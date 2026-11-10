// Professions on server time. Zielarstwo: the start stores the time, the
// herbs chosen and the seed; the claim after the end gathers them with that
// seed, puts what fits into the bag and saves the report. Herbs in the bag
// can be sold to the scrapper or thrown away. All of it waits while the
// professions are hidden in this deployment (features.js).

import {
  addQuestProgress,
  applyWork,
  bagCapacity,
  campBonus,
  campLevels,
  gatherHerbs,
  gatheringMinutes,
  gatheringReport,
  herbSlots,
  isUnlocked,
  playerCombatant,
  professionState,
  storeStacks,
  workProfession,
  workXp,
  saleGold,
  weekFactor,
} from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, currentHp, engineCharacter, equippedItems, loadPlayer, questsNow, requirePlayer, requireWorker, workOf } from './characters.js';
import { toHex } from './encoding.js';
import { professionsOn } from './features.js';
import { assertion, characterChanged, raced } from './atomic.js';
import { takenBefore, trialProgress } from './guild-trials.js';
import { workFamePoints } from './fame.js';
import { ApiError, json, readJson } from './http.js';
import { herbsOf } from './professions-view.js';
import { perkOf } from './perks.js';
import { trimReports } from './reports.js';
import { keptWeek, weekNow } from './weeks.js';

// A JSON path for an id with a hyphen.
const path = (id) => `$."${id}"`;

// What adds `amounts` (by id) to a JSON column at once, so a change made
// meanwhile elsewhere (the camp's stores, the table's queue, the other
// worker's claim) stays.
export function addTo(column, amounts) {
  const entries = Object.entries(amounts).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return { sql: '', binds: [] };
  return {
    sql: `, ${column} = json_set(${column}, ${entries.map(() => `?, COALESCE(json_extract(${column}, ?), 0) + ?`).join(', ')})`,
    binds: entries.flatMap(([id, amount]) => [path(id), path(id), amount]),
  };
}

// What `minutes` of a profession's work give the character: the XP and the
// level it brings, the profession's new level and, at a new level, full HP;
// and what the claim sets for that. The Awatar Systemu's work (`avatar`)
// gives avatar.share of it since 10.11.2026, as if the character had done
// the work: that share of the profession's XP (its minutes) and of the
// character's XP, each rounded, with the levels, the HP and the Time
// Points they bring (the author: „Awatar niech od teraz daje 1/4 tego co
// zdobyłaby postać - XPa i wpływ na level Profesji w podobnej ilości - tak
// jakby gracz robił te czynności. Tak, pamiętam pierwotne założenia, ale
// wszystko ewoluuje.”); before, none of it. The profession's XP takes the
// share of the week the work began in (profession-xp, weeks.js), kept with
// it, the Awatar's as the character's. All of it is computed from the row
// read, so a claim saves it only while the row is as read (workClaim).
export function workGains(player, profession, before, minutes, avatar, now) {
  const { row } = player;
  const character = engineCharacter(row);
  const share = avatar ? content().avatar.share : 1;
  const week = weekFactor(keptWeek(workOf(player, avatar).activity?.options), 'profession-xp');
  const after = workProfession(profession, before, Math.round(minutes * share), week);
  const xp = Math.round(workXp(row.level, minutes, content()) * share);
  const work = applyWork(character, xp, content());
  // A new level heals fully; otherwise resting simply goes on.
  const levelled = { ...character, level: work.level, xp: work.xp };
  const hp = work.levelled ? playerCombatant({ character: levelled, equipped: equippedItems(player), name: row.name }, content()).maxHp : null;
  const professions = { ...character.professions, [profession.id]: { level: after.level, xp: after.xp } };
  const sets = {
    sql: `, level = ?, xp = ?, time_points = time_points + ?, professions = ?${hp === null ? '' : ', hp = ?, hp_at = ?'}`,
    binds: [work.level, work.xp, work.timePoints, JSON.stringify(professions), ...(hp === null ? [] : [hp, now])],
  };
  return { character, after, xp, work, sets };
}

// The head of the batch of a work's claim that brings a report (atomic.js):
// the work is still there in `table` and the character's row is as read.
// The claim writes the character's level, XP and professions as workGains
// computed them from that row, and since 10.11.2026 its Awatar's claim
// writes them too, so neither claim may undo what the other or an entry of
// the Wieże gave meanwhile; a retry claims anew.
export const workClaim = (db, row, table, activity) =>
  assertion(db, `EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND started_at = ?) AND (SELECT version FROM characters WHERE id = ?) = ?`, [
    row.id,
    activity.started_at,
    row.id,
    row.version,
  ]);

// Why such a claim failed on its head: the work claimed or called back by
// another request a moment ago, or the character changed meanwhile.
export async function workClaimFailed(db, row, table, activity) {
  const still = await db.prepare(`SELECT 1 AS found FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at).first();
  return still ? characterChanged() : new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
}

// The start of a work that takes things from the bag or the camp (brewing.js,
// workshop.js): its activity, for the character with its HP at the start or
// for its Awatar Systemu, saved only once the statement before has taken
// them, so two taps at once start one work. Its batch begins with the
// assertion that the row is as read (atomic.js), so the version one higher
// here is the statement before's own. The work keeps the week of the year
// it begins in (`week`, weeks.js), whose share of its XP it gets.
export function insertWork(db, avatar, row, { kind, placeId, minutes, now, seed, hp, options }) {
  const week = weekNow(now);
  const columns = ['character_id', 'kind', 'region_id', 'minutes', 'started_at', 'ends_at', 'seed', ...(avatar ? [] : ['hp_at_start']), 'options'];
  const values = [row.id, kind, placeId, minutes, now, now + minutes * 60000, seed, ...(avatar ? [] : [hp]), JSON.stringify(week ? { ...options, week } : options)];
  return db
    .prepare(
      `INSERT INTO ${avatar ? 'avatar_activities' : 'activities'} (${columns.join(', ')})
       SELECT ${values.map(() => '?').join(', ')} WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)`,
    )
    .bind(...values, row.id, row.version + 1);
}

// Professions need this deployment to show them and the character's level.
export function requireProfessions(player) {
  if (!professionsOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const unlock = content().unlocksById.professions;
  if (!isUnlocked('professions', player.row.level, content())) {
    throw new ApiError(403, 'locked', `Profesje odblokujesz na poziomie postaci ${unlock.level}.`);
  }
}

// A gathering of `minutes` of the herbs chosen, from now on, by the
// character or by its Awatar Systemu (`avatar` in the request).
export async function startGathering(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { gathering } = content();
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), gathering.profession);
  const herbIds = body.herbs;
  const slots = herbSlots(level, content());
  if (!Array.isArray(herbIds) || herbIds.length === 0 || new Set(herbIds).size !== herbIds.length) {
    throw new ApiError(400, 'invalid_herbs', 'Wybierz zioła do zbierania.');
  }
  if (herbIds.length > slots) {
    throw new ApiError(400, 'too_many_herbs', slots === 1 ? 'Na tym poziomie zbierasz naraz najwyżej 1 zioło.' : `Na tym poziomie zbierasz naraz najwyżej ${slots} zioła.`);
  }
  for (const id of herbIds) {
    const herb = typeof id === 'string' ? content().herbsById[id] : undefined;
    if (!herb || herb.level > level) throw new ApiError(400, 'unknown_herb', 'Tego zioła jeszcze nie znasz.');
  }
  if (!gatheringMinutes(content()).includes(body.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas zbierania.');

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  // `begun`: when it really began, for the Próby Gildii (takenBefore);
  // `more`: the Bractwo Zielarzy's share of herbs more (589 A), as now;
  // `week`: the week of the year it begins in (weeks.js).
  const more = perkOf(player.row, 'herbYield');
  const week = weekNow(now);
  const options = JSON.stringify({ herbs: herbIds, begun: now, ...(more > 0 && { more }), ...(week && { week }) });
  const ends = now + body.minutes * 60000;
  try {
    await db.batch(
      avatar
        ? [
            db
              .prepare('INSERT INTO avatar_activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(player.row.id, 'herbs', gathering.place.id, body.minutes, now, ends, seed, options),
          ]
        : [
            db
              .prepare(
                'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              )
              .bind(player.row.id, 'herbs', gathering.place.id, body.minutes, now, ends, seed, hp, options),
            // The HP rested so far is saved, and resting goes on from now.
            db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, player.row.id),
          ],
    );
  } catch (error) {
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', avatar ? content().avatar.texts.busy[0] : 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a finished gathering (claimHunt sends a gathering here), of
// the character or, with `avatar`, of its Awatar Systemu (avatar.js), whose
// work brings the herbs and its share of the XP and of the levels
// (workGains).
export async function finishGathering(db, player, now, { avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { gathering } = content();
  const profession = content().professionsById[gathering.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  // Herbs the data no longer has are left out.
  const herbIds = (JSON.parse(activity.options ?? '{}').herbs ?? []).filter((id) => content().herbsById[id]);
  const more = JSON.parse(activity.options ?? '{}').more ?? 0;
  // The week it began in: its share of the herbs (weeks.js).
  const week = weekFactor(keptWeek(activity.options), 'herbs');
  const found = herbIds.length > 0 ? gatherHerbs({ herbIds, minutes: activity.minutes, level: before.level, seed: activity.seed, more, week }, content()) : {};
  const capacity = bagCapacity(campLevels(player.buildings, now, content()), content());
  const { stored, lost } = storeStacks(herbsOf(row), found, capacity - bagPlaces(player), content());
  const { character, after, xp, work, sets } = workGains(player, profession, before, activity.minutes, avatar, now);
  const report = {
    ...gatheringReport(
      { minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at, seed: activity.seed, found, stored, lost, before, after, character, xp, work },
      content(),
    ),
    ...(avatar && { avatar: true }),
  };
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    herbs: report.herbs.map(({ name, count }) => ({ name, count })),
    lost: Object.values(lost).reduce((sum, count) => sum + count, 0),
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...(avatar && { avatar: true }),
  };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { herbs: found }));
  const herbs = addTo('herbs', stored);

  let results;
  try {
    results = await db.batch([
      // Only while the gathering is still there (atomic.js): one called
      // back a moment ago brings no report (the code review); and while the
      // character is as read (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'herbs', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'herbs'),
      db
        .prepare(`UPDATE characters SET quests = CASE WHEN quests = ? THEN ? ELSE quests END${sets.sql}${herbs.sql}, version = version + 1 WHERE id = ?`)
        .bind(row.quests, quests, ...sets.binds, ...herbs.binds, row.id),
      // The Próby Gildii's trial too (guild-trials.js).
      // A trial taken before the gathering set out (takenBefore).
      ...trialProgress(db, row.id, { herbs: found }, now, takenBefore(JSON.parse(activity.options ?? '{}').begun)),
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

// How many of a herb the request names: a whole number from 1 to what the
// character has.
function herbCount(player, body) {
  const herb = typeof body.herbId === 'string' ? content().herbsById[body.herbId] : undefined;
  if (!herb) throw new ApiError(400, 'unknown_herb', 'Nie ma takiego zioła.');
  const have = herbsOf(player.row)[herb.id] ?? 0;
  if (have === 0) throw new ApiError(404, 'no_herb', 'Nie masz tego zioła.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  return { id: herb.id, price: herb.price, have, count: body.count };
}

// The herbs or the potions (`column`) after `count` of one kind go: the key
// goes with the last of them, and `also` ({ sql, binds }) sets more with
// them. The change saves only if the kind is still as seen, so two taps at
// once sell, throw away or drink once.
export function takeFromBag(db, player, column, { id, have, count }, gold = 0, also = null) {
  const left = have - count;
  return db
    .prepare(
      `UPDATE characters SET ${column} = ${left === 0 ? `json_remove(${column}, ?)` : `json_set(${column}, ?, ?)`}, gold = gold + ?${also ? `, ${also.sql}` : ''}, version = version + 1
       WHERE id = ? AND json_extract(${column}, ?) = ?`,
    )
    .bind(path(id), ...(left === 0 ? [] : [left]), gold, ...(also?.binds ?? []), player.row.id, path(id), have)
    .run();
}

// The scrapper buys herbs at their price, with the camp's Skup złomu.
export async function sellHerbs(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const taken = herbCount(player, body);
  const bonus = campBonus(campLevels(player.buildings, context.now, content()), 'sellPrice', content());
  const gold = saleGold(taken.price * (1 + bonus), taken.count);
  const result = await takeFromBag(context.env.DB, player, 'herbs', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Zioła zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function discardHerbs(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'herbs', herbCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Zioła zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
