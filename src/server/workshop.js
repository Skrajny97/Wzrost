// Rzemieślnictwo in the Systemowy Warsztat (src/engine/workshop.js): an
// order of up to maxCount items of one pattern and rarity takes its parts
// and the camp's resources at the start, and its report brings the items
// made into the bag, the parts of the failed ones lost and their resources
// back. Called back early, the character brings the items done and gets
// back all the rest.

import {
  addQuestProgress,
  applyWork,
  bagCapacity,
  campLevels,
  craftCost,
  craftItems,
  craftRarities,
  orderMinutes,
  patternLevel,
  playerCombatant,
  potionsDone,
  professionState,
  settleCrafting,
  workProfession,
  workXp,
  workshopReport,
} from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, craftingState, currentHp, engineCharacter, equippedItems, loadPlayer, questsNow, requireIdlePlayer, walletOf } from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { requireProfessions } from './professions.js';
import { KEPT_REPORTS } from './reports.js';

const path = (id) => `$."${id}"`;

// What adds `amounts` (by id) to a JSON column at once, so a change made
// meanwhile elsewhere (the camp's stores, the table's queue) stays.
function addTo(column, amounts) {
  const entries = Object.entries(amounts).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return { sql: '', binds: [] };
  return {
    sql: `, ${column} = json_set(${column}, ${entries.map(() => `?, COALESCE(json_extract(${column}, ?), 0) + ?`).join(', ')})`,
    binds: entries.flatMap(([id, amount]) => [path(id), path(id), amount]),
  };
}

// A share of what an order took, by id: for `of` items out of `count`.
const shareOf = (amounts, of, count) =>
  Object.fromEntries(Object.entries(amounts ?? {}).map(([id, amount]) => [id, Math.round((amount * of) / Math.max(1, count))]));

// An order of `count` items of a known pattern and rarity, from now on. The
// parts and the resources go at once, only if the character is still as
// seen, so two taps at once start one order; and only with room in the bag
// for all the items.
export async function startCrafting(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireProfessions(player);
  const body = await readJson(context.request);
  const { workshop } = content;
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), workshop.profession);
  const base = typeof body.baseId === 'string' ? content.basesById[body.baseId] : undefined;
  if (!base || !workshop.parts[base.slot] || patternLevel(base, content) > level) throw new ApiError(400, 'unknown_pattern', 'Tego wzoru jeszcze nie znasz.');
  const rarity = craftRarities(level, content).find((candidate) => candidate.id === body.rarity);
  if (!rarity) throw new ApiError(400, 'unknown_rarity', 'Tej rzadkości jeszcze nie wykonasz.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > workshop.maxCount) {
    throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${workshop.maxCount} sztuk.`);
  }

  const now = context.now;
  const cost = craftCost(base, rarity.id, body.count, content);
  // The parts include those of the table's orders done by now.
  const table = settleCrafting(craftingState(player.row), now);
  const { parts } = table;
  const wallet = walletOf(player.row);
  const [partId, needed] = Object.entries(cost.parts)[0];
  if ((parts[partId] ?? 0) < needed) throw new ApiError(409, 'no_parts', `Brakuje części: ${content.partsById[partId].name} (potrzeba ${needed}).`);
  const short = Object.entries(cost.resources).find(([id, amount]) => (wallet[id] ?? 0) < amount);
  if (short) throw new ApiError(409, 'no_resources', `Brakuje zasobów: ${content.resourcesById[short[0]].name} (potrzeba ${short[1]}).`);
  const free = bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player);
  if (free < body.count) throw new ApiError(409, 'bag_full', `W plecaku musi być ${body.count} wolnych miejsc na całe zlecenie.`);

  const minutes = orderMinutes(body.count, rarity.id, level, content);
  const partsLeft = { ...parts, [partId]: parts[partId] - needed };
  const resources = JSON.parse(player.row.resources ?? '{}');
  for (const [id, amount] of Object.entries(cost.resources)) resources[id] = (resources[id] ?? 0) - amount;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { row } = player;
  const db = context.env.DB;
  const [taken] = await db.batch([
    // The HP rested so far is saved, and resting goes on from now.
    db
      .prepare(
        `UPDATE characters SET parts = ?, crafting = ?, resources = ?, hp = ?, hp_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM activities WHERE character_id = ?)`,
      )
      .bind(JSON.stringify(partsLeft), JSON.stringify(table.queue), JSON.stringify(resources), hp, now, row.id, row.version, row.id),
    db
      .prepare(
        `INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)`,
      )
      .bind(
        row.id,
        'items',
        workshop.place.id,
        minutes,
        now,
        now + minutes * 60000,
        seed,
        hp,
        // The item level is the character's at the start.
        JSON.stringify({ base: base.id, rarity: rarity.id, count: body.count, level: row.level, parts: cost.parts, resources: cost.resources }),
        row.id,
        row.version + 1,
      ),
  ]);
  if (taken.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of an order (claimHunt sends a finished one here), or with
// `stop` of the part done before now (cancelHunt). Stopped before the first
// item, it only gives everything back and makes no report (null).
export async function finishCrafting(db, player, now, { stop = false } = {}) {
  const { row, activity } = player;
  const character = engineCharacter(row);
  const { workshop } = content;
  const profession = content.professionsById[workshop.profession];
  const before = professionState(character.professions, profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // A base the data no longer has makes nothing.
  const base = content.basesById[options.base];
  const count = base ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  const results = done > 0 ? craftItems({ baseId: base.id, rarityId: options.rarity, count: done, level: options.level, professionLevel: before.level, met: JSON.parse(row.met ?? '[]'), seed: activity.seed }, content) : [];
  const made = results.filter((result) => result.made).map((result) => result.item);
  // The parts of the items not done come back, and the resources of those
  // and of the failed ones.
  const partsBack = shareOf(options.parts, options.count - done, options.count);
  const resourcesBack = shareOf(options.resources, options.count - made.length, options.count);
  const back = [addTo('parts', partsBack), addTo('resources', resourcesBack)];
  const key = `${row.id}:${activity.started_at}`;
  // Only while the activity is as seen, so two calls at once give back once.
  const ongoing = 'EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND started_at = ?)';
  const end = db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at);
  if (done === 0) {
    await db.batch([
      db
        .prepare(`UPDATE characters SET version = version + 1${back.map((each) => each.sql).join('')} WHERE id = ? AND ${ongoing}`)
        .bind(...back.flatMap((each) => each.binds), row.id, row.id, activity.started_at),
      end,
    ]);
    return null;
  }

  const after = workProfession(profession, before, worked);
  const xp = workXp(row.level, worked, content);
  const work = applyWork(character, xp, content);
  // A new level heals fully; otherwise resting simply goes on.
  const levelled = { ...character, level: work.level, xp: work.xp };
  const hp = work.levelled ? playerCombatant({ character: levelled, equipped: equippedItems(player), name: row.name }, content).maxHp : null;
  const report = workshopReport(
    { base, rarityId: options.rarity, results, minutes: worked, startedAt: activity.started_at, endsAt: stop ? now : activity.ends_at, seed: activity.seed, stopped: stop, before, after, character, xp, work },
    content,
  );
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    items: made.length > 0 ? [{ name: base.name, count: made.length }] : [],
    failed: report.failed,
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
  };
  const professions = { ...character.professions, [profession.id]: { level: after.level, xp: after.xp } };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { made: made.length }));
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)');

  let saved;
  try {
    saved = await db.batch([
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'items', now, JSON.stringify(summary), JSON.stringify(report)),
      db
        .prepare('DELETE FROM reports WHERE character_id = ? AND id NOT IN (SELECT id FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?)')
        .bind(row.id, row.id, KEPT_REPORTS),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, time_points = time_points + ?, professions = ?,
             quests = CASE WHEN quests = ? THEN ? ELSE quests END${hp === null ? '' : ', hp = ?, hp_at = ?'}${back.map((each) => each.sql).join('')}, version = version + 1
           WHERE id = ? AND ${ongoing}`,
        )
        .bind(
          work.level,
          work.xp,
          work.timePoints,
          JSON.stringify(professions),
          row.quests,
          quests,
          ...(hp === null ? [] : [hp, now]),
          ...back.flatMap((each) => each.binds),
          row.id,
          row.id,
          activity.started_at,
        ),
      // The items made go to the bag; the room was there at the start.
      ...made.map((item) => insertItem.bind(row.id, JSON.stringify(item), now)),
      end,
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    throw error;
  }
  return { id: saved[0].meta.last_row_id, report };
}
