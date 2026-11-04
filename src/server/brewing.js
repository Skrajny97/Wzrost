// Alchemia on server time. The start takes the herbs for all the potions and
// stores the recipe, the count and the seed with the activity; the claim
// after the end brews them with that seed, puts what fits into the bag and
// saves the report. Called back early, the character brings the potions done
// so far with their report, and the herbs for the rest go back to the bag.
// Potions in the bag can be sold to the scrapper, thrown away or drunk. All
// of it waits while the professions are hidden in this deployment
// (features.js).

import {
  addCounts,
  addQuestProgress,
  bagCapacity,
  bagStacks,
  brewMinutes,
  brewPotions,
  brewingReport,
  buffLeft,
  campBonus,
  campLevels,
  catalystChance,
  drinkTimed,
  fightsText,
  knownStack,
  mostPotions,
  parseStack,
  potionHerbs,
  potionPrice,
  potionsDone,
  professionState,
  storeStacks,
  timedKind,
  saleGold,
} from '../engine/index.js';
import { content } from './content.js';
import { bagItems, buffsOf, characterView, currentHp, loadPlayer, questsNow, requireIdle, requirePlayer, requireWorker, workOf } from './characters.js';
import { toHex } from './encoding.js';
import { assertion, atomically, raced, sameVersion } from './atomic.js';
import { takenBefore, trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { addTo, insertWork, requireProfessions, takeFromBag, workGains } from './professions.js';
import { herbsOf, potionKnown, potionsOf } from './professions-view.js';
import { perkOf } from './perks.js';
import { trimReports } from './reports.js';
import { tripOf } from './trips.js';
import { say } from '../engine/text.js';

// A brewing of `count` potions of the recipe chosen, from now on, by the
// character or by its Awatar Systemu (`avatar` in the request). The herbs
// go into the cauldron at once, only if the character is still as seen, so
// two taps at once start one brewing.
export async function startBrewing(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  const { brewing } = content;
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), brewing.profession);
  const potion = typeof body.recipe === 'string' ? content.potionsById[body.recipe] : undefined;
  if (!potion || potion.level > level) throw new ApiError(400, 'unknown_recipe', 'Tego przepisu jeszcze nie znasz.');
  const herbs = herbsOf(player.row);
  // The Bractwo Zielarzy brews faster (589 B), for the Awatar's work too.
  const faster = perkOf(player.row, 'brewFaster');
  let most = mostPotions(potion, level, herbs, content, faster);
  if (most === 0) throw new ApiError(409, 'no_herbs', 'Brakuje ziół na tę miksturę.');
  // A recipe with a catalyst (proposal 3: "Wybrane mikstury biorą jeden
  // materiał stwora") takes a piece of its material a potion, of the grade
  // chosen ({ catalyst: "viper-scales:rare" }).
  const materials = JSON.parse(player.row.materials ?? '{}');
  const catalystKey = potion.catalyst ? body.catalyst : null;
  if (potion.catalyst) {
    const have = knownStack(catalystKey, content) && parseStack(catalystKey).materialId === potion.catalyst ? (materials[catalystKey] ?? 0) : 0;
    if (have === 0) throw new ApiError(409, 'no_catalyst', `Ta mikstura bierze też katalizator: ${content.materialsById[potion.catalyst].name}.`);
    most = Math.min(most, have);
  }
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > most) {
    throw new ApiError(400, 'invalid_count', `Wybierz liczbę mikstur od 1 do ${most}.`);
  }
  const catalyst = catalystKey ? { key: catalystKey, count: body.count } : null;

  const now = context.now;
  const minutes = brewMinutes(body.count, level, content, faster);
  const used = potionHerbs(potion, body.count);
  const left = Object.fromEntries(Object.entries(herbs).map(([id, count]) => [id, count - (used[id] ?? 0)]).filter(([, count]) => count > 0));
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { row } = player;
  const db = context.env.DB;
  // The batch holds only while the character is as read (atomic.js), so
  // the work starts only with what it takes taken by this request.
  const [, taken] = await atomically(db, [
    sameVersion(db, row),
    // The HP rested so far is saved, and resting goes on from now; the
    // Awatar's work leaves it be.
    db
      .prepare(
        `UPDATE characters SET herbs = ?${catalyst ? ', materials = ?' : ''}${avatar ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM ${avatar ? 'avatar_activities' : 'activities'} WHERE character_id = ?)`,
      )
      .bind(
        JSON.stringify(left),
        ...(catalyst ? [JSON.stringify(addCounts(materials, { [catalyst.key]: -catalyst.count }))] : []),
        ...(avatar ? [] : [hp, now]),
        row.id,
        row.version,
        row.id,
      ),
    insertWork(db, avatar, row, {
      kind: 'potions',
      placeId: brewing.place.id,
      minutes,
      now,
      seed,
      hp,
      // `begun`: when it really began, for the Próby Gildii (takenBefore).
      options: { recipe: potion.id, count: body.count, herbs: used, ...(catalyst && { catalyst }), begun: now },
    }),
  ]);
  if (taken.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The report of a brewing (claimHunt sends a finished one here), or with
// `stop` of the part done before now (cancelHunt): the potions done, and
// the herbs for the rest back in the bag. Stopped before the first potion,
// it only gives the herbs back and makes no report (null). With `avatar`,
// the brewing of the Awatar Systemu (avatar.js), whose work brings the
// potions alone.
export async function finishBrewing(db, player, now, { stop = false, avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { brewing } = content;
  const profession = content.professionsById[brewing.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  // A recipe the data no longer has brews nothing.
  const potion = content.potionsById[options.recipe];
  const count = potion ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  // The herbs for the potions not brewed, of herbs the data still has.
  const used = options.herbs ?? {};
  const back = Object.fromEntries(
    Object.entries(used)
      .filter(([id]) => content.herbsById[id])
      .map(([id, amount]) => [id, amount - Math.round((amount * done) / Math.max(1, options.count))]),
  );
  const herbs = herbsOf(row);
  for (const [id, amount] of Object.entries(back)) if (amount > 0) herbs[id] = (herbs[id] ?? 0) + amount;
  const herbsBack = addTo('herbs', back);
  // The catalyst: a piece a potion brewed, the rest back; its grade raises
  // every potion's chance of an extra one (catalystChance).
  const catalyst = options.catalyst && knownStack(options.catalyst.key, content) ? options.catalyst : null;
  const catalystsBack = addTo('materials', catalyst ? { [catalyst.key]: catalyst.count - Math.min(catalyst.count, done) } : {});
  // Only while the activity is as seen, so two calls at once give back once.
  const ongoing = `EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND started_at = ?)`;
  const end = db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at);
  // Each batch holds only while the work is still there (atomic.js), so a
  // "Wróć wcześniej" and a claim at once never leave a report without its
  // potions (the code review, as in the Warsztat).
  const stillThere = assertion(db, ongoing, [row.id, activity.started_at]);
  if (done === 0) {
    await atomically(
      db,
      [
        stillThere,
        db
          .prepare(`UPDATE characters SET version = version + 1${herbsBack.sql}${catalystsBack.sql} WHERE id = ? AND ${ongoing}`)
          .bind(...herbsBack.binds, ...catalystsBack.binds, row.id, row.id, activity.started_at),
        end,
      ],
      alreadyDone,
    );
    return null;
  }

  const made = brewPotions({ count: done, seed: activity.seed, extraChance: catalystChance(catalyst?.key, content) }, content);
  const capacity = bagCapacity(campLevels(player.buildings, now, content), content);
  const taken = bagItems(player).length + bagStacks(herbs, content) + bagStacks(potionsOf(row), content);
  const { stored, lost } = storeStacks(potionsOf(row), { [potion.id]: made.count }, capacity - taken, content);
  const { character, after, xp, work, sets } = workGains(player, profession, before, worked, avatar, now);
  const report = {
    ...brewingReport(
      { potion, minutes: worked, startedAt: activity.started_at, endsAt: stop ? now : activity.ends_at, seed: activity.seed, made, stored, lost, stopped: stop, before, after, character, xp, work },
      content,
    ),
    ...(avatar && { avatar: true }),
  };
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
    ...(avatar && { avatar: true }),
  };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { potions: { [potion.id]: made.count } }));
  const potions = addTo('potions', stored);

  let results;
  try {
    results = await db.batch([
      stillThere,
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'potions', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'potions'),
      db
        .prepare(
          `UPDATE characters SET quests = CASE WHEN quests = ? THEN ? ELSE quests END${sets.sql}${herbsBack.sql}${catalystsBack.sql}${potions.sql}, version = version + 1
           WHERE id = ? AND ${ongoing}`,
        )
        .bind(row.quests, quests, ...sets.binds, ...herbsBack.binds, ...catalystsBack.binds, ...potions.binds, row.id, row.id, activity.started_at),
      // The Próby Gildii's trial too (guild-trials.js).
      // A trial taken before the brewing began (takenBefore).
      ...trialProgress(db, row.id, { potions: { [potion.id]: made.count } }, now, takenBefore(options.begun)),
      end,
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE') || raced(error)) throw alreadyDone();
    throw error;
  }
  return { id: results[1].meta.last_row_id, report };
}

// A work claimed or called back by another request a moment ago.
function alreadyDone() {
  return new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
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
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const taken = potionCount(player, body);
  const bonus = campBonus(campLevels(player.buildings, context.now, content), 'sellPrice', content);
  const gold = saleGold(taken.price * (1 + bonus), taken.count);
  const result = await takeFromBag(context.env.DB, player, 'potions', taken, gold);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Mikstury zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ sold: { count: taken.count, gold }, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

// "Wypij" in the bag: a healing potion gives HP back now, and a
// strengthening potion works in its number of the next fights of
// explorations, added to those still left (potions.js), as many at once as
// chosen, each adding its fights, with no top to them (the author: "Niech nie
// bedzie maksymalnego limitu na trwanie bonusów typu z mikstur"). A healing potion
// is drunk one at a time. A mana potion, an antidote and the fern brew work
// only by themselves in fights.
export async function drinkPotion(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const chosen = typeof body.potionId === 'string' ? content.potionsById[body.potionId] : undefined;
  const taken = potionCount(player, { potionId: body.potionId, count: chosen && timedKind(chosen) ? (body.count ?? 1) : 1 });
  const potion = content.potionsById[taken.id];
  const kind = timedKind(potion);
  if (!potion.effect.heal && !kind) {
    throw new ApiError(409, 'fight_only', potion.effect.mana ? 'Ta mikstura działa sama w walce, gdy zabraknie many na umiejętność.' : 'Ta mikstura działa sama na wyprawie.');
  }
  // One got in a Wymiana waits for its recipe (DECISIONS.md, "Wymiana").
  if (!potionKnown(player.row, potion)) throw new ApiError(409, 'unknown_recipe', `Nie znasz jeszcze receptury: ${potion.name}.`);
  const texts = content.potionUse.texts;
  const now = context.now;
  let also;
  let text;
  if (potion.effect.heal) {
    // On an exploration the HP is the report's: healing waits for the return.
    if (player.activity?.kind === 'hunt') requireIdle(player, now);
    const { hp, maxHp } = currentHp(player, now);
    if (hp >= maxHp) throw new ApiError(409, 'full_hp', 'Postać ma pełne HP.');
    const healed = Math.min(maxHp - hp, Math.round(potion.effect.heal * maxHp));
    // Resting goes on from the HP the potion gave.
    also = { sql: 'hp = ?, hp_at = ?', binds: [hp + healed, now] };
    text = say(texts, 'drunkHeal', 0, { potion: potion.counted[0], amount: healed });
  } else {
    let buffs = buffsOf(player.row, now);
    // The Bractwo Zielarzy: a potion for a time works longer (589 C).
    const extra = perkOf(player.row, 'potionFights');
    for (let i = 0; i < taken.count; i++) buffs = drinkTimed(buffs, potion, extra);
    also = { sql: 'buffs = ?', binds: [JSON.stringify(buffs)] };
    // drunkSpeed, drunkArmor and so on: what the kind gives now and for how
    // long; several at once by their count, as a report counts potions.
    const key = `drunk${kind[0].toUpperCase()}${kind.slice(1)}`;
    const drunk = taken.count > 1 ? `${taken.count} × ${potion.name}` : potion.counted[0];
    text = say(texts, key, 0, { potion: drunk, bonus: Math.round(buffs[kind].bonus * 100), fights: fightsText(buffLeft(buffs, kind), content) });
    // On a Drużyna's trip the fights are the same for all who went, as it
    // set out, so what is drunk on the way works from the next exploration
    // (claimWindows in potions.js).
    if (player.activity && tripOf(player.activity)) text = `${text} ${say(texts, 'drunkTrip', 0)}`;
  }
  const result = await takeFromBag(context.env.DB, player, 'potions', taken, 0, also);
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Mikstury zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ text, character: characterView(await loadPlayer(context.env.DB, session.userId), now) });
}

export async function discardPotions(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const result = await takeFromBag(context.env.DB, player, 'potions', potionCount(player, body));
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Mikstury zmieniły się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}
