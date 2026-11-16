// Gotowanie on server time (src/engine/cooking.js; 999.3, 1059), as Alchemia
// (brewing.js): the start takes the ingredients for all the dishes (the
// fish and crops from the Spiżarnia, the herbs from the bag) and stores the
// recipe, the count and the seed with the activity; the claim after the end
// cooks them with that seed, puts them in the Spiżarnia and saves the
// report. Called back early, the character brings the dishes done so far
// with their report, and the ingredients for the rest go back. The meal a
// dish makes is eaten as an exploration sets out (hunts.js, mealAtStart).

import { bagCapacity, bagStacks, campLevels, cookDishes, cookMinutes, cookingReport, dishIngredients, dishesDone, mostDishes, professionState } from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, currentHp, loadPlayer, requireWorker, workOf } from './characters.js';
import { cardSummary, cardUpserts, packGains, workCard } from './cards.js';
import { toHex } from './encoding.js';
import { atomically, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { addTo, alreadyClaimed, insertWork, requireProfessions, workClaim, workClaimFailed, workGains } from './professions.js';
import { workFamePoints } from './fame.js';
import { herbsOf, pantryOf } from './professions-view.js';
import { requireOpen } from './mining.js';
import { trimReports } from './reports.js';
import { say } from '../engine/text.js';

// The ingredients of `amounts` split by where they are kept: the herbs in
// the bag, the rest (fish and crops) in the Spiżarnia.
function byStore(amounts) {
  const herbs = {};
  const pantry = {};
  for (const [id, amount] of Object.entries(amounts)) (content().herbsById[id] ? herbs : pantry)[id] = amount;
  return { herbs, pantry };
}

// A cooking of `count` dishes of the recipe chosen, from now on, by the
// character or by its Awatar Systemu (`avatar` in the request). The
// ingredients go into the pot at once, only if the character is still as
// seen, so two taps at once start one cooking.
export async function startCooking(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { cooking } = content();
  requireOpen(player, content().professionsById[cooking.profession]);
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), cooking.profession);
  const dish = typeof body.recipe === 'string' ? content().dishesById[body.recipe] : undefined;
  if (!dish || dish.level > level) throw new ApiError(400, 'unknown_recipe', 'Tego przepisu jeszcze nie znasz.');
  const pantry = pantryOf(player.row);
  const herbs = herbsOf(player.row);
  const most = mostDishes(dish, level, { ...pantry, ...herbs }, content());
  if (most === 0) throw new ApiError(409, 'no_ingredients', 'Brakuje składników na tę potrawę.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > most) {
    throw new ApiError(400, 'invalid_count', `Wybierz liczbę potraw od 1 do ${most}.`);
  }

  const now = context.now;
  const minutes = cookMinutes(body.count, level, content());
  const used = dishIngredients(dish, body.count);
  const taken = byStore(used);
  const left = (stock, take) => Object.fromEntries(Object.entries(stock).map(([id, count]) => [id, count - (take[id] ?? 0)]).filter(([, count]) => count > 0));
  const herbsTaken = Object.keys(taken.herbs).length > 0;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { row } = player;
  const db = context.env.DB;
  // The batch holds only while the character is as read (atomic.js), so
  // the work starts only with what it takes taken by this request.
  const [, started] = await atomically(db, [
    sameVersion(db, row),
    // The HP rested so far is saved, and resting goes on from now; the
    // Awatar's work leaves it be.
    db
      .prepare(
        `UPDATE characters SET pantry = ?${herbsTaken ? ', herbs = ?' : ''}${avatar ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM ${avatar ? 'avatar_activities' : 'activities'} WHERE character_id = ?)`,
      )
      .bind(JSON.stringify(left(pantry, taken.pantry)), ...(herbsTaken ? [JSON.stringify(left(herbs, taken.herbs))] : []), ...(avatar ? [] : [hp, now]), row.id, row.version, row.id),
    insertWork(db, avatar, row, {
      kind: 'dishes',
      placeId: cooking.place.id,
      minutes,
      now,
      seed,
      hp,
      // `begun`: when it really began.
      options: { recipe: dish.id, count: body.count, ingredients: used, begun: now },
    }),
  ]);
  if (started.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a cooking (claimHunt sends a finished one here), or with
// `stop` of the part done before now (cancelHunt): the dishes done, and the
// ingredients for the rest back where they were. Stopped before the first
// dish, it only gives the ingredients back and makes no report (null). With
// `avatar`, the cooking of the Awatar Systemu (avatar.js), whose work brings
// the dishes and its share of the XP and of the levels (workGains).
export async function finishCooking(db, player, now, { stop = false, avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { cooking } = content();
  const profession = content().professionsById[cooking.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // A recipe the data no longer has cooks nothing.
  const dish = content().dishesById[options.recipe];
  const count = dish ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? dishesDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  // The ingredients for the dishes not cooked, of those the data still has.
  const back = byStore(
    Object.fromEntries(
      Object.entries(options.ingredients ?? {})
        .filter(([id]) => content().herbsById[id] || content().pantryById[id])
        .map(([id, amount]) => [id, amount - Math.round((amount * done) / Math.max(1, options.count))]),
    ),
  );
  // The herbs for the rest wait while the bag has no room for the places
  // they take, as a brewing's do (brewing.js): the cooking goes on.
  const herbs = herbsOf(row);
  for (const [id, amount] of Object.entries(back.herbs)) if (amount > 0) herbs[id] = (herbs[id] ?? 0) + amount;
  const capacity = bagCapacity(campLevels(player.buildings, now, content()), content());
  const needed = bagStacks(herbs, content()) - bagStacks(herbsOf(row), content());
  if (needed > 0 && needed > capacity - bagPlaces(player)) throw new ApiError(409, 'bag_full', say(cooking.texts, 'bagFull', 0));
  const herbsBack = addTo('herbs', back.herbs);
  // Only while the activity is as seen, so two calls at once give back once.
  const ongoing = `EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND started_at = ?)`;
  const end = db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at);
  if (done === 0) {
    const pantryBack = addTo('pantry', back.pantry);
    try {
      await db.batch([
        workClaim(db, row, table, activity),
        db
          .prepare(`UPDATE characters SET version = version + 1${herbsBack.sql}${pantryBack.sql} WHERE id = ? AND ${ongoing}`)
          .bind(...herbsBack.binds, ...pantryBack.binds, row.id, row.id, activity.started_at),
        end,
      ]);
    } catch (error) {
      if (raced(error)) throw await workClaimFailed(db, row, table, activity);
      throw error;
    }
    return null;
  }

  // The Gotowanie of the claim decides the extra dishes, past its mastery.
  const made = cookDishes({ count: done, seed: activity.seed, level: before.level }, content());
  const { character, after, xp, work, sets } = workGains(player, profession, before, worked, avatar, now);
  // A card the work may leave, by the time it lasted (903, cards.js).
  const card = await workCard(db, row, activity, worked);
  const report = {
    ...cookingReport(
      { dish, minutes: worked, startedAt: activity.started_at, endsAt: stop ? now : activity.ends_at, seed: activity.seed, made, stopped: stop, before, after, character, xp, work },
      content(),
    ),
    ...(avatar && { avatar: true }),
    ...(card && { cards: card.cards }),
  };
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    dishes: [{ name: dish.name, count: made.count }],
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...(avatar && { avatar: true }),
    ...(card && { cards: cardSummary(card.cards) }),
  };
  // The dishes made and the ingredients for the rest, in the Spiżarnia.
  const pantry = addTo('pantry', { ...back.pantry, [dish.id]: made.count });
  let results;
  try {
    results = await db.batch([
      // The work still there and the character as read (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'dishes', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'dishes'),
      db
        .prepare(`UPDATE characters SET version = version + 1${sets.sql}${herbsBack.sql}${pantry.sql} WHERE id = ? AND ${ongoing}`)
        .bind(...sets.binds, ...herbsBack.binds, ...pantry.binds, row.id, row.id, activity.started_at),
      // The Punkty Sławy of the work (fame.js), the Awatar's a quarter.
      ...workFamePoints(db, row.id, worked, avatar, now),
      // The card the work left, a copy (cards.js).
      ...cardUpserts(db, row.id, card?.ids ?? [], now),
      ...packGains(db, row.id, card?.packs ?? 0),
      end,
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw alreadyClaimed();
    if (raced(error)) throw await workClaimFailed(db, row, table, activity);
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}
