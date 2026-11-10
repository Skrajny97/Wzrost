// Rzemieślnictwo in the Systemowy Warsztat (src/engine/workshop.js): an
// order of up to maxCount items of one pattern and rarity takes its parts
// and the camp's resources at the start, and its report brings the items
// made into the bag, the parts of the failed ones lost and their resources
// back. Called back early, the character brings the items done and gets
// back all the rest. From the scroll's level an order may be of Zwoje
// ochronne instead, from parts alone: they always come out and wait for the
// Kowadło (`scrolls` of the character), taking no room in the bag. Parts of a
// rarity go for one of the next at once, beside any work (exchangeParts).

import {
  addQuestProgress,
  bagCapacity,
  campLevels,
  craftCost,
  craftItems,
  craftRarities,
  knowsPattern,
  orderMinutes,
  partExchangeBlock,
  partSource,
  potionsDone,
  professionOpen,
  professionState,
  professionUnlockLevel,
  scrollCost,
  scrollOrderMinutes,
  settleCrafting,
  workshopReport,
} from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, craftingState, currentHp, loadPlayer, questsNow, requirePlayer, requireWorker, walletOf, workOf } from './characters.js';
import { toHex } from './encoding.js';
import { assertion, atomically, raced, sameVersion } from './atomic.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { craftingOn } from './features.js';
import { perkOf } from './perks.js';
import { addTo, insertWork, requireProfessions, workClaim, workClaimFailed, workGains } from './professions.js';
import { trimReports } from './reports.js';
import { say } from '../engine/text.js';

// A share of what an order took, by id: for `of` items out of `count`.
const shareOf = (amounts, of, count) =>
  Object.fromEntries(Object.entries(amounts ?? {}).map(([id, amount]) => [id, Math.round((amount * of) / Math.max(1, count))]));

// An order of `count` items of a known pattern and rarity, or with `scroll`
// of `count` Zwoje ochronne, from now on, by the character or by its Awatar
// Systemu (`avatar` in the request). The parts and the resources go at once,
// only if the character is still as seen, so two taps at once start one
// order; and items only with room in the bag for all of them.
export async function startCrafting(context) {
  const body = await readJson(context.request);
  const { session, player, avatar } = await requireWorker(context, body);
  requireProfessions(player);
  if (!craftingOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const { workshop } = content();
  const crafting = content().professionsById[workshop.profession];
  if (!professionOpen(crafting, player.row.level, content())) {
    throw new ApiError(403, 'locked', `${crafting.name} odblokujesz na poziomie postaci ${professionUnlockLevel(crafting, content())}.`);
  }
  const { level } = professionState(JSON.parse(player.row.professions ?? '{}'), workshop.profession);
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > workshop.maxCount) {
    throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${workshop.maxCount} sztuk.`);
  }
  const order = body.scroll === true || body.scroll === 'steady' ? scrollOrder(player.row, level, body.count, body.scroll === 'steady') : itemOrder(player.row, level, body);
  const { cost } = order;

  const now = context.now;
  // The parts include those of the table's orders done by now.
  const table = settleCrafting(craftingState(player.row), now);
  const { parts } = table;
  const wallet = walletOf(player.row);
  const [partId, needed] = Object.entries(cost.parts)[0];
  if ((parts[partId] ?? 0) < needed) throw new ApiError(409, 'no_parts', `Brakuje części: ${content().partsById[partId].name} (potrzeba ${needed}).`);
  const short = Object.entries(cost.resources).find(([id, amount]) => (wallet[id] ?? 0) < amount);
  if (short) throw new ApiError(409, 'no_resources', `Brakuje zasobów: ${content().resourcesById[short[0]].name} (potrzeba ${short[1]}).`);
  const free = bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player);
  if (order.room && free < body.count) throw new ApiError(409, 'bag_full', `W plecaku musi być ${body.count} wolnych miejsc na całe zlecenie.`);

  const { minutes } = order;
  const partsLeft = { ...parts, [partId]: parts[partId] - needed };
  const resources = JSON.parse(player.row.resources ?? '{}');
  for (const [id, amount] of Object.entries(cost.resources)) resources[id] = (resources[id] ?? 0) - amount;
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
        `UPDATE characters SET parts = ?, crafting = ?, resources = ?${avatar ? '' : ', hp = ?, hp_at = ?'}, version = version + 1
         WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM ${avatar ? 'avatar_activities' : 'activities'} WHERE character_id = ?)`,
      )
      .bind(JSON.stringify(partsLeft), JSON.stringify(table.queue), JSON.stringify(resources), ...(avatar ? [] : [hp, now]), row.id, row.version, row.id),
    insertWork(db, avatar, row, {
      kind: 'items',
      placeId: workshop.place.id,
      minutes,
      now,
      seed,
      hp,
      options: { ...order.options, count: body.count, parts: cost.parts, resources: cost.resources },
    }),
  ]);
  if (taken.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// The parts' exchange: `count` parts of a kind for `rate` times as many of
// the rarity below (partExchangeBlock), at once and whatever the character
// and its Awatar do. The parts include those of the table's orders done by
// now; saved only if the character is as seen, so two taps make one.
export async function exchangeParts(context) {
  const body = await readJson(context.request);
  const { session, player } = await requirePlayer(context);
  requireProfessions(player);
  if (!craftingOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const crafting = content().professionsById[content().workshop.profession];
  if (!professionOpen(crafting, player.row.level, content())) {
    throw new ApiError(403, 'locked', `${crafting.name} odblokujesz na poziomie postaci ${professionUnlockLevel(crafting, content())}.`);
  }
  const now = context.now;
  const table = settleCrafting(craftingState(player.row), now);
  const { partId, count } = body;
  const block = partExchangeBlock({ parts: table.parts, partId, count }, content());
  if (block) throw new ApiError(block.code.startsWith('invalid') ? 400 : 409, block.code, block.message);
  const source = partSource(partId, content());
  const given = count * source.rate;
  const parts = { ...table.parts, [source.partId]: table.parts[source.partId] - given, [partId]: (table.parts[partId] ?? 0) + count };
  const { row } = player;
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET parts = ?, crafting = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(parts), JSON.stringify(table.queue), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({
    exchanged: { from: source.partId, partId, given, count },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// An order of items: a pattern the character knows, a rarity of its level,
// what they take at the character's level, which is also the items' level,
// and room for them in the bag. The Bractwo Kowali shortens the work and
// adds to the luck of a rarity up (590), the luck kept with the order.
function itemOrder(row, level, body) {
  const base = typeof body.baseId === 'string' ? content().basesById[body.baseId] : undefined;
  const learned = JSON.parse(row.patterns ?? '[]');
  if (!base || !content().workshop.parts[base.slot] || !knowsPattern(base, level, learned, content())) throw new ApiError(400, 'unknown_pattern', 'Tego wzoru jeszcze nie znasz.');
  const rarity = craftRarities(level, content()).find((candidate) => candidate.id === body.rarity);
  if (!rarity) throw new ApiError(400, 'unknown_rarity', 'Tej rzadkości jeszcze nie wykonasz.');
  const luck = perkOf(row, 'workshopLuck');
  return {
    cost: craftCost(base, rarity.id, body.count, row.level, content()),
    minutes: orderMinutes(body.count, rarity.id, level, content(), perkOf(row, 'workshopFaster')),
    room: true,
    options: { base: base.id, rarity: rarity.id, level: row.level, ...(luck > 0 && { luck }) },
  };
}

// An order of Zwoje ochronne, or with `steady` of Zwoje utrwalenia, from the
// scroll's level of the profession.
function scrollOrder(row, level, count, steady = false) {
  const { texts } = content().workshop;
  const scroll = steady ? content().workshop.steadyScroll : content().workshop.scroll;
  if (level < scroll.level) throw new ApiError(403, 'locked', say(texts, 'hidden', 0, { level: scroll.level }));
  return {
    cost: { ...scrollCost(count, content(), scroll), resources: {} },
    minutes: scrollOrderMinutes(count, level, content(), perkOf(row, 'workshopFaster'), scroll),
    room: false,
    options: { scroll: steady ? 'steady' : true },
  };
}

// The report of an order (claimHunt sends a finished one here), or with
// `stop` of the part done before now (cancelHunt). Stopped before the first
// item, it only gives everything back and makes no report (null). With
// `avatar`, the order of the Awatar Systemu (avatar.js), whose work brings
// the items and its share of the XP and of the levels (workGains).
// A work claimed or called back by another request a moment ago.
const alreadyDone = () => new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');

export async function finishCrafting(db, player, now, { stop = false, avatar = false } = {}) {
  const { row } = player;
  const { table, activity, key } = workOf(player, avatar);
  const { workshop } = content();
  const profession = content().professionsById[workshop.profession];
  const before = professionState(JSON.parse(row.professions ?? '{}'), profession.id);
  const options = JSON.parse(activity.options ?? '{}');
  const { scroll } = options;
  // The scroll's column: the Zwoje utrwalenia's for an order of them.
  const scrolls = scroll === 'steady' ? 'steady_scrolls' : 'scrolls';
  // A base the data no longer has makes nothing.
  const base = scroll ? (scroll === 'steady' ? workshop.steadyScroll : workshop.scroll) : content().basesById[options.base];
  const count = base ? options.count : 0;
  const elapsed = now - activity.started_at;
  const done = stop ? potionsDone(count, activity.minutes, elapsed) : count;
  const worked = stop ? Math.floor(elapsed / 60000) : activity.minutes;
  const results =
    done > 0 && !scroll
      ? craftItems({ baseId: base.id, rarityId: options.rarity, count: done, level: options.level, professionLevel: before.level, met: JSON.parse(row.met ?? '[]'), seed: activity.seed, luck: options.luck ?? 0 }, content())
      : [];
  const made = results.filter((result) => result.made).map((result) => result.item);
  // Every scroll done comes out.
  const madeCount = scroll ? done : made.length;
  // The parts of the items not done come back, and the resources of those
  // and of the failed ones.
  const partsBack = shareOf(options.parts, options.count - done, options.count);
  const resourcesBack = shareOf(options.resources, options.count - madeCount, options.count);
  const back = [addTo('parts', partsBack), addTo('resources', resourcesBack)];
  // Only while the activity is as seen, so two calls at once give back once.
  const ongoing = `EXISTS (SELECT 1 FROM ${table} WHERE character_id = ? AND started_at = ?)`;
  const end = db.prepare(`DELETE FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(row.id, activity.started_at);
  // Each batch holds only while the work is still there (atomic.js), so a
  // "Wróć wcześniej" and a claim at once give back or give the items, never
  // both (the code review).
  const stillThere = assertion(db, ongoing, [row.id, activity.started_at]);
  if (done === 0) {
    await atomically(db, [
      stillThere,
      db
        .prepare(`UPDATE characters SET version = version + 1${back.map((each) => each.sql).join('')} WHERE id = ? AND ${ongoing}`)
        .bind(...back.flatMap((each) => each.binds), row.id, row.id, activity.started_at),
      end,
    ], alreadyDone);
    return null;
  }

  const { character, after, xp, work, sets } = workGains(player, profession, before, worked, avatar, now);
  const report = {
    ...workshopReport(
      {
        base,
        rarityId: scroll ? null : options.rarity,
        results,
        ...(scroll && { scrolls: done }),
        learned: JSON.parse(row.patterns ?? '[]'),
        minutes: worked,
        startedAt: activity.started_at,
        endsAt: stop ? now : activity.ends_at,
        seed: activity.seed,
        stopped: stop,
        before,
        after,
        character,
        xp,
        work,
      },
      content(),
    ),
    ...(avatar && { avatar: true }),
  };
  const summary = {
    placeName: report.placeName,
    minutes: report.minutes,
    items: madeCount > 0 ? [{ name: base.name, count: madeCount }] : [],
    failed: report.failed,
    xp,
    professionName: profession.name,
    professionLevel: after.level,
    levelAfter: work.level,
    system: report.system,
    ...(avatar && { avatar: true }),
  };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { made: made.length }));
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)');

  let saved;
  try {
    saved = await db.batch([
      // The work still there and the character as read (workClaim).
      workClaim(db, row, table, activity),
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, key, 'items', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'items'),
      db
        .prepare(
          `UPDATE characters SET quests = CASE WHEN quests = ? THEN ? ELSE quests END${sets.sql}${back.map((each) => each.sql).join('')}${scroll ? `, ${scrolls} = ${scrolls} + ?` : ''}, version = version + 1
           WHERE id = ? AND ${ongoing}`,
        )
        .bind(row.quests, quests, ...sets.binds, ...back.flatMap((each) => each.binds), ...(scroll ? [done] : []), row.id, row.id, activity.started_at),
      // The Próby Gildii's trial too (guild-trials.js).
      ...trialProgress(db, row.id, { made: made.length }, now),
      // The items made go to the bag; the room was there at the start.
      ...made.map((item) => insertItem.bind(row.id, JSON.stringify(item), now)),
      end,
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw alreadyDone();
    if (raced(error)) throw await workClaimFailed(db, row, table, activity);
    throw error;
  }
  return { id: saved[1].meta.last_row_id, report };
}
