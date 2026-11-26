// Kultywacja (1230 A; src/engine/cultivation.js, DECISIONS.md „Kultywacja
// (1230 A)”) on server time: the character meditates for 10 minutes to 8
// hours, as long as a profession's work (cultivationMinutes), from its
// unlock on. While its class is ahead, it gets character XP:
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
//
// An Awatar Systemu may meditate instead (DECISIONS.md, „Kultywacja
// Awatarem (26.11.2026)”; the author: „Do tego trzeba pozwolić robić
// Kultywację Awatarem. Ale tylko jednym na raz i żeby użycie go zajmowało
// też slot tego z Profesji. Żeby były powiązane ale niech tylko jeden na raz
// może robić”): with `avatar` in the start's request (true, or 2 for the
// second), its Kultywacja sits where its profession's work does
// (avatar_activities, avatar2_activities), so it takes no work meanwhile
// (requireWorker in characters.js), while the character is free for
// anything. Its claim and its "Przerwij" are the Awatar's (avatar.js), and
// Punkty Czasu rewind it as its work (time.js, `avatar`, `avatar2`). It
// brings the Kultywacja's XP whole and its share of the character XP
// (avatar.share, a quarter; cultivationKept), under the same cap at the
// claim. One meditates at a time, the character or an Awatar
// (meditationOf, cultivationTaken).

import {
  cultivationBonus,
  cultivationGain,
  cultivationKept,
  cultivationMinutes,
  cultivationPlan,
  cultivationProgress,
  cultivationRate,
  cultivationXpToNext,
  isUnlocked,
  newestArea,
  playerCombatant,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { content } from './content.js';
import { avatarMark, avatarTexts, avatarWorkOf, characterView, currentHp, engineCharacter, equippedItems, loadPlayer, requireWorker, workOf, workTable } from './characters.js';
import { toHex } from './encoding.js';
import { assertion, characterChanged, raced } from './atomic.js';
import { professionsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { alreadyClaimed, requireProfessions, workClaim, workClaimFailed } from './professions.js';
import { trimReports } from './reports.js';

// The activity's kind (activities.kind) and its report's.
export const CULTIVATION = 'cultivation';
const MINUTE = 60000;

// The words of a character busy with it, as requireIdle says them
// (characters.js): still meditating, or its report waiting.
export const cultivationBusy = (finished) =>
  finished ? new ApiError(409, 'claim_first', 'Kultywacja się skończyła. Najpierw odbierz jej raport.') : new ApiError(409, 'busy', 'Postać medytuje. Poczekaj na koniec Kultywacji.');

// The Kultywacja going on or waiting for its claim, of the character or of
// one of its Awatary, as { activity, avatar } (`avatar`: false, true for
// the first Awatar, 2 for the second, as workTable names them), or null:
// one at a time (the author, 26.11.2026: „tylko jeden na raz”).
function meditationOf(player) {
  for (const avatar of [false, true, 2]) {
    const activity = avatar ? avatarWorkOf(player, avatar) : player.activity;
    if (activity?.kind === CULTIVATION) return { activity, avatar };
  }
  return null;
}

// Why no other Kultywacja begins while `one` (meditationOf) goes on, or
// waits for its claim, in words that name who meditates.
function cultivationTaken({ activity, avatar }, now) {
  const ended = activity.ends_at <= now;
  if (!avatar) {
    return ended
      ? new ApiError(409, 'claim_first', 'Postać skończyła Kultywację. Najpierw odbierz jej raport.')
      : new ApiError(409, 'busy', 'Kultywację robi już postać. Naraz medytuje tylko jeden.');
  }
  const texts = avatarTexts(avatar);
  return ended ? new ApiError(409, 'claim_first', texts.meditated[0]) : new ApiError(409, 'busy', texts.cultivationTaken[0]);
}

// SQL: nobody meditates, neither the character nor an Awatar, for the head
// of a start's batch (three binds of the character's id).
const NOBODY_MEDITATES = ['activities', 'avatar_activities', 'avatar2_activities']
  .map((table) => `NOT EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND kind = '${CULTIVATION}')`)
  .join(' AND ');

// Whether an Awatar Systemu bought is free to meditate now (not at work, not
// meditating), where the deployment shows the professions it belongs to.
const avatarFree = (player) =>
  professionsOn() && ((Boolean(player.row.avatar_at) && !player.avatarActivity) || (Boolean(player.row.avatar2_at) && !player.avatar2Activity));

// The XP the start kept, a whole number (0 for anything else).
const keptXp = (activity) => {
  const { xp } = JSON.parse(activity.options ?? '{}');
  return Number.isSafeInteger(xp) && xp > 0 ? xp : 0;
};

// The Kultywacja's own level and its XP, as the character's row keeps them,
// with XP that a shorter level of a changed curve (balance.json
// `cultivation`) no longer holds counted on into the next levels at once
// (cultivationProgress of no minutes); the next claim writes them so.
const progressOf = (row) => {
  const { level, xp } = cultivationProgress({ level: row.cultivation_level ?? 0, xp: row.cultivation_xp ?? 0 }, 0, content());
  return { level, xp };
};

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
// while the character is away); at home also the plan (cultivationPlan)
// for each of its lengths (cultivationMinutes), and with an Awatar free the
// plan of its meditation (`avatarPlan`: its share of the character XP); while
// one runs or waits for its claim, the character's or an Awatar's, what the
// claim would give now (`running`, with `avatar` for an Awatar's).
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
    // A level's share and the first and the last level's minutes, for
    // "Jak to działa?".
    perLevel: levelBonus,
    firstMinutes: cultivationXpToNext(0, content()),
    lastMinutes: cultivationXpToNext(maxLevel - 1, content()),
    // Once an Awatar is bought, its share of the character XP, for the
    // words of its meditation.
    ...(professionsOn() && row.avatar_at && { avatarShare: content().avatar.share }),
  };
  const character = engineCharacter(row);
  const meditation = meditationOf(player);
  if (meditation) {
    const { gained, capped, after } = cultivationGain(character, keptXp(meditation.activity), content());
    const grown = cultivationProgress(progress, meditation.activity.minutes, content());
    return { ...base, running: { xp: gained, level: after.level, capped, cultivationXp: grown.gained, cultivationLevel: grown.level, ...avatarMark(meditation.avatar) } };
  }
  const lengths = cultivationMinutes(content());
  return {
    ...base,
    ...(!activity && { plan: cultivationPlan(character, progress, lengths, content()) }),
    ...(avatarFree(player) && { avatarPlan: cultivationPlan(character, progress, lengths, content(), content().avatar.share) }),
  };
}

// POST /api/cultivation { minutes, avatar? }: a Kultywacja from now on, of
// one of its lengths (cultivationMinutes: 10 minutes to 8 hours every 10, at
// any level), while it gives something: character XP with the class ahead,
// or the Kultywacja's own XP below its top level. The character at home
// meditates, or with `avatar` its Awatar Systemu (true) or second Awatar
// (2), bought and free (requireWorker), while the character does anything;
// and only while nobody else meditates (meditationOf).
// It keeps the XP of the length at the rate of the class level now, an
// Awatar's share of it for an Awatar's (cultivationKept), and the levels it
// began with; the character's own saves the HP rested so far, and resting
// goes on. The batch holds only while nobody meditates, and the
// character's own only while its row is as read, so two taps at once, or
// the character's and an Awatar's start at once, begin one (each table
// holds one activity for each character).
export async function startCultivation(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  const { row } = player;
  const now = context.now;
  if (!isUnlocked(CULTIVATION, row.level, content())) {
    throw new ApiError(403, 'locked', `Kultywację odblokujesz na poziomie postaci ${content().unlocksById[CULTIVATION].level}.`);
  }
  // The Awatar comes with the Profesje tab, where it is bought.
  if (avatar) requireProfessions(player);
  if (!cultivationMinutes(content()).includes(body?.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas Kultywacji.');
  const other = meditationOf(player);
  if (other) throw cultivationTaken(other, now);
  const share = avatar ? content().avatar.share : 1;
  const plan = cultivationPlan(engineCharacter(row), progressOf(row), [body.minutes], content(), share);
  if (!plan.possible) {
    throw new ApiError(409, 'nothing_to_gain', 'Twoja postać dogoniła klasę, a Kultywacja ma najwyższy poziom: medytacja nic teraz nie da.');
  }
  // The XP of the whole length, also at equal levels: the claim gives what
  // the class's level lets then (cultivationGain).
  const xp = cultivationKept(cultivationRate(row.class_level, content()), body.minutes, share);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const options = JSON.stringify({ xp, levels: { level: row.level, classLevel: row.class_level } });
  const place = newestArea(row.class_level, content()).id;
  const ends = now + body.minutes * MINUTE;
  const db = context.env.DB;
  const ids = [row.id, row.id, row.id];
  let statements;
  if (avatar) {
    statements = [
      assertion(db, NOBODY_MEDITATES, ids),
      db
        .prepare(`INSERT INTO ${workTable(avatar)} (character_id, kind, region_id, minutes, started_at, ends_at, seed, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(row.id, CULTIVATION, place, body.minutes, now, ends, seed, options),
    ];
  } else {
    const { hp } = currentHp(player, now);
    statements = [
      assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND ${NOBODY_MEDITATES}`, [row.id, row.version, ...ids]),
      db
        .prepare('INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.id, CULTIVATION, place, body.minutes, now, ends, seed, hp, options),
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
    ];
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (raced(error)) throw characterChanged();
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', avatar ? avatarTexts(avatar).busy[0] : 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a Kultywacja that ended (finishActivity in hunts.js; with
// `avatar`, an Awatar's, claimAvatar in avatar.js): the character XP kept
// at its start, at most what brings the character to its class's level now
// (cultivationGain), its new levels with their Time Points, and full HP at
// a new level, as after a work's XP; and the Kultywacja's own XP of its
// minutes, with its new level and its System line. An Awatar's report names
// it, as its work's does (`avatar`, „Wykonawca”). Saved only while the
// Kultywacja is still there and the character is as read (workClaim), so a
// claim and a "Przerwij" at once give it once or not at all.
export async function finishCultivation(db, player, now, { avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
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
    // Who meditated: an Awatar (avatarMark), or the character.
    ...avatarMark(avatar),
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
    ...avatarMark(avatar),
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
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, CULTIVATION, now, JSON.stringify(listed), JSON.stringify(report)),
      trimReports(db, row.id, CULTIVATION),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, time_points = time_points + ?, cultivation_level = ?, cultivation_xp = ?${hp === null ? '' : ', hp = ?, hp_at = ?'}, version = version + 1 WHERE id = ?`,
        )
        .bind(after.level, after.xp, after.timePoints, grown.level, grown.xp, ...(hp === null ? [] : [hp, now]), row.id),
      db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw alreadyClaimed();
    if (raced(error)) throw await workClaimFailed(db, row, table, activity);
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}
