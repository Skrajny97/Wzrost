// The Wieże Systemu (data/towers.json, src/engine/towers.js; DECISIONS.md,
// "Wieże Systemu i Gildia"), from character level 50: the Wieża Solo and
// the Wieża Drużyn. An entry is one fight on a floor the player picks, up
// to the one above the highest it has won in that tower, whatever its
// level (towerTop; floor 1 is of level 50), with its report at once; the
// entries of a day are counted together for both towers, from midnight in
// Poland. The climb does not
// keep the character from anything (the author: "wspinaczka nie zajmuje
// postaci"): it goes in also while it works in a profession, at full HP and
// with no potions, and its HP stays as it was, unless a new level heals it.
// Not while it is on an exploration, nor before its report is claimed: the
// report is made with the character as it is then (the author: "by nie
// można było robić natychmiastowych Wież w trakcie Wypraw (bo może to
// zmienić stan Postaci przed ukończeniem Wyprawy)"). A win pays as a fight of an exploration and writes the
// creatures into the Bestiariusz; a floor of every chestEvery won the
// first time in a tower brings the tower's chest, and a champion's floor
// won the first time there its trophy (483 A). Everything is saved in
// one batch only while the character is as read (atomic.js).

import {
  addQuestProgress,
  applyHunt,
  areaDangers,
  areasOpened,
  autoEquip,
  bagCapacity,
  bagOverflow,
  campBonus,
  campLevels,
  companionReady,
  companionStays,
  hpAfterHunt,
  huntKills,
  huntReport,
  isUnlocked,
  laterPeriod,
  questPeriod,
  sellPrice,
  towerArea,
  towerFight,
  towerGold,
  towerTop,
  trialTowerFloor,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import {
  bagItems,
  bagPlaces,
  characterView,
  engineCharacter,
  equippedItems,
  loadCharacter,
  loadPlayer,
  questsNow,
  requireNotExploring,
  requirePlayer,
  trophiesFor,
} from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { favoriteIds } from './favorites.js';
import { fallenGems, gemsBackSql, soldGold } from './inventory.js';
import { gemLines } from './hunts.js';
import { partyOf } from './parties.js';
import { trimReports } from './reports.js';
import { weekNow } from './weeks.js';

const rules = () => content().towers;
const path = (key) => `$."${key}"`;

function requireUnlocked(row) {
  if (!isUnlocked('towers', row.level, content())) {
    throw new ApiError(403, 'locked', `Wieże odblokujesz na poziomie postaci ${content().unlocksById.towers.level}.`);
  }
}

// The character's record of the towers: the day and the entries used on
// it, the highest floor won in each tower, the floors whose chest it has
// taken there and the champions' floors it has won there, whose trophy
// comes only with the first win (the author: 483 A; a record from before
// has none, so each champion's floor brings its trophy once more).
function recordOf(row) {
  let stored;
  try {
    stored = JSON.parse(row.towers ?? '{}');
  } catch {
    stored = {};
  }
  return { day: stored.day ?? null, used: stored.used ?? 0, best: stored.best ?? {}, chests: stored.chests ?? {}, champions: stored.champions ?? {} };
}

// The entries of a later day leave none for today (laterPeriod in
// quests.js): a request still of the day gone climbs no floor and writes no
// day back (the code review, 12.11.2026).
function entriesUsed(record, now) {
  const day = questPeriod('daily', now, content()).key;
  return laterPeriod(record.day, day) ? rules().entries.perDay : record.day === day ? record.used : 0;
}

// Who climbs a tower beside the character: in the Wieża Drużyn the other
// players of its Drużyna first, as they are (within the class levels'
// spread, as every party is: parties.js), then its companions in the
// places left (a wounded one too: the tower takes nobody's HP), up to the
// most fighters of `size`; in the Wieża Solo nobody. Since 10.11.2026 the
// character goes in with its companions alone too (the author: „Wieża
// Drużyn niech będzie możliwa także z towarzyszami.”): the tower asks only
// for the fewest fighters of `size` on its side, players and companions
// together, and the fewest players of `members`, itself counted; before,
// two players of a Drużyna at least, and the companions only filled the
// places left. The creatures' strength still grows with every fighter
// (towerFight in the engine). `top` is the highest floor open (one above
// the highest the character has won in this tower), `missing` why the
// tower is shut.
async function climbersFor(db, player, tower) {
  const row = player.row;
  const top = towerTop(recordOf(row).best[tower.id]);
  const [least, most] = tower.size;
  if (most === 1) return { partners: [], companions: [], top, missing: null };
  const party = tower.members[1] > 1 ? await partyOf(db, row.id) : null;
  const others = party ? (await Promise.all(party.memberIds.filter((id) => id !== row.id).map((id) => loadCharacter(db, id)))).filter(Boolean) : [];
  const partners = others.slice(0, Math.min(tower.members[1], most) - 1).map((other) => ({ id: other.row.id, name: other.row.name, level: other.row.level, character: engineCharacter(other.row), equipped: equippedItems(other) }));
  const places = Math.max(0, most - 1 - partners.length);
  // Those who go on explorations first, then the Kwatery's reserves.
  const ready = tower.companions ? (JSON.parse(row.settlement ?? '{}').companions ?? []).filter((companion) => companionReady(companion, true)) : [];
  const hired = [...ready.filter((companion) => !companionStays(companion)), ...ready.filter((companion) => companionStays(companion))];
  const companions = hired.slice(0, places);
  const missing =
    1 + partners.length < tower.members[0]
      ? t('Do Wieży Drużyn wchodzi się z drużyną: co najmniej {count} postacie graczy. Drużynę założysz w Społeczności.', { count: tower.members[0] })
      : 1 + partners.length + companions.length < least
        ? t('Do Wieży Drużyn nie wchodzi się w pojedynkę: obok Ciebie musi walczyć co najmniej {count} z graczy Twojej Drużyny albo towarzyszy z Kwater. Drużynę założysz w Społeczności, a towarzysza zwerbujesz w Karczmie w Osadzie.', {
            count: least - 1,
          })
        : null;
  return { partners, companions, top, missing };
}

// The towers for the page: the entries left today, the order of the
// inner regions the floors go through, what a win pays (the gold of each
// floor up to the highest open, the materials' pieces and their rarities
// by the floor's level, the chance of an item), and each tower with its
// highest floor open, the highest won, the chests taken, the champions'
// floors won (their trophies taken) and who climbs with the character.
async function towersView(db, player, now) {
  const row = player.row;
  const record = recordOf(row);
  const { towers, entries, chestEvery, loot } = rules();
  const climbs = await Promise.all(towers.map((tower) => climbersFor(db, player, tower)));
  const top = Math.max(1, ...climbs.map((climbers) => climbers.top));
  return {
    loot: {
      gold: Array.from({ length: top }, (_, index) => towerGold(index + 1, content())),
      pieces: loot.materials.pieces,
      rarities: loot.materials.rarities,
      itemChance: loot.itemChance,
    },
    perDay: entries.perDay,
    left: Math.max(0, entries.perDay - entriesUsed(record, now)),
    chestEvery,
    firstFloorLevel: rules().firstFloorLevel,
    strength: rules().strength,
    eliteEvery: rules().floors.eliteEvery,
    eliteLapEvery: rules().floors.eliteLapEvery,
    championEvery: rules().floors.championEvery,
    cycle: content().areas.map((area) => ({ id: area.id, name: area.name, regionName: area.regionName, elite: Boolean(area.elite), champion: Boolean(area.champion) })),
    towers: towers.map((tower, index) => {
      const climbers = climbs[index];
      return {
        id: tower.id,
        name: tower.name,
        place: tower.place ?? null,
        top: climbers.top,
        best: record.best[tower.id] ?? 0,
        chests: record.chests[tower.id] ?? [],
        champions: record.champions[tower.id] ?? [],
        partners: climbers.partners.map((partner) => ({ name: partner.name, level: partner.level })),
        companions: climbers.companions.map((companion) => companion.name),
        missing: climbers.missing,
      };
    }),
  };
}

export async function getTowers(context) {
  const { player } = await requirePlayer(context);
  requireUnlocked(player.row);
  return json({ towers: await towersView(context.env.DB, player, context.now) });
}

// { tower, floor? }: an entry, on the first floor not won yet. The report comes at once; the character's
// gains, the chest's item (worn at once in an empty slot, else in the bag,
// where the scrapper buys the weakest items that do not fit, as after an
// exploration), the Bestiariusz and the quests are saved with the entry.
export async function enterTower(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireUnlocked(row);
  const db = context.env.DB;
  const now = context.now;
  requireNotExploring(player, now);
  const body = await readJson(context.request);
  const tower = rules().towers.find((one) => one.id === body.tower);
  if (!tower) throw new ApiError(400, 'invalid_tower', 'Wybierz wieżę.');
  const record = recordOf(row);
  const used = entriesUsed(record, now);
  if (used >= rules().entries.perDay) throw new ApiError(409, 'no_entries', 'Wejścia do Wież na dziś się skończyły. Nowe od północy.');
  const climbers = await climbersFor(db, player, tower);
  if (climbers.missing) throw new ApiError(409, 'no_party', climbers.missing);
  // Always the first floor not won yet, never one lower or higher (the
  // author, 7.11.2026: "stopień po prostu masz konkretny i nie mozesz zejsc
  // nizej ani wyżej"). A page that names another floor saw an old state.
  const floor = climbers.top;
  if (body.floor !== undefined && body.floor !== floor) throw new ApiError(400, 'invalid_floor', `Wejść można tylko na piętro ${floor}.`);

  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const taken = record.chests[tower.id] ?? [];
  const chest = floor % rules().chestEvery === 0 && !taken.includes(floor);
  // A champion's trophy only at the first win of its floor in this tower.
  const beaten = record.champions[tower.id] ?? [];
  const championTrophy = !beaten.includes(floor);
  const area = towerArea(floor, content());
  // The Encyklopedia's trophies for the creatures of the floor's region.
  const trophies = trophiesFor(player, now, areaDangers(area, content()).map((danger) => danger.monsterId));
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  // The week of the year of the entry (weeks.js).
  const hunt = towerFight({ character, equipped, name: row.name, floor, seed, partners: climbers.partners, companions: climbers.companions, trophies, chest, championTrophy, week: weekNow(now) }, content());
  const won = hunt.tower.won;
  const applied = applyHunt(character, hunt, content());

  // The chest's item: in an empty slot it is worn at once, else it goes to
  // the bag, and what does not fit there the scrapper buys, the weakest
  // first (as after an exploration).
  const autoEquipped = autoEquip(equipped, hunt.items, content(), row.class_id, row.class_level);
  const levels = campLevels(player.buildings, now, content());
  const bag = bagItems(player);
  const capacity = bagCapacity(levels, content()) - (bagPlaces(player) - bag.length);
  const sellBonus = campBonus(levels, 'sellPrice', content());
  const toBag = hunt.items.map((_, index) => index).filter((index) => !autoEquipped.includes(index));
  const candidates = [...bag, ...toBag.map((index) => hunt.items[index])];
  // The favourites stay, as after an exploration (favorites.js).
  const sold = toBag.length > 0 ? bagOverflow(candidates, capacity, row.class_id, content(), favoriteIds(row)) : [];
  const storedSold = sold.filter((index) => index < bag.length).map((index) => bag[index]);
  const soldFound = sold.filter((index) => index >= bag.length).map((index) => toBag[index - bag.length]);
  const soldFoundGold = soldFound.reduce((sum, index) => sum + sellPrice(hunt.items[index], content(), sellBonus), 0);
  const overflow = sold.length > 0 ? { capacity, count: sold.length, gold: sold.reduce((sum, index) => sum + sellPrice(candidates[index], content(), sellBonus), 0), sold: soldFound } : null;

  const report = {
    ...huntReport({ hunt, applied, character, areaId: area.id, startedAt: now, endsAt: now, autoEquipped, overflow }, content()),
    kind: 'tower',
    resultText: hunt.tower.text,
    tower: {
      id: tower.id,
      name: tower.name,
      floor,
      level: hunt.tower.level,
      won,
      chest: hunt.tower.chest,
      lootItem: hunt.tower.lootItem,
      partners: climbers.partners.map((partner) => partner.name),
      companions: climbers.companions.map((companion) => companion.name),
    },
  };
  // The gems of the bag's items the scrapper bought fall out and go back to
  // the minerals (757 B), as after an exploration (hunts.js).
  // Each counted from the items still in the bag as the batch runs, as their
  // price is (the code review, 12.11.2026: a gem given back for an item
  // put into the Skrzynia Konta meanwhile stayed in it too).
  const gemsBack = fallenGems(storedSold);
  if (Object.keys(gemsBack).length > 0) report.system = [...report.system, ...gemLines(gemsBack)];
  const setGems = gemsBackSql(row.id, storedSold);
  const summary = {
    tower: { name: tower.name, floor },
    areaName: report.areaName,
    minutes: 0,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: 0,
    gold: report.summary.gold,
    itemsFound: report.summary.itemsFound,
    resources: {},
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: report.summary.timePoints,
    bestFind: report.summary.bestFind && { name: report.summary.bestFind.name, color: report.summary.bestFind.color },
    levelAfter: applied.level,
    system: report.system,
  };

  const today = questPeriod('daily', now, content()).key;
  const next = {
    day: today,
    used: used + 1,
    best: { ...record.best, [tower.id]: won ? Math.max(record.best[tower.id] ?? 0, floor) : (record.best[tower.id] ?? 0) },
    chests: { ...record.chests, [tower.id]: won && chest ? [...taken, floor].sort((a, b) => a - b) : taken },
    champions: { ...record.champions, [tower.id]: won && hunt.tower.champion && championTrophy ? [...beaten, floor].sort((a, b) => a - b) : beaten },
  };
  // The creatures fought join those the character has met (the Bestiariusz).
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))])];
  const opened = areasOpened(character.classLevel, applied.classLevel, content());
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills: huntKills(hunt, content()), opened }));
  const found = Object.entries(hunt.materials);
  const setMaterials = found.length ? `, materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})` : '';
  // A new level heals fully, with the chest's item worn if it went on.
  const worn = [...equipped, ...autoEquipped.map((index) => hunt.items[index])];
  const healed = applied.levelled ? hpAfterHunt({ character, applied, hunt, equipped: worn, name: row.name }, content()) : null;
  const storedPrice = storedSold.length > 0 ? soldGold(row.id, storedSold, sellBonus) : { sql: '0', binds: [] };
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');

  const results = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, `${row.id}:tower:${seed}`, 'tower', now, JSON.stringify(summary), JSON.stringify(report)),
    trimReports(db, row.id, 'tower'),
    db
      .prepare(
        `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = MAX(0, gold + ? + ${storedPrice.sql})${setMaterials}${setGems.sql},
           time_points = time_points + ?, met = ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END, towers = ?${healed !== null ? ', hp = ?, hp_at = ?' : ''},
           version = version + 1
         WHERE id = ?`,
      )
      .bind(
        applied.level,
        applied.xp,
        applied.classLevel,
        applied.classXp,
        hunt.gold + soldFoundGold,
        ...storedPrice.binds,
        ...found.flatMap(([key, count]) => [path(key), path(key), count]),
        ...setGems.binds,
        applied.timePoints,
        JSON.stringify(met),
        row.quests,
        quests,
        JSON.stringify(next),
        ...(healed !== null ? [healed, now] : []),
        row.id,
      ),
    // The Próby Gildii's trial too: the creatures and the fight won, on a
    // floor of a level at most so many below the character's
    // (guild-trials.js; the author: 488 A).
    ...trialProgress(db, row.id, { kills: huntKills(hunt, content()), towerWins: won && floor >= trialTowerFloor(row.level, content()) ? 1 : 0 }, now),
    ...(storedSold.length > 0 ? [db.prepare(`DELETE FROM items WHERE character_id = ? AND slot IS NULL AND id IN (${storedSold.map(() => '?').join(', ')})`).bind(row.id, ...storedSold.map((item) => item.id))] : []),
    // The win's items last: the database may give a new item the id of an
    // item gone from the bag meanwhile, which the scrapper's price, gems and
    // deletion above, counted by the ids read, would then take for the one
    // they sell (the code review, 12.11.2026).
    ...hunt.items.flatMap((item, index) => (soldFound.includes(index) ? [] : [insertItem.bind(row.id, autoEquipped.includes(index) ? item.slot : null, JSON.stringify(item), now)])),
  ]);
  const after = await loadPlayer(db, session.userId);
  return json({
    report: { id: results[1].meta.last_row_id, createdAt: now, ...report },
    towers: await towersView(db, after, now),
    character: characterView(after, now),
  });
}
