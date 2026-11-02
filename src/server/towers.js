// The Wieże Systemu (data/towers.json, src/engine/towers.js; DECISIONS.md,
// "Wieże Systemu i Gildia"), from character level 50: the Wieża Solo and
// the Wieża Drużyn. An entry is one fight on a floor the player picks, up
// to the character's level (in the Wieża Drużyn the lowest level of its
// Drużyna), with its report at once; the entries of a day are counted
// together for both towers, from midnight in Poland. The climb does not
// keep the character from anything (the author: "wspinaczka nie zajmuje
// postaci"): it goes in also while it works in a profession, at full HP and
// with no potions, and its HP stays as it was, unless a new level heals it.
// Not while it is on an exploration, nor before its report is claimed: the
// report is made with the character as it is then (the author: "by nie
// można było robić natychmiastowych Wież w trakcie Wypraw (bo może to
// zmienić stan Postaci przed ukończeniem Wyprawy)"). A win pays as a fight of an exploration and writes the
// creatures into the Bestiariusz; a floor of every chestEvery won the
// first time in a tower brings the tower's chest. Everything is saved in
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
  hpAfterHunt,
  huntKills,
  huntReport,
  isUnlocked,
  questPeriod,
  sellPrice,
  towerArea,
  towerFight,
  trophyBonuses,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import { bagPlaces, characterView, engineCharacter, equippedItems, loadCharacter, loadPlayer, questsNow, requireNotExploring, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { soldGold } from './inventory.js';
import { partyOf } from './parties.js';
import { KEPT_REPORTS } from './reports.js';

const rules = () => content.towers;
const path = (key) => `$."${key}"`;

function requireUnlocked(row) {
  if (!isUnlocked('towers', row.level, content)) {
    throw new ApiError(403, 'locked', `Wieże odblokujesz na poziomie postaci ${content.unlocksById.towers.level}.`);
  }
}

// The character's record of the towers: the day and the entries used on
// it, the highest floor won in each tower and the floors whose chest it
// has taken there.
function recordOf(row) {
  let stored;
  try {
    stored = JSON.parse(row.towers ?? '{}');
  } catch {
    stored = {};
  }
  return { day: stored.day ?? null, used: stored.used ?? 0, best: stored.best ?? {}, chests: stored.chests ?? {} };
}

const entriesUsed = (record, now) => (record.day === questPeriod('daily', now, content).key ? record.used : 0);

// Who climbs a tower beside the character: in the Wieża Drużyn the other
// players of its Drużyna as they are (within the class levels' spread, as
// every party is: parties.js), and its companions in the places left (a
// wounded one too: the tower takes nobody's HP); in the Wieża Solo nobody.
// `top` is the highest floor open, `missing` why the tower is shut.
async function climbersFor(db, player, tower) {
  const row = player.row;
  if (tower.members[1] === 1) return { partners: [], companions: [], top: row.level, missing: null };
  const party = await partyOf(db, row.id);
  const others = party ? (await Promise.all(party.memberIds.filter((id) => id !== row.id).map((id) => loadCharacter(db, id)))).filter(Boolean) : [];
  const partners = others.slice(0, tower.members[1] - 1).map((other) => ({ id: other.row.id, name: other.row.name, level: other.row.level, character: engineCharacter(other.row), equipped: equippedItems(other) }));
  const places = Math.max(0, tower.size - 1 - partners.length);
  const hired = tower.companions ? (JSON.parse(row.settlement ?? '{}').companions ?? []).filter((companion) => companionReady(companion, true)) : [];
  const companions = hired.slice(0, places);
  const missing = 1 + partners.length < tower.members[0] ? `Do Wieży Drużyn wchodzi się z drużyną: co najmniej ${tower.members[0]} postacie graczy. Drużynę założysz w Społeczności.` : null;
  return { partners, companions, top: Math.min(row.level, ...partners.map((partner) => partner.level)), missing };
}

// The towers for the page: the entries left today, the order of the
// inner regions the floors go through, and each tower with its highest
// floor open, the highest won, the chests taken and who climbs with the
// character.
async function towersView(db, player, now) {
  const row = player.row;
  const record = recordOf(row);
  const { towers, entries, chestEvery } = rules();
  return {
    perDay: entries.perDay,
    left: Math.max(0, entries.perDay - entriesUsed(record, now)),
    chestEvery,
    eliteEvery: rules().floors.eliteEvery,
    championEvery: rules().floors.championEvery,
    cycle: content.areas.map((area) => ({ id: area.id, name: area.name, regionName: area.regionName, elite: Boolean(area.elite), champion: Boolean(area.champion) })),
    towers: await Promise.all(
      towers.map(async (tower) => {
        const climbers = await climbersFor(db, player, tower);
        return {
          id: tower.id,
          name: tower.name,
          place: tower.place ?? null,
          top: climbers.top,
          best: record.best[tower.id] ?? 0,
          chests: record.chests[tower.id] ?? [],
          partners: climbers.partners.map((partner) => ({ name: partner.name, level: partner.level })),
          companions: climbers.companions.map((companion) => companion.name),
          missing: climbers.missing,
        };
      }),
    ),
  };
}

export async function getTowers(context) {
  const { player } = await requirePlayer(context);
  requireUnlocked(player.row);
  return json({ towers: await towersView(context.env.DB, player, context.now) });
}

// { tower, floor }: an entry. The report comes at once; the character's
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
  const floor = body.floor;
  if (!Number.isInteger(floor) || floor < 1 || floor > climbers.top) {
    throw new ApiError(400, 'invalid_floor', `Wybierz piętro od 1 do ${climbers.top}.`);
  }

  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const taken = record.chests[tower.id] ?? [];
  const chest = floor % rules().chestEvery === 0 && !taken.includes(floor);
  const area = towerArea(floor, content);
  // The Encyklopedia's trophies for the creatures of the floor's region.
  const trophies = trophyBonuses(JSON.parse(row.discovered ?? '{}'), content, areaDangers(area, content).map((danger) => danger.monsterId));
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hunt = towerFight({ character, equipped, name: row.name, floor, seed, partners: climbers.partners, companions: climbers.companions, trophies, chest }, content);
  const won = hunt.tower.won;
  const applied = applyHunt(character, hunt, content);

  // The chest's item: in an empty slot it is worn at once, else it goes to
  // the bag, and what does not fit there the scrapper buys, the weakest
  // first (as after an exploration).
  const autoEquipped = autoEquip(equipped, hunt.items, content, row.class_id, row.class_level);
  const levels = campLevels(player.buildings, now, content);
  const bag = player.items.filter((item) => !item.equippedSlot);
  const capacity = bagCapacity(levels, content) - (bagPlaces(player) - bag.length);
  const sellBonus = campBonus(levels, 'sellPrice', content);
  const toBag = hunt.items.map((_, index) => index).filter((index) => !autoEquipped.includes(index));
  const candidates = [...bag, ...toBag.map((index) => hunt.items[index])];
  const sold = toBag.length > 0 ? bagOverflow(candidates, capacity, row.class_id, content) : [];
  const storedSold = sold.filter((index) => index < bag.length).map((index) => bag[index]);
  const soldFound = sold.filter((index) => index >= bag.length).map((index) => toBag[index - bag.length]);
  const soldFoundGold = soldFound.reduce((sum, index) => sum + sellPrice(hunt.items[index], content, sellBonus), 0);
  const overflow = sold.length > 0 ? { capacity, count: sold.length, gold: sold.reduce((sum, index) => sum + sellPrice(candidates[index], content, sellBonus), 0), sold: soldFound } : null;

  const report = {
    ...huntReport({ hunt, applied, character, areaId: area.id, startedAt: now, endsAt: now, autoEquipped, overflow }, content),
    kind: 'tower',
    resultText: hunt.tower.text,
    tower: { id: tower.id, name: tower.name, floor, level: hunt.tower.level, won, partners: climbers.partners.map((partner) => partner.name), companions: climbers.companions.map((companion) => companion.name) },
  };
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

  const today = questPeriod('daily', now, content).key;
  const next = {
    day: today,
    used: used + 1,
    best: { ...record.best, [tower.id]: won ? Math.max(record.best[tower.id] ?? 0, floor) : (record.best[tower.id] ?? 0) },
    chests: { ...record.chests, [tower.id]: won && chest ? [...taken, floor].sort((a, b) => a - b) : taken },
  };
  // The creatures fought join those the character has met (the Bestiariusz).
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))])];
  const opened = areasOpened(character.classLevel, applied.classLevel, content);
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills: huntKills(hunt, content), opened }));
  const found = Object.entries(hunt.materials);
  const setMaterials = found.length ? `, materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})` : '';
  // A new level heals fully, with the chest's item worn if it went on.
  const worn = [...equipped, ...autoEquipped.map((index) => hunt.items[index])];
  const healed = applied.levelled ? hpAfterHunt({ character, applied, hunt, equipped: worn, name: row.name }, content) : null;
  const storedPrice = storedSold.length > 0 ? soldGold(row.id, storedSold, sellBonus) : { sql: '0', binds: [] };
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');

  const results = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, `${row.id}:tower:${seed}`, 'tower', now, JSON.stringify(summary), JSON.stringify(report)),
    db
      .prepare('DELETE FROM reports WHERE character_id = ? AND id NOT IN (SELECT id FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?)')
      .bind(row.id, row.id, KEPT_REPORTS),
    ...hunt.items.flatMap((item, index) => (soldFound.includes(index) ? [] : [insertItem.bind(row.id, autoEquipped.includes(index) ? item.slot : null, JSON.stringify(item), now)])),
    db
      .prepare(
        `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = MAX(0, gold + ? + ${storedPrice.sql})${setMaterials},
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
        applied.timePoints,
        JSON.stringify(met),
        row.quests,
        quests,
        JSON.stringify(next),
        ...(healed !== null ? [healed, now] : []),
        row.id,
      ),
    // The Próby Gildii's trial too: the creatures and the fight won (guild-trials.js).
    ...trialProgress(db, row.id, { kills: huntKills(hunt, content), towerWins: won ? 1 : 0 }, now),
    ...(storedSold.length > 0 ? [db.prepare(`DELETE FROM items WHERE character_id = ? AND id IN (${storedSold.map(() => '?').join(', ')})`).bind(row.id, ...storedSold.map((item) => item.id))] : []),
  ]);
  const after = await loadPlayer(db, session.userId);
  return json({
    report: { id: results[1].meta.last_row_id, createdAt: now, ...report },
    towers: await towersView(db, after, now),
    character: characterView(after, now),
  });
}
