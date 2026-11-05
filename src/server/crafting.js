// The Stół rozbiórki in the camp: materials from beaten creatures and
// taken-apart items become parts, for free, in a queue that takes time
// (crafting.js in the engine). The table's level sets the highest rarity it
// takes and, later, the chance of extra parts. The queue works on its own,
// also while the character is away, and an order not finished yet can leave
// it with all it took given back (cancelOrders). Every change first settles
// the queue at the present time and is saved only if the character is as
// read (its version), so two taps at once make one change.

import {
  addCounts,
  addQuestProgress,
  bagCapacity,
  campBonus,
  campLevels,
  craftLevelFor,
  craftTable,
  craftTakes,
  createRng,
  itemName,
  knownStack,
  materialPrice,
  orderCancellable,
  orderMaterials,
  orderSalvage,
  orderSalvageMany,
  parseStack,
  questPeriod,
  questText,
  rewardedQuest,
  settleCrafting,
  saleGold,
  salvageYield,
  tableBuilding,
  takeOffQueue,
  takeQuestProgress,
  trialAfterCancel,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import { content } from './content.js';
import { bagPlaces, characterView, craftingState, loadPlayer, questsNow, requireOffRack, requirePlayer, taughtPattern } from './characters.js';
import { toHex } from './encoding.js';
import { tableTrials, trialProgress, trialTakenBack } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { testMode, testModeFor } from './test-mode.js';

// The table at the camp's levels, or an error without one.
function tableOf(player, now) {
  const table = craftTable(campLevels(player.buildings, now, content), content);
  if (table.pace === 0) throw new ApiError(409, 'no_table', 'Najpierw zbuduj Stół rozbiórki w obozie.');
  return table;
}

const tooRare = (rarityId) =>
  new ApiError(409, 'too_rare', `Ta rzadkość wymaga Stołu rozbiórki na poziomie ${craftLevelFor(rarityId, content)}. Rozbuduj go w obozie.`);

// The roll of extra parts for a new order.
const newRng = () => createRng(toHex(crypto.getRandomValues(new Uint8Array(16))));

function checkRoom(queue) {
  const { queueLimit } = content.balance.crafting;
  if (queue.length >= queueLimit) {
    throw new ApiError(409, 'queue_full', `Kolejka stołu jest pełna (${queueLimit} zleceń). Poczekaj, aż skończy się któreś.`);
  }
}

// A new order's id, to find it later (the page's list, a taken-apart item).
const newId = () => toHex(crypto.getRandomValues(new Uint8Array(8)));
const withIds = (before, state) => ({ ...state, queue: state.queue.map((order, index) => (index < before ? order : { id: newId(), ...order })) });

// `quests`: the narrator's quests moved on by the order; `gold`: the
// scrapper's payment; `minerals`: the character's minerals after jewellery
// taken apart gave its gem and ore (salvageYield); `traded`: pieces of
// stacks, by stack, marked again as got in a trade (an order taken off the
// queue, takeOffQueue). `condition` adds to the WHERE clause, with its own
// `binds`.
function saveState(db, row, state, { quests, patterns, gold = 0, minerals = null, traded = {}, condition = '', binds = [] } = {}) {
  const marks = Object.entries(traded);
  const foreign = marks.length
    ? `, foreign_stacks = json_set(COALESCE(foreign_stacks, '{}'), ${marks.map(() => '?, COALESCE(json_extract(foreign_stacks, ?), 0) + ?').join(', ')})`
    : '';
  return db
    .prepare(
      `UPDATE characters SET materials = ?, parts = ?, crafting = ?${quests ? ', quests = ?' : ''}${patterns ? ', patterns = ?' : ''}${gold ? ', gold = gold + ?' : ''}${minerals ? ', minerals = ?' : ''}${foreign}, version = version + 1
       WHERE id = ? AND version = ?${condition}`,
    )
    .bind(
      JSON.stringify(state.materials),
      JSON.stringify(state.parts),
      JSON.stringify(state.queue),
      ...(quests ? [JSON.stringify(quests)] : []),
      ...(patterns ? [JSON.stringify(patterns)] : []),
      ...(gold ? [gold] : []),
      ...(minerals ? [JSON.stringify(minerals)] : []),
      ...marks.flatMap(([key, count]) => [`$."material:${key}"`, `$."material:${key}"`, count]),
      row.id,
      row.version,
      ...binds,
    );
}

// The patterns the new orders' items teach, kept by each order (`taught`:
// { id, partId }, the part its item makes), to hide again should it leave
// the queue (cancelOrders).
const withPatterns = (state, before, taught) => ({
  ...state,
  queue: state.queue.map((order, index) => {
    const ids = index < before ? [] : taught.filter((one) => one.partId === order.partId).map((one) => one.id);
    return ids.length > 0 ? { ...order, patterns: ids } : order;
  }),
});

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The gem and the ore that jewellery taken apart gives at once, added to the
// character's minerals, or null for other items (salvageYield).
function withMinerals(row, items) {
  const found = items.reduce((sum, item) => addCounts(sum, salvageYield(item, content).minerals ?? {}), {});
  return Object.keys(found).length > 0 ? { found, minerals: addCounts(JSON.parse(row.minerals ?? '{}'), found) } : null;
}

// Minerals as the page lists them: name and count.
export const mineralList = (minerals) => Object.entries(minerals ?? {}).map(([id, count]) => ({ id, name: content.mineralsById[id].name, count }));

// The scrapper buys `count` pieces of a stack of materials ({ key, count }),
// for their price with the camp's Skup złomu (proposal 1: "Skup złomu
// kupuje materiały. Za złoto, a cena rośnie z rzadkością"), also while the
// character is away, as the table works then too.
export async function sellMaterials(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const settled = settleCrafting(craftingState(player.row), now);
  const have = knownStack(body.key, content) ? (settled.materials[body.key] ?? 0) : 0;
  if (have === 0) throw new ApiError(404, 'no_materials', 'Nie masz tego materiału.');
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  const bonus = campBonus(campLevels(player.buildings, now, content), 'sellPrice', content);
  const gold = saleGold(materialPrice(parseStack(body.key).rarityId, content) * (1 + bonus), body.count);
  const state = { ...settled, materials: addCounts(settled.materials, { [body.key]: -body.count }) };
  const db = context.env.DB;
  const result = await saveState(db, player.row, state, { gold }).run();
  if (result.meta.changes !== 1) throw changed();
  return json({ sold: { count: body.count, gold }, character: characterView(await loadPlayer(db, session.userId), now) });
}

// Materials to the queue: whole stacks, { keys: ["wolf-pelt:common", …] };
// as many pieces of one stack as chosen, { key, count } (the author:
// "Powinna być mozliwosc przerobienia pojedynczej sztuki danego materiału");
// or { all: true } for every stack, while the queue has room.
export async function craftMaterials(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const table = tableOf(player, now);
  const settled = settleCrafting(craftingState(player.row), now);
  const one = typeof body.key === 'string';
  if (one) {
    const have = knownStack(body.key, content) ? (settled.materials[body.key] ?? 0) : 0;
    if (have === 0) throw new ApiError(404, 'no_materials', 'Nie masz tego materiału.');
    if (!Number.isInteger(body.count) || body.count < 1 || body.count > have) throw new ApiError(400, 'invalid_count', `Wybierz od 1 do ${have} sztuk.`);
  }
  const keys = one ? [body.key] : body.all === true ? Object.keys(settled.materials) : Array.isArray(body.keys) ? body.keys.filter((key) => typeof key === 'string') : [];
  if (keys.length === 0) throw new ApiError(400, 'invalid_materials', 'Wybierz materiały do przeróbki.');
  checkRoom(settled.queue);
  const foreign = JSON.parse(player.row.foreign_stacks ?? '{}');
  const { state, ordered, tooRare: rare } = orderMaterials(settled, keys, table, now, newRng(), content, one ? { [body.key]: body.count } : {}, foreign);
  if (ordered === 0 && rare > 0) {
    const rarities = keys.filter((key) => settled.materials[key] > 0).map((key) => key.slice(key.lastIndexOf(':') + 1));
    throw tooRare(rarities.sort((a, b) => craftLevelFor(a, content) - craftLevelFor(b, content))[0]);
  }
  if (ordered === 0) throw new ApiError(409, 'no_materials', 'Nie masz tych materiałów.');
  // Every material handed to the table counts for the narrator's quests.
  const processed = Object.entries(settled.materials).reduce((sum, [key, count]) => sum + count - (state.materials[key] ?? 0), 0);
  const quests = addQuestProgress(questsNow(player, now), { processed });
  const db = context.env.DB;
  const saved = withIds(settled.queue.length, state);
  const [result] = await db.batch([
    saveState(db, player.row, saved, { quests }),
    // The Próby Gildii's trial too, only with the queue saved above, whose
    // new orders' ids are this request's own (guild-trials.js).
    ...trialProgress(db, player.row.id, { processed }, now, { sql: '(SELECT crafting FROM characters WHERE id = ?) = ?', binds: [player.row.id, JSON.stringify(saved.queue)] }),
  ]);
  if (result.meta.changes !== 1) throw changed();
  return json({ ordered, skipped: rare, character: characterView(await loadPlayer(db, session.userId), now) });
}

// An item from the bag taken apart on the table: it goes now, and its parts
// come when the order ends. An item of a pattern the Warsztat or the
// Szlifiernia does not show yet teaches it at once (taughtPattern).
export async function salvageItem(context) {
  const { session, player } = await requirePlayer(context);
  const item = player.items.find((candidate) => String(candidate.id) === context.params.id);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  requireOffRack(player, item);
  const now = context.now;
  const table = tableOf(player, now);
  if (!craftTakes(table, item.rarity, content)) throw tooRare(item.rarity);
  const settled = settleCrafting(craftingState(player.row), now);
  checkRoom(settled.queue);
  const db = context.env.DB;
  const row = player.row;
  const learned = JSON.parse(row.patterns ?? '[]');
  const pattern = taughtPattern(item, learned);
  const ordered = withIds(settled.queue.length, orderSalvage(settled, item, itemName(item, content), table, now, newRng(), content));
  const state = pattern ? withPatterns(ordered, settled.queue.length, [{ id: pattern.id, partId: ordered.queue.at(-1).partId }]) : ordered;
  const order = state.queue.at(-1);
  // The order is saved only while the item is still in the bag, and the item
  // goes only if that order was saved: two taps make one order.
  const quests = addQuestProgress(questsNow(player, now), { salvaged: 1 });
  const jewel = withMinerals(row, [item]);
  const [saved] = await db.batch([
    saveState(db, row, state, {
      quests,
      ...(pattern && { patterns: [...learned, pattern.id] }),
      ...(jewel && { minerals: jewel.minerals }),
      condition: ' AND EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ? AND slot IS NULL)',
      binds: [item.id, row.id],
    }),
    // The Próby Gildii's trial too, only with that order (guild-trials.js).
    ...trialProgress(db, row.id, { salvaged: 1 }, now, { sql: 'EXISTS (SELECT 1 FROM characters WHERE id = ? AND instr(crafting, ?) > 0)', binds: [row.id, `"id":"${order.id}"`] }),
    db
      .prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND instr(crafting, ?) > 0)')
      .bind(item.id, row.id, row.id, `"id":"${order.id}"`),
  ]);
  if (saved.meta.changes !== 1) throw changed();
  return json({
    salvage: {
      name: order.name,
      part: content.partsById[order.partId].name,
      parts: order.parts,
      endsAt: order.endsAt,
      ...(pattern && { pattern: pattern.name, patternAt: pattern.at }),
      ...(jewel && { minerals: mineralList(jewel.found) }),
    },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// Several items from the bag taken apart at once, { ids: [...] } ("Rozbierz
// kilka", the author: "zaznaczać które chcemy (i możemy) przedmioty i dać do
// rozbiórki"): one order for each kind of part (orderSalvageMany), the parts
// and the time as one by one. All or none: the orders are saved only while
// every item is still in the bag, and the items go only with those orders.
export async function salvageItems(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => Number.isSafeInteger(id)))] : [];
  if (ids.length === 0) throw new ApiError(400, 'invalid_items', 'Zaznacz przedmioty do rozbiórki.');
  const items = ids.map((id) => player.items.find((candidate) => candidate.id === id));
  if (items.includes(undefined)) throw new ApiError(404, 'item_not_found', 'Któregoś z tych przedmiotów nie masz już w plecaku.');
  if (items.some((item) => item.equippedSlot)) throw new ApiError(409, 'equipped', 'Założonych przedmiotów nie rozbierzesz. Najpierw je zdejmij.');
  requireOffRack(player, ...items);
  const now = context.now;
  const table = tableOf(player, now);
  const rare = items.find((item) => !craftTakes(table, item.rarity, content));
  if (rare) throw tooRare(rare.rarity);
  const settled = settleCrafting(craftingState(player.row), now);
  const row = player.row;
  // Every item of a pattern the Warsztat or the Szlifiernia does not show
  // yet teaches it, each pattern once (taughtPattern), and the order of its
  // part keeps it.
  const learned = JSON.parse(row.patterns ?? '[]');
  const taught = items.reduce((list, item) => {
    const pattern = taughtPattern(item, [...learned, ...list.map((one) => one.id)]);
    return pattern ? [...list, { ...pattern, partId: salvageYield(item, content).partId }] : list;
  }, []);
  const entries = items.map((item) => ({ item, name: itemName(item, content) }));
  const ordered = withIds(settled.queue.length, orderSalvageMany(settled, entries, table, now, newRng(), content));
  const state = withPatterns(ordered, settled.queue.length, taught);
  const orders = state.queue.slice(settled.queue.length);
  const { queueLimit } = content.balance.crafting;
  if (state.queue.length > queueLimit) {
    const room = Math.max(0, queueLimit - settled.queue.length);
    throw new ApiError(
      409,
      'queue_full',
      room === 0
        ? `Kolejka stołu jest pełna (${queueLimit} zleceń). Poczekaj, aż skończy się któreś.`
        : `Każda rzadkość części to osobne zlecenie stołu. Zaznaczone przedmioty potrzebują ich: ${orders.length}, a wolne miejsca w kolejce: ${room}. Zaznacz mniej rzadkości albo poczekaj, aż stół skończy któreś zlecenie.`,
    );
  }
  const db = context.env.DB;
  const quests = addQuestProgress(questsNow(player, now), { salvaged: items.length });
  const patterns = [...learned, ...taught.map((one) => one.id)];
  const jewels = withMinerals(row, items);
  const list = JSON.stringify(ids);
  const saved = `EXISTS (SELECT 1 FROM characters WHERE id = ? AND instr(crafting, ?) > 0)`;
  const marker = [row.id, `"id":"${orders[0].id}"`];
  const [result] = await db.batch([
    saveState(db, row, state, {
      quests,
      ...(taught.length > 0 && { patterns }),
      ...(jewels && { minerals: jewels.minerals }),
      condition: ' AND (SELECT COUNT(*) FROM items WHERE character_id = ? AND slot IS NULL AND id IN (SELECT value FROM json_each(?))) = ?',
      binds: [row.id, list, ids.length],
    }),
    // The Próby Gildii's trial too, only with those orders (guild-trials.js).
    ...trialProgress(db, row.id, { salvaged: items.length }, now, { sql: saved, binds: marker }),
    db.prepare(`DELETE FROM items WHERE character_id = ? AND id IN (SELECT value FROM json_each(?)) AND ${saved}`).bind(row.id, list, ...marker),
  ]);
  if (result.meta.changes !== 1) throw changed();
  return json({
    salvaged: {
      count: items.length,
      orders: orders.map((order) => ({ part: content.partsById[order.partId].name, parts: order.parts, endsAt: order.endsAt })),
      patterns: taught.map(({ name, at }) => ({ name, at })),
      ...(jewels && { minerals: mineralList(jewels.found) }),
    },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// The words of the table's queue (data/buildings.json, the table's `queue`).
const queueTexts = () => tableBuilding(content).queue;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// "Usuń z kolejki" ({ id }) and "Usuń wszystkie" ({ all: true }): orders the
// table has not finished leave its queue without a penalty (the author: „nie
// wiem czy jest sens karania za takie pomyłki, może to ogarniemy?”). All
// they took comes back, the materials to the character's and the items to
// the bag, also from the order at work, whose work so far is lost, and the
// orders after them move up (takeOffQueue). What they brought goes too: the
// narrator's quests and the Próby Gildii lose what they counted for them
// (takeQuestProgress, trialAfterCancel), the minerals jewellery gave at
// once go back, and a pattern an item taught hides again, unless an order
// staying holds an item of it. All or none, so "Usuń wszystkie" too: nothing
// leaves while the bag has no room for every item, the character no longer
// has those minerals or a quest the work finished has given its reward.
// An order taking items apart from before 0.1.65 does not hold its item and
// stays; "Usuń wszystkie" leaves it. Saved only if the character is as read.
export async function cancelOrders(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const { row } = player;
  const { errors } = queueTexts();
  const settled = settleCrafting(craftingState(row), now);
  const all = body.all === true;
  const leaving = all ? settled.queue.filter(orderCancellable) : settled.queue.filter((order) => typeof body.id === 'string' && order.id === body.id);
  if (leaving.length === 0) throw new ApiError(409, 'not_queued', all ? errors.empty : errors.gone);
  if (!leaving.every(orderCancellable)) throw new ApiError(409, 'too_old', errors.old);
  const ids = new Set(leaving.map((order) => order.id));
  const back = takeOffQueue(settled, ids, now);
  const free = bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player);
  if (back.items.length > free) throw new ApiError(409, 'bag_full', filled(errors.bagFull, { need: back.items.length, free: Math.max(0, free) }));
  const held = JSON.parse(row.minerals ?? '{}');
  const short = Object.entries(back.minerals)
    .filter(([id, count]) => (held[id] ?? 0) < count)
    .map(([id, count]) => `${content.mineralsById[id].name} ×${count - (held[id] ?? 0)}`);
  if (short.length > 0) throw new ApiError(409, 'minerals_used', filled(errors.minerals, { minerals: short.join(', ') }));
  const cancelled = back.work.filter((one) => one.cancelled);
  const quests = questsNow(player, now);
  const after = takeQuestProgress(quests, cancelled, content);
  const rewarded = rewardedQuest(quests, after);
  if (rewarded) throw new ApiError(409, 'quest_rewarded', filled(errors.rewarded, { quest: questText(rewarded, content) }));
  // A pattern stays known while an order staying holds an item of it: that
  // item would have taught it. Only later orders can, as the table works one
  // after another, so they are all still in the queue.
  const learned = JSON.parse(row.patterns ?? '[]');
  const hidden = back.patterns.filter((id) => learned.includes(id) && !back.state.queue.some((order) => (order.items ?? []).some((item) => item.base === id)));
  const db = context.env.DB;
  const weeks = [...new Set(cancelled.map((one) => questPeriod('weekly', one.orderedAt, content).key))];
  const trials = (await tableTrials(db, row.id, weeks))
    .map((trial) => [trial, trialAfterCancel(trial, back.work, now, content)])
    .filter(([, next]) => next);
  const taken = Object.fromEntries(Object.entries(back.minerals).map(([id, count]) => [id, -count]));
  await atomically(db, [
    sameVersion(db, row),
    saveState(db, row, back.state, {
      quests: after,
      ...(hidden.length > 0 && { patterns: learned.filter((id) => !hidden.includes(id)) }),
      ...(Object.keys(taken).length > 0 && { minerals: addCounts(held, taken) }),
      traded: back.traded,
    }),
    ...back.items.map((item) => db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify(item), now)),
    ...trials.map(([trial, next]) => trialTakenBack(db, trial, next)),
  ]);
  return json({ cancelled: leaving.length, items: back.items.length, character: characterView(await loadPlayer(db, session.userId), now) });
}

// "Pomiń czas" at the table in test mode: every order ends now.
export async function skipCrafting(context) {
  if (!testMode(context.env)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const now = context.now;
  const stored = craftingState(player.row);
  const state = settleCrafting({ ...stored, queue: stored.queue.map((order) => ({ ...order, startsAt: Math.min(order.startsAt, now), endsAt: now })) }, now);
  const db = context.env.DB;
  const result = await saveState(db, player.row, state).run();
  if (result.meta.changes !== 1) throw changed();
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}
