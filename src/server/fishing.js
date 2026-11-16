// Rybołówstwo on server time (src/engine/fishing.js; 1057): the start stores
// the fish chosen and the seed; the claim after the end fishes with that
// seed, adds the fish to the character's Spiżarnia and saves the report.
// Called back early, the character brings nothing, as from the Zagajnik. The
// fish take no room in the bag; the innkeeper Zbylut buys them, or they go
// away.

import { fishCatch, fishingMinutes, fishingReport, fishSlots, minigameExtra, professionState, saleGold, weekFactor } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, requirePlayer, requireWorker, workOf } from './characters.js';
import { cardSummary, cardUpserts, packGains, workCard } from './cards.js';
import { toHex } from './encoding.js';
import { characterChanged, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { addTo, alreadyClaimed, requireProfessions, takeFromBag, workClaim, workClaimFailed, workGains } from './professions.js';
import { workFamePoints } from './fame.js';
import { requireOpen } from './mining.js';
import { pantryOf } from './professions-view.js';
import { trimReports } from './reports.js';
import { keptWeek, weekNow } from './weeks.js';
import { withMinigame } from './minigame.js';

// A fishing of `minutes` from now on, of the fish chosen (`fish`, as many
// kinds as the level's slots allow), by the character or by its Awatar
// Systemu (`avatar` in the request). Nothing is taken at the start, so it
// only needs the worker free: two taps at once start one work, as the
// activity's table holds one for each character.
export async function startFishing(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { fishing } = content();
  requireOpen(player, content().professionsById[fishing.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), fishing.profession);
  const fishIds = body.fish;
  const slots = fishSlots(level, content());
  if (!Array.isArray(fishIds) || fishIds.length === 0 || new Set(fishIds).size !== fishIds.length) {
    throw new ApiError(400, 'invalid_fish', 'Wybierz ryby do łowienia.');
  }
  if (fishIds.length > slots) {
    throw new ApiError(400, 'too_many_fish', slots === 1 ? 'Na tym poziomie łowisz naraz najwyżej 1 rodzaj ryb.' : `Na tym poziomie łowisz naraz najwyżej ${slots} rodzaje ryb.`);
  }
  for (const id of fishIds) {
    const fish = typeof id === 'string' ? content().fishById[id] : undefined;
    if (!fish || fish.level > level) throw new ApiError(400, 'unknown_fish', 'Tej ryby jeszcze nie znasz.');
  }
  if (!fishingMinutes(content()).includes(body.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas połowu.');

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  const { row } = player;
  // `begun`, when it really began; `week`, the week of the year it begins
  // in (weeks.js).
  const week = weekNow(now);
  const options = JSON.stringify({ fish: fishIds, begun: now, ...(week && { week }) });
  const ends = now + body.minutes * 60000;
  try {
    await db.batch(
      avatar
        ? [
            db
              .prepare('INSERT INTO avatar_activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(row.id, 'fish', fishing.place.id, body.minutes, now, ends, seed, options),
          ]
        : [
            // The HP rested so far is computed from the row read: the start
            // holds only while it is as read (atomic.js).
            sameVersion(db, row),
            db
              .prepare(
                'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              )
              .bind(row.id, 'fish', fishing.place.id, body.minutes, now, ends, seed, hp, options),
            // The HP rested so far is saved, and resting goes on from now.
            db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
          ],
    );
  } catch (error) {
    if (raced(error)) throw characterChanged();
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', avatar ? content().avatar.texts.busy[0] : 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a finished fishing (claimHunt sends one here), of the
// character or, with `avatar`, of its Awatar Systemu (avatar.js), whose work
// brings the fish and its share of the XP and of the levels (workGains). The
// Rybołówstwo level of the claim decides the fish, as the Zielarstwo level
// decides the herbs.
export async function finishFishing(db, player, now, { avatar = false, minigame = null } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { fishing } = content();
  const profession = content().professionsById[fishing.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // Fish the data no longer has are left out; the week it began in gives
  // its share of the fish (weeks.js); past the mastery some come twice.
  const fishIds = (options.fish ?? []).filter((id) => content().fishById[id]);
  const week = weekFactor(keptWeek(options), 'fish');
  const { found, lucky } = fishIds.length > 0 ? fishCatch({ fishIds, minutes: activity.minutes, level: before.level, seed: activity.seed, week }, content()) : { found: {}, lucky: {} };
  // The mini-game's hits (minigame.js; 1006): their share more of the fish.
  for (const [id, more] of Object.entries(minigameExtra(found, minigame?.share ?? 0, activity.seed))) found[id] = (found[id] ?? 0) + more;
  const { character, after, xp, work, sets } = workGains(player, profession, before, activity.minutes, avatar, now);
  // A card the work may leave (903, cards.js).
  const card = await workCard(db, row, activity, activity.minutes);
  const report = withMinigame({
    ...fishingReport({ minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at, seed: activity.seed, found, lucky, before, after, character, xp, work }, content()),
    ...(avatar && { avatar: true }),
    ...(card && { cards: card.cards }),
  }, minigame);
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    fish: report.fish.map(({ name, count }) => ({ name, count })),
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...(avatar && { avatar: true }),
    ...(card && { cards: cardSummary(card.cards) }),
  };
  const pantry = addTo('pantry', found);
  let results;
  try {
    results = await db.batch([
      // Only while the fishing is still there (atomic.js): one called back
      // a moment ago brings no report; and while the character is as read
      // (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'fish', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'fish'),
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

// How many of a good of the Spiżarnia the request names: a whole number from
// 1 to what the character has.
function pantryCount(player, body) {
  const good = typeof body.id === 'string' ? content().pantryById[body.id] : undefined;
  if (!good) throw new ApiError(400, 'unknown_good', 'Nie ma takiej rzeczy w Spiżarni.');
  const have = pantryOf(player.row)[good.id] ?? 0;
  if (have === 0) throw new ApiError(404, 'no_good', 'Nie masz tego w Spiżarni.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  return { id: good.id, price: good.price, have, count: body.count };
}

// The innkeeper Zbylut buys the Spiżarnia's goods at their price, also
// while the character is away, as the scrapper buys minerals.
export async function sellPantry(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const taken = pantryCount(player, body);
  const gold = saleGold(taken.price, taken.count);
  const result = await takeFromBag(context.env.DB, player, 'pantry', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Spiżarnia zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function discardPantry(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'pantry', pantryCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Spiżarnia zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
