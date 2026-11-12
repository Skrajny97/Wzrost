// The player's character: creation, the full view the page draws, and free
// stat points.

import {
  blockedName,
  createRng,
  areaFor,
  autoDistribute,
  bagCapacity,
  builderSpirit,
  buildsUnderWay,
  campBonus,
  campLevels,
  classLevelRate,
  addBonuses,
  blessingPlan,
  gearSetCount,
  gearSetIds,
  greenhouseHours,
  greenhouseStore,
  knownHerbs,
  professionState,
  trainingPlan,
  trainingXp,
  familyDiscoveries,
  keptFamilies,
  trophyBonuses,
  trophyHallBonuses,
  fortressReady,
  fortressStands,
  buildingTop,
  campNeeds,
  canUse,
  classNameOf,
  classXpToNext,
  collect,
  collectWithFills,
  combatValues,
  extraValues,
  computeStats,
  construction,
  craftLevelFor,
  craftMinutes,
  craftTable,
  openedChests,
  patternFrom,
  jewelPatternFrom,
  craftTakes,
  currentQuests,
  effectText,
  equipVerdict,
  pathGear,
  challengeAt,
  evolutionPanel,
  fireTrade,
  fireUnitsMade,
  freePoints,
  gainedTimePoints,
  goodStock,
  standingRewardsDue,
  ownDiscoveries,
  bagStacks,
  hoursToNext,
  isUnlocked,
  huntDurations,
  itemView,
  materialPrice,
  materialView,
  mergeDiscoveries,
  nextHuntUnlock,
  plannedLevel,
  playerCombatant,
  production,
  professionOpen,
  questPeriod,
  samePeriod,
  questsStale,
  questsView,
  readyChests,
  regenPerMinute,
  resourceExchange,
  restBonus,
  restedHp,
  salvageYield,
  settleBoard,
  settleCrafting,
  orderCancellable,
  countedAtEnd,
  addQuestProgress,
  tableBuilding,
  shopBought,
  shopLeft,
  shopOffer,
  skillsView,
  spentPoints,
  spiritLeast,
  pointSources,
  statShares,
  unlockedFeatures,
  upgradeCost,
  buildMinutes,
  campEffectText,
  campLevel,
  xpToNext,
  buffLeft,
  storedBuffs,
  TIMED_KINDS,
  timedKind,
  cosmeticsOf,
  nameColor,
  seatLevels,
  collectorTakes,
  weekAt,
  weekRest,
  equipBlock,
  coreSockets,
  freeSockets,
  gemView,
  knownArtifact,
  gendered,
  wantedName,
  wantedOf,
} from '../engine/index.js';
import { mountView } from '../engine/stable.js';
import { say } from '../engine/text.js';
import { cardRemoval } from './cards.js';
import { chatRole } from './chat.js';
import { relationTo } from './community.js';
import { content, contentIn } from './content.js';
import { favoriteIds } from './favorites.js';
import { buildingOn, craftingOn, fortressOn, labyrinthOn, professionsOn, settlementOn, weeksOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { assertion, atomically, characterChanged, raced, sameVersion } from './atomic.js';
import { marketRemoval } from './market.js';
import { mercenaryBusy, mercenaryPlace, mercenaryRules, serviceEnded } from './mercenaries.js';
import { ACCOUNT_NAMES, ALL_CHARACTERS, looksTaken, nameKey, validateName } from './names.js';
import { championOf } from './guild-fame.js';
import { fameNotice } from './fame.js';
import { guildOf, guildRemoval, guildTagSql } from './guilds.js';
import { guildSeatSql } from './guild-seat.js';
import { takenBefore, trialProgress } from './guild-trials.js';
import { partyOf, partyRemoval } from './parties.js';
import { anvilDiscountOf } from './perks.js';
import { bagHerbs, bagMinerals, bagPotions, herbsOf, potionsOf, professionsView, settlementPointsOf } from './professions-view.js';
import { OWN_CHARACTERS } from './roles.js';
import { requirePlayable } from './sessions.js';
import { tradeBlockOf, tradesEnded } from './trades.js';
import { skipIntroduction } from './tutorial.js';
import { weekFactorNow, weekOfCharacter } from './weeks.js';

// A character's name (names.js): 2 to 20 signs, the filter of words, and no
// two players share one, whatever the letter case; neither does a character
// take the name another player chose for its account (832 A, the chat shows
// it before the character's name).
const accountNameTaken = async (db, name, userId) =>
  Boolean(await db.prepare('SELECT 1 FROM users WHERE account_name_key = ? AND id != ?').bind(nameKey(name), userId).first()) ||
  looksTaken(db, ACCOUNT_NAMES, name, [userId]);
const accountNameError = () => new ApiError(409, 'name_taken', content().chat.accounts.takenByAccount);

// Throws when the name looks like another character's: the same letters
// but for some signs that look alike, of another alphabet, a digit or a
// capital I (names.js lookKey). Names that differ are told apart by the
// unique key. Whichever of the two came first (the code review of
// 12.11.2026: a Latin "Sasha" went through beside a Cyrillic one made
// before it, and a Greek name beside a Cyrillic one).
async function refuseLookAlike(db, name, except = 0) {
  if (await looksTaken(db, ALL_CHARACTERS, name, [except])) throw new ApiError(409, 'name_taken', 'To imię nosi już inna postać w grze. Wybierz inne.');
}

// The character the account plays, with all it has, or null.
export async function loadPlayer(db, userId) {
  const row = await db.prepare("SELECT * FROM characters WHERE user_id = ? AND role = 'player'").bind(userId).first();
  return row ? playerOf(db, row) : null;
}

// Any character by its id, played or aside, as loadPlayer gives it (a
// member of a Drużyna, parties.js), or null.
export async function loadCharacter(db, id) {
  const row = await db.prepare('SELECT * FROM characters WHERE id = ?').bind(id).first();
  return row ? playerOf(db, row) : null;
}

// A character's row with its items, activities and camp buildings.
async function playerOf(db, row) {
  const [items, activities, avatarActivities, buildings, parcels, stored] = await db.batch([
    db.prepare('SELECT id, slot, data FROM items WHERE character_id = ? ORDER BY id').bind(row.id),
    db.prepare('SELECT * FROM activities WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT * FROM avatar_activities WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT building_id, level, started_at, ends_at, collected_at, cost FROM buildings WHERE character_id = ?').bind(row.id),
    // With the tag of its guild, for its own name (guilds.js), whether it
    // is in a Drużyna, where its companions stay in the Kwatery (parties.js,
    // companions.js in the engine), and the donations to its guild's
    // Siedziba, whose levels give it its bonuses (guild-seat.js).
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM market_parcels WHERE character_id = ?) AS waiting, ${guildTagSql('?')} AS guild_tag,
           EXISTS (SELECT 1 FROM party_members WHERE character_id = ?) AS in_party, ${guildSeatSql('?')} AS guild_seat`,
      )
      .bind(row.id, row.id, row.id, row.id),
    // What the Warsztat and the Szlifiernia made, waiting in the
    // Przechowalnia out of the bag (storage.js).
    db.prepare('SELECT id, data FROM storage_items WHERE character_id = ? ORDER BY id').bind(row.id),
  ]);
  return {
    row,
    // equippedSlot is where the item is worn (null in the bag); item.slot is where it can go.
    items: items.results.map((item) => ({ id: item.id, equippedSlot: item.slot, ...JSON.parse(item.data) })),
    // The items of the Przechowalnia, the oldest first, each with its own id
    // there (not an item's of the bag).
    stored: stored.results.map((item) => ({ id: item.id, ...JSON.parse(item.data) })),
    activity: activities.results[0] ?? null,
    // The work of the Awatar Systemu, kept as the character's own (avatar.js).
    avatarActivity: avatarActivities.results[0] ?? null,
    // What waits to be collected at the Targowisko (market.js).
    marketWaiting: parcels.results[0]?.waiting ?? 0,
    guildTag: parcels.results[0]?.guild_tag ?? null,
    // A membership the spread of class levels or a party of one has ended
    // ends here too (partyOf), so the companions go again at once (828 B).
    inParty: Boolean(parcels.results[0]?.in_party) && Boolean(await partyOf(db, row.id)),
    // The levels of its guild's Siedziba, by building, all 0 outside a guild
    // (guild-seat.js): the bonuses it has as a member.
    guildSeat: seatLevels(JSON.parse(parcels.results[0]?.guild_seat ?? '{}'), content()),
    // { campfire: { level, startedAt, endsAt, collectedAt } }: see camp.js in
    // the engine; `cost`, what a build was paid, once kept (camp.js).
    buildings: Object.fromEntries(
      buildings.results.map((building) => [
        building.building_id,
        {
          level: building.level,
          startedAt: building.started_at,
          endsAt: building.ends_at,
          collectedAt: building.collected_at,
          ...(building.cost && { cost: JSON.parse(building.cost) }),
        },
      ]),
    ),
  };
}

// Gold and resources together, as building costs name them.
export function walletOf(row) {
  const stored = JSON.parse(row.resources ?? '{}');
  return { gold: row.gold, ...Object.fromEntries(content().resources.map((resource) => [resource.id, stored[resource.id] ?? 0])) };
}

export async function requirePlayer(context) {
  const session = await requirePlayable(context);
  const player = await loadPlayer(context.env.DB, session.userId);
  if (!player) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  await settleCharacter(context.env.DB, player, context.now);
  return { session, player };
}

// What every request of the player settles first, of what time brought
// (requirePlayer); also for a Drużyna's member whose report its party's
// setting out claims, as its own "Odbierz raport" would (parties.js).
export async function settleCharacter(db, player, now) {
  await settleBuilds(db, player, now);
  // The Zbieracz Systemu collects here, where every request of the player
  // settles what time brought: so GET /api/character and every action see
  // the stores collected, and the answers built from a character read again
  // after the action too. loadPlayer itself has no time and reads also the
  // other side of a Wymiana, and loadCharacter the members of a Drużyna:
  // their stores wait for their own requests. After the builds, as a build
  // that began meanwhile took its store along at its start.
  await settleCollector(db, player, now);
  await settleTimePoints(db, player.row, now);
  await settleTable(db, player, now);
  await settleQuests(db, player, now);
  await settleDiscoveries(db, player, now);
}

// The Encyklopedia's record with what the character holds now: its items,
// potions, herbs, materials and parts, those of the Stół rozbiórki's
// finished orders too (encyclopedia.js in the engine). So whatever passes
// through the bag between two requests is written down, but for what came
// from a Wymiana or the Skrzynia Konta (ownDiscoveries): of the stacks from a
// trade, only what the character still holds stays counted out.
export async function settleDiscoveries(db, player, now) {
  const { row } = player;
  const { materials, parts } = settleCrafting(craftingState(row), now);
  const stored = JSON.parse(row.foreign_stacks ?? '{}');
  const holdings = { items: player.items, potions: JSON.parse(row.potions ?? '{}'), herbs: JSON.parse(row.herbs ?? '{}'), materials, parts, minerals: JSON.parse(row.minerals ?? '{}') };
  const { found, foreign } = ownDiscoveries(holdings, stored, content());
  // The trade pieces used up meanwhile are written down as gone.
  if (Object.keys(stored).some((key) => foreign[key] !== stored[key])) {
    const kept = JSON.stringify(foreign);
    const result = await db.prepare('UPDATE characters SET foreign_stacks = ? WHERE id = ? AND foreign_stacks = ?').bind(kept, row.id, row.foreign_stacks ?? '{}').run();
    if (result.meta.changes === 1) row.foreign_stacks = kept;
  }
  // The creature families known in full, for the Warownia's Sala trofeów.
  const merged = mergeDiscoveries(JSON.parse(row.discovered ?? '{}'), { ...found, ...familyDiscoveries(JSON.parse(row.met ?? '[]'), content()) });
  if (!merged) return;
  const discovered = JSON.stringify(merged);
  const result = await db.prepare('UPDATE characters SET discovered = ? WHERE id = ? AND discovered = ?').bind(discovered, row.id, row.discovered ?? '{}').run();
  row.discovered = result.meta.changes === 1 ? discovered : (await db.prepare('SELECT discovered FROM characters WHERE id = ?').bind(row.id).first()).discovered;
}

// The pattern an item taken apart teaches, or null, with where it is used
// ("w Szlifierni"): one the Warsztat does not show yet, with
// Rzemieślnictwo (patternFrom), or one the Szlifiernia does not show yet,
// with the professions (jewelPatternFrom). The character's `learned`
// patterns hold both, as the two make different slots.
export function taughtPattern(item, learned) {
  const id = (craftingOn() && patternFrom(item, learned, content())) || (professionsOn() && jewelPatternFrom(item, learned, content())) || null;
  if (!id) return null;
  const base = content().basesById[id];
  const texts = content().workshop.parts[base.slot] ? content().workshop.texts : content().jewelcrafting.texts;
  return { id, name: base.name, at: say(texts, 'patternAt', 0) };
}

// The character as it is now, with the builds whose time has come started:
// for an answer after something moved the camp's time (a skipped build).
export async function loadSettled(db, userId, now) {
  const player = await loadPlayer(db, userId);
  await settleBuilds(db, player, now);
  return player;
}

// The camp's waiting builds (camp.js in the engine), as the row keeps them.
export const buildQueue = (row) => JSON.parse(row.build_queue ?? '[]');

const path = (id) => `$."${id}"`;

// Gathering herbs, brewing potions, making items, digging and the work of
// the Szlifiernia are no fights: the character rests meanwhile, as at home.
// A mercenary waiting in the Karczma or serving rests too (mercenaries.js):
// its HP is its own, the exploration's fights are another's.
export const restsDuring = (activity) => !activity || ['herbs', 'potions', 'items', 'minerals', 'jewels', 'mercenary'].includes(activity.kind);

// A character's buffs in fights (storedBuffs in potions.js): those kept in
// time before 0.1.26 count as the fights of their minutes.
export const buffsOf = (row, now) => storedBuffs(JSON.parse(row.buffs ?? '{}'), now, content());

// The strengthening potions drunk from the bag and the strengthenings of
// events (the blue mushroom's) that still work (potions.js), by kind: the
// fights of explorations they have left, their bonus, the words for it and
// the first potion of the kind for its picture. The fights go when a report
// is claimed, so they stay as they are on an exploration.
function activeBuffs(player, now) {
  const buffs = buffsOf(player.row, now);
  const active = [];
  for (const kind of TIMED_KINDS) {
    const fights = buffLeft(buffs, kind);
    if (fights <= 0) continue;
    const { bonus } = buffs[kind];
    const potion = content().potions.find((one) => timedKind(one) === kind)?.id ?? null;
    active.push({ kind, fights, bonus, label: content().potionUse.buffLabels[kind].replace('{bonus}', Math.round(bonus * 100)), potion });
  }
  return active;
}

// The Zbrojownia's saved gear sets (characters.fortress), null for one not
// saved (421 A).
export const gearSetsOf = (row) => JSON.parse(row.fortress ?? '{}').sets ?? [];

// The ids of the items the Zbrojownia's sets keep, where the Warownia works
// (with FORTRESS off its racks are gone and their items back in the bag).
export const rackedIds = (row) => (fortressOn() ? gearSetIds(gearSetsOf(row)) : new Set());

// The items in the bag: neither worn nor on the Zbrojownia's racks, where
// the items of its sets hang while not worn.
export function bagItems(player) {
  const racked = rackedIds(player.row);
  return player.items.filter((item) => !item.equippedSlot && !racked.has(item.id));
}

// An item on a rack leaves it only through the Zbrojownia: worn with its
// set, or brought down to the bag by a change of the sets. It is not sold,
// given, put away or taken apart from the rack.
export function requireOffRack(player, ...items) {
  const racked = rackedIds(player.row);
  if (items.some((item) => item && !item.equippedSlot && racked.has(item.id))) {
    throw new ApiError(409, 'on_rack', 'Ta rzecz wisi na stojaku w Zbrojowni. Usuń jej zestaw albo zapisz go bez niej.');
  }
}

// The bag's places taken: one an item, and the herbs and the potions by the
// stack.
export const bagPlaces = (player) => bagItems(player).length + bagStacks(herbsOf(player.row), content()) + bagStacks(potionsOf(player.row), content());

// The Skrzynia Konta's padlock (843, the author: „miec kłódkę i być
// zablokowana do 20 poziomu postaci”): below the character level of
// balance.account.chestLevel a character puts nothing in and takes nothing
// out (chest.js), and the page shows the level it opens at. Null once open.
export function chestLock(row) {
  const level = content().balance.account.chestLevel;
  return row.level < level ? { level } : null;
}

// What adds a gathered store to the character: gold has its own column, the
// other resources sit in the JSON of `resources`.
export function gainSql(resource, amount) {
  return resource === 'gold'
    ? { sql: 'gold = gold + ?', values: [amount] }
    : { sql: 'resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?)', values: [path(resource), path(resource), amount] };
}

// The same gain on the row as read, so the answer shows it.
function gainRow(row, { resource, amount }) {
  if (resource === 'gold') {
    row.gold += amount;
    return;
  }
  const resources = JSON.parse(row.resources ?? '{}');
  resources[resource] = (resources[resource] ?? 0) + amount;
  row.resources = JSON.stringify(resources);
}

// The writes of a store collected, by "Zbierz" (camp.js: collectProduction)
// or by the Zbieracz Systemu (settleCollector): the resources come only if
// the store still starts where it was seen (`seen`), and then the store
// moves on to `gathered.collectedAt`. Two requests at once compute the same
// new store, so the check is on the store before: the second finds it moved
// and gets nothing. For one db.batch.
export function storeCollection(db, characterId, buildingId, seen, gathered, now) {
  const gain = gainSql(gathered.resource, gathered.amount);
  return [
    db
      .prepare(
        `UPDATE characters SET ${gain.sql}, version = version + 1
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND COALESCE(collected_at, ends_at) = ? AND ends_at <= ?
         )`,
      )
      .bind(...gain.values, characterId, characterId, buildingId, seen, now),
    db
      .prepare(
        `UPDATE buildings SET collected_at = ?
         WHERE character_id = ? AND building_id = ? AND COALESCE(collected_at, ends_at) = ? AND ends_at <= ?`,
      )
      .bind(gathered.collectedAt, characterId, buildingId, seen, now),
  ];
}

// The Zbieracz Systemu (camp.js: buyCollector; DECISIONS.md, „Zbieracz
// Systemu”): once the character has him, every production building's store
// gives all it made by now, its whole fills and the whole units of the next
// (collectorTakes in the engine; the author's 753 A), at most about once a
// collector.everySeconds, as "Zbierz" takes a store, all in one batch. So
// production never stands, also while the player is away: what was made
// waits for the next request. `player` shows what came.
// A store another request collected meanwhile gives nothing here: the
// character is read again, and what is left is collected from there.
export async function settleCollector(db, player, now) {
  for (let tries = 0; tries < 3; tries++) {
    const { row } = player;
    if (!row.collector_at) return;
    const every = content().camp.collector.everySeconds * 1000;
    const fills = content().buildings
      .filter((building) => building.effect.kind === 'production')
      .map((building) => {
        const stored = player.buildings[building.id];
        // With the week's share of what the buildings give (weeks.js).
        return { building, stored, gathered: collectorTakes(building, stored, now, row.collector_at, every, weekFactorNow(now, 'camp')) };
      })
      .filter((fill) => fill.gathered);
    if (fills.length === 0) return;
    const results = await db.batch(fills.flatMap(({ building, stored, gathered }) => storeCollection(db, row.id, building.id, stored.collectedAt ?? stored.endsAt, gathered, now)));
    let missed = false;
    for (const [index, { building, stored, gathered }] of fills.entries()) {
      if (results[2 * index].meta.changes !== 1) {
        missed = true;
        continue;
      }
      gainRow(row, gathered);
      row.version += 1;
      player.buildings[building.id] = { ...stored, collectedAt: gathered.collectedAt };
    }
    if (!missed) return;
    Object.assign(player, await loadPlayer(db, row.user_id));
  }
}

// The waiting builds whose time has come start, one after another, each as
// if it had started at its own time, as a build started by hand does
// (camp.js: beginBuilding): a production building's store goes to the
// resources then, and the HP rested by then is saved. Each start saves only
// if the character is as seen here; when another request moved first, the
// character is read again and its queue goes on from there. With the
// Zbieracz Systemu the store gives the whole fills made by then as well
// (settleCollector), as he would have collected them.
async function settleBuilds(db, player, now) {
  for (let tries = 0; tries < 10; tries++) {
    const [entry, ...rest] = buildQueue(player.row);
    if (!entry || entry.startsAt > now) return;
    const { row } = player;
    const at = entry.startsAt;
    const building = content().buildingsById[entry.buildingId];
    const producing = building?.effect?.kind === 'production';
    const stored = player.buildings[building?.id];
    // The store goes as the build begins, with that week's share (weeks.js).
    const week = weekFactorNow(at, 'camp');
    const gathered = !producing ? null : row.collector_at ? collectWithFills(building, stored, at, row.collector_at, week) : collect(building, stored, at, week);
    const resting = restsDuring(player.activity);
    const hp = resting ? currentHp(player, at).hp : null;
    const gain = gathered && gainSql(gathered.resource, gathered.amount);
    const statements = [
      db
        .prepare(
          `UPDATE characters SET build_queue = ?${gain ? `, ${gain.sql}` : ''}${resting ? ', hp = ?, hp_at = ?' : ''}, version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .bind(
          JSON.stringify(rest),
          ...(gain ? gain.values : []),
          ...(resting ? [hp, at] : []),
          row.id,
          row.version,
        ),
    ];
    // A build of a building the game no longer has only leaves the queue.
    // One that starts keeps the cost it was paid in the queue, for
    // "Przerwij budowę" (camp.js).
    if (building) {
      statements.push(
        db
          .prepare(
            `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at, cost)
             SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)
             ON CONFLICT (character_id, building_id) DO UPDATE
               SET level = excluded.level, started_at = excluded.started_at, ends_at = excluded.ends_at, collected_at = excluded.collected_at, cost = excluded.cost`,
          )
          .bind(row.id, building.id, entry.level, at, entry.endsAt, producing ? entry.endsAt : null, entry.cost ? JSON.stringify(entry.cost) : null, row.id, row.version + 1),
      );
    }
    // The batch holds only while the character is as read (atomic.js), so
    // the building starts only with its queue moved by this request.
    let moved = null;
    try {
      [, moved] = await db.batch([sameVersion(db, row), ...statements]);
    } catch (error) {
      if (!raced(error)) throw error;
    }
    if (moved?.meta.changes !== 1) {
      Object.assign(player, await loadPlayer(db, row.user_id));
      continue;
    }
    row.build_queue = JSON.stringify(rest);
    row.version += 1;
    if (gathered) gainRow(row, gathered);
    if (resting) Object.assign(row, { hp, hp_at: at });
    if (building) {
      player.buildings[building.id] = { level: entry.level, startedAt: at, endsAt: entry.endsAt, collectedAt: producing ? entry.endsAt : null, ...(entry.cost && { cost: entry.cost }) };
    }
  }
}

// The Punkty Czasu that came with time since time_points_at join the stored
// ones (gainedTimePoints), and `row` shows them. The version stays: a change
// sent at the same moment still saves, and the condition on time_points_at
// adds each point once.
async function settleTimePoints(db, row, now) {
  const { points, since } = gainedTimePoints(row.time_points_at, now, content());
  if (points === 0) return;
  const result = await db
    .prepare('UPDATE characters SET time_points = time_points + ?, time_points_at = ? WHERE id = ? AND time_points_at = ?')
    .bind(points, since, row.id, row.time_points_at)
    .run();
  if (result.meta.changes === 1) Object.assign(row, { time_points: row.time_points + points, time_points_at: since });
  else Object.assign(row, await db.prepare('SELECT time_points, time_points_at FROM characters WHERE id = ?').bind(row.id).first());
}

// The Stół rozbiórki's orders done by now leave the queue for their parts,
// so whatever reads the parts sees them: the Osada's orders, the Targowisko,
// the Wymiana (the code review: they waited for the next action at the
// table). Their work counts now (countedAtEnd; the author: „zrób też tak
// zeby zadania rozbiórki przedmiotów liczyły się po zakończonej rozbiórce
// bo inaczej bedzie mozna anulować rozbiórkę a zadanie zaliczone”): for the
// narrator's quests of the periods of now, and for the Próby Gildii of the
// guild the character is in now and of this week, a trial taken by the
// time the order was made, as an exploration's counts from its start. All
// in one write that holds only while the parts, the queue and the quests
// are as read, so two requests settling at once count an order once; the
// version moves on with it, so a change read before cannot put the order
// back. With nothing to count (orders made before work counted at the end)
// the version stays, as nothing the player did changed, and the result is
// the same whoever settles it. When another request moved first, the
// character is read again and its queue settled from there.
export async function settleTable(db, player, now) {
  for (let tries = 0; tries < 10; tries++) {
    const { row } = player;
    const state = craftingState(row);
    if (!state.queue.some((order) => order.endsAt <= now)) return;
    const { parts, queue, done } = settleCrafting(state, now);
    const work = countedAtEnd(done);
    const next = { parts: JSON.stringify(parts), crafting: JSON.stringify(queue) };
    if (work.length === 0) {
      const result = await db
        .prepare('UPDATE characters SET parts = ?, crafting = ? WHERE id = ? AND parts IS ? AND crafting IS ?')
        .bind(next.parts, next.crafting, row.id, row.parts, row.crafting)
        .run();
      if (result.meta.changes === 1) {
        Object.assign(row, next);
        return;
      }
    } else {
      const pieces = (kind) => work.filter((one) => one.kind === kind).reduce((sum, one) => sum + one.pieces, 0);
      const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { processed: pieces('process'), salvaged: pieces('salvage') }));
      const gains = (one) => (one.kind === 'process' ? { processed: one.pieces } : { salvaged: one.pieces });
      try {
        await db.batch([
          assertion(db, 'EXISTS (SELECT 1 FROM characters WHERE id = ? AND parts IS ? AND crafting IS ? AND quests IS ?)', [row.id, row.parts, row.crafting, row.quests]),
          db.prepare('UPDATE characters SET parts = ?, crafting = ?, quests = ?, version = version + 1 WHERE id = ?').bind(next.parts, next.crafting, quests, row.id),
          ...work.flatMap((one) => trialProgress(db, row.id, gains(one), now, takenBefore(one.orderedAt))),
        ]);
        Object.assign(row, { ...next, quests, version: row.version + 1 });
        return;
      } catch (error) {
        if (!raced(error)) throw error;
      }
    }
    Object.assign(player, await loadPlayer(db, row.user_id));
  }
  throw characterChanged();
}

// The Osada opened below its level by "Testuj Osadę" (settlement.js).
const settlementTest = (row) => settlementOn() && JSON.parse(row.settlement ?? '{}').test === true;

// Whether the character has the Osada: where the deployment has it on, from
// its level, or opened by "Testuj Osadę".
export const settlementOpen = (row) =>
  settlementOn() && Boolean(content().settlement) && (row.level >= content().unlocksById.settlement.level || settlementTest(row));

// The Ołtarz Systemu's blessing an exploration sets out with: the one of the
// day with fights left (fortress.js), where the Warownia is on.
export function blessingOf(row) {
  const { blessing } = JSON.parse(row.fortress ?? '{}');
  return fortressOn() && blessing?.left > 0 ? { day: blessing.day, kind: blessing.kind, bonus: blessing.bonus, fights: blessing.left } : null;
}

// The Warownia's state after an exploration's report: the fights its
// blessing worked in come off the day's, while it is still the one it set
// out with; null when nothing changes.
export function blessingAfter(row, taken, used) {
  if (!taken || used <= 0) return null;
  const state = JSON.parse(row.fortress ?? '{}');
  if (state.blessing?.day !== taken.day || state.blessing.kind !== taken.kind) return null;
  return JSON.stringify({ ...state, blessing: { ...state.blessing, left: Math.max(0, state.blessing.left - used) } });
}

// The bonus to the damage dealt to each of the creatures `ids`: the
// Encyklopedia's trophies and the Warownia's Sala trofeów (fortress.js).
export function trophiesFor(player, now, ids) {
  const discovered = JSON.parse(player.row.discovered ?? '{}');
  const met = JSON.parse(player.row.met ?? '[]');
  const hall = trophyHallBonuses(campLevels(player.buildings, now, content()), met, keptFamilies(discovered), content(), ids);
  return addBonuses(trophyBonuses(discovered, content(), ids), hall);
}

// A camp building of the Osada's (the Kwatery, `settlement` in
// buildings.json) stands once the character has the Osada, and one of the
// Warownia's (`fortress`) once the camp has turned into one, where the
// Warownia is on (fortress.js); without `stored` and `now`, never. The
// others always. (The Obóz's own `fortress` is its transformation, not this
// mark.)
export const buildingOpen = (building, row, stored = null, now = 0) =>
  (!building.settlement || settlementOpen(row)) && (building.fortress !== true || (fortressOn() && Boolean(stored) && fortressStands(stored, now, content())));

// What the character holds of the goods the Osada's orders ask for, by the
// column each kind is kept in, the parts of the Stół rozbiórki's orders
// done by `now` among them, and the Warsztat's items in the bag by pattern
// (`crafted`), but for its favourites, which no order takes (favorites.js).
export function settlementGoods(row, items, now) {
  const stocks = Object.fromEntries(['herbs', 'potions', 'materials', 'resources'].map((column) => [column, JSON.parse(row[column] ?? '{}')]));
  stocks.parts = settleCrafting(craftingState(row), now).parts;
  const favorites = favoriteIds(row);
  const crafted = {};
  for (const item of bagItems({ row, items })) if (item.crafted && !favorites.has(item.id)) crafted[item.base] = (crafted[item.base] ?? 0) + 1;
  return { ...stocks, crafted };
}

// The character as an order of the Osada and a companion's gift see it: what
// it knows, with the creatures it met, the patterns it learned and its
// relations and reputation in the Osada (`settlement`: the herbalist's rare
// recipes, 121 A).
export const knowingCharacter = (row) => ({ ...engineCharacter(row), met: JSON.parse(row.met ?? '[]'), patterns: JSON.parse(row.patterns ?? '[]'), settlement: settlementPointsOf(row) });

// The Osada's board at `now` for the character as it is: the stored one
// (settlement.js) with the orders whose time has come. Settled in Polish
// whatever the request's language: an order keeps the sentence of the one
// who posts it as it was drawn, and one not among the data's sentences is
// rewritten (freshStory in the engine), so a board settled in English would
// rewrite every sentence at each change of the language. The page gets it
// in its own language (orderView in settlement.js).
export function settlementBoard(row, stored, now) {
  return settleBoard(stored.board, { character: knowingCharacter(row), reputation: stored.reputation, seed: `${row.id}:settlement` }, now, contentIn('pl'));
}

// Whether an order on the board, the week's included, can be delivered
// now, something waits at the Targowisko, a brotherhood's reward for a
// new standing (593 A and B) or a wanted poster's bounty waits: the dot on
// the Osada tab. The bag stays
// at hand while the character is away, so every order counts then too.
function settlementWaiting(row, items, now, parcels = 0) {
  if (!settlementOpen(row)) return false;
  if (parcels > 0) return true;
  const stored = JSON.parse(row.settlement ?? '{}');
  // A wanted poster's bounty waits at the sołtys's (wanted.js).
  if (stored.wanted?.taken?.beaten) return true;
  const rewarded = stored.rewarded ?? {};
  if (content().settlement.brotherhoods.some((one) => standingRewardsDue(one.id, stored.reputation?.[one.id] ?? 0, rewarded[one.id] ?? 0, content()))) return true;
  const board = settlementBoard(row, { board: stored.board ?? null, reputation: stored.reputation ?? {} }, now);
  const goods = settlementGoods(row, items, now);
  const weekly = board.weekly && !board.weekly.done ? board.weekly.order : null;
  return [...board.slots.map((slot) => slot.order), weekly].some((order) => order && goodStock(order, goods, content()) >= order.count);
}

// What a period's quests are drawn from: the character as it is, whether its
// Stół rozbiórki stands, which professions it has (Rzemieślnictwo where it
// works and from its own level, and each profession open at its level, as
// Górnictwo and Jubilerstwo from 25), whether its Osada is open, its id for
// the seed and the moment it came, for its first week (quests.js).
export function questContext(player, now) {
  const hasProfessions = professionsOn() && isUnlocked('professions', player.row.level, content());
  const crafting = content().professionsById[content().workshop.profession];
  return {
    // With its relations and reputation in the Osada, for the herbalist's
    // rare recipes (121 A).
    character: { ...engineCharacter(player.row), settlement: settlementPointsOf(player.row) },
    hasTable: craftTable(campLevels(player.buildings, now, content()), content()).pace > 0,
    hasProfessions,
    hasCrafting: hasProfessions && craftingOn() && professionOpen(crafting, player.row.level, content()),
    openProfessions: hasProfessions ? content().professions.filter((profession) => professionOpen(profession, player.row.level, content())).map((profession) => profession.id) : [],
    hasSettlement: settlementOpen(player.row),
    seed: player.row.id,
    createdAt: player.row.created_at,
  };
}

// The quests of both periods at `now`.
export const questsNow = (player, now) => currentQuests(JSON.parse(player.row.quests ?? '{}'), questContext(player, now), now, content());

// A new day or week draws its quests and saves them at once, so they stay
// the same however the character changes that day; so are the lost quests
// drawn anew in their place (quests.js). As with the Punkty Czasu, the
// version stays, and only the first of two requests at once saves them.
export async function settleQuests(db, player, now) {
  const { row } = player;
  const stored = JSON.parse(row.quests ?? '{}');
  const settled = questsNow(player, now);
  if (!questsStale(stored, now, content()) && JSON.stringify(settled) === JSON.stringify(stored)) return;
  const quests = JSON.stringify(settled);
  const result = await db.prepare('UPDATE characters SET quests = ? WHERE id = ? AND quests = ?').bind(quests, row.id, row.quests).run();
  row.quests = result.meta.changes === 1 ? quests : (await db.prepare('SELECT quests FROM characters WHERE id = ?').bind(row.id).first()).quests;
}

// For changes that need the character at home.
export async function requireIdlePlayer(context) {
  const found = await requirePlayer(context);
  requireIdle(found.player, context.now);
  return found;
}

// The character at home, with no exploration or work of a profession going
// on: its bag and its equipment wait for its return.
export function requireIdle(player, now) {
  const activity = player.activity;
  if (!activity) return;
  // A profession's work says so in its own words.
  const texts =
    activity.kind === 'mercenary'
      ? mercenaryBusy(activity)
      : { herbs: content().professionTexts, potions: content().brewing?.texts, items: content().workshop?.texts, minerals: content().mining?.texts, jewels: content().jewelcrafting?.texts }[activity.kind];
  throw activity.ends_at <= now
    ? new ApiError(409, 'claim_first', texts ? texts.claimFirst[0] : 'Wyprawa się skończyła. Najpierw odbierz raport.')
    : new ApiError(409, 'busy', texts ? texts.busy[0] : 'Postać jest na wyprawie. Poczekaj na jej koniec.');
}

// While the character is away, its bag stays at hand (the author: "Niech
// system pozwala na Wymianę i różne działania na przedmiotach w czasie
// zbierania ziół itp."). What it wears waits only for the return from an
// exploration, whose report is made with it; at a profession's work the
// equipment is at hand too (the author: "W trakcie wykonywania Profesji..
// w sumie powinniśmy być w stanie zarządzać Ekwipunkiem? Czemu to miałoby
// przeszkadzać w gruncie rzeczy?"), as nothing of the work depends on it.
export function requireUnworn(player, item, now) {
  if (item?.equippedSlot) requireNotExploring(player, now);
}

// On an exploration also what its fights are counted with waits: the
// equipment, the stat points, the skills and the evolution, since the report
// is made with them when it is claimed (hunts.js). The work of a profession
// needs none of it.
// A mercenary offering itself or serving (mercenaries.js) keeps it all as
// it is too: it goes with all it wears (the author: "Nie może też
// modyfikować swojego rynsztunku").
export function requireNotExploring(player, now) {
  if (['hunt', 'mercenary'].includes(player.activity?.kind)) requireIdle(player, now);
}

// Why the Gildia's fights (the Bestia, a guardian of the Wyprawa) are shut
// to the character now, in `text`, or null: while its activity is an offer
// or a service as a mercenary, as the attacks themselves refuse then, so
// its pages offer no attack and its dots stay off.
export const attackBlocked = (activity, text) => (activity?.kind === 'mercenary' ? text : null);

// The character for a change of its stat points, skills or evolution (above).
export async function requireBuildPlayer(context) {
  const found = await requirePlayer(context);
  requireNotExploring(found.player, context.now);
  return found;
}

// Who does a profession's work: the character at home, or with `avatar` in
// the request its Awatar Systemu, bought and free (avatar.js), while the
// character may be away or at work itself.
export async function requireWorker(context, body) {
  if (body.avatar !== true) return { ...(await requireIdlePlayer(context)), avatar: false };
  const found = await requirePlayer(context);
  const { row, avatarActivity } = found.player;
  if (!row.avatar_at) throw new ApiError(409, 'no_avatar', 'Nie masz jeszcze Awatara Systemu.');
  if (avatarActivity) {
    const { texts } = content().avatar;
    throw avatarActivity.ends_at <= context.now ? new ApiError(409, 'claim_first', texts.claimFirst[0]) : new ApiError(409, 'busy', texts.busy[0]);
  }
  return { ...found, avatar: true };
}

// The work of the character or, with `avatar`, of its Awatar Systemu: the
// table it sits in, the activity and the key of its report.
export function workOf(player, avatar) {
  const activity = avatar ? player.avatarActivity : player.activity;
  return {
    table: avatar ? 'avatar_activities' : 'activities',
    activity,
    key: avatar ? `${player.row.id}:avatar:${activity.started_at}` : `${player.row.id}:${activity.started_at}`,
  };
}

// The stat points as stored, only those of known stats in whole numbers, so
// whatever else a request might once have stored counts for nothing (the
// code review).
const statPoints = (stored) =>
  Object.fromEntries(Object.entries(stored ?? {}).filter(([stat, value]) => Object.hasOwn(content().statsById, stat) && Number.isInteger(value)));

// The place a character opened early in the Sala prób (trial-hall.js;
// the author's 620 B), or null.
export function earlyAreaOf(row) {
  try {
    return JSON.parse(row.trial_hall ?? '{}').early ?? null;
  } catch {
    return null;
  }
}

// The character's Rdzeń (src/server/core.js; 858–865): whether it is
// open, the Odłamki, the gem set in it and the Artefakty absorbed, each a
// kind the game knows (a row from before a change of the data does
// nothing).
export function coreOf(row) {
  let stored;
  try {
    stored = JSON.parse(row.core ?? '{}');
  } catch {
    stored = {};
  }
  return {
    open: stored.open === true,
    shards: Number.isSafeInteger(stored.shards) && stored.shards > 0 ? stored.shards : 0,
    gem: typeof stored.gem === 'string' ? stored.gem : null,
    absorbed: (Array.isArray(stored.absorbed) ? stored.absorbed : []).filter((artifact) => knownArtifact(artifact, content())),
  };
}

export function engineCharacter(row) {
  const outfit = row.cosmetics ? cosmeticsOf(JSON.parse(row.cosmetics), content()).outfit : null;
  // The Rdzeń's Artefakty and its gem work in the character's fights and
  // stats (core.js in the engine), where the Labirynt is on.
  const core = labyrinthOn() ? coreOf(row) : null;
  return {
    classId: row.class_id,
    level: row.level,
    xp: row.xp,
    classLevel: row.class_level,
    classXp: row.class_xp,
    points: statPoints(JSON.parse(row.points)),
    // Free stat points an event gave beyond those of the levels.
    bonusPoints: row.bonus_points ?? 0,
    position: row.position,
    appearance: row.appearance,
    skin: row.skin ?? content().defaultSkin,
    // The skills learned and their levels (skills.js).
    skills: JSON.parse(row.skills ?? '{}'),
    // The evolution taken at class level 50 (evolutions.js), or null.
    evolution: row.evolution ?? null,
    // The professions' levels and XP (professions.js).
    professions: JSON.parse(row.professions ?? '{}'),
    // The Sklep Systemu's skórka worn (cosmetics.js), for the fights' busts.
    ...(outfit && { outfit }),
    ...(core && core.absorbed.length > 0 && { core: { absorbed: core.absorbed, gem: core.gem } }),
  };
}

export const equippedItems = (player) => player.items.filter((item) => item.equippedSlot);

// HP now: frozen at the start of an exploration, otherwise rested since
// hp_at (also while gathering herbs), faster with the camp's Ognisko, and
// faster or slower in a week of resting (weekRest in weeks.js): `rest`
// gives the pace from hp_at and from its last change on, for the page and
// the pace of now too.
export function currentHp(player, now) {
  const character = engineCharacter(player.row);
  const { totals } = computeStats(character, equippedItems(player), content());
  const combatant = playerCombatant({ character, equipped: equippedItems(player), name: player.row.name }, content());
  const camp = restBonus(player.buildings, player.row.hp_at, now, content());
  const rest = weeksOn() ? weekRest(camp, player.row.hp_at, now, content()) : camp;
  const hp = !restsDuring(player.activity)
    ? player.activity.hp_at_start
    : restedHp(
        { hp: player.row.hp, since: player.row.hp_at, now, maxHp: combatant.maxHp, vitality: totals.vitality, ...rest },
        content(),
      );
  return { hp: Math.min(hp, combatant.maxHp), maxHp: combatant.maxHp, vitality: totals.vitality, combatant, rest };
}

// The training as the yard's screen shows it: what one gives now, whether
// one may start, and the one of the day under way or done.
function trainingView(player, levels, now) {
  const plan = trainingPlan(levels, content());
  if (!fortressOn() || !plan) return null;
  const { training } = JSON.parse(player.row.fortress ?? '{}');
  const day = questPeriod('daily', now, content());
  const today = samePeriod(training?.day, day.key);
  return {
    hours: plan.hours,
    xp: trainingXp(player.row.level, plan, content()),
    canStart: !today && (!training || training.claimed),
    nextDayAt: today ? day.endsAt : null,
    current: training && !training.claimed ? { startedAt: training.startedAt, endsAt: training.endsAt, xp: training.xp, done: training.endsAt <= now } : null,
  };
}

// The Ołtarz's blessing as its screen shows it: the three to choose from,
// for how many fights, and the one of the day with the fights left.
function blessingView(player, levels, now, building) {
  const plan = blessingPlan(levels, content());
  if (!fortressOn() || !plan) return null;
  const { blessing } = JSON.parse(player.row.fortress ?? '{}');
  const today = samePeriod(blessing?.day, questPeriod('daily', now, content()).key);
  return {
    fights: plan.fights,
    choices: building.blessings,
    canChoose: !today,
    current: blessing?.left > 0 ? { kind: blessing.kind, left: blessing.left, today } : null,
  };
}

// The Szklarnia as its screen shows it: the herbs it may grow (those known
// from Zielarstwa), how much of the chosen one a day, and its store now.
function greenhouseView(player, levels, now) {
  const hours = greenhouseHours(levels, content());
  if (!fortressOn() || hours <= 0) return null;
  const herbalism = professionState(JSON.parse(player.row.professions ?? '{}'), content().gathering.profession).level;
  const { greenhouse } = JSON.parse(player.row.fortress ?? '{}');
  const store = greenhouseStore(levels, greenhouse, herbalism, now, content());
  return {
    hours,
    herbs: knownHerbs(herbalism, content()).map((herb) => ({ id: herb.id, name: herb.name })),
    current: store && { herb: store.herb, name: content().herbsById[store.herb].name, perDay: store.perDay, limit: store.limit, capacity: store.capacity, amount: store.amount, since: store.since },
  };
}

// The Zbrojownia's sets as its screen shows them: as many as the building
// keeps, each with its name, the items of it still had (on a rack or worn)
// and whether the character wears it now, all of it and nothing else.
function gearSetsView(player, levels, building) {
  const count = gearSetCount(levels, content());
  if (!fortressOn() || count <= 0) return null;
  const sets = gearSetsOf(player.row);
  const byId = new Map(player.items.map((item) => [item.id, item]));
  const worn = equippedItems(player);
  return {
    count,
    nameLength: building.gearSets.nameLength,
    sets: Array.from({ length: count }, (_, index) => {
      const items = (sets[index]?.items ?? []).map((id) => byId.get(id)).filter(Boolean);
      return {
        index,
        name: sets[index]?.name ?? null,
        items: items.map((item) => ({ id: item.id, worn: Boolean(item.equippedSlot), ...itemView(item, content()) })),
        worn: items.length > 0 && items.length === worn.length && items.every((item) => item.equippedSlot),
      };
    }),
  };
}

// The transformation into a Warownia as the Kamień węgielny's window shows
// it: whether it may begin (every camp building and the Obóz at the top),
// what it costs and takes, the build under way or waiting, and once done
// that the Warownia stands.
function fortressView(player, open, queue, now) {
  const fortress = content().camp.fortress;
  const stored = player.buildings[fortress.id];
  const stands = fortressStands(player.buildings, now, content());
  return {
    id: fortress.id,
    name: fortress.name,
    description: fortress.description,
    ready: fortressReady(player.buildings, now, open, content()) && !queue.some((entry) => entry.buildingId === fortress.id),
    cost: upgradeCost(fortress, 1),
    minutes: buildMinutes(fortress, 1, campLevel(player.buildings, now, content()), content()),
    building: stored && !stands ? { startedAt: stored.startedAt, endsAt: stored.endsAt } : null,
    queued: queue.some((entry) => entry.buildingId === fortress.id),
    stands,
    texts: { start: fortress.start, building: fortress.building, done: fortress.done },
  };
}

// The camp as the page shows it: its own level, and each building with its
// level and, below its highest level, what the next one gives, costs and
// takes in a camp of this level.
function campView(player, levels, now) {
  const running = construction(player.buildings, now);
  const queue = buildQueue(player.row);
  const { camp } = content();
  const own = campLevel(player.buildings, now, content());
  // The next level of each building comes after the builds under way and
  // waiting, and builds in the camp they leave behind.
  const campThen = plannedLevel(camp, player.buildings, queue);
  const following = campThen < camp.maxLevel ? campThen + 1 : null;
  const queued = (id) => queue.filter((entry) => entry.buildingId === id).map((entry) => entry.level);
  // The Kamień węgielny Warowni: how many of the camp's buildings stand at
  // their highest level, and the camp's own level, out of all.
  // The Warownia's buildings, once they stand, count for the spirit but not
  // for the stone's rows: the transformation needs the camp's alone.
  // Every camp building of the game, the Osada's Kwatery too where the
  // Osada is, as the transformation counts them (camp.js beginBuilding).
  const built = content().buildings.filter((building) => buildingOpen(building, player.row, player.buildings, now));
  const open = content().buildings.filter((building) => !building.fortress && buildingOn(building));
  const finished = open.filter((building) => levels[building.id] >= building.maxLevel).length;
  return {
    cornerstone: {
      name: camp.cornerstone.name,
      label: camp.cornerstone.label,
      text: camp.cornerstone.text,
      rows: [
        { label: camp.cornerstone.buildings, done: finished, of: open.length },
        { label: camp.cornerstone.camp, done: own, of: camp.maxLevel },
      ],
      ready: finished === open.length && own >= camp.maxLevel ? camp.cornerstone.ready : null,
      // The transformation into a Warownia, where it is on (fortress.js).
      fortress: fortressOn() ? fortressView(player, open, queue, now) : null,
      spirit: spiritView(player, built, queue, now),
    },
    collector: collectorView(player.row),
    level: {
      id: camp.id,
      name: camp.name,
      description: camp.description,
      level: own,
      maxLevel: camp.maxLevel,
      effect: campEffectText(own, content()),
      // At the highest level only the evolution to come is left.
      evolution: following ? null : camp.evolution,
      next: following && {
        level: following,
        effect: campEffectText(following, content()),
        minutes: buildMinutes(camp, following, campThen, content()),
        cost: upgradeCost(camp, following),
      },
      queued: queued(camp.id),
    },
    construction: running && {
      buildingId: running.buildingId,
      name: content().buildingsById[running.buildingId].name,
      level: running.level,
      startedAt: running.startedAt,
      endsAt: running.endsAt,
      // What "Przerwij budowę" gives back: what the build was paid, or for
      // one from before that was kept, the price of its level now.
      cost: running.cost ?? upgradeCost(content().buildingsById[running.buildingId], running.level),
    },
    // The builds waiting after it, each with the time it starts, and how
    // many builds the camp has at most, the one under way too.
    queue: queue.map((entry) => ({ ...entry, name: content().buildingsById[entry.buildingId]?.name ?? entry.buildingId })),
    queueSize: camp.queue,
    underWay: buildsUnderWay(player.buildings, queue, now),
    buildings: content().buildings.filter((building) => buildingOpen(building, player.row, player.buildings, now)).map((building) => {
      const level = levels[building.id];
      const planned = plannedLevel(building, player.buildings, queue);
      // Past level 10 in the Warownia for the resource buildings (618).
      const top = buildingTop(building, player.buildings, now, content());
      const next = planned < top ? planned + 1 : null;
      const stored = player.buildings[building.id];
      // A production building's store, once the building stands: the page
      // counts it up from `since`.
      const store = level > 0 ? production(building, stored, now) : null;
      return {
        id: building.id,
        name: building.name,
        description: building.description,
        level,
        maxLevel: top,
        // At the camp's top with more to come in the Warownia (618): the hint.
        beyond: building.beyond && top === building.maxLevel && level >= building.maxLevel ? building.beyond.hint : null,
        // A building with looks of its own (the Kwatery): the look at its
        // level, the first one while it is not built yet.
        ...(building.looks && { look: building.looks[Math.min(Math.max(level, 1), building.looks.length) - 1] }),
        // The Stół rozbiórki: its screen shows the table (crafting).
        crafts: building.effect.kind === 'craftSpeed',
        // The Kowadło: its screen lists the items to upgrade.
        upgrades: building.effect.kind === 'upgradeCap',
        effect: level > 0 ? effectText(building, level, content()) : null,
        production: store && {
          resource: store.resource,
          perHour: store.perHour,
          capacity: store.capacity,
          amount: store.amount,
          since: store.since,
          paused: stored.endsAt > now,
        },
        next: next && {
          level: next,
          effect: effectText(building, next, content()),
          minutes: buildMinutes(building, next, campThen, content()),
          cost: upgradeCost(building, next),
        },
        queued: queued(building.id),
        trade: building.trade && level > 0 ? fireView(building, level, player.row, now) : null,
        shop: building.shop && level > 0 ? shopView(building, level, player.row, now) : null,
        exchange: building.exchange && level > 0 ? exchangeView(building, level) : null,
        // The Warownia's Plac treningowy: the training of the day.
        training: building.effect.kind === 'training' && level > 0 ? trainingView(player, levels, now) : null,
        // The Szklarnia: its herb and store.
        greenhouse: building.effect.kind === 'greenhouse' && level > 0 ? greenhouseView(player, levels, now) : null,
        // The Zbrojownia: the saved gear sets.
        gearSets: building.effect.kind === 'gearSets' && level > 0 ? gearSetsView(player, levels, building) : null,
        // The Ołtarz Systemu: the blessing of the day.
        blessing: building.effect.kind === 'blessing' && level > 0 ? blessingView(player, levels, now, building) : null,
      };
    }),
  };
}

// The Zbieracz Systemu (camp.js: buyCollector): his icon, name, price and
// words, and whether the character has him; the board shows him by the
// Skrzynia Konta until he is bought.
function collectorView(row) {
  const { art, name, price, everySeconds, texts } = content().camp.collector;
  return { art, name, price, everySeconds, owned: Boolean(row.collector_at), texts: { offer: texts.offer, bought: texts.bought, hint: texts.hint } };
}

// The Duch budowniczego at the Kamień węgielny Warowni (builder-spirit.js):
// who he is and, for each resource he buys, what the character has, his
// gold for a lot of pieces, the fewest pieces that bring a coin, and what
// the camp's builds not paid yet still need of it (`open`: the buildings
// the character has), so the page can tell the surplus. Null where the
// game has no spirit.
function spiritView(player, open, queue, now) {
  const spirit = builderSpirit(content());
  if (!spirit) return null;
  const wallet = walletOf(player.row);
  // With the Warownia in the game, what its transformation still needs too,
  // and once it stands the resource buildings' levels up to 20 (618).
  const needs = campNeeds(
    fortressOn() && content().camp.fortress ? [...open, content().camp.fortress] : open,
    player.buildings,
    queue,
    content(),
    (building) => buildingTop(building, player.buildings, now, content()),
  );
  return {
    art: spirit.art,
    name: spirit.name,
    line: spirit.line,
    lot: spirit.lot,
    texts: { price: spirit.texts.price, need: spirit.texts.need, least: spirit.texts.least, sold: spirit.texts.sold },
    goods: Object.entries(spirit.gold).map(([id, gold]) => ({
      id,
      name: content().resourcesById[id].name,
      have: wallet[id] ?? 0,
      gold,
      least: spiritLeast(id, content()),
      need: needs[id] ?? 0,
    })),
  };
}

// The fire spirit's trade at the Ognisko's level: the price of a piece,
// the pieces a day and those left today, and the same at the next level.
function fireView(building, level, row, now) {
  const trade = fireTrade(level, content());
  const made = fireUnitsMade({ day: row.fire_day, units: row.fire_units }, now, content());
  const next = level < building.maxLevel ? fireTrade(level + 1, content()) : null;
  return {
    title: building.trade.title,
    text: building.trade.text,
    resources: trade.resources,
    unitGold: trade.unitGold,
    perDay: trade.perDay,
    left: Math.max(0, trade.perDay - made),
    next: next && { level: level + 1, unitGold: next.unitGold, perDay: next.perDay },
  };
}

// The Stół rozbiórki's exchange at its level: the pieces of a resource
// given for one of another, and fewer at the next level.
function exchangeView(building, level) {
  const exchange = resourceExchange(level, content());
  const next = level < building.maxLevel ? resourceExchange(level + 1, content()) : null;
  return {
    title: building.exchange.title,
    text: building.exchange.text,
    resources: exchange.resources,
    rate: exchange.rate,
    next: next && next.rate < exchange.rate ? { level: level + 1, rate: next.rate } : null,
  };
}

// The scrap dealer's counter at the Skup złomu's level: the parts with
// their prices (the page takes their names and counts from crafting), and
// what the next level adds.
function shopView(building, level, row, now) {
  const offer = shopOffer(level, content());
  const later = level < building.maxLevel ? shopOffer(level + 1, content()) : null;
  const bought = shopBought({ day: row.shop_day, parts: JSON.parse(row.shop_parts ?? '{}') }, now, content());
  return {
    title: building.shop.title,
    text: building.shop.text,
    counts: building.shop.counts,
    // Each part with its price, the parts a day and those left today.
    parts: offer.map(({ partId, price }) => ({
      id: partId,
      price,
      daily: building.shop.daily[content().partsById[partId].rarity],
      left: shopLeft(partId, bought, content()),
    })),
    next: later && {
      level: level + 1,
      added: later
        .filter(({ partId }) => !offer.some((entry) => entry.partId === partId))
        .map(({ partId }) => ({ id: partId, name: content().partsById[partId].name, gender: content().partsById[partId].gender })),
      discount: building.shop.discountPerLevel,
    },
  };
}

// What the character row keeps: materials, parts and the queue, as JSON.
export function craftingState(row) {
  return { materials: JSON.parse(row.materials ?? '{}'), parts: JSON.parse(row.parts ?? '{}'), queue: JSON.parse(row.crafting ?? '[]') };
}

const rarityIndex = (id) => content().rarities.findIndex((rarity) => rarity.id === id);

// The table as the page shows it, settled at `now`. `pace` 0: no table yet.
function craftingView(row, levels, now) {
  const table = craftTable(levels, content());
  const { pace } = table;
  const { materials, parts, queue } = settleCrafting(craftingState(row), now);
  // What the scrapper pays for a piece, with the camp's Skup złomu.
  const sellBonus = campBonus(levels, 'sellPrice', content());
  return {
    pace,
    // The table's level, the highest rarity it takes and the chance of an
    // extra part for each part made.
    level: table.level,
    maxRarity: table.maxRarity < 0 ? null : content().rarities[table.maxRarity].id,
    bonusChance: table.bonusChance,
    limit: content().balance.crafting.queueLimit,
    // The words of "Usuń z kolejki" and "Usuń wszystkie" (data/buildings.json).
    texts: queueTexts(),
    materials: Object.entries(materials)
      .map(([key, count]) => {
        const view = materialView(key, count, content());
        // `needs`: the table's level that takes this rarity, when it is not built up to it yet.
        const takes = pace > 0 && craftTakes(table, view.rarity, content());
        return {
          ...view,
          price: materialPrice(view.rarity, content()) * (1 + sellBonus),
          minutes: takes ? craftMinutes(view.rarity, count, pace, content()) : null,
          needs: pace > 0 && !takes ? craftLevelFor(view.rarity, content()) : null,
        };
      })
      .sort((a, b) => rarityIndex(a.rarity) - rarityIndex(b.rarity) || a.name.localeCompare(b.name, 'pl')),
    parts: content().parts.map((part) => ({
      id: part.id,
      name: part.name,
      description: part.description,
      rarity: part.rarity,
      color: content().raritiesById[part.rarity].color,
      count: parts[part.id] ?? 0,
    })),
    queue: queue.map((order) => {
      const material = order.kind === 'material' ? materialView(order.key, order.count, content()) : null;
      const rarity = material ? material.rarity : order.rarity;
      return {
        id: order.id,
        kind: order.kind,
        materialId: material?.materialId ?? null,
        // A handful taken apart at once ("Rozbierz kilka") has no one name.
        name: material ? material.name : (order.name ?? t('Przedmioty')),
        count: order.count ?? 1,
        rarity,
        color: content().raritiesById[rarity].color,
        part: content().partsById[order.partId].name,
        parts: order.parts,
        // No extra parts here: drawn with the order, they show only once it
        // ends, among the parts (taken off and ordered again, an order would
        // draw them anew).
        startsAt: order.startsAt,
        endsAt: order.endsAt,
        // "Usuń z kolejki" (cancelOrders in crafting.js): whether the order
        // can leave the queue, whether its work counted already (`counted`:
        // one made before work counted at the end, so the quests and the
        // Próby Gildii lose it), and what it gave at once that would go back
        // with it: jewellery's gems and ores, the patterns its items taught.
        cancellable: orderCancellable(order),
        counted: order.countsAtEnd !== true,
        minerals: Object.entries(order.minerals ?? {}).map(([id, count]) => ({ name: content().mineralsById[id]?.name ?? id, count })),
        patterns: (order.patterns ?? []).map((id) => content().basesById[id]?.name).filter(Boolean),
        // Its items came from the Przechowalnia and go back there (storage.js).
        ...((order.items ?? []).some((item) => item.fromStorage === true) && { stored: true }),
      };
    }),
  };
}

// The words of the table's queue for the page, without the server's answers.
function queueTexts() {
  const { errors: _, ...texts } = tableBuilding(content())?.queue ?? {};
  return texts;
}

// Where an activity takes place. region_id holds the inner region, or a whole
// region for an activity started before inner regions; a gathering, its
// place and the herbs chosen; a brewing, its place, the potion and how many;
// an order of items, its place, the pattern, the rarity and how many; a
// digging, its place; a work of the Szlifiernia, its place and the jewels
// ordered, or the gem set and the item's id.
function activityPlace(activity, level) {
  if (activity.kind === 'herbs') {
    const herbs = (JSON.parse(activity.options ?? '{}').herbs ?? []).filter((id) => content().herbsById[id]);
    return { profession: content().gathering.profession, placeName: content().gathering.place.name, herbs: herbs.map((id) => ({ id, name: content().herbsById[id].name })) };
  }
  if (activity.kind === 'potions') {
    const { recipe, count } = JSON.parse(activity.options ?? '{}');
    const potion = content().potionsById[recipe];
    return { profession: content().brewing.profession, placeName: content().brewing.place.name, potion: potion ? { id: potion.id, name: potion.name } : null, count: count ?? 0 };
  }
  if (activity.kind === 'items') {
    const { base: baseId, rarity, count, scroll } = JSON.parse(activity.options ?? '{}');
    // A scroll order names its scroll: the Zwój ochronny, or the Zwój
    // utrwalenia for one of "steady".
    const base = scroll ? (scroll === 'steady' ? content().workshop.steadyScroll : content().workshop.scroll) : content().basesById[baseId];
    return {
      profession: content().workshop.profession,
      placeName: content().workshop.place.name,
      base: base ? { id: base.id, name: base.name } : null,
      rarityName: content().raritiesById[rarity]?.name ?? '',
      count: count ?? 0,
      ...(scroll && { scroll: true }),
    };
  }
  if (activity.kind === 'minerals') return { profession: content().mining.profession, placeName: content().mining.place.name };
  // A mercenary's offer or service in the Karczma (mercenaries.js).
  if (activity.kind === 'mercenary') return mercenaryPlace(activity);
  if (activity.kind === 'jewels') {
    const { base: baseId, rarity, count, set, gem, itemName } = JSON.parse(activity.options ?? '{}');
    const base = content().basesById[baseId];
    return {
      profession: content().jewelcrafting.profession,
      placeName: content().jewelcrafting.place.name,
      ...(set
        ? { set: { gem: content().mineralsById[gem]?.name ?? '', item: itemName ?? '' } }
        : { base: base ? { id: base.id, name: base.name } : null, rarityName: content().raritiesById[rarity]?.name ?? '', count: count ?? 0 }),
    };
  }
  const area = areaFor(activity.region_id, level, content());
  return { areaId: area.id, areaName: area.name, regionId: area.regionId, regionName: area.regionName };
}

// An activity as the page shows it, of the character or of its Awatar.
function activityView(activity, level, now) {
  // A Drużyna's exploration (parties.js): who went, and the time the others
  // skipped for everyone (time.js), said on the Walka screen.
  const options = activity?.kind === 'hunt' ? JSON.parse(activity.options ?? '{}') : {};
  return (
    activity && {
      kind: activity.kind,
      ...(options.party && {
        party: {
          names: options.party.names ?? [],
          skips: (options.skips ?? []).filter((skip) => skip.id !== activity.character_id),
          // The others who went, as they look on the way: they walk beside
          // the character in the Walka scene (640 A). A trip that set out
          // before 0.1.69 has none.
          walkers: (options.party.looks ?? []).filter((look) => look.id !== activity.character_id).map(({ id, ...look }) => look),
          // The report that waited, claimed as the party set out
          // (parties.js), for the Walka to tell and open: { id, kind }.
          ...(options.claimed && { claimed: options.claimed }),
        },
      }),
      // The companions from the Kwatery who went along, as the exploration
      // keeps them from its start (hunts.js: beginHunt; never on a Drużyna's
      // trip): they walk beside the character in the Walka scene too (640 A,
      // 648), each in its fixed look.
      ...(options.companions?.length > 0 && {
        companions: options.companions.map(({ name, classId, appearance }) => ({ name, classId, appearance })),
      }),
      ...activityPlace(activity, level),
      minutes: activity.minutes,
      startedAt: activity.started_at,
      endsAt: activity.ends_at,
      avoidRare: activity.avoid_rare === 1,
      seekRare: activity.seek_rare === 1,
      // A Trudna wyprawa (629 A, hunts.js).
      ...(options.hard && { hard: true }),
      // The mercenary from the Karczma it took along, and its fee
      // (mercenaries.js); and its look on the way, kept from its hire: it
      // walks beside the character in the Walka scene, as a Drużyna's
      // member does (654 A). One hired before that has none, and the scene
      // goes without it.
      ...(options.mercenary && {
        mercenary: { name: options.mercenary.name, gold: options.mercenary.gold, ...(options.mercenary.look && { walker: options.mercenary.look }) },
      }),
      // The creatures the exploration tracks for the quests (hunts.js).
      tracksQuests: activity.tracked !== null && activity.tracked !== undefined,
      finished: activity.ends_at <= now,
    }
  );
}

// The Szybkie (`kind` "quick") or Błyskawiczne ("flash") polowania left,
// and when they come back once all are used: `refillHours` after the last
// one (the author: "resetowane co 12h po zużyciu"; 7.11.2026: "Zmieniamy
// Błyskawiczne wyprawy na reset co 6 godzin, a Szybkie wyprawy na reset co
// 12 godzin", five of each). Stored in quick_hunts as { quick: { used, at },
// flash: { used, at } }; the Szybkie Polowania counted by the day before
// (day, used) start anew.
export function huntsLeft(row, kind, now) {
  const { count, refillHours } = content().balance[kind === 'flash' ? 'flashHunt' : 'quickHunt'];
  const done = JSON.parse(row.quick_hunts ?? 'null')?.[kind];
  if (!done || done.used < count) return { left: count - (done?.used ?? 0), backAt: null };
  const backAt = done.at + refillHours * 3600000;
  return now >= backAt ? { left: count, backAt: null } : { left: 0, backAt };
}

// The Szybkie and the Błyskawiczne polowania left, or null below their
// level.
function quickHuntsView(row, now) {
  const quick = content().balance.quickHunt;
  const flash = content().balance.flashHunt;
  return isUnlocked('quick-hunts', row.level, content())
    ? {
        ...huntsLeft(row, 'quick', now),
        count: quick.count,
        minutes: quick.minutes,
        refillHours: quick.refillHours,
        flash: { ...huntsLeft(row, 'flash', now), count: flash.count, minutes: flash.minutes, refillHours: flash.refillHours },
      }
    : null;
}

// The wanted poster in hand from the Osada's Tablica zleceń (wanted.js),
// for the strip on the Walka screen (a player's remark, 12.11.2026: „w
// okienku wypraw fajnie byłoby widzieć, które zlecenie na elitę obecnie
// mamy wybrane z tablicy zleceń”): its target, its place and whether it
// has fallen already, with the poster's words of the data in the page's
// language; null with no poster in hand.
function wantedInHand(row) {
  const rules = settlementOn() ? wantedOf(content()) : null;
  const taken = rules && JSON.parse(row.settlement ?? '{}').wanted?.taken;
  const area = taken && content().areasById[taken.areaId];
  if (!area) return null;
  const words = (text) => gendered(text, taken.female ? 'female' : 'male');
  return {
    kind: taken.kind,
    monsterId: taken.monsterId,
    name: wantedName(taken, content()),
    label: words(taken.kind === 'outlaw' ? rules.texts.outlaw : rules.texts.wanted),
    areaId: area.id,
    beaten: Boolean(taken.beaten),
    note: words(taken.beaten ? rules.texts.beaten : rules.texts.hunting.replaceAll('{area}', area.name)),
  };
}

// The Awatar Systemu (avatar.js): its price and words until it is bought,
// then its work under way, or null.
function avatarView(player, now) {
  const { name, price, description } = content().avatar;
  return { name, price, description, owned: Boolean(player.row.avatar_at), activity: activityView(player.avatarActivity, player.row.level, now) };
}

export function characterView(player, now) {
  const { row, items, activity } = player;
  const character = engineCharacter(row);
  const spent = spentPoints(character);
  const equipped = equippedItems(player);
  const professions = professionsView(row);
  const { totals, sources } = computeStats(character, equipped, content());
  const { hp, maxHp, combatant, rest } = currentHp(player, now);
  const values = combatValues(character, equipped, content());
  const shares = statShares(character, equipped, content());
  const levels = campLevels(player.buildings, now, content());
  const sellBonus = campBonus(levels, 'sellPrice', content());
  // The Kowadło's level is the highest upgrade it allows.
  const upgradeCap = campBonus(levels, 'upgradeCap', content());
  // What the Stół rozbiórki makes of an item taken apart and how long it
  // takes, or the table's level its rarity needs.
  // Also the pattern the item teaches, and where (taughtPattern).
  const table = craftTable(levels, content());
  const learned = JSON.parse(row.patterns ?? '[]');
  const salvage = (item) => {
    const { partId, count, minerals } = salvageYield(item, content());
    const part = content().partsById[partId];
    const takes = table.pace > 0 && craftTakes(table, item.rarity, content());
    const pattern = taughtPattern(item, learned);
    return {
      part: part.name,
      color: content().raritiesById[part.rarity].color,
      parts: count,
      minutes: takes ? craftMinutes(item.rarity, count, table.pace, content()) : null,
      needs: table.pace > 0 && !takes ? craftLevelFor(item.rarity, content()) : null,
      ...(pattern && { pattern: pattern.name, patternAt: pattern.at }),
      // Jewellery's gem and ore for Jubilerstwo, given at once.
      ...(minerals && { minerals: Object.entries(minerals).map(([id, mineralCount]) => ({ id, name: content().mineralsById[id].name, count: mineralCount })) }),
    };
  };
  // The materials that pay for the Kowadło's upgrades from +5 on.
  const materials = JSON.parse(row.materials ?? '{}');
  // Less gold on the Kowadło with the Bractwo Kowali (590) and the guild's
  // Kuźnia Gildii (616 A).
  const anvilDiscount = anvilDiscountOf(player);
  // The chance of an upgrade with the week's share of it (weeks.js).
  const anvilWeek = weekFactorNow(now, 'upgrade');
  // The items the player marked with a star (favorites.js), which are not
  // taken apart nor sold to the scrapper.
  const favorites = favoriteIds(row);
  // An item as the page shows it; one of the bag or worn also with its star.
  const itemOf = (item) => ({
    id: item.id,
    ...itemView(item, content(), { sellBonus, upgradeCap, materials, anvilDiscount, anvilWeek }),
    salvage: salvage(item),
  });
  const toItem = (item) => ({ ...itemOf(item), ...(favorites.has(item.id) && { favorite: true }) });
  // Whether a bag item would make the character stronger in place of what
  // its slot holds, along the class's proposed path of points (equipVerdict
  // in preview.js), for the marks on the bag and on finds; null for an item
  // the class cannot wear.
  const pathWorn = pathGear(character, equipped, content());
  const pathNow = combatValues(character, pathWorn, content());
  const verdict = (item) =>
    canUse(item.base, row.class_id, content()) && !content().slotsById[item.slot].locked ? equipVerdict(character, item, content(), pathWorn, pathNow) : null;
  const { gold, ...resources } = walletOf(row);
  const weapon = combatant.weapon;
  const cosmetics = JSON.parse(row.cosmetics ?? '{}');

  return {
    name: row.name,
    // Its guild's tag, in square brackets beside its name (guilds.js).
    guildTag: player.guildTag ?? null,
    // Its name in its frame's colour, or null (cosmetics.js).
    nameColor: nameColor(cosmetics, content()),
    classId: row.class_id,
    // The class goes by its evolution's name; the class itself stays a note
    // on the character card.
    className: classNameOf(character, content()),
    baseClassName: content().classesById[row.class_id].name,
    // The look: the portrait and the voice in fights, and the portrait's
    // skin tone.
    appearance: row.appearance,
    skin: row.skin ?? content().defaultSkin,
    level: row.level,
    xp: row.xp,
    xpToNext: xpToNext(row.level, content()),
    hoursToNext: Math.round(hoursToNext(row.level, row.xp, content()) * 100) / 100,
    classLevel: row.class_level,
    classXp: row.class_xp,
    classXpToNext: classXpToNext(row.class_level, content()),
    // The place opened early in the Sala prób (trial-hall.js), or null.
    earlyArea: earlyAreaOf(row),
    gold,
    systemPoints: row.system_points,
    // The Sklep Systemu (cosmetics.js): the cosmetics bought for Punkty
    // Systemu and those worn, and whether the name shows in the frame's
    // colour.
    cosmetics: cosmeticsOf(cosmetics, content()),
    // Punkty Czasu: 1 point skips 1 minute of a wait (time.js). One more
    // comes every `minutes` from `since`; the page counts them up the same way.
    timePoints: row.time_points,
    timePointsGain: { since: row.time_points_at, minutes: content().balance.timePoints.generateMinutes },
    resources,
    position: row.position,
    hp,
    maxHp,
    // While resting, the page counts HP up the same way the server does. A
    // camp upgrade that sped up resting since hp_at changes the pace at `at`.
    regen: !restsDuring(activity)
      ? null
      : {
          hp: row.hp,
          since: row.hp_at,
          perMinute: regenPerMinute(maxHp, totals.vitality, content(), rest.bonus),
          change: rest.change && { at: rest.change.at, perMinute: regenPerMinute(maxHp, totals.vitality, content(), rest.change.bonus) },
        },
    mana: values.mana,
    maxMana: values.mana,
    // An evolution tried below its class level on the test version opens
    // its tab too, and so does the Osada opened by "Testuj Osadę".
    // The Rdzeń opens with the first guardian of the Labirynt beaten (855 A).
    features: [
      ...new Set([
        ...unlockedFeatures(row.level, content(), row.class_level),
        ...(row.evolution ? ['evolution'] : []),
        ...(settlementTest(row) ? ['settlement'] : []),
        ...(labyrinthOn() && coreOf(row).open ? ['core'] : []),
      ]),
    ],
    // The Rdzeń at a glance, once it is open (core.js): its sockets and how
    // many are free, the Odłamki and the gem set in it.
    core: labyrinthOn() && coreOf(row).open ? coreSummary(row) : null,
    // Whether the character has the Osada (the narrator's Osada chapter).
    settlementOpen: settlementOpen(row),
    // A name the filter blocks (names.js): the game asks for a new one, and
    // nothing else goes on until it has it.
    nameBlocked: blockedName(row.name, content()),
    // The one change of the name the Ustawienia offer, and the System's
    // word after it gave the character a new name itself.
    canRename: !row.name_changed,
    nameNotice: row.name_notice ?? null,
    // An order of the Osada that can be delivered now lights its tab.
    settlementWaiting: settlementWaiting(row, items, now, player.marketWaiting) || serviceEnded(player.activity, now),
    huntDurations: huntDurations(row.level, content()),
    // The Karczma's mercenaries (mercenaries.js): what the character may
    // offer and ask, or null below their level.
    mercenaries: mercenaryRules(row),
    // The Trudna wyprawa's creatures and rewards (629 A), from the
    // challenge's level; null before it.
    hardHunt: challengeAt(row.level, content())?.hard ?? null,
    // Szybkie Polowania left today (hunts.js), or null below their level.
    quickHunts: quickHuntsView(row, now),
    // The next longer exploration and its level, for the hint under the slider.
    huntNext: nextHuntUnlock(row.level, content()),
    // The Stajnia's mount, which shortens the wait under the slider too
    // (stable.js in the engine), or null.
    mount: settlementOn() ? mountView(JSON.parse(row.settlement ?? '{}'), content()) : null,
    // The wanted poster in hand, for its strip on the Walka screen, or null.
    wanted: wantedInHand(row),
    freePoints: freePoints(character, content()),
    // The Umiejętności tab: the choices, the skills learned and the Skill Points.
    skills: skillsView(character, content()),
    // The evolution taken, or the two to choose from at class level 50.
    evolution: evolutionPanel(character, content()),
    // On the test version, a test evolution can be undone (evolutions.js).
    evolutionUndo: Boolean(row.evolution_undo),
    // The free reset of the stat points after an evolution, while the player
    // has not decided: all the points there will be to give out again, from
    // the character's levels, the class's levels and events.
    evolutionReset: row.evolution_reset && spent > 0 ? pointSources(character, content()) : null,
    canResetPoints: row.level <= content().balance.progression.freeResetMaxLevel && spent > 0,
    stats: content().stats.map((stat) => ({
      id: stat.id,
      name: stat.name,
      effect: stat.combat,
      total: totals[stat.id],
      sources: sources[stat.id],
      gives: shares[stat.id],
    })),
    combat: {
      damage: `${values.damageMin}–${values.damageMax}`,
      damageKind: weapon.category === 'physical' ? t('fizyczne') : t('magiczne, {element}', { element: content().elementsById[weapon.element].name }),
      reduction: Math.round(values.reduction * 100),
      maxHp,
      maxMana: values.mana,
      // What the next class level adds to both, without any points: the
      // current form's (classLevelRate in the engine).
      perClassLevel: classLevelRate(character, content()),
      // The Parametry dodatkowe window: the total armour, the chances with
      // their ratings, the resistances (preview.js); the HP at rest at the
      // Ognisko's pace of now.
      extra: extraValues(character, equipped, content(), { rest: rest.change?.bonus ?? rest.bonus }),
    },
    equipment: Object.fromEntries(
      content().slots.map((slot) => {
        const item = equipped.find((candidate) => candidate.equippedSlot === slot.id);
        return [slot.id, item ? toItem(item) : null];
      }),
    ),
    // With why the character cannot wear one now, if it cannot, as "Załóż"
    // refuses it (equipBlock in the engine): for the list of a slot's items.
    bag: bagItems(player)
      .reverse()
      .map((item) => {
        const block = equipBlock(item, row.class_id, row.class_level, content());
        return { ...toItem(item), verdict: verdict(item), ...(block && { equipBlock: block }) };
      }),
    // The herbs and the potions in the bag, which take its places by the stack.
    herbs: bagHerbs(row, sellBonus),
    potions: bagPotions(row, sellBonus),
    // The gems and ores of Górnictwo, which take no room in it.
    minerals: bagMinerals(row, sellBonus),
    herbStack: content().professionRules.stack,
    bagUsed: bagPlaces(player),
    bagCapacity: bagCapacity(levels, content()),
    // The Profesje tab, or null while it is hidden or locked (professions-view.js),
    // with the Awatar Systemu and, once the Warsztat or the Szlifiernia is
    // open, the Przechowalnia of what they made, the newest first, each as
    // the bag shows it (storage.js; no favourites there).
    professions: professions && {
      ...professions,
      avatar: avatarView(player, now),
      ...((professions.workshop || professions.jewelcrafting) && {
        storage: { items: (player.stored ?? []).map(itemOf).reverse() },
      }),
    },
    camp: campView(player, levels, now),
    // The Skrzynia Konta's padlock while the character is below the level
    // it opens at (chestLock), for the camp's board; absent once it opens.
    ...(chestLock(row) && { chestLock: chestLock(row) }),
    // The Stół rozbiórki: materials, parts and the queue (crafting.js).
    crafting: craftingView(row, levels, now),
    // The Zwoje ochronne made in the Warsztat for the Kowadło.
    scrolls: row.scrolls,
    steadyScrolls: row.steady_scrolls ?? 0,
    // The creatures met in fights, by id: the others are shadows on the
    // lists of an inner region's dangers.
    met: JSON.parse(row.met ?? '[]'),
    // The inner regions and lands whose Bestiariusz chest is open for their
    // lists as they are now (bestiary.js).
    bestiary: openedChests(JSON.parse(row.bestiary ?? '[]'), content()),
    // The Encyklopedia's chests ready to open, for the top bar's light
    // (encyclopedia.js).
    encyclopedia: { ready: readyChests(JSON.parse(row.discovered ?? '{}'), JSON.parse(row.encyclopedia ?? '[]'), content()) },
    // The potions for a time still working (potions.js).
    buffs: activeBuffs(player, now),
    // The narrator's daily, weekly and monthly quests (quests.js).
    quests: questsView(questsNow(player, now), now, content(), JSON.parse(row.met ?? '[]'), row.level),
    // The narrator's cards seen so far, or null for a character made before
    // the introduction (tutorial.js).
    tutorial: row.tutorial === null ? null : JSON.parse(row.tutorial),
    activity: activityView(activity, row.level, now),
    // The week of the year and the three after it, for the line on the
    // Walka screen and the sheet Tygodnie, with the notice of a new week not
    // told yet (weeks.js), or null where the weeks are off.
    week: weekOfCharacter(row, now),
    serverTime: now,
  };
}

// With the tag of last week's best guild, in gold wherever a guild's tag
// shows (380 C): asking for it the first time in a new week freezes the
// Sława of the week before (guild-fame.js). And the Punkty Sławy's best
// character of last week, its name in gold, with the character's reward
// waiting (fame.js, 760 A), the week before closed the same way.
export async function getCharacter(context) {
  const { player } = await requirePlayer(context);
  const [champion, fame] = await Promise.all([championOf(context.env.DB, context.now), fameNotice(context.env.DB, player.row.id, context.now)]);
  return json({ character: characterView(player, context.now), championTag: champion?.tag ?? null, fame });
}

// GET /api/profile/:name: another player's character as everyone may see
// it, from a tap on its name in the chat: its look, levels, what it wears
// and the skills it has learned, with its account's role in the chat.
export async function characterProfile(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const name = String(context.params.name ?? '');
  const found = await db
    .prepare(`SELECT c.*, u.login, u.google_sub, u.chat_moderator FROM characters c JOIN users u ON u.id = c.user_id WHERE c.name_key = ? AND c.${OWN_CHARACTERS}`)
    .bind(nameKey(name))
    .first();
  if (!found) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  const view = characterView(await playerOf(db, found), context.now);
  // Whether the one who looks is a friend of this character (community.js);
  // another character of the same account is the player's own.
  const own = await db.prepare("SELECT id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
  const mine = found.user_id === session.userId;
  const guild = await guildOf(db, found.id);
  // "Zaproś do gildii" (the author: "w karcie postaci powinno być Zaproś do
  // gildii, jeśli jeszcze nie ma"): for the leader or a deputy of a guild,
  // to a character of another player in no guild that has the Społeczność;
  // 'sent' once its invitation waits (guilds.js, inviteToGuild).
  const viewerGuild = own && !mine && !guild ? await guildOf(db, own.id) : null;
  const guildInvite =
    viewerGuild && ['leader', 'deputy'].includes(viewerGuild.role) && isUnlocked('community', found.level, content())
      ? (await db.prepare('SELECT 1 FROM guild_invites WHERE guild_id = ? AND character_id = ?').bind(viewerGuild.id, found.id).first())
        ? 'sent'
        : 'can'
      : null;
  const worn = (item) =>
    item && {
      name: item.name,
      base: item.base,
      slot: item.slot,
      slotName: item.slotName,
      level: item.level,
      upgrade: item.upgrade,
      rarity: item.rarity,
      rarityName: item.rarityName,
      color: item.color,
      properties: item.properties,
      classNames: item.classNames,
      classLevel: item.classLevel,
    };
  return json({
    profile: {
      id: found.id,
      name: view.name,
      classId: view.classId,
      className: view.className,
      appearance: view.appearance,
      skin: view.skin,
      // The evolution's portrait (art.js), once the character has one.
      evolution: view.evolution.current?.id ?? null,
      // The frame, the background, the aura and the pet of its portrait,
      // and its name's colour from the frame (cosmetics.js).
      frame: view.cosmetics.frame,
      background: view.cosmetics.background,
      aura: view.cosmetics.aura,
      pet: view.cosmetics.pet,
      // The outfit worn (skórka), in place of its class's look.
      outfit: view.cosmetics.outfit,
      nameColor: view.nameColor,
      level: view.level,
      classLevel: view.classLevel,
      role: chatRole(context.env, found),
      // Its guild, by name and tag (guilds.js), or null.
      guild: guild && { name: guild.name, tag: guild.tag },
      guildInvite,
      relation: mine ? { state: 'self' } : own ? await relationTo(db, own.id, found.id, context.now) : null,
      tradeBlocked: await tradeBlockOf(db, session.userId, found.user_id),
      equipment: content().slots.map((slot) => ({ slot: slot.id, slotName: slot.name, item: worn(view.equipment[slot.id]) })),
      skills: view.skills.pools.flatMap((pool) =>
        pool.options
          .filter((skill) => skill.state === 'main' || skill.state === 'second')
          .map(({ id, name: skillName, level, maxLevel, state, effect }) => ({ id, name: skillName, level, maxLevel, path: state, effect })),
      ),
    },
  });
}

// A new character starts without gear: its first comes from the hunts. The
// narrator gives it Time Points, and an abandoned camp some gold and wood
// (data/balance.json: timePoints.start, startingSupply).
export async function createCharacter(context) {
  const session = await requirePlayable(context);
  const body = await readJson(context.request);
  const name = validateName(body.name);
  const cls = typeof body.classId === 'string' ? content().classesById[body.classId] : undefined;
  if (!cls) throw new ApiError(400, 'invalid_class', 'Wybierz klasę postaci.');
  const appearance = validAppearance(body.appearance);
  const skin = body.skin === undefined ? content().defaultSkin : validSkin(body.skin);

  const db = context.env.DB;
  if (await accountNameTaken(db, name, session.userId)) throw accountNameError();
  const max = content().balance.account.characters;
  const full = () => new ApiError(409, 'characters_full', `Masz już ${max} postaci. Usuń jedną z nich, żeby stworzyć nową.`);
  const [counted, played, parked] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM characters WHERE user_id = ? AND ${OWN_CHARACTERS}`).bind(session.userId),
    db.prepare("SELECT 1 FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId),
    db.prepare("SELECT 1 FROM characters WHERE user_id = ? AND role = 'parked'").bind(session.userId),
  ]);
  if (counted.results[0].count >= max) throw full();
  // The test version's introduction makes its character while the player's
  // own waits parked, and no other until that one is back (testing.js).
  if (played.results.length > 0 && parked.results.length > 0) throw new ApiError(409, 'parked', PARKED_TEXT);

  await refuseLookAlike(db, name);
  const character = { classId: cls.id, level: 1, classLevel: 1, points: {}, position: cls.position };
  const hp = playerCombatant({ character, equipped: [], name }, content()).maxHp;
  const now = context.now;
  const supply = content().balance.startingSupply;
  try {
    // Only while the account has room, checked first (the code review of
    // 12.11.2026): of two creations at once with one place left, the second
    // set aside the character the first had just made, and made none, so
    // the account was left with no character to play.
    await atomically(db, [
      assertion(db, `(SELECT COUNT(*) FROM characters WHERE user_id = ? AND ${OWN_CHARACTERS}) < ?`, [session.userId, max]),
      // The character played until now waits aside, with its exploration or
      // work going on.
      ...setAside(db, session.userId, now),
      // Punkty Systemu earned while the account had no character to play,
      // for the e-mail confirmed (email.js), come with the new one. The
      // statement counts the room again, so two taps at once cannot make a
      // character over the limit.
      db
        .prepare(
          `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, skin, position, hp, hp_at, created_at, gold, resources, time_points, time_points_at, tutorial, system_points)
           SELECT ?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', (SELECT system_points_waiting FROM users WHERE id = ?)
           WHERE (SELECT COUNT(*) FROM characters WHERE user_id = ? AND ${OWN_CHARACTERS}) < ?`,
        )
        .bind(
          session.userId, name, nameKey(name), cls.id, appearance, skin, cls.position, hp, now, now,
          supply.gold, JSON.stringify(supply.resources), content().balance.timePoints.start, now, session.userId, session.userId, max,
        ),
      db.prepare("UPDATE users SET system_points_waiting = 0 WHERE id = ? AND EXISTS (SELECT 1 FROM characters WHERE user_id = ? AND role = 'player')").bind(session.userId, session.userId),
    ], full);
  } catch (error) {
    if (String(error?.message).includes('name_key')) throw new ApiError(409, 'name_taken', 'To imię nosi już inna postać w grze. Wybierz inne.');
    throw error;
  }
  const player = await loadPlayer(db, session.userId);
  if (!player) throw full();
  await settleQuests(db, player, now);
  if (!session.user.skipTutorials) return json({ character: characterView(player, now) }, 201);
  // "Pomijaj objaśnienia narratora" on the account (tutorial.js): the new
  // character starts as after "Pomiń wprowadzenie", its first steps played.
  // Should they fail, the character is made all the same, and the page
  // passes the introduction itself (narrator.js).
  await skipIntroduction(db, session.userId, now).catch((error) => console.error(error));
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

const PARKED_TEXT = 'Najpierw wróć do swojej postaci w „Testuj samouczki”.';

// The statements that set the character the account plays aside: it keeps
// its exploration or work, which go on (the author's 176 A), and its live
// Wymiana ends, as the trade needs the character played (trades.js).
function setAside(db, userId, now) {
  return [
    tradesEnded(db, userId, now),
    db.prepare("UPDATE characters SET role = 'aside' WHERE user_id = ? AND role = 'player'").bind(userId),
  ];
}

// GET /api/characters: the account's characters to choose the one to play,
// each with its look, levels and what it is doing, how many the account
// may have, and the name of the one parked for the test version's
// introduction.
export async function listCharacters(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const own = `SELECT id FROM characters WHERE user_id = ? AND ${OWN_CHARACTERS}`;
  const [rows, works, avatarWorks, parked, perClass] = await db.batch([
    db.prepare(`SELECT * FROM characters WHERE user_id = ? AND ${OWN_CHARACTERS} ORDER BY id`).bind(session.userId),
    db.prepare(`SELECT * FROM activities WHERE character_id IN (${own})`).bind(session.userId),
    // The Awatar Systemu's profession work, for the time over each bust on
    // the Postać tab (screens/character.js, 0.2.27).
    db.prepare(`SELECT character_id, kind, ends_at FROM avatar_activities WHERE character_id IN (${own})`).bind(session.userId),
    db.prepare("SELECT name FROM characters WHERE user_id = ? AND role = 'parked'").bind(session.userId),
    // All the game's characters of each class, played or set aside, for the
    // creation screen (the author: "po to by gracz wiedział jakiej klasy może
    // brakować w grze komuś (w przyszlosci) do druzyny, jaka jest popularna").
    db.prepare(`SELECT class_id, COUNT(*) AS count FROM characters WHERE ${OWN_CHARACTERS} GROUP BY class_id`),
  ]);
  const activities = new Map(works.results.map((row) => [row.character_id, row]));
  const avatars = new Map(avatarWorks.results.map((row) => [row.character_id, { kind: row.kind, endsAt: row.ends_at }]));
  const counts = new Map(perClass.results.map((row) => [row.class_id, row.count]));
  return json({
    characters: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      classId: row.class_id,
      className: classNameOf(engineCharacter(row), content()),
      appearance: row.appearance,
      skin: row.skin ?? content().defaultSkin,
      evolution: content().evolutionsById[row.evolution] ? row.evolution : null,
      // The outfit worn (skórka), for its bust.
      outfit: cosmeticsOf(JSON.parse(row.cosmetics ?? '{}'), content()).outfit,
      level: row.level,
      classLevel: row.class_level,
      played: row.role === 'player',
      activity: activityView(activities.get(row.id) ?? null, row.level, context.now),
      avatarActivity: avatars.get(row.id) ?? null,
    })),
    max: content().balance.account.characters,
    parked: parked.results[0]?.name ?? null,
    classes: Object.fromEntries(content().classes.map((cls) => [cls.id, counts.get(cls.id) ?? 0])),
  });
}

// POST /api/characters/choose { id }: the account plays that character of
// its own from now on, and the one played until then waits aside. Punkty
// Systemu earned while the account played none come with the chosen one.
export async function chooseCharacter(context) {
  const session = await requirePlayable(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const chosen = Number.isInteger(body.id)
    ? await db.prepare(`SELECT id, role FROM characters WHERE id = ? AND user_id = ? AND ${OWN_CHARACTERS}`).bind(body.id, session.userId).first()
    : null;
  if (!chosen) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci na Twoim koncie.');
  if (chosen.role === 'player') return json({ ok: true });
  if (await db.prepare("SELECT 1 FROM characters WHERE user_id = ? AND role = 'parked'").bind(session.userId).first()) throw new ApiError(409, 'parked', PARKED_TEXT);
  await db.batch([
    ...setAside(db, session.userId, context.now),
    db
      .prepare("UPDATE characters SET role = 'player', system_points = system_points + (SELECT system_points_waiting FROM users WHERE id = ?), version = version + 1 WHERE id = ? AND role = 'aside'")
      .bind(session.userId, chosen.id),
    db.prepare("UPDATE users SET system_points_waiting = 0 WHERE id = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND role = 'player')").bind(session.userId, chosen.id),
  ]);
  return json({ ok: true });
}

// POST /api/character/name { name }: the new name, checked as a new
// character's is; the chat's messages it wrote take it too. A character
// whose name the filter blocks (names.js) must take one, and any character
// may change its name once in the Ustawienia (the author: "jednorazowo, po
// czym opcja się blokuje"); the change the filter forces does not count.
// What shows a character's name besides its own row, once it has `name`
// (`renamed`: { sql, binds }, true only when the row took it): its chat
// messages and its offers open on the Targowisko, whose seller everyone
// sees (the code review, 12.11.2026: a blocked name the System renamed
// stayed on them until the auction ended).
const nameShown = (db, characterId, name, renamed = { sql: '1', binds: [] }) => [
  db.prepare(`UPDATE chat_messages SET name = ? WHERE character_id = ? AND ${renamed.sql}`).bind(name, characterId, ...renamed.binds),
  db.prepare(`UPDATE market_offers SET seller_name = ? WHERE seller_id = ? AND state = 'open' AND ${renamed.sql}`).bind(name, characterId, ...renamed.binds),
];

// The name may change during an exploration: nothing there depends on it.
export async function renameCharacter(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const forced = blockedName(player.row.name, content());
  if (!forced && player.row.name_changed) throw new ApiError(409, 'name_locked', content().chat.names.locked);
  const name = validateName(body.name);
  const db = context.env.DB;
  await refuseLookAlike(db, name, player.row.id);
  if (await accountNameTaken(db, name, session.userId)) throw accountNameError();
  try {
    await db.batch([
      db
        .prepare('UPDATE characters SET name = ?, name_key = ?, name_changed = name_changed + ?, name_notice = NULL, version = version + 1 WHERE id = ?')
        .bind(name, nameKey(name), forced ? 0 : 1, player.row.id),
      ...nameShown(db, player.row.id, name),
    ]);
  } catch (error) {
    if (String(error?.message).includes('name_key')) throw new ApiError(409, 'name_taken', 'To imię nosi już inna postać w grze. Wybierz inne.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// POST /api/character/name/seen: the player read the System's word about
// the name it gave the character.
export async function nameNoticeSeen(context) {
  const { session, player } = await requirePlayer(context);
  await context.env.DB.prepare('UPDATE characters SET name_notice = NULL WHERE id = ?').bind(player.row.id).run();
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

// The new week of the year told on the page (weekOfCharacter in weeks.js):
// not told again until the next one. The character's version stays, as
// for the name's notice, so no action of the same moment is refused.
export async function weekNoticeSeen(context) {
  const { session, player } = await requirePlayer(context);
  const { startsAt } = weekAt(context.now, content());
  await context.env.DB.prepare('UPDATE characters SET week_seen = ? WHERE id = ? AND COALESCE(week_seen, 0) < ?').bind(startsAt, player.row.id, startsAt).run();
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

// The scheduled run (index.js), at the top of every hour from names.renameAt
// on (the author: "W poniedziałek o godz. 1:00 czasu polskiego zmień nazwy
// postaci [...], które mają niecenzuralne na takie, które są akceptowalne.
// Po prostu im je wygeneruj."): every character whose name the filter
// blocks gets a name from names.generated for its look, the first one free
// in an order drawn from its id, or with its id after it when all are
// taken; its chat messages take it too, and its player is told. Returns
// the characters renamed.
export async function renameBlockedNames(env, now) {
  const words = content().chat.names;
  const from = Date.parse(words.renameAt);
  if (!(now >= from) || new Date(now).getUTCMinutes() !== 0) return 0;
  const db = env.DB;
  const { results } = await db.prepare('SELECT id, user_id, name, appearance FROM characters').all();
  let renamed = 0;
  for (const row of results.filter((one) => blockedName(one.name, content()))) {
    const pool = words.generated[row.appearance === 'female' ? 'female' : 'male'];
    const rng = createRng(`name:${row.id}`);
    const order = pool.map((name) => ({ name, key: rng.float(0, 1) })).sort((a, b) => a.key - b.key).map(({ name }) => name);
    let name = null;
    for (const candidate of order) {
      // Free of the characters and of the other accounts' names (832 A).
      const key = nameKey(candidate);
      const taken = await db
        .prepare('SELECT EXISTS (SELECT 1 FROM characters WHERE name_key = ?) OR EXISTS (SELECT 1 FROM users WHERE account_name_key = ? AND id != ?) AS taken')
        .bind(key, key, row.user_id)
        .first();
      if (!taken.taken) {
        name = candidate;
        break;
      }
    }
    name ??= `${order[0]}${row.id}`;
    // Only while the character still has the name read: one its player chose
    // meanwhile (free for a blocked name) stays (the code review,
    // 12.11.2026). A name someone took meanwhile stops only this character's
    // renaming, until the next hour, not the whole run.
    try {
      const [done] = await db.batch([
        db
          .prepare('UPDATE characters SET name = ?, name_key = ?, name_notice = ?, version = version + 1 WHERE id = ? AND name = ?')
          .bind(name, nameKey(name), words.renamed.replace('{name}', name), row.id, row.name),
        ...nameShown(db, row.id, name, { sql: 'EXISTS (SELECT 1 FROM characters WHERE id = ? AND name = ?)', binds: [row.id, name] }),
      ]);
      if (done.meta.changes === 1) renamed += 1;
    } catch (error) {
      if (!String(error?.message).includes('UNIQUE')) throw error;
    }
  }
  return renamed;
}

const validAppearance = (id) => {
  if (typeof id !== 'string' || !content().appearancesById[id]) throw new ApiError(400, 'invalid_appearance', 'Wybierz wygląd postaci.');
  return id;
};

// The look can change at any time, also during an exploration: it changes
// nothing but the portrait and the voice.
export async function setAppearance(context) {
  const { player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const appearance = validAppearance(body.appearance);
  await context.env.DB.prepare('UPDATE characters SET appearance = ?, version = version + 1 WHERE id = ?').bind(appearance, player.row.id).run();
  const updated = { ...player, row: { ...player.row, appearance, version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
}

const validSkin = (id) => {
  if (typeof id !== 'string' || !content().skinsById[id]) throw new ApiError(400, 'invalid_skin', 'Wybierz kolor skóry.');
  return id;
};

// The skin tone changes the portrait only, so it too can change at any time.
export async function setSkin(context) {
  const { player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const skin = validSkin(body.skin);
  await context.env.DB.prepare('UPDATE characters SET skin = ?, version = version + 1 WHERE id = ?').bind(skin, player.row.id).run();
  const updated = { ...player, row: { ...player.row, skin, version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
}

// "Usuń postać" (once "Zacznij od nowa"): the character, its items, hunt, reports and messages in
// the chat are removed; the account stays, with its other characters, what
// it hides in the chat and its silence there (chat.js), and the player
// chooses another character or creates a new one.
export async function deleteCharacter(context) {
  const { player } = await requirePlayer(context);
  const db = context.env.DB;
  await db.batch(characterRemoval(db, player.row.id, context.now));
  return json({ ok: true });
}

// The rows that outlive the characters `which` (SQL after `character_id`,
// with `binds`), kept with the id made negative, as the purchases are: the
// database gives the highest id of a removed character again. The goods
// they put in the Skrzynia Konta join their account's no one's pieces of
// each good (character 0, chest.js), as one character's goods are a row to
// a good.
export const detachedRows = (db, which, binds) => [
  ...['chest_items', 'lottery_draws', 'gift_codes_used'].map((table) =>
    db.prepare(`UPDATE ${table} SET character_id = -character_id WHERE character_id ${which}`).bind(...binds),
  ),
  db
    .prepare(
      `INSERT INTO chest_goods (user_id, character_id, kind, good, count, traded)
       SELECT user_id, 0, kind, good, SUM(count), SUM(traded) FROM chest_goods WHERE character_id ${which} GROUP BY user_id, kind, good
       ON CONFLICT (user_id, character_id, kind, good) DO UPDATE SET count = count + excluded.count, traded = traded + excluded.traded`,
    )
    .bind(...binds),
  db.prepare(`DELETE FROM chest_goods WHERE character_id ${which}`).bind(...binds),
];

// The Rdzeń at a glance (characterView): its sockets, those free, the
// Odłamki and its gem.
function coreSummary(row) {
  const core = coreOf(row);
  return {
    open: true,
    sockets: coreSockets(row.level, content()),
    free: freeSockets(core, row.level, content()),
    shards: core.shards,
    gem: gemView(core.gem, content()),
  };
}

// The statements that remove a character with all it has, at `now`.
export function characterRemoval(db, id, now) {
  return [
    db.prepare('DELETE FROM friends WHERE character_id = ? OR friend_id = ?').bind(id, id),
    db.prepare('DELETE FROM gifts WHERE sender_id = ? OR receiver_id = ?').bind(id, id),
    db.prepare('DELETE FROM trades WHERE from_id = ? OR to_id = ?').bind(id, id),
    db.prepare('DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE character_id = ? OR recipient_id = ?)').bind(id, id),
    // Its tags in the chat, and the tags in its messages (mentions.js).
    db.prepare('DELETE FROM chat_mentions WHERE character_id = ? OR message_id IN (SELECT id FROM chat_messages WHERE character_id = ? OR recipient_id = ?)').bind(id, id, id),
    db.prepare('DELETE FROM chat_messages WHERE character_id = ? OR recipient_id = ?').bind(id, id),
    db.prepare('DELETE FROM chat_closed WHERE character_id = ? OR other_id = ?').bind(id, id),
    db.prepare('DELETE FROM reports WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM activities WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM avatar_activities WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM items WHERE character_id = ?').bind(id),
    // What waits in its Przechowalnia (storage.js).
    db.prepare('DELETE FROM storage_items WHERE character_id = ?').bind(id),
    // The Artefakty of its Skrytka Rdzenia (core.js).
    db.prepare('DELETE FROM core_artifacts WHERE character_id = ?').bind(id),
    // Its cards, deck and matches of the Talia Systemu (cards.js).
    ...cardRemoval(db, '= ?', [id]),
    db.prepare('DELETE FROM buildings WHERE character_id = ?').bind(id),
    // Its tickets of the Loteria not drawn yet (casino.js).
    db.prepare('DELETE FROM lottery_tickets WHERE character_id = ?').bind(id),
    ...marketRemoval(db, '?', [id]),
    ...partyRemoval(db, '?', [id]),
    ...guildRemoval(db, '?', [id], now),
    // Its purchases of Punkty Systemu stay for the bookkeeping, detached
    // (the id made negative), as its id may be given again (payments.js).
    db.prepare('UPDATE purchases SET character_id = -character_id WHERE character_id = ?').bind(id),
    // So do the items it put in the Skrzynia Konta (for the account's other
    // characters, no one's own any more: chest.js), the Loteria draw it won
    // and the gift codes it took for the account (11.11.2026): else a new
    // character given its id would take them as its own.
    ...detachedRows(db, '= ?', [id]),
    db.prepare('DELETE FROM characters WHERE id = ?').bind(id),
  ];
}

async function savePoints(context, player, points) {
  const result = await context.env.DB.prepare(
    'UPDATE characters SET points = ?, version = version + 1 WHERE id = ? AND version = ?',
  )
    .bind(JSON.stringify(points), player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) {
    throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  }
  const updated = { ...player, row: { ...player.row, points: JSON.stringify(points), version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
}

export async function spendPoints(context) {
  const { player } = await requireBuildPlayer(context);
  const body = await readJson(context.request);
  const added = body.points;
  const invalid = new ApiError(400, 'invalid_points', 'Nieprawidłowy podział punktów.');
  if (added === null || typeof added !== 'object' || Array.isArray(added)) throw invalid;

  const character = engineCharacter(player.row);
  const points = { ...character.points };
  let total = 0;
  for (const [stat, value] of Object.entries(added)) {
    if (!content().statsById[stat] || !Number.isInteger(value) || value < 0) throw invalid;
    if (value > 0) points[stat] = (points[stat] ?? 0) + value;
    total += value;
  }
  if (total === 0) throw invalid;
  if (!(total <= freePoints(character, content()))) {
    throw new ApiError(400, 'not_enough_points', 'Nie masz tylu wolnych punktów.');
  }
  return savePoints(context, player, points);
}

export async function autoPoints(context) {
  const { player } = await requireBuildPlayer(context);
  const character = engineCharacter(player.row);
  if (freePoints(character, content()) === 0) {
    throw new ApiError(400, 'no_free_points', 'Nie masz wolnych punktów.');
  }
  return savePoints(context, player, autoDistribute(character, content()));
}

export async function resetPoints(context) {
  const { player } = await requireBuildPlayer(context);
  if (player.row.level > content().balance.progression.freeResetMaxLevel) {
    throw new ApiError(
      403,
      'reset_locked',
      `Darmowe zerowanie punktów jest dostępne do poziomu ${content().balance.progression.freeResetMaxLevel}.`,
    );
  }
  return savePoints(context, player, {});
}
