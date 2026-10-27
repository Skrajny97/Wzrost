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
} from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, currentHp, engineCharacter, equippedItems, loadPlayer, questsNow, requireIdlePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { professionsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { herbsOf } from './professions-view.js';
import { KEPT_REPORTS } from './reports.js';

// A JSON path for an id with a hyphen.
const path = (id) => `$."${id}"`;

// Professions need this deployment to show them and the character's level.
export function requireProfessions(player) {
  if (!professionsOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const unlock = content.unlocksById.professions;
  if (!isUnlocked('professions', player.row.level, content)) {
    throw new ApiError(403, 'locked', `Profesje odblokujesz na poziomie postaci ${unlock.level}.`);
  }
}

// A gathering of `minutes` of the herbs chosen, from now on.
export async function startGathering(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireProfessions(player);
  const body = await readJson(context.request);
  const { gathering } = content;
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), gathering.profession);
  const herbIds = body.herbs;
  const slots = herbSlots(level, content);
  if (!Array.isArray(herbIds) || herbIds.length === 0 || new Set(herbIds).size !== herbIds.length) {
    throw new ApiError(400, 'invalid_herbs', 'Wybierz zioła do zbierania.');
  }
  if (herbIds.length > slots) throw new ApiError(400, 'too_many_herbs', `Na tym poziomie zbierasz naraz najwyżej ${slots} ${slots === 1 ? 'zioło' : 'zioła'}.`);
  for (const id of herbIds) {
    const herb = typeof id === 'string' ? content.herbsById[id] : undefined;
    if (!herb || herb.level > level) throw new ApiError(400, 'unknown_herb', 'Tego zioła jeszcze nie znasz.');
  }
  if (!gatheringMinutes(content).includes(body.minutes)) throw new ApiError(400, 'invalid_duration', 'Wybierz czas zbierania.');

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(player.row.id, 'herbs', gathering.place.id, body.minutes, now, now + body.minutes * 60000, seed, hp, JSON.stringify({ herbs: herbIds })),
      // The HP rested so far is saved, and resting goes on from now.
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, player.row.id),
    ]);
  } catch (error) {
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', 'Postać jest już zajęta.');
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a finished gathering (claimHunt sends a gathering here).
export async function finishGathering(db, player, now) {
  const { row, activity } = player;
  const character = engineCharacter(row);
  const { gathering } = content;
  const profession = content.professionsById[gathering.profession];
  const before = professionState(character.professions, profession.id);
  // Herbs the data no longer has are left out.
  const herbIds = (JSON.parse(activity.options ?? '{}').herbs ?? []).filter((id) => content.herbsById[id]);
  const found = herbIds.length > 0 ? gatherHerbs({ herbIds, minutes: activity.minutes, level: before.level, seed: activity.seed }, content) : {};
  const capacity = bagCapacity(campLevels(player.buildings, now, content), content);
  const { after: herbs, stored, lost } = storeStacks(herbsOf(row), found, capacity - bagPlaces(player), content);
  const after = workProfession(profession, before, activity.minutes);
  const xp = workXp(row.level, activity.minutes, content);
  const work = applyWork(character, xp, content);
  // A new level heals fully; otherwise resting simply goes on.
  const levelled = { ...character, level: work.level, xp: work.xp };
  const hp = work.levelled ? playerCombatant({ character: levelled, equipped: equippedItems(player), name: row.name }, content).maxHp : null;
  const report = gatheringReport(
    { minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at, seed: activity.seed, found, stored, lost, before, after, character, xp, work },
    content,
  );
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
  };
  const professions = { ...character.professions, [profession.id]: { level: after.level, xp: after.xp } };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { herbs: found }));

  let results;
  try {
    results = await db.batch([
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, `${row.id}:${activity.started_at}`, 'herbs', now, JSON.stringify(summary), JSON.stringify(report)),
      db
        .prepare('DELETE FROM reports WHERE character_id = ? AND id NOT IN (SELECT id FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?)')
        .bind(row.id, row.id, KEPT_REPORTS),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, time_points = time_points + ?, herbs = ?, professions = ?,
             quests = CASE WHEN quests = ? THEN ? ELSE quests END${hp === null ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
           WHERE id = ?`,
        )
        .bind(work.level, work.xp, work.timePoints, JSON.stringify(herbs), JSON.stringify(professions), row.quests, quests, ...(hp === null ? [] : [hp, now]), row.id),
      db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    throw error;
  }
  return { id: results[0].meta.last_row_id, report };
}

// How many of a herb the request names: a whole number from 1 to what the
// character has.
function herbCount(player, body) {
  const herb = typeof body.herbId === 'string' ? content.herbsById[body.herbId] : undefined;
  if (!herb) throw new ApiError(400, 'unknown_herb', 'Nie ma takiego zioła.');
  const have = herbsOf(player.row)[herb.id] ?? 0;
  if (have === 0) throw new ApiError(404, 'no_herb', 'Nie masz tego zioła.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  return { id: herb.id, price: herb.price, have, count: body.count };
}

// The herbs or the potions (`column`) after `count` of one kind go: the key
// goes with the last of them. The change saves only if the kind is still as
// seen, so two taps at once sell or throw away once.
export function takeFromBag(db, player, column, { id, have, count }, gold = 0) {
  const left = have - count;
  return db
    .prepare(
      `UPDATE characters SET ${column} = ${left === 0 ? `json_remove(${column}, ?)` : `json_set(${column}, ?, ?)`}, gold = gold + ?, version = version + 1
       WHERE id = ? AND json_extract(${column}, ?) = ?`,
    )
    .bind(path(id), ...(left === 0 ? [] : [left]), gold, player.row.id, path(id), have)
    .run();
}

// The scrapper buys herbs at their price, with the camp's Skup złomu.
export async function sellHerbs(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const taken = herbCount(player, body);
  const bonus = campBonus(campLevels(player.buildings, context.now, content), 'sellPrice', content);
  const gold = Math.max(1, Math.round(taken.price * taken.count * (1 + bonus)));
  const result = await takeFromBag(context.env.DB, player, 'herbs', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Zioła zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function discardHerbs(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'herbs', herbCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Zioła zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
