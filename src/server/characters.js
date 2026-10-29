// The player's character: creation, the full view the page draws, and free
// stat points.

import {
  areaFor,
  autoDistribute,
  bagCapacity,
  buildsUnderWay,
  campBonus,
  campLevels,
  canUse,
  classXpToNext,
  collect,
  combatValues,
  computeStats,
  construction,
  craftLevelFor,
  craftMinutes,
  craftTable,
  openedChests,
  patternFrom,
  craftTakes,
  currentQuests,
  effectText,
  equipChange,
  fireTrade,
  fireUnitsMade,
  freePoints,
  gainedTimePoints,
  bagStacks,
  hoursToNext,
  isUnlocked,
  huntDurations,
  itemView,
  materialView,
  nextHuntUnlock,
  plannedLevel,
  playerCombatant,
  production,
  professionOpen,
  questPeriod,
  questsStale,
  questsView,
  regenPerMinute,
  resourceExchange,
  restBonus,
  restedHp,
  salvageYield,
  settleCrafting,
  shopBought,
  shopLeft,
  shopOffer,
  skillsView,
  spentPoints,
  statEffects,
  unlockedFeatures,
  upgradeCost,
  buildMinutes,
  campEffectText,
  campLevel,
  xpToNext,
  buffLeft,
  optionWindows,
  TIMED_KINDS,
} from '../engine/index.js';
import { chatRole } from './chat.js';
import { relationTo } from './community.js';
import { content } from './content.js';
import { craftingOn, professionsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { bagHerbs, bagPotions, herbsOf, potionsOf, professionsView } from './professions-view.js';
import { requirePlayable } from './sessions.js';
import { tradeBlockOf } from './trades.js';

// 2 to 20 characters: letters and digits, spaces, hyphens, apostrophes and
// underscores ("Justi_725"), from a letter to a letter or a digit. What a
// phone's keyboard adds unseen goes: invisible marks, letters split from
// their accents (joined again), a curly apostrophe (made straight). The
// message names what is wrong.
const NAME_CHARACTER = /[\p{L}\p{N}_' -]/u;
const ALLOWED_TEXT = 'Mogą być litery, cyfry, spacje, myślniki, apostrofy i podkreślniki.';

export function validateName(value) {
  const name =
    typeof value === 'string'
      ? value.normalize('NFC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc]/g, "'")
      : '';
  const characters = [...name];
  const wrong = characters.find((character) => !NAME_CHARACTER.test(character));
  const problem =
    characters.length < 2 || characters.length > 20
      ? 'Imię postaci musi mieć od 2 do 20 znaków.'
      : wrong
        ? `Imię postaci nie może zawierać znaku „${wrong}”. ${ALLOWED_TEXT}`
        : !/^\p{L}/u.test(name)
          ? 'Imię postaci musi zaczynać się od litery.'
          : !/[\p{L}\p{N}]$/u.test(name)
            ? 'Imię postaci musi kończyć się literą albo cyfrą.'
            : null;
  if (problem) throw new ApiError(400, 'invalid_name', problem);
  return name;
}

// No two players share a name, whatever the letter case
// (migrations/0009_unique_names.sql).
const nameKey = (name) => name.toLowerCase();

export async function loadPlayer(db, userId) {
  const row = await db.prepare("SELECT * FROM characters WHERE user_id = ? AND role = 'player'").bind(userId).first();
  if (!row) return null;
  const [items, activities, avatarActivities, buildings] = await db.batch([
    db.prepare('SELECT id, slot, data FROM items WHERE character_id = ? ORDER BY id').bind(row.id),
    db.prepare('SELECT * FROM activities WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT * FROM avatar_activities WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT building_id, level, started_at, ends_at, collected_at FROM buildings WHERE character_id = ?').bind(row.id),
  ]);
  return {
    row,
    // equippedSlot is where the item is worn (null in the bag); item.slot is where it can go.
    items: items.results.map((item) => ({ id: item.id, equippedSlot: item.slot, ...JSON.parse(item.data) })),
    activity: activities.results[0] ?? null,
    // The work of the Awatar Systemu, kept as the character's own (avatar.js).
    avatarActivity: avatarActivities.results[0] ?? null,
    // { campfire: { level, startedAt, endsAt, collectedAt } }: see camp.js in the engine.
    buildings: Object.fromEntries(
      buildings.results.map((building) => [
        building.building_id,
        { level: building.level, startedAt: building.started_at, endsAt: building.ends_at, collectedAt: building.collected_at },
      ]),
    ),
  };
}

// Gold and resources together, as building costs name them.
export function walletOf(row) {
  const stored = JSON.parse(row.resources ?? '{}');
  return { gold: row.gold, ...Object.fromEntries(content.resources.map((resource) => [resource.id, stored[resource.id] ?? 0])) };
}

export async function requirePlayer(context) {
  const session = await requirePlayable(context);
  const player = await loadPlayer(context.env.DB, session.userId);
  if (!player) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  await settleBuilds(context.env.DB, player, context.now);
  await settleTimePoints(context.env.DB, player.row, context.now);
  await settleQuests(context.env.DB, player, context.now);
  return { session, player };
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

// Gathering herbs, brewing potions and making items are no fights: the
// character rests meanwhile, as at home.
export const restsDuring = (activity) => !activity || ['herbs', 'potions', 'items'].includes(activity.kind);

// A character's buffs (potions.js). A speed potion drunk while its time
// still passed everywhere keeps what it had left.
export function buffsOf(row, now) {
  const buffs = JSON.parse(row.buffs ?? '{}');
  const { speed } = buffs;
  if (speed && !Number.isFinite(speed.ms)) buffs.speed = { ms: Math.max(0, (speed.until ?? now) - now), bonus: speed.bonus };
  return buffs;
}

// The potions for a time drunk from the bag that still work (potions.js), by
// kind: the time of explorations they have left after the one under way,
// until when they work in it, their bonus and the words for it.
function activeBuffs(player, now) {
  const buffs = buffsOf(player.row, now);
  const windows = player.activity?.kind === 'hunt' ? optionWindows(JSON.parse(player.activity.options ?? '{}')) : {};
  const active = [];
  for (const kind of TIMED_KINDS) {
    const window = windows[kind];
    const ends = window ? player.activity.started_at + window.ms : 0;
    const until = ends > now ? ends : null;
    const ms = buffLeft(buffs, kind);
    if (ms <= 0 && !until) continue;
    const bonus = until ? window.bonus : buffs[kind].bonus;
    active.push({ kind, ms, until, bonus, label: content.potionUse.buffLabels[kind].replace('{bonus}', Math.round(bonus * 100)) });
  }
  return active;
}

// The bag's places taken: one an item, and the herbs and the potions by the
// stack.
export const bagPlaces = (player) =>
  player.items.filter((item) => !item.equippedSlot).length + bagStacks(herbsOf(player.row), content) + bagStacks(potionsOf(player.row), content);

// What adds a gathered store to the character: gold has its own column, the
// other resources sit in the JSON of `resources`.
export function gainSql(resource, amount) {
  return resource === 'gold'
    ? { sql: 'gold = gold + ?', values: [amount] }
    : { sql: 'resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?)', values: [path(resource), path(resource), amount] };
}

// The waiting builds whose time has come start, one after another, each as
// if it had started at its own time, as a build started by hand does
// (camp.js: beginBuilding): a production building's store goes to the
// resources then, and the HP rested by then is saved. Each start saves only
// if the character is as seen here; when another request moved first, the
// character is read again and its queue goes on from there.
async function settleBuilds(db, player, now) {
  for (let tries = 0; tries < 10; tries++) {
    const [entry, ...rest] = buildQueue(player.row);
    if (!entry || entry.startsAt > now) return;
    const { row } = player;
    const at = entry.startsAt;
    const building = content.buildingsById[entry.buildingId];
    const producing = building?.effect.kind === 'production';
    const gathered = producing ? collect(building, player.buildings[building.id], at) : null;
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
    if (building) {
      statements.push(
        db
          .prepare(
            `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at)
             SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)
             ON CONFLICT (character_id, building_id) DO UPDATE
               SET level = excluded.level, started_at = excluded.started_at, ends_at = excluded.ends_at, collected_at = excluded.collected_at`,
          )
          .bind(row.id, building.id, entry.level, at, entry.endsAt, producing ? entry.endsAt : null, row.id, row.version + 1),
      );
    }
    const [moved] = await db.batch(statements);
    if (moved.meta.changes !== 1) {
      Object.assign(player, await loadPlayer(db, row.user_id));
      continue;
    }
    row.build_queue = JSON.stringify(rest);
    row.version += 1;
    if (gathered?.resource === 'gold') row.gold += gathered.amount;
    else if (gathered) {
      const resources = JSON.parse(row.resources ?? '{}');
      resources[gathered.resource] = (resources[gathered.resource] ?? 0) + gathered.amount;
      row.resources = JSON.stringify(resources);
    }
    if (resting) Object.assign(row, { hp, hp_at: at });
    if (building) {
      player.buildings[building.id] = { level: entry.level, startedAt: at, endsAt: entry.endsAt, collectedAt: producing ? entry.endsAt : null };
    }
  }
}

// The Punkty Czasu that came with time since time_points_at join the stored
// ones (gainedTimePoints), and `row` shows them. The version stays: a change
// sent at the same moment still saves, and the condition on time_points_at
// adds each point once.
async function settleTimePoints(db, row, now) {
  const { points, since } = gainedTimePoints(row.time_points_at, now, content);
  if (points === 0) return;
  const result = await db
    .prepare('UPDATE characters SET time_points = time_points + ?, time_points_at = ? WHERE id = ? AND time_points_at = ?')
    .bind(points, since, row.id, row.time_points_at)
    .run();
  if (result.meta.changes === 1) Object.assign(row, { time_points: row.time_points + points, time_points_at: since });
  else Object.assign(row, await db.prepare('SELECT time_points, time_points_at FROM characters WHERE id = ?').bind(row.id).first());
}

// What a period's quests are drawn from: the character as it is, whether its
// Stół rozbiórki stands, which professions it has (Rzemieślnictwo where it
// works and from its own level), and its id for the seed (quests.js).
export function questContext(player, now) {
  const hasProfessions = professionsOn() && isUnlocked('professions', player.row.level, content);
  const crafting = content.professionsById[content.workshop.profession];
  return {
    character: engineCharacter(player.row),
    hasTable: craftTable(campLevels(player.buildings, now, content), content).pace > 0,
    hasProfessions,
    hasCrafting: hasProfessions && craftingOn() && professionOpen(crafting, player.row.level, content),
    seed: player.row.id,
  };
}

// The quests of both periods at `now`.
export const questsNow = (player, now) => currentQuests(JSON.parse(player.row.quests ?? '{}'), questContext(player, now), now, content);

// A new day or week draws its quests and saves them at once, so they stay
// the same however the character changes that day; so are the lost quests
// drawn anew in their place (quests.js). As with the Punkty Czasu, the
// version stays, and only the first of two requests at once saves them.
export async function settleQuests(db, player, now) {
  const { row } = player;
  const stored = JSON.parse(row.quests ?? '{}');
  const settled = questsNow(player, now);
  if (!questsStale(stored, now, content) && JSON.stringify(settled) === JSON.stringify(stored)) return;
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
  const texts = { herbs: content.professionTexts, potions: content.brewing?.texts, items: content.workshop?.texts }[activity.kind];
  throw activity.ends_at <= now
    ? new ApiError(409, 'claim_first', texts ? texts.claimFirst[0] : 'Wyprawa się skończyła. Najpierw odbierz raport.')
    : new ApiError(409, 'busy', texts ? texts.busy[0] : 'Postać jest na wyprawie. Poczekaj na jej koniec.');
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
    const { texts } = content.avatar;
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

export function engineCharacter(row) {
  return {
    classId: row.class_id,
    level: row.level,
    xp: row.xp,
    classLevel: row.class_level,
    classXp: row.class_xp,
    points: JSON.parse(row.points),
    // Free stat points an event gave beyond those of the levels.
    bonusPoints: row.bonus_points ?? 0,
    position: row.position,
    appearance: row.appearance,
    skin: row.skin ?? content.defaultSkin,
    // The skills learned and their levels (skills.js).
    skills: JSON.parse(row.skills ?? '{}'),
    // The professions' levels and XP (professions.js).
    professions: JSON.parse(row.professions ?? '{}'),
  };
}

export const equippedItems = (player) => player.items.filter((item) => item.equippedSlot);

// HP now: frozen at the start of an exploration, otherwise rested since
// hp_at (also while gathering herbs), faster with the camp's Ognisko.
export function currentHp(player, now) {
  const character = engineCharacter(player.row);
  const { totals } = computeStats(character, equippedItems(player), content);
  const combatant = playerCombatant({ character, equipped: equippedItems(player), name: player.row.name }, content);
  const rest = restBonus(player.buildings, player.row.hp_at, now, content);
  const hp = !restsDuring(player.activity)
    ? player.activity.hp_at_start
    : restedHp(
        { hp: player.row.hp, since: player.row.hp_at, now, maxHp: combatant.maxHp, vitality: totals.vitality, ...rest },
        content,
      );
  return { hp: Math.min(hp, combatant.maxHp), maxHp: combatant.maxHp, vitality: totals.vitality, combatant, rest };
}

// The camp as the page shows it: its own level, and each building with its
// level and, below its highest level, what the next one gives, costs and
// takes in a camp of this level.
function campView(player, levels, now) {
  const running = construction(player.buildings, now);
  const queue = buildQueue(player.row);
  const { camp } = content;
  const own = campLevel(player.buildings, now, content);
  // The next level of each building comes after the builds under way and
  // waiting, and builds in the camp they leave behind.
  const campThen = plannedLevel(camp, player.buildings, queue);
  const following = campThen < camp.maxLevel ? campThen + 1 : null;
  const queued = (id) => queue.filter((entry) => entry.buildingId === id).map((entry) => entry.level);
  return {
    level: {
      id: camp.id,
      name: camp.name,
      description: camp.description,
      level: own,
      maxLevel: camp.maxLevel,
      effect: campEffectText(own, content),
      // At the highest level only the evolution to come is left.
      evolution: following ? null : camp.evolution,
      next: following && {
        level: following,
        effect: campEffectText(following, content),
        minutes: buildMinutes(camp, following, campThen, content),
        cost: upgradeCost(camp, following),
      },
      queued: queued(camp.id),
    },
    construction: running && {
      buildingId: running.buildingId,
      name: content.buildingsById[running.buildingId].name,
      level: running.level,
      startedAt: running.startedAt,
      endsAt: running.endsAt,
    },
    // The builds waiting after it, each with the time it starts, and how
    // many builds the camp has at most, the one under way too.
    queue: queue.map((entry) => ({ ...entry, name: content.buildingsById[entry.buildingId]?.name ?? entry.buildingId })),
    queueSize: camp.queue,
    underWay: buildsUnderWay(player.buildings, queue, now),
    buildings: content.buildings.map((building) => {
      const level = levels[building.id];
      const planned = plannedLevel(building, player.buildings, queue);
      const next = planned < building.maxLevel ? planned + 1 : null;
      const stored = player.buildings[building.id];
      // A production building's store, once the building stands: the page
      // counts it up from `since`.
      const store = level > 0 ? production(building, stored, now) : null;
      return {
        id: building.id,
        name: building.name,
        description: building.description,
        level,
        maxLevel: building.maxLevel,
        // The Stół rozbiórki: its screen shows the table (crafting).
        crafts: building.effect.kind === 'craftSpeed',
        effect: level > 0 ? effectText(building, level, content) : null,
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
          effect: effectText(building, next, content),
          minutes: buildMinutes(building, next, campThen, content),
          cost: upgradeCost(building, next),
        },
        queued: queued(building.id),
        trade: building.trade && level > 0 ? fireView(building, level, player.row, now) : null,
        shop: building.shop && level > 0 ? shopView(building, level, player.row, now) : null,
        exchange: building.exchange && level > 0 ? exchangeView(building, level) : null,
      };
    }),
  };
}

// The fire spirit's trade at the Ognisko's level: the price of a piece,
// the pieces a day and those left today, and the same at the next level.
function fireView(building, level, row, now) {
  const trade = fireTrade(level, content);
  const made = fireUnitsMade({ day: row.fire_day, units: row.fire_units }, now, content);
  const next = level < building.maxLevel ? fireTrade(level + 1, content) : null;
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
  const exchange = resourceExchange(level, content);
  const next = level < building.maxLevel ? resourceExchange(level + 1, content) : null;
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
  const offer = shopOffer(level, content);
  const later = level < building.maxLevel ? shopOffer(level + 1, content) : null;
  const bought = shopBought({ day: row.shop_day, parts: JSON.parse(row.shop_parts ?? '{}') }, now, content);
  return {
    title: building.shop.title,
    text: building.shop.text,
    counts: building.shop.counts,
    // Each part with its price, the parts a day and those left today.
    parts: offer.map(({ partId, price }) => ({
      id: partId,
      price,
      daily: building.shop.daily[content.partsById[partId].rarity],
      left: shopLeft(partId, bought, content),
    })),
    next: later && {
      level: level + 1,
      added: later
        .filter(({ partId }) => !offer.some((entry) => entry.partId === partId))
        .map(({ partId }) => ({ id: partId, name: content.partsById[partId].name, gender: content.partsById[partId].gender })),
      discount: building.shop.discountPerLevel,
    },
  };
}

// What the character row keeps: materials, parts and the queue, as JSON.
export function craftingState(row) {
  return { materials: JSON.parse(row.materials ?? '{}'), parts: JSON.parse(row.parts ?? '{}'), queue: JSON.parse(row.crafting ?? '[]') };
}

const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

// The table as the page shows it, settled at `now`. `pace` 0: no table yet.
function craftingView(row, levels, now) {
  const table = craftTable(levels, content);
  const { pace } = table;
  const { materials, parts, queue } = settleCrafting(craftingState(row), now);
  return {
    pace,
    // The table's level, the highest rarity it takes and the chance of an
    // extra part for each part made.
    level: table.level,
    maxRarity: table.maxRarity < 0 ? null : content.rarities[table.maxRarity].id,
    bonusChance: table.bonusChance,
    limit: content.balance.crafting.queueLimit,
    materials: Object.entries(materials)
      .map(([key, count]) => {
        const view = materialView(key, count, content);
        // `needs`: the table's level that takes this rarity, when it is not built up to it yet.
        const takes = pace > 0 && craftTakes(table, view.rarity, content);
        return {
          ...view,
          minutes: takes ? craftMinutes(view.rarity, count, pace, content) : null,
          needs: pace > 0 && !takes ? craftLevelFor(view.rarity, content) : null,
        };
      })
      .sort((a, b) => rarityIndex(a.rarity) - rarityIndex(b.rarity) || a.name.localeCompare(b.name, 'pl')),
    parts: content.parts.map((part) => ({
      id: part.id,
      name: part.name,
      description: part.description,
      rarity: part.rarity,
      color: content.raritiesById[part.rarity].color,
      count: parts[part.id] ?? 0,
    })),
    queue: queue.map((order) => {
      const material = order.kind === 'material' ? materialView(order.key, order.count, content) : null;
      const rarity = material ? material.rarity : order.rarity;
      return {
        id: order.id,
        kind: order.kind,
        materialId: material?.materialId ?? null,
        name: material ? material.name : order.name,
        count: order.kind === 'material' ? order.count : 1,
        rarity,
        color: content.raritiesById[rarity].color,
        part: content.partsById[order.partId].name,
        parts: order.parts,
        // Extra parts from the table's later levels, told when the order ends.
        bonus: order.bonus ?? 0,
        startsAt: order.startsAt,
        endsAt: order.endsAt,
      };
    }),
  };
}

// Where an activity takes place. region_id holds the inner region, or a whole
// region for an activity started before inner regions; a gathering, its
// place and the herbs chosen; a brewing, its place, the potion and how many;
// an order of items, its place, the pattern, the rarity and how many.
function activityPlace(activity, level) {
  if (activity.kind === 'herbs') {
    const herbs = (JSON.parse(activity.options ?? '{}').herbs ?? []).filter((id) => content.herbsById[id]);
    return { profession: content.gathering.profession, placeName: content.gathering.place.name, herbs: herbs.map((id) => ({ id, name: content.herbsById[id].name })) };
  }
  if (activity.kind === 'potions') {
    const { recipe, count } = JSON.parse(activity.options ?? '{}');
    const potion = content.potionsById[recipe];
    return { profession: content.brewing.profession, placeName: content.brewing.place.name, potion: potion ? { id: potion.id, name: potion.name } : null, count: count ?? 0 };
  }
  if (activity.kind === 'items') {
    const { base: baseId, rarity, count, scroll } = JSON.parse(activity.options ?? '{}');
    const base = scroll ? content.workshop.scroll : content.basesById[baseId];
    return {
      profession: content.workshop.profession,
      placeName: content.workshop.place.name,
      base: base ? { id: base.id, name: base.name } : null,
      rarityName: content.raritiesById[rarity]?.name ?? '',
      count: count ?? 0,
      ...(scroll && { scroll: true }),
    };
  }
  const area = areaFor(activity.region_id, level, content);
  return { areaId: area.id, areaName: area.name, regionId: area.regionId, regionName: area.regionName };
}

// An activity as the page shows it, of the character or of its Awatar.
function activityView(activity, level, now) {
  return (
    activity && {
      kind: activity.kind,
      ...activityPlace(activity, level),
      minutes: activity.minutes,
      startedAt: activity.started_at,
      endsAt: activity.ends_at,
      avoidRare: activity.avoid_rare === 1,
      seekRare: activity.seek_rare === 1,
      // The creatures the exploration tracks for the quests (hunts.js).
      tracksQuests: activity.tracked !== null && activity.tracked !== undefined,
      finished: activity.ends_at <= now,
    }
  );
}

// How many Szybkie Polowania the character has used today in Poland
// (hunts.js).
export function quickHuntsUsed(row, now) {
  const stored = JSON.parse(row.quick_hunts ?? 'null');
  return stored?.day === questPeriod('daily', now, content).key ? stored.used : 0;
}

// The Szybkie Polowania left today, or null below their level.
function quickHuntsView(row, now) {
  const { perDay, minutes } = content.balance.quickHunt;
  return isUnlocked('quick-hunts', row.level, content) ? { left: Math.max(0, perDay - quickHuntsUsed(row, now)), perDay, minutes } : null;
}

// The Awatar Systemu (avatar.js): its price and words until it is bought,
// then its work under way, or null.
function avatarView(player, now) {
  const { name, price, description } = content.avatar;
  return { name, price, description, owned: Boolean(player.row.avatar_at), activity: activityView(player.avatarActivity, player.row.level, now) };
}

export function characterView(player, now) {
  const { row, items, activity } = player;
  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const professions = professionsView(row);
  const { totals, sources } = computeStats(character, equipped, content);
  const { hp, maxHp, combatant, rest } = currentHp(player, now);
  const values = combatValues(character, equipped, content);
  const perPoint = statEffects(character, equipped, content);
  const levels = campLevels(player.buildings, now, content);
  const sellBonus = campBonus(levels, 'sellPrice', content);
  // The Kowadło's level is the highest upgrade it allows.
  const upgradeCap = campBonus(levels, 'upgradeCap', content);
  // What the Stół rozbiórki makes of an item taken apart and how long it
  // takes, or the table's level its rarity needs.
  // With Rzemieślnictwo, also the pattern the item teaches (patternFrom).
  const table = craftTable(levels, content);
  const learned = JSON.parse(row.patterns ?? '[]');
  const salvage = (item) => {
    const { partId, count } = salvageYield(item, content);
    const part = content.partsById[partId];
    const takes = table.pace > 0 && craftTakes(table, item.rarity, content);
    const pattern = craftingOn() && patternFrom(item, learned, content);
    return {
      part: part.name,
      color: content.raritiesById[part.rarity].color,
      parts: count,
      minutes: takes ? craftMinutes(item.rarity, count, table.pace, content) : null,
      needs: table.pace > 0 && !takes ? craftLevelFor(item.rarity, content) : null,
      ...(pattern && { pattern: content.basesById[pattern].name }),
    };
  };
  const toItem = (item) => ({ id: item.id, ...itemView(item, content, { sellBonus, upgradeCap }), salvage: salvage(item) });
  // Whether a bag item would make the character stronger in place of what
  // its slot holds (preview.js), for the marks on the bag and on finds; null
  // for an item the class cannot wear.
  const verdict = (item) =>
    canUse(item.base, row.class_id, content) && !content.slotsById[item.slot].locked ? equipChange(character, equipped, item, content, values).verdict : null;
  const { gold, ...resources } = walletOf(row);
  const weapon = combatant.weapon;

  return {
    name: row.name,
    classId: row.class_id,
    className: content.classesById[row.class_id].name,
    // The look: the portrait and the voice in fights, and the portrait's
    // skin tone.
    appearance: row.appearance,
    skin: row.skin ?? content.defaultSkin,
    level: row.level,
    xp: row.xp,
    xpToNext: xpToNext(row.level, content),
    hoursToNext: Math.round(hoursToNext(row.level, row.xp, content) * 100) / 100,
    classLevel: row.class_level,
    classXp: row.class_xp,
    classXpToNext: classXpToNext(row.class_level, content),
    gold,
    systemPoints: row.system_points,
    // Punkty Czasu: 1 point skips 1 minute of a wait (time.js). One more
    // comes every `minutes` from `since`; the page counts them up the same way.
    timePoints: row.time_points,
    timePointsGain: { since: row.time_points_at, minutes: content.balance.timePoints.generateMinutes },
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
          perMinute: regenPerMinute(maxHp, totals.vitality, content, rest.bonus),
          change: rest.change && { at: rest.change.at, perMinute: regenPerMinute(maxHp, totals.vitality, content, rest.change.bonus) },
        },
    mana: values.mana,
    maxMana: values.mana,
    features: unlockedFeatures(row.level, content, row.class_level),
    huntDurations: huntDurations(row.level, content),
    // Szybkie Polowania left today (hunts.js), or null below their level.
    quickHunts: quickHuntsView(row, now),
    // The next longer exploration and its level, for the hint under the slider.
    huntNext: nextHuntUnlock(row.level, content),
    freePoints: freePoints(character, content),
    // The Umiejętności tab: the choices, the skills learned and the Skill Points.
    skills: skillsView(character, content),
    canResetPoints: row.level <= content.balance.progression.freeResetMaxLevel && spentPoints(character) > 0,
    stats: content.stats.map((stat) => ({
      id: stat.id,
      name: stat.name,
      effect: stat.combat,
      total: totals[stat.id],
      sources: sources[stat.id],
      perPoint: perPoint[stat.id],
    })),
    combat: {
      damage: `${values.damageMin}–${values.damageMax}`,
      damageKind: weapon.category === 'physical' ? 'fizyczne' : `magiczne, ${content.elementsById[weapon.element].name}`,
      reduction: Math.round(values.reduction * 100),
      maxHp,
      maxMana: values.mana,
      // What every class level adds to both, without any points.
      perClassLevel: content.classesById[character.classId].perClassLevel,
    },
    equipment: Object.fromEntries(
      content.slots.map((slot) => {
        const item = equipped.find((candidate) => candidate.equippedSlot === slot.id);
        return [slot.id, item ? toItem(item) : null];
      }),
    ),
    bag: items
      .filter((item) => !item.equippedSlot)
      .reverse()
      .map((item) => ({ ...toItem(item), verdict: verdict(item) })),
    // The herbs and the potions in the bag, which take its places by the stack.
    herbs: bagHerbs(row, sellBonus),
    potions: bagPotions(row, sellBonus),
    herbStack: content.professionRules.stack,
    bagUsed: bagPlaces(player),
    bagCapacity: bagCapacity(levels, content),
    // The Profesje tab, or null while it is hidden or locked (professions-view.js),
    // with the Awatar Systemu.
    professions: professions && { ...professions, avatar: avatarView(player, now) },
    camp: campView(player, levels, now),
    // The Stół rozbiórki: materials, parts and the queue (crafting.js).
    crafting: craftingView(row, levels, now),
    // The Zwoje ochronne made in the Warsztat for the Kowadło.
    scrolls: row.scrolls,
    // The creatures met in fights, by id: the others are shadows on the
    // lists of an inner region's dangers.
    met: JSON.parse(row.met ?? '[]'),
    // The inner regions and lands whose Bestiariusz chest is open for their
    // lists as they are now (bestiary.js).
    bestiary: openedChests(JSON.parse(row.bestiary ?? '[]'), content),
    // The potions for a time still working (potions.js).
    buffs: activeBuffs(player, now),
    // The narrator's daily and weekly quests (quests.js).
    quests: questsView(questsNow(player, now), now, content, JSON.parse(row.met ?? '[]')),
    // The narrator's cards seen so far, or null for a character made before
    // the introduction (tutorial.js).
    tutorial: row.tutorial === null ? null : JSON.parse(row.tutorial),
    activity: activityView(activity, row.level, now),
    serverTime: now,
  };
}

export async function getCharacter(context) {
  const { player } = await requirePlayer(context);
  return json({ character: characterView(player, context.now) });
}

// GET /api/profile/:name: another player's character as everyone may see
// it, from a tap on its name in the chat: its look, levels, what it wears
// and the skills it has learned, with its account's role in the chat.
export async function characterProfile(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const name = String(context.params.name ?? '');
  const found = await db
    .prepare("SELECT c.id, c.user_id, u.login, u.google_sub, u.chat_moderator FROM characters c JOIN users u ON u.id = c.user_id WHERE c.name_key = ? AND c.role = 'player'")
    .bind(nameKey(name))
    .first();
  if (!found) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  const view = characterView(await loadPlayer(db, found.user_id), context.now);
  // Whether the one who looks is a friend of this character (community.js).
  const own = await db.prepare("SELECT id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
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
      level: view.level,
      classLevel: view.classLevel,
      role: chatRole(context.env, found),
      relation: own ? await relationTo(db, own.id, found.id, context.now) : null,
      tradeBlocked: await tradeBlockOf(db, session.userId, found.user_id),
      equipment: content.slots.map((slot) => ({ slot: slot.id, slotName: slot.name, item: worn(view.equipment[slot.id]) })),
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
  const cls = typeof body.classId === 'string' ? content.classesById[body.classId] : undefined;
  if (!cls) throw new ApiError(400, 'invalid_class', 'Wybierz klasę postaci.');
  const appearance = validAppearance(body.appearance);
  const skin = body.skin === undefined ? content.defaultSkin : validSkin(body.skin);

  const db = context.env.DB;
  const exists = () => new ApiError(409, 'character_exists', 'Masz już postać.');
  if (await loadPlayer(db, session.userId)) throw exists();

  const character = { classId: cls.id, level: 1, classLevel: 1, points: {}, position: cls.position };
  const hp = playerCombatant({ character, equipped: [], name }, content).maxHp;
  const now = context.now;
  const supply = content.balance.startingSupply;
  try {
    await db.batch([
      // Punkty Systemu earned before there was a character, for the e-mail
      // confirmed (email.js), come with it.
      db
        .prepare(
          `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, skin, position, hp, hp_at, created_at, gold, resources, time_points, time_points_at, tutorial, system_points)
           VALUES (?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', (SELECT system_points_waiting FROM users WHERE id = ?))`,
        )
        .bind(
          session.userId, name, nameKey(name), cls.id, appearance, skin, cls.position, hp, now, now,
          supply.gold, JSON.stringify(supply.resources), content.balance.timePoints.start, now, session.userId,
        ),
      db.prepare('UPDATE users SET system_points_waiting = 0 WHERE id = ?').bind(session.userId),
    ]);
  } catch (error) {
    const message = String(error?.message);
    if (message.includes('name_key')) throw new ApiError(409, 'name_taken', 'To imię nosi już inna postać w grze. Wybierz inne.');
    if (message.includes('UNIQUE')) throw exists();
    throw error;
  }
  const player = await loadPlayer(db, session.userId);
  await settleQuests(db, player, now);
  return json({ character: characterView(player, now) }, 201);
}

const validAppearance = (id) => {
  if (typeof id !== 'string' || !content.appearancesById[id]) throw new ApiError(400, 'invalid_appearance', 'Wybierz wygląd postaci.');
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
  if (typeof id !== 'string' || !content.skinsById[id]) throw new ApiError(400, 'invalid_skin', 'Wybierz kolor skóry.');
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

// "Zacznij od nowa": the character, its items, hunt, reports and messages in
// the chat are removed; the account stays, with what it hides in the chat
// and its silence there (chat.js), and a new character can be created.
export async function deleteCharacter(context) {
  const { player } = await requirePlayer(context);
  const db = context.env.DB;
  await db.batch(characterRemoval(db, player.row.id));
  return json({ ok: true });
}

// The statements that remove a character with all it has.
export function characterRemoval(db, id) {
  return [
    db.prepare('DELETE FROM friends WHERE character_id = ? OR friend_id = ?').bind(id, id),
    db.prepare('DELETE FROM gifts WHERE sender_id = ? OR receiver_id = ?').bind(id, id),
    db.prepare('DELETE FROM trades WHERE from_id = ? OR to_id = ?').bind(id, id),
    db.prepare('DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE character_id = ? OR recipient_id = ?)').bind(id, id),
    db.prepare('DELETE FROM chat_messages WHERE character_id = ? OR recipient_id = ?').bind(id, id),
    db.prepare('DELETE FROM chat_closed WHERE character_id = ? OR other_id = ?').bind(id, id),
    db.prepare('DELETE FROM reports WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM activities WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM avatar_activities WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM items WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM buildings WHERE character_id = ?').bind(id),
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
  const { player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const added = body.points;
  const invalid = new ApiError(400, 'invalid_points', 'Nieprawidłowy podział punktów.');
  if (added === null || typeof added !== 'object' || Array.isArray(added)) throw invalid;

  const character = engineCharacter(player.row);
  const points = { ...character.points };
  let total = 0;
  for (const [stat, value] of Object.entries(added)) {
    if (!content.statsById[stat] || !Number.isInteger(value) || value < 0) throw invalid;
    if (value > 0) points[stat] = (points[stat] ?? 0) + value;
    total += value;
  }
  if (total === 0) throw invalid;
  if (total > freePoints(character, content)) {
    throw new ApiError(400, 'not_enough_points', 'Nie masz tylu wolnych punktów.');
  }
  return savePoints(context, player, points);
}

export async function autoPoints(context) {
  const { player } = await requireIdlePlayer(context);
  const character = engineCharacter(player.row);
  if (freePoints(character, content) === 0) {
    throw new ApiError(400, 'no_free_points', 'Nie masz wolnych punktów.');
  }
  return savePoints(context, player, autoDistribute(character, content));
}

export async function resetPoints(context) {
  const { player } = await requireIdlePlayer(context);
  if (player.row.level > content.balance.progression.freeResetMaxLevel) {
    throw new ApiError(
      403,
      'reset_locked',
      `Darmowe zerowanie punktów jest dostępne do poziomu ${content.balance.progression.freeResetMaxLevel}.`,
    );
  }
  return savePoints(context, player, {});
}
