// Rolnictwo on server time (src/engine/farming.js; 999.2, the board of 1005):
// the start stores the crop of each plot and the seed; the claim after the
// end harvests each plot with that seed, adds the crops to the character's
// Spiżarnia and saves the report. Called back early, the character brings
// nothing, as from the Zagajnik. The crops take no room in the bag; the
// innkeeper Zbylut buys them, as the fish (fishing.js).

import { farmingMinutes, farmingReport, harvest, knownCrops, minigameExtra, plotCount, professionState, weekFactor } from '../engine/index.js';
import { content } from './content.js';
import { avatarMark, avatarTexts, characterView, currentHp, loadPlayer, requireWorker, workOf, workTable } from './characters.js';
import { cardSummary, cardUpserts, packGains, workCard } from './cards.js';
import { toHex } from './encoding.js';
import { characterChanged, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { addTo, alreadyClaimed, requireProfessions, startLevels, workClaim, workClaimFailed, workGains } from './professions.js';
import { workFamePoints } from './fame.js';
import { requireOpen } from './mining.js';
import { trimReports } from './reports.js';
import { keptWeek, weekFor } from './weeks.js';
import { withMinigame } from './minigame.js';

// A farming of `minutes` from now on, of the field `plots` (the crop of
// each plot, by id, or null for a plot left empty, as many as the level's
// plots at most, one sown at least), by the character or by its Awatar
// Systemu (`avatar` in the request). Nothing is taken at the start, so it
// only needs the worker free: two taps at once start one work, as the
// activity's table holds one for each character.
export async function startFarming(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { farming } = content();
  requireOpen(player, content().professionsById[farming.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), farming.profession);
  const plots = body.plots;
  const count = plotCount(level, content());
  if (!Array.isArray(plots) || plots.length === 0 || plots.length > count) throw new ApiError(400, 'invalid_plots', 'Obsiej grządki na swoim polu.');
  const known = new Set(knownCrops(level, content()).map((crop) => crop.id));
  for (const id of plots) {
    if (id !== null && !(typeof id === 'string' && known.has(id))) throw new ApiError(400, 'unknown_crop', 'Tej rośliny jeszcze nie znasz.');
  }
  if (plots.every((id) => id === null)) throw new ApiError(400, 'nothing_sown', 'Obsiej co najmniej jedną grządkę.');
  if (!farmingMinutes(content()).includes(body.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas uprawy.');

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  const { row } = player;
  // The field as many plots long as the level gives, the rest left empty;
  // `begun`, when it really began; `levels`, for its Kulki Profesji
  // (startLevels); `week`, the week of the year it begins in (weeks.js).
  const field = Array.from({ length: count }, (_, index) => plots[index] ?? null);
  const week = weekFor(row, now);
  const options = JSON.stringify({ plots: field, begun: now, ...startLevels(row), ...(week && { week }) });
  const ends = now + body.minutes * 60000;
  try {
    await db.batch(
      avatar
        ? [
            db
              .prepare(`INSERT INTO ${workTable(avatar)} (character_id, kind, region_id, minutes, started_at, ends_at, seed, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
              .bind(row.id, 'crops', farming.place.id, body.minutes, now, ends, seed, options),
          ]
        : [
            // The HP rested so far is computed from the row read: the start
            // holds only while it is as read (atomic.js).
            sameVersion(db, row),
            db
              .prepare(
                'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              )
              .bind(row.id, 'crops', farming.place.id, body.minutes, now, ends, seed, hp, options),
            // The HP rested so far is saved, and resting goes on from now.
            db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
          ],
    );
  } catch (error) {
    if (raced(error)) throw characterChanged();
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', avatar ? avatarTexts(avatar).busy[0] : 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a finished farming (claimHunt sends one here), of the
// character or, with `avatar`, of its Awatar Systemu (avatar.js), whose
// work brings the crops and its share of the XP and of the levels
// (workGains). The Rolnictwo level of the claim decides the crops, as the
// Zielarstwo level decides the herbs.
export async function finishFarming(db, player, now, { avatar = false, minigame = null } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { farming } = content();
  const profession = content().professionsById[farming.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // Crops the data no longer has leave their plots empty; the week it began
  // in gives its share of the crops (weeks.js); past the mastery some come
  // twice.
  const plots = (options.plots ?? []).map((id) => (typeof id === 'string' && content().cropsById[id] ? id : null));
  const week = weekFactor(keptWeek(options), 'crops');
  const sown = plots.some((id) => id !== null);
  const { found, lucky, byPlot } = sown ? harvest({ plots, minutes: activity.minutes, level: before.level, seed: activity.seed, week }, content()) : { found: {}, lucky: {}, byPlot: plots.map(() => null) };
  // The mini-game's hits (minigame.js; 1006): their share more of the
  // crops, at the first plot of each, as the mastery's.
  for (const [id, more] of Object.entries(minigameExtra(found, minigame?.share ?? 0, activity.seed))) {
    found[id] = (found[id] ?? 0) + more;
    const first = plots.indexOf(id);
    byPlot[first] = (byPlot[first] ?? 0) + more;
  }
  const { character, after, xp, work, sets } = workGains(player, profession, before, activity.minutes, avatar, now);
  // A card the work may leave (903, cards.js).
  const card = await workCard(db, row, activity, activity.minutes);
  const report = withMinigame({
    ...farmingReport(
      { minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at, seed: activity.seed, plots, byPlot, found, lucky, before, after, character, xp, work },
      content(),
    ),
    ...avatarMark(avatar),
    ...(card && { cards: card.cards }),
  }, minigame);
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    crops: report.crops.map(({ name, count }) => ({ name, count })),
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...avatarMark(avatar),
    ...(card && { cards: cardSummary(card.cards) }),
  };
  const pantry = addTo('pantry', found);
  let results;
  try {
    results = await db.batch([
      // Only while the farming is still there (atomic.js): one called back a
      // moment ago brings no report; and while the character is as read
      // (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'crops', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'crops'),
      db.prepare(`UPDATE characters SET version = version + 1${sets.sql}${pantry.sql} WHERE id = ?`).bind(...sets.binds, ...pantry.binds, row.id),
      // The Punkty Sławy of the work (fame.js), the Awatar's a quarter.
      ...workFamePoints(db, row.id, activity.minutes, avatar, now),
      // The card the work left, a copy (cards.js).
      ...cardUpserts(db, row.id, card?.ids ?? [], now),
      ...packGains(db, row.id, card?.packs ?? 0),
      db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw alreadyClaimed();
    if (raced(error)) throw await workClaimFailed(db, row, table, activity);
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}
