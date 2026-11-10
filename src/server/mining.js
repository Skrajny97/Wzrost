// Górnictwo on server time (src/engine/mining.js): the start stores the time,
// the character's level, which sets the gold of the veins, and the seed; the
// claim after the end digs with that seed, adds the minerals and the veins'
// gold to the character and saves the report. Called back early, the
// character brings nothing, as from the Zagajnik. Minerals take no room in
// the bag; they sell to the scrapper or go away.

import { addQuestProgress, campBonus, campLevels, mineMinerals, miningMinutes, miningReport, professionOpen, professionState, professionUnlockLevel, saleGold, weekFactor } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, questsNow, requirePlayer, requireWorker, workOf } from './characters.js';
import { toHex } from './encoding.js';
import { raced } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { addTo, requireProfessions, takeFromBag, workClaim, workClaimFailed, workGains } from './professions.js';
import { workFamePoints } from './fame.js';
import { mineralsOf } from './professions-view.js';
import { trimReports } from './reports.js';
import { keptWeek, weekNow } from './weeks.js';

// A profession that opens later than the Profesje tab waits for its level.
export function requireOpen(player, profession) {
  if (!professionOpen(profession, player.row.level, content())) {
    throw new ApiError(403, 'locked', `${profession.name} odblokujesz na poziomie postaci ${professionUnlockLevel(profession, content())}.`);
  }
}

// A digging of `minutes` from now on, by the character or by its Awatar
// Systemu (`avatar` in the request). Nothing is taken at the start, so it
// only needs the worker free: two taps at once start one work, as the
// activity's table holds one for each character.
export async function startMining(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { mining } = content();
  requireOpen(player, content().professionsById[mining.profession]);
  if (!miningMinutes(content()).includes(body.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas kopania.');

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  const { row } = player;
  // The character's level sets the veins' gold; `begun`, when it really
  // began; `week`, the week of the year it begins in (weeks.js).
  const week = weekNow(now);
  const options = JSON.stringify({ level: row.level, begun: now, ...(week && { week }) });
  const ends = now + body.minutes * 60000;
  try {
    await db.batch(
      avatar
        ? [
            db
              .prepare('INSERT INTO avatar_activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(row.id, 'minerals', mining.place.id, body.minutes, now, ends, seed, options),
          ]
        : [
            db
              .prepare(
                'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              )
              .bind(row.id, 'minerals', mining.place.id, body.minutes, now, ends, seed, hp, options),
            // The HP rested so far is saved, and resting goes on from now.
            db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
          ],
    );
  } catch (error) {
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', avatar ? content().avatar.texts.busy[0] : 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a finished digging (claimHunt sends one here), of the
// character or, with `avatar`, of its Awatar Systemu (avatar.js), whose work
// brings the minerals, the gold and its share of the XP and of the levels
// (workGains). The Górnictwo level of the claim
// decides the minerals, as the Zielarstwo level decides the herbs.
export async function finishMining(db, player, now, { avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { mining } = content();
  const profession = content().professionsById[mining.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // The week it began in: its share of the minerals (weeks.js).
  const mined = mineMinerals({ minutes: activity.minutes, level: before.level, characterLevel: options.level ?? row.level, seed: activity.seed, week: weekFactor(keptWeek(options), 'minerals') }, content());
  const { character, after, xp, work, sets } = workGains(player, profession, before, activity.minutes, avatar, now);
  const report = {
    ...miningReport({ minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at, seed: activity.seed, mined, before, after, character, xp, work }, content()),
    ...(avatar && { avatar: true }),
  };
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    minerals: report.minerals.map(({ name, count }) => ({ name, count })),
    gold: mined.gold,
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...(avatar && { avatar: true }),
  };
  const minerals = addTo('minerals', mined.found);
  // Every piece dug moves the quests of digging (mineAny), the Awatar's too,
  // as its herbs move the gathering's.
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { minerals: Object.values(mined.found).reduce((sum, count) => sum + count, 0) }));
  let results;
  try {
    results = await db.batch([
      // Only while the digging is still there (atomic.js): one called back
      // a moment ago brings no report; and while the character is as read
      // (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'minerals', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'minerals'),
      db
        .prepare(`UPDATE characters SET gold = gold + ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END${sets.sql}${minerals.sql}, version = version + 1 WHERE id = ?`)
        .bind(mined.gold, row.quests, quests, ...sets.binds, ...minerals.binds, row.id),
      // The Punkty Sławy of the work (fame.js), the Awatar's a quarter.
      ...workFamePoints(db, row.id, activity.minutes, avatar, now),
      db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    if (raced(error)) throw await workClaimFailed(db, row, table, activity);
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}

// How many of a mineral the request names: a whole number from 1 to what
// the character has.
function mineralCount(player, body) {
  const mineral = typeof body.mineralId === 'string' ? content().mineralsById[body.mineralId] : undefined;
  if (!mineral) throw new ApiError(400, 'unknown_mineral', 'Nie ma takiego minerału.');
  const have = mineralsOf(player.row)[mineral.id] ?? 0;
  if (have === 0) throw new ApiError(404, 'no_mineral', 'Nie masz tego minerału.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  return { id: mineral.id, price: mineral.price, have, count: body.count };
}

// The scrapper buys minerals at their price, with the camp's Skup złomu, as
// herbs (533 A); like the bag's other goods, also while the character is away.
export async function sellMinerals(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const taken = mineralCount(player, body);
  const bonus = campBonus(campLevels(player.buildings, context.now, content()), 'sellPrice', content());
  const gold = saleGold(taken.price * (1 + bonus), taken.count);
  const result = await takeFromBag(context.env.DB, player, 'minerals', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Minerały zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function discardMinerals(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'minerals', mineralCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Minerały zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
