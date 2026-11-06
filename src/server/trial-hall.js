// The Sala prób in the Osada (data/settlement.json, trialHall;
// src/engine/trial-hall.js; DECISIONS.md, "Sala prób"; the author's 620 B):
// once a day, free, a trial of three fights for the next place the class
// level has not opened yet; passed, it opens that place for the character
// for good. The trial goes in while the character works in a profession,
// but not while it is on an exploration or before its report is claimed,
// as the Wieże (towers.js). Its HP outside the hall stays as it was, unless
// a new level heals it. The record is the column trial_hall: the day of the
// last trial ({ day }) and the place opened early ({ early }). Everything is
// saved in one batch only while the character is as read (atomic.js).

import {
  addQuestProgress,
  applyHunt,
  areaDangers,
  areasOpened,
  encounterCombatants,
  hpAfterHunt,
  huntKills,
  huntReport,
  questPeriod,
  trialEncounters,
  trialHallFights,
  trialHallOf,
  trialTarget,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import { characterView, engineCharacter, equippedItems, loadPlayer, questsNow, requireNotExploring, requirePlayer, trophiesFor } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json } from './http.js';
import { companionsGoing } from './hunts.js';
import { knownPotionsOf, potionsOf } from './professions-view.js';
import { requireOpen } from './settlement.js';

const path = (key) => `$."${key}"`;

// The character's record of the hall: the day of its last trial and the
// place it opened early (null: none).
export function hallRecord(row) {
  let stored;
  try {
    stored = JSON.parse(row.trial_hall ?? '{}');
  } catch {
    stored = {};
  }
  return { day: stored.day ?? null, early: stored.early ?? null };
}

// The creatures a trial in `area` may bring, for the screen's three
// squares: the place's two most usual encounters' first creatures and its
// elite (the trial draws its encounters at the start).
function preview(area) {
  const encounters = trialEncounters(area, `preview:${area.id}`, content());
  return encounters.map((encounter) => {
    const [enemy] = encounterCombatants(encounter, content());
    return { monsterId: enemy.monsterId, name: content().monstersById[enemy.monsterId].name, elite: encounter.elite };
  });
}

// The hall for the Osada's page: whether today's trial is used, and the
// place it tests the character for, with its creatures, or why there is
// none; null where the game has no hall.
export function trialHallView(row, now) {
  const hall = trialHallOf(content());
  if (!hall) return null;
  const record = hallRecord(row);
  const target = trialTarget(row.class_level, record.early, content());
  const { fightStart: _a, eliteStart: _b, defeat: _c, won: _d, lost: _e, ...texts } = hall.texts;
  return {
    used: record.day === questPeriod('daily', now, content()).key,
    texts,
    target: target && {
      areaId: target.area.id,
      name: target.area.name,
      regionName: target.area.regionName ?? null,
      levels: `${target.area.minLevel}–${target.area.maxLevel}`,
      unlockClassLevel: Math.max(1, target.area.minLevel - content().balance.hunt.areaUnlockLead),
      passed: target.passed,
      fights: target.passed ? [] : preview(target.area),
    },
  };
}

// POST /api/settlement/trial-hall: today's trial. The report comes at once;
// the gains, the potions drunk, the creatures met and the quests are saved
// with the day of the trial and, when it is passed, the place opened.
export async function enterTrialHall(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const hall = trialHallOf(content());
  if (!hall) throw new ApiError(404, 'not_found', 'Sali prób jeszcze nie ma.');
  const now = context.now;
  requireNotExploring(player, now);
  const record = hallRecord(row);
  const today = questPeriod('daily', now, content()).key;
  if (record.day === today) throw new ApiError(409, 'used', hall.texts.used);
  const target = trialTarget(row.class_level, record.early, content());
  if (!target) throw new ApiError(409, 'all_open', hall.texts.allOpen);
  if (target.passed) throw new ApiError(409, 'passed', hall.texts.passed.replace('{area}', target.area.name));

  const { area } = target;
  const db = context.env.DB;
  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const companions = companionsGoing(player, now);
  const trophies = trophiesFor(player, now, areaDangers(area, content()).map((danger) => danger.monsterId));
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  // Only the potions whose recipes the character knows are drunk, as on an
  // exploration (potionKnown; the code review: one got in a Wymiana before
  // its recipe was drunk here).
  const hunt = trialHallFights({ character, equipped, name: row.name, area, seed, potions: knownPotionsOf(row), companions, trophies }, content());
  const applied = applyHunt(character, hunt, content());
  const won = hunt.hall.won;

  const report = {
    ...huntReport({ hunt, applied, character, areaId: area.id, startedAt: now, endsAt: now }, content()),
    kind: 'trial-hall',
    resultText: hunt.hall.text,
    hall: { areaId: area.id, areaName: area.name, won, fights: hunt.hall.fights },
  };
  const summary = {
    hall: { areaName: area.name, won },
    areaName: report.areaName,
    minutes: 0,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: 0,
    gold: report.summary.gold,
    itemsFound: 0,
    resources: {},
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: report.summary.timePoints,
    bestFind: null,
    levelAfter: applied.level,
    system: report.system,
  };

  // The potions drunk come out of the bag.
  const bag = { ...potionsOf(row) };
  for (const [id, count] of Object.entries(hunt.potionsUsed)) bag[id] = (bag[id] ?? 0) - count;
  const potions = Object.fromEntries(Object.entries(bag).filter(([, count]) => count > 0));
  const next = { day: today, early: won ? area.id : record.early };
  // The creatures fought join those the character has met (the Bestiariusz).
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))])];
  const opened = areasOpened(character.classLevel, applied.classLevel, content());
  const kills = huntKills(hunt, content());
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills, opened }));
  const found = Object.entries(hunt.materials);
  const setMaterials = found.length ? `, materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})` : '';
  // A new level heals fully.
  const healed = applied.levelled ? hpAfterHunt({ character, applied, hunt, equipped, name: row.name }, content()) : null;

  const results = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, `${row.id}:trial-hall:${seed}`, 'trial-hall', now, JSON.stringify(summary), JSON.stringify(report)),
    db
      .prepare(
        `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = MAX(0, gold + ?)${setMaterials},
           time_points = time_points + ?, met = ?, potions = ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END, trial_hall = ?${healed !== null ? ', hp = ?, hp_at = ?' : ''},
           version = version + 1
         WHERE id = ?`,
      )
      .bind(
        applied.level,
        applied.xp,
        applied.classLevel,
        applied.classXp,
        hunt.gold,
        ...found.flatMap(([key, count]) => [path(key), path(key), count]),
        applied.timePoints,
        JSON.stringify(met),
        JSON.stringify(potions),
        row.quests,
        quests,
        JSON.stringify(next),
        ...(healed !== null ? [healed, now] : []),
        row.id,
      ),
    // The Próby Gildii's trials of creatures beaten (guild-trials.js).
    ...trialProgress(db, row.id, { kills }, now),
  ]);
  const after = await loadPlayer(db, session.userId);
  return json({
    report: { id: results[1].meta.last_row_id, createdAt: now, ...report },
    hall: trialHallView(after.row, now),
    character: characterView(after, now),
  });
}
