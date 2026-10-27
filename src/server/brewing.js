// Alchemia on server time. The start takes the herbs for all the potions and
// stores the recipe, the count and the seed with the activity; the claim
// after the end brews them with that seed, puts what fits into the bag and
// saves the report. Called back early, the character brings the potions done
// so far with their report, and the herbs for the rest go back to the bag.
// Potions in the bag can be sold to the scrapper or thrown away. All of it
// waits while the professions are hidden in this deployment (features.js).

import {
  addQuestProgress,
  applyWork,
  bagCapacity,
  bagStacks,
  brewMinutes,
  brewPotions,
  brewingReport,
  campBonus,
  campLevels,
  mostPotions,
  playerCombatant,
  potionHerbs,
  potionPrice,
  potionsDone,
  professionState,
  storeStacks,
  workProfession,
  workXp,
} from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, engineCharacter, equippedItems, loadPlayer, questsNow, requireIdlePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { requireProfessions, takeFromBag } from './professions.js';
import { herbsOf, potionsOf } from './professions-view.js';
import { KEPT_REPORTS } from './reports.js';

// A brewing of `count` potions of the recipe chosen, from now on. The herbs
// go into the cauldron at once, only if the character is still as seen, so
// two taps at once start one brewing.
export async function startBrewing(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireProfessions(player);
  const body = await readJson(context.request);
  const { brewing } = content;
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), brewing.profession);
  const potion = typeof body.recipe === 'string' ? content.potionsById[body.recipe] : undefined;
  if (!potion || potion.level > level) throw new ApiError(400, 'unknown_recipe', 'Tego przepisu jeszcze nie znasz.');
  const herbs = herbsOf(player.row);
  const most = mostPotions(potion, level, herbs, content);
  if (most === 0) throw new ApiError(409, 'no_herbs', 'Brakuje ziół na tę miksturę.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > most) {
    throw new ApiError(400, 'invalid_count', `Wybierz liczbę mikstur od 1 do ${most}.`);
  }

  const now = context.now;
  const minutes = brewMinutes(body.count, level, content);
  const used = potionHerbs(potion, body.count);
  const left = Object.fromEntries(Object.entries(herbs).map(([id, count]) => [id, count - (used[id] ?? 0)]).filter(([, count]) => count > 0));
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { row } = player;
  const db = context.env.DB;
  const [taken] = await db.batch([
    // The HP rested so far is saved, and resting goes on from now.
    db
      .prepare(
        `UPDATE characters SET herbs = ?, hp = ?, hp_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM activities WHERE character_id = ?)`,
      )
      .bind(JSON.stringify(left), hp, now, row.id, row.version, row.id),
    db
      .prepare(
        `INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)`,
      )
      .bind(
        row.id,
        'potions',
        brewing.place.id,
        minutes,
        now,
        now + minutes * 60000,
        seed,
        hp,
        JSON.stringify({ recipe: potion.id, count: body.count, herbs: used }),
        row.id,
        row.version + 1,
      ),
  ]);
  if (taken.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a brewing (claimHunt sends a finished one here), or with
// `stop` of the part done before now (cancelHunt): the potions done, and
// the herbs for the rest back in the bag. Stopped before the first potion,
// it only gives the herbs back and makes no report (null).
export async function finishBrewing(db, player, now, { stop = false } = {}) {
  const { row, activity } = player;
  const character = engineCharacter(row);
  const { brewing } = content;
  const profession = content.professionsById[brewing.profession];
  const before = professionState(character.professions, profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // A recipe the data no longer has brews nothing.
  const potion = content.potionsById[options.recipe];
  const count = potion ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  // The herbs for the potions not brewed, of herbs the data still has.
  const used = options.herbs ?? {};
  const back = Object.entries(used)
    .filter(([id]) => content.herbsById[id])
    .map(([id, amount]) => [id, amount - Math.round((amount * done) / Math.max(1, options.count))]);
  const herbs = herbsOf(row);
  for (const [id, amount] of back) if (amount > 0) herbs[id] = (herbs[id] ?? 0) + amount;
  const key = `${row.id}:${activity.started_at}`;
  // Only while the activity is as seen, so two calls at once give back once.
  const ongoing = 'EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND started_at = ?)';
  const end = db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at);
  if (done === 0) {
    await db.batch([
      db.prepare(`UPDATE characters SET herbs = ?, version = version + 1 WHERE id = ? AND ${ongoing}`).bind(JSON.stringify(herbs), row.id, row.id, activity.started_at),
      end,
    ]);
    return null;
  }

  const made = brewPotions({ count: done, seed: activity.seed }, content);
  const capacity = bagCapacity(campLevels(player.buildings, now, content), content);
  const taken = player.items.filter((item) => !item.equippedSlot).length + bagStacks(herbs, content) + bagStacks(potionsOf(row), content);
  const { after: potions, stored, lost } = storeStacks(potionsOf(row), { [potion.id]: made.count }, capacity - taken, content);
  const after = workProfession(profession, before, worked);
  const xp = workXp(row.level, worked, content);
  const work = applyWork(character, xp, content);
  // A new level heals fully; otherwise resting simply goes on.
  const levelled = { ...character, level: work.level, xp: work.xp };
  const hp = work.levelled ? playerCombatant({ character: levelled, equipped: equippedItems(player), name: row.name }, content).maxHp : null;
  const report = brewingReport(
    { potion, minutes: worked, startedAt: activity.started_at, endsAt: stop ? now : activity.ends_at, seed: activity.seed, made, stored, lost, stopped: stop, before, after, character, xp, work },
    content,
  );
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    potions: [{ name: potion.name, count: made.count }],
    lost: lost[potion.id] ?? 0,
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
  };
  const professions = { ...character.professions, [profession.id]: { level: after.level, xp: after.xp } };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { potions: { [potion.id]: made.count } }));

  let results;
  try {
    results = await db.batch([
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'potions', now, JSON.stringify(summary), JSON.stringify(report)),
      db
        .prepare('DELETE FROM reports WHERE character_id = ? AND id NOT IN (SELECT id FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?)')
        .bind(row.id, row.id, KEPT_REPORTS),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, time_points = time_points + ?, herbs = ?, potions = ?, professions = ?,
             quests = CASE WHEN quests = ? THEN ? ELSE quests END${hp === null ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
           WHERE id = ? AND ${ongoing}`,
        )
        .bind(
          work.level,
          work.xp,
          work.timePoints,
          JSON.stringify(herbs),
          JSON.stringify(potions),
          JSON.stringify(professions),
          row.quests,
          quests,
          ...(hp === null ? [] : [hp, now]),
          row.id,
          row.id,
          activity.started_at,
        ),
      end,
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    throw error;
  }
  return { id: results[0].meta.last_row_id, report };
}

// How many of a potion the request names: a whole number from 1 to what the
// character has.
function potionCount(player, body) {
  const potion = typeof body.potionId === 'string' ? content.potionsById[body.potionId] : undefined;
  if (!potion) throw new ApiError(400, 'unknown_potion', 'Nie ma takiej mikstury.');
  const have = potionsOf(player.row)[potion.id] ?? 0;
  if (have === 0) throw new ApiError(404, 'no_potion', 'Nie masz tej mikstury.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  return { id: potion.id, price: potionPrice(potion, content), have, count: body.count };
}

// The scrapper buys potions for priceFactor times their herbs, with the
// camp's Skup złomu.
export async function sellPotions(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const taken = potionCount(player, body);
  const bonus = campBonus(campLevels(player.buildings, context.now, content), 'sellPrice', content);
  const gold = Math.max(1, Math.round(taken.price * taken.count * (1 + bonus)));
  const result = await takeFromBag(context.env.DB, player, 'potions', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Mikstury zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function discardPotions(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'potions', potionCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Mikstury zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
