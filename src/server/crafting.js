// The Stół rzemieślniczy in the camp: materials from beaten creatures and
// taken-apart items become parts, for free, in a queue that takes time
// (crafting.js in the engine). The table's level sets the highest rarity it
// takes and, later, the chance of extra parts. The queue works on its own,
// also while the character is away. Every change first settles the queue at
// the present time and is saved only if the character is as read (its
// version), so two taps at once make one change.

import {
  addQuestProgress,
  campLevels,
  craftLevelFor,
  craftTable,
  craftTakes,
  createRng,
  itemName,
  orderMaterials,
  orderSalvage,
  settleCrafting,
} from '../engine/index.js';
import { content } from './content.js';
import { characterView, craftingState, loadPlayer, questsNow, requireIdlePlayer, requirePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { testMode, testModeFor } from './test-mode.js';

// The table at the camp's levels, or an error without one.
function tableOf(player, now) {
  const table = craftTable(campLevels(player.buildings, now, content), content);
  if (table.pace === 0) throw new ApiError(409, 'no_table', 'Najpierw zbuduj Stół rzemieślniczy w obozie.');
  return table;
}

const tooRare = (rarityId) =>
  new ApiError(409, 'too_rare', `Ta rzadkość wymaga Stołu rzemieślniczego na poziomie ${craftLevelFor(rarityId, content)}. Rozbuduj go w obozie.`);

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

// `quests`: the narrator's quests moved on by the order. `condition` adds to
// the WHERE clause, with its own `binds`.
const saveState = (db, row, state, { quests, condition = '', binds = [] } = {}) =>
  db
    .prepare(
      `UPDATE characters SET materials = ?, parts = ?, crafting = ?${quests ? ', quests = ?' : ''}, version = version + 1 WHERE id = ? AND version = ?${condition}`,
    )
    .bind(
      JSON.stringify(state.materials),
      JSON.stringify(state.parts),
      JSON.stringify(state.queue),
      ...(quests ? [JSON.stringify(quests)] : []),
      row.id,
      row.version,
      ...binds,
    );

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// Whole stacks of materials to the queue: { keys: ["wolf-pelt:common", …] },
// or { all: true } for every stack, while the queue has room.
export async function craftMaterials(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const table = tableOf(player, now);
  const settled = settleCrafting(craftingState(player.row), now);
  const keys = body.all === true ? Object.keys(settled.materials) : Array.isArray(body.keys) ? body.keys.filter((key) => typeof key === 'string') : [];
  if (keys.length === 0) throw new ApiError(400, 'invalid_materials', 'Wybierz materiały do przeróbki.');
  checkRoom(settled.queue);
  const { state, ordered, tooRare: rare } = orderMaterials(settled, keys, table, now, newRng(), content);
  if (ordered === 0 && rare > 0) {
    const rarities = keys.filter((key) => settled.materials[key] > 0).map((key) => key.slice(key.lastIndexOf(':') + 1));
    throw tooRare(rarities.sort((a, b) => craftLevelFor(a, content) - craftLevelFor(b, content))[0]);
  }
  if (ordered === 0) throw new ApiError(409, 'no_materials', 'Nie masz tych materiałów.');
  // Every material handed to the table counts for the narrator's quests.
  const processed = Object.entries(settled.materials).reduce((sum, [key, count]) => sum + count - (state.materials[key] ?? 0), 0);
  const quests = addQuestProgress(questsNow(player, now), { processed });
  const db = context.env.DB;
  const result = await saveState(db, player.row, withIds(settled.queue.length, state), { quests }).run();
  if (result.meta.changes !== 1) throw changed();
  return json({ ordered, skipped: rare, character: characterView(await loadPlayer(db, session.userId), now) });
}

// An item from the bag taken apart on the table: it goes now, and its parts
// come when the order ends.
export async function salvageItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = player.items.find((candidate) => String(candidate.id) === context.params.id);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  const now = context.now;
  const table = tableOf(player, now);
  if (!craftTakes(table, item.rarity, content)) throw tooRare(item.rarity);
  const settled = settleCrafting(craftingState(player.row), now);
  checkRoom(settled.queue);
  const state = withIds(settled.queue.length, orderSalvage(settled, item, itemName(item, content), table, now, newRng(), content));
  const order = state.queue.at(-1);
  const db = context.env.DB;
  const row = player.row;
  // The order is saved only while the item is still in the bag, and the item
  // goes only if that order was saved: two taps make one order.
  const quests = addQuestProgress(questsNow(player, now), { salvaged: 1 });
  const [saved] = await db.batch([
    saveState(db, row, state, {
      quests,
      condition: ' AND EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ? AND slot IS NULL)',
      binds: [item.id, row.id],
    }),
    db
      .prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND instr(crafting, ?) > 0)')
      .bind(item.id, row.id, row.id, `"id":"${order.id}"`),
  ]);
  if (saved.meta.changes !== 1) throw changed();
  return json({
    salvage: { name: order.name, part: content.partsById[order.partId].name, parts: order.parts, endsAt: order.endsAt },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
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
