// Kultywacja (1230 A; src/engine/cultivation.js, DECISIONS.md „Kultywacja
// (1230 A)”) on server time: the character meditates for a length an
// exploration offers it. While its class is ahead, it gets character XP:
// the start keeps the XP of the length at the rate of the class level then,
// and the claim ("Odbierz raport", claimHunt in hunts.js through
// finishActivity) gives it, at most what brings the character to its
// class's level as it is at the claim. Every meditation, also at equal
// levels, grows the Kultywacja's own level (characters.cultivation_level
// and cultivation_xp, a point a minute), whose share more character XP the
// claim of an exploration adds (hunts.js: cultivationShare). Its report goes
// to the Dziennik. Meanwhile the character is busy as at a profession's
// work (requireIdle in characters.js): no exploration, profession or
// Drużyna's trip, and it rests. Punkty Czasu rewind it as any activity
// (time.js), and "Przerwij" (cancelHunt in hunts.js) ends it with nothing
// gained, as an exploration.

import {
  cultivationBonus,
  cultivationGain,
  cultivationPlan,
  cultivationProgress,
  cultivationRate,
  cultivationXp,
  cultivationXpToNext,
  huntDurations,
  isUnlocked,
  newestArea,
  playerCombatant,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { content } from './content.js';
import { characterView, currentHp, engineCharacter, equippedItems, loadPlayer, requireIdlePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { characterChanged, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { alreadyClaimed, workClaim, workClaimFailed } from './professions.js';
import { trimReports } from './reports.js';

// The activity's kind (activities.kind) and its report's.
export const CULTIVATION = 'cultivation';
const MINUTE = 60000;

// The words of a character busy with it, as requireIdle says them
// (characters.js): still meditating, or its report waiting.
export const cultivationBusy = (finished) =>
  finished ? new ApiError(409, 'claim_first', 'Kultywacja się skończyła. Najpierw odbierz jej raport.') : new ApiError(409, 'busy', 'Postać medytuje. Poczekaj na koniec Kultywacji.');

// The XP the start kept, a whole number (0 for anything else).
const keptXp = (activity) => {
  const { xp } = JSON.parse(activity.options ?? '{}');
  return Number.isSafeInteger(xp) && xp > 0 ? xp : 0;
};

// The Kultywacja's own level and its XP, as the character's row keeps them.
const progressOf = (row) => ({ level: row.cultivation_level ?? 0, xp: row.cultivation_xp ?? 0 });

// "7" or "1.5": a share in percent, for the System's lines.
const percent = (share) => Math.round(share * 1000) / 10;

// The share more character XP a character's explorations give, by its
// Kultywacja's level, for applyHunt (hunts.js), or null at level 0.
export function cultivationShare(row) {
  const { level } = progressOf(row);
  return level > 0 ? { level, share: cultivationBonus(level, content()) } : null;
}

// Where the activity takes place, for its view (activityPlace in
// characters.js): the Kultywacja itself.
export const cultivationPlace = () => ({ placeName: t('Kultywacja') });

// The Kultywacja for the page (characterView), from the level its unlock
// opens at (data/unlocks.json `cultivation`), null before it: its own level
// with its XP, the XP to the next level and its share more character XP
// from explorations (`bonus`), always (the bonuses' list shows it, also
// while the character is away); at home also the plan
// (cultivationPlan) for each length an exploration offers; while one runs
// or waits for its claim, what the claim would give now (`running`).
export function cultivationView(player) {
  const { row, activity } = player;
  if (!isUnlocked(CULTIVATION, row.level, content())) return null;
  const progress = progressOf(row);
  const { maxLevel, levelBonus } = content().balance.cultivation;
  const base = {
    level: progress.level,
    xp: progress.xp,
    xpToNext: cultivationXpToNext(progress.level, content()),
    maxLevel,
    bonus: cultivationBonus(progress.level, content()),
    // A level's share and the first level's minutes, for "Jak to działa?".
    perLevel: levelBonus,
    firstMinutes: cultivationXpToNext(0, content()),
  };
  const character = engineCharacter(row);
  if (activity?.kind === CULTIVATION) {
    const { gained, capped, after } = cultivationGain(character, keptXp(activity), content());
    const grown = cultivationProgress(progress, activity.minutes, content());
    return { ...base, running: { xp: gained, level: after.level, capped, cultivationXp: grown.gained, cultivationLevel: grown.level } };
  }
  if (activity) return base;
  return { ...base, plan: cultivationPlan(character, progress, huntDurations(row.level, content()), content()) };
}

// POST /api/cultivation { minutes }: a Kultywacja from now on, of a length
// an exploration offers the character, while it gives something: character
// XP with the class ahead, or the Kultywacja's own XP below its top level.
// It keeps the XP of the length at the rate of the class level now and the
// levels it began with; the HP rested so far is saved, and resting goes on.
// The character's row is as read, so two taps at once start one (the
// activities' table holds one for each character).
export async function startCultivation(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const { row } = player;
  const now = context.now;
  if (!isUnlocked(CULTIVATION, row.level, content())) {
    throw new ApiError(403, 'locked', `Kultywację odblokujesz na poziomie postaci ${content().unlocksById[CULTIVATION].level}.`);
  }
  if (!huntDurations(row.level, content()).includes(body?.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas Kultywacji.');
  const plan = cultivationPlan(engineCharacter(row), progressOf(row), [body.minutes], content());
  if (!plan.possible) {
    throw new ApiError(409, 'nothing_to_gain', 'Twoja postać dogoniła klasę, a Kultywacja ma najwyższy poziom: medytacja nic teraz nie da.');
  }
  // The XP of the whole length, also at equal levels: the claim gives what
  // the class's level lets then (cultivationGain).
  const xp = cultivationXp(cultivationRate(row.class_level, content()), body.minutes);
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const options = JSON.stringify({ xp, levels: { level: row.level, classLevel: row.class_level } });
  const db = context.env.DB;
  try {
    await db.batch([
      sameVersion(db, row),
      db
        .prepare('INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.id, CULTIVATION, newestArea(row.class_level, content()).id, body.minutes, now, now + body.minutes * MINUTE, seed, hp, options),
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
    ]);
  } catch (error) {
    if (raced(error)) throw characterChanged();
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a Kultywacja that ended (finishActivity in hunts.js): the
// character XP kept at its start, at most what brings the character to its
// class's level now (cultivationGain), its new levels with their Time
// Points, and full HP at a new level, as after a work's XP; and the
// Kultywacja's own XP of its minutes, with its new level and its System
// line. Saved only while the Kultywacja is still there and the character is
// as read (workClaim), so a claim and a "Przerwij" at once give it once or
// not at all.
export async function finishCultivation(db, player, now) {
  const { row, activity } = player;
  const character = engineCharacter(row);
  const full = keptXp(activity);
  const { gained, capped, after } = cultivationGain(character, full, content());
  const hp = after.levelled ? playerCombatant({ character: { ...character, level: after.level, xp: after.xp }, equipped: equippedItems(player), name: row.name }, content()).maxHp : null;
  const progress = progressOf(row);
  const grown = cultivationProgress(progress, activity.minutes, content());
  const area = content().areasById[activity.region_id];
  const summary = { xp: gained, levelBefore: row.level, levelAfter: after.level, timePoints: after.timePoints };
  const report = {
    kind: CULTIVATION,
    placeName: t('Kultywacja'),
    // The place its XP was counted from (newestArea at its start).
    ...(area && { areaName: area.name }),
    minutes: activity.minutes,
    startedAt: activity.started_at,
    endsAt: activity.ends_at,
    xp: gained,
    // The XP of its length, and whether the class's level took some of it.
    full,
    capped,
    classLevel: row.class_level,
    // The Kultywacja's own XP and levels, and its share more character XP
    // from explorations at its level now.
    cultivation: { xp: grown.gained, levelBefore: progress.level, levelAfter: grown.level, bonus: cultivationBonus(grown.level, content()) },
    summary,
    system: [
      ...after.messages,
      ...(grown.level > progress.level ? [say(content().texts, 'cultivationLevelUp', 0, { level: grown.level, share: percent(cultivationBonus(grown.level, content())) })] : []),
    ],
  };
  const listed = {
    placeName: report.placeName,
    minutes: report.minutes,
    xp: gained,
    levelBefore: row.level,
    levelAfter: after.level,
    capped,
    cultivation: report.cultivation,
    system: report.system,
  };
  let results;
  try {
    results = await db.batch([
      workClaim(db, row, 'activities', activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, `${row.id}:${activity.started_at}`, CULTIVATION, now, JSON.stringify(listed), JSON.stringify(report)),
      trimReports(db, row.id, CULTIVATION),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, time_points = time_points + ?, cultivation_level = ?, cultivation_xp = ?${hp === null ? '' : ', hp = ?, hp_at = ?'}, version = version + 1 WHERE id = ?`,
        )
        .bind(after.level, after.xp, after.timePoints, grown.level, grown.xp, ...(hp === null ? [] : [hp, now]), row.id),
      db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw alreadyClaimed();
    if (raced(error)) throw await workClaimFailed(db, row, 'activities', activity);
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}
