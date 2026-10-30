// The Osada, part I (settlement.js in the engine): the view of the board
// and the residents, delivering and rejecting an order, and reforging an
// affix at the Zaklinaczka's. It opens at the settlement unlock's level
// (unlocks.json) where the deployment has it on (SETTLEMENT, features.js).
// Each change saves only if the character is as read (its version), so two
// taps make one. On the test version "Testuj Osadę" opens it below its
// level, puts everyone at one standing and brings new orders at once.

import {
  BAG_GOODS,
  addQuestProgress,
  createRng,
  deliverBlock,
  deliverOrder,
  itemName,
  materialView,
  parseStack,
  pathResetCost,
  propertyName,
  reforgeBlock,
  reforgeCost,
  reforgeItem,
  rejectOrder,
  standingOf,
  statResetCost,
  upgradedItem,
} from '../engine/index.js';
import { content } from './content.js';
import {
  characterView,
  engineCharacter,
  loadPlayer,
  questsNow,
  requireIdle,
  requireIdlePlayer,
  requirePlayer,
  settlementBoard,
  settlementGoods,
} from './characters.js';
import { toHex } from './encoding.js';
import { settlementOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { settlementTestsFor } from './test-mode.js';

// A JSON path for a key with a hyphen or a colon ("iron-ore", "wolf-pelt:rare").
const jsonPath = (key) => `$."${key}"`;

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The column a kind of goods is kept in.
const COLUMNS = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' };

// The relations after a service: its resident's grows by its relationGain.
const grow = (relations, { resident, relationGain }) => ({ ...relations, [resident]: (relations[resident] ?? 0) + relationGain });

// The service each resident gives on the page, as the data names them: the
// board's orders, the reforging or the resets; none for the others.
const serviceOf = (residentId) => ['orders', 'reforge', 'hermit'].find((service) => content.settlement[service].resident === residentId) ?? null;

// What the row keeps of the Osada: reputation and relations by id, the
// board, and `test` once "Testuj Osadę" opened it below its level.
export function settlementOf(row) {
  const stored = JSON.parse(row.settlement ?? '{}');
  return { reputation: stored.reputation ?? {}, relations: stored.relations ?? {}, board: stored.board ?? null, ...(stored.test && { test: true }) };
}

function requireOpen(row) {
  const unlock = content.unlocksById.settlement;
  if (!settlementOn() || !content.settlement) throw new ApiError(404, 'not_found', 'Osady jeszcze nie ma.');
  if (row.level < unlock.level && !settlementOf(row).test) throw new ApiError(403, 'locked', `Osadę odblokujesz na poziomie postaci ${unlock.level}.`);
}

// A good's name on the board.
function goodLabel({ kind, key }) {
  if (kind === 'herb') return content.herbsById[key].name;
  if (kind === 'potion') return content.potionsById[key].name;
  if (kind === 'material') {
    const { label } = materialView(key, 1, content);
    return label[0].toUpperCase() + label.slice(1);
  }
  if (kind === 'resource') return content.resourcesById[key].name;
  return content.partsById[key].name;
}

const orderView = (order, stocks) => ({
  ...order,
  label: goodLabel(order),
  brotherhoodName: content.settlement.brotherhoods.find((one) => one.id === order.brotherhood).name,
  have: stocks[COLUMNS[order.kind]]?.[order.key] ?? 0,
  // Delivered only at home (BAG_GOODS).
  home: BAG_GOODS.has(order.kind),
});

// The Osada for the page: the board's places, the residents with the
// greeting of their relation's standing, the brotherhoods' standings and
// the orders on the board, each with what the character holds of it.
export function settlementView(player, stored, board, now) {
  const stocks = settlementGoods(player.row);
  const { name, description, places, residents, brotherhoods } = content.settlement;
  return {
    name,
    description,
    places,
    residents: residents.map((resident) => {
      const standing = standingOf(stored.relations[resident.id] ?? 0, content);
      return { ...resident, service: serviceOf(resident.id), standing, greeting: resident.greetings[Math.min(standing.index, resident.greetings.length - 1)] };
    }),
    brotherhoods: brotherhoods.map((brotherhood) => ({ ...brotherhood, standing: standingOf(stored.reputation[brotherhood.id] ?? 0, content) })),
    board: {
      slots: board.slots.map((slot) => (slot.order ? { order: orderView(slot.order, stocks) } : { readyAt: slot.readyAt })),
      weekly: board.weekly?.order && !board.weekly.done ? orderView({ ...board.weekly.order, id: 'weekly' }, stocks) : null,
      weeklyDone: board.weekly?.done ?? false,
    },
    reforge: { items: player.items.filter((item) => item.affixes?.length > 0).map((item) => reforgeView(item, stocks.materials)) },
    hermit: { path: pathResetCost(player.row.level, content), stats: statResetCost(player.row.level, content) },
    now,
  };
}

// An item the Zaklinaczka can reforge: its affixes as the item card shows
// them (with the Kowadło's upgrade) and the price, with the character's
// stacks of the materials it takes.
function reforgeView(item, materials) {
  const shown = upgradedItem(item, content);
  const cost = reforgeCost(item, item.reforged ?? 0, content);
  const need = cost.materials;
  return {
    id: item.id,
    name: itemName(item, content),
    rarity: item.rarity,
    equipped: Boolean(item.equippedSlot),
    affixes: shown.affixes.map((affix) => `${propertyName(affix.stat, content)}: +${affix.value}`),
    gold: cost.gold,
    materials: need && {
      ...need,
      rarityName: content.raritiesById[need.rarity].name,
      stacks: Object.entries(materials)
        .filter(([key, count]) => parseStack(key).rarityId === need.rarity && count >= need.count)
        .map(([key, count]) => ({ key, label: materialView(key, count, content).label, count })),
    },
  };
}

// Saves a board drawn anew (new orders came) if the row is still as read.
async function saveBoard(db, row, stored, board) {
  const next = JSON.stringify({ ...stored, board });
  if (next === (row.settlement ?? '{}')) return;
  await db.prepare('UPDATE characters SET settlement = ? WHERE id = ? AND settlement IS ?').bind(next, row.id, row.settlement ?? null).run();
}

export async function getSettlement(context) {
  const { player } = await requirePlayer(context);
  requireOpen(player.row);
  const stored = settlementOf(player.row);
  const board = settlementBoard(player.row, stored, context.now);
  await saveBoard(context.env.DB, player.row, stored, board);
  return json({ settlement: settlementView(player, stored, board, context.now), character: characterView(player, context.now) });
}

// { orderId }: hands over what an order asks for, for its gold, the
// brotherhood's reputation, the relation with the resident who posts the
// orders and maybe Punkty Systemu.
export async function deliverSettlementOrder(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const board = settlementBoard(row, stored, context.now);
  const block = deliverBlock(board, body.orderId, settlementGoods(row));
  if (block) throw new ApiError(block.code === 'no_order' ? 404 : 409, block.code, block.message);
  const done = deliverOrder(board, body.orderId, context.now, content);
  // The potions taken along leave the bag only when the report is claimed,
  // so herbs and potions wait for the character at home, as at the Skup.
  if (BAG_GOODS.has(done.take.kind)) requireIdle(player, context.now);
  const add = (counts, more) => ({ ...counts, ...Object.fromEntries(Object.entries(more).map(([id, gain]) => [id, (counts[id] ?? 0) + gain])) });
  const next = { ...stored, reputation: add(stored.reputation, done.reputation), relations: add(stored.relations, done.relation), board: done.board };
  // The narrator's quests "Wykonaj N zleceń w Osadzie" (question 95).
  const quests = JSON.stringify(addQuestProgress(questsNow(player, context.now), { orders: 1 }));
  const column = COLUMNS[done.take.kind];
  const key = jsonPath(done.take.key);
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?,
         ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END,
         version = version + 1
       WHERE id = ? AND version = ? AND COALESCE(json_extract(${column}, ?), 0) >= ?`,
    )
    .bind(done.gold, done.systemPoints, JSON.stringify(next), quests, key, done.take.count, key, key, done.take.count, key, row.id, row.version, key, done.take.count)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  return json({
    delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
    settlement: settlementView(after, next, done.board, context.now),
    character: characterView(after, context.now),
  });
}

// { orderId }: takes an order off the board for free; a new one comes later.
export async function rejectSettlementOrder(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const board = rejectOrder(settlementBoard(row, stored, context.now), body.orderId, context.now, content);
  if (!board) throw new ApiError(404, 'no_order', 'Tego zlecenia nie da się odrzucić.');
  const next = { ...stored, board };
  const result = await context.env.DB.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ settlement: settlementView(player, next, board, context.now), character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

// { itemId, affix, material }: the Zaklinaczka draws one affix of an item
// anew, for gold and creatures' materials (`material`: the stack paid with).
// The character must be at home, as at the Kowadło.
export async function reforgeAtEnchantress(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  const times = item.reforged ?? 0;
  const materials = JSON.parse(row.materials ?? '{}');
  const block = reforgeBlock(item, body.affix, { gold: row.gold, materials, stack: body.material, times }, content);
  if (block) throw new ApiError(block.code.startsWith('invalid') || block.code === 'no_affixes' ? 400 : 409, block.code, block.message);
  const cost = reforgeCost(item, times, content);
  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const done = reforgeItem(item, body.affix, createRng(roll), content);
  const stack = jsonPath(cost.materials ? body.material : 'none');
  const taken = cost.materials ? cost.materials.count : 0;
  const stored = settlementOf(row);
  const relations = grow(stored.relations, content.settlement.reforge);
  const db = context.env.DB;
  // As at the Kowadło: the item changes only if it is as seen here and the
  // price is still there, and the payment only if this roll was saved.
  await db.batch([
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.affixes', json(?), '$.reforged', ?, '$.lastRoll', ?)
         WHERE id = ? AND character_id = ? AND COALESCE(json_extract(data, '$.reforged'), 0) = ?
           AND (SELECT gold FROM characters WHERE id = ?) >= ?
           AND COALESCE(json_extract((SELECT materials FROM characters WHERE id = ?), ?), 0) >= ?`,
      )
      .bind(JSON.stringify(done.affixes), done.reforged, roll, item.id, row.id, times, row.id, cost.gold, row.id, stack, taken),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, settlement = ?,
           materials = CASE WHEN ? = 0 THEN materials WHEN json_extract(materials, ?) > ? THEN json_set(materials, ?, json_extract(materials, ?) - ?) ELSE json_remove(materials, ?) END,
           version = version + 1
         WHERE id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(cost.gold, JSON.stringify({ ...stored, relations }), taken, stack, taken, stack, stack, taken, stack, row.id, item.id, roll),
  ]);
  const after = await loadPlayer(db, session.userId);
  const saved = after.items.find((candidate) => candidate.id === item.id);
  if (saved?.lastRoll !== roll) throw changed();
  return json({ item: saved, gold: cost.gold, character: characterView(after, context.now) });
}

// { service: "path" | "stats" }: the Pustelnik's resets for gold. "path"
// gives back the Skill Points of the class's skills, so the paths can be
// chosen anew (question 122 A), not after an evolution, whose paths change
// with it; "stats" gives back the stat points above the free reset's level
// (question 124 A). At home only, like the stat points and the skills.
export async function hermitService(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const character = engineCharacter(row);
  let gold;
  let set;
  let value;
  if (body.service === 'path') {
    if (character.evolution) throw new ApiError(409, 'evolved', 'Po ewolucji ścieżki zmieniają się razem z nią.');
    const skills = Object.fromEntries(Object.entries(character.skills).filter(([id]) => content.skillsById[id]?.evolution));
    if (Object.keys(skills).length === Object.keys(character.skills).length) throw new ApiError(409, 'nothing_to_reset', 'Nie masz jeszcze żadnej ścieżki do wyzerowania.');
    gold = pathResetCost(row.level, content);
    set = 'skills';
    value = skills;
  } else if (body.service === 'stats') {
    gold = statResetCost(row.level, content);
    if (gold === null) throw new ApiError(409, 'free_reset', 'Do tego poziomu punkty wyzerujesz za darmo w Statystykach.');
    if (Object.keys(character.points).length === 0) throw new ApiError(409, 'nothing_to_reset', 'Nie masz rozdanych punktów do wyzerowania.');
    set = 'points';
    value = {};
  } else {
    throw new ApiError(400, 'invalid_service', 'Pustelnik tego nie robi.');
  }
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  const stored = settlementOf(row);
  const relations = grow(stored.relations, content.settlement.hermit);
  const db = context.env.DB;
  const result = await db
    .prepare(`UPDATE characters SET gold = gold - ?, ${set} = ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?`)
    .bind(gold, JSON.stringify(value), JSON.stringify({ ...stored, relations }), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ gold, character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// "Testuj Osadę" on the test version, for the accounts with test mode
// (test-mode.js), where the deployment has the Osada.
async function requireTester(context) {
  const { session, player } = await requirePlayer(context);
  if (!settlementOn() || !content.settlement || !settlementTestsFor(context.env, session.user.login)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return { session, player };
}

// The standings to put everyone at.
export async function settlementTests(context) {
  await requireTester(context);
  return json({ standings: content.settlement.standings.map(({ id, name }) => ({ id, name })) });
}

// { action }: "open" opens the Osada below its level, "standing" (with
// `standing`) puts every brotherhood's reputation and every resident's
// relation at that standing's points, and "orders" brings new orders to
// every slot of the board and this week's big one back.
export async function testSettlement(context) {
  const { session, player } = await requireTester(context);
  const { row } = player;
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  let next;
  if (body.action === 'open') {
    next = { ...stored, test: true };
  } else if (body.action === 'standing') {
    const standing = content.settlement.standings.find((one) => one.id === body.standing);
    if (!standing) throw new ApiError(400, 'invalid_standing', 'Nie ma takiego stopnia.');
    const everyone = (list) => Object.fromEntries(list.map(({ id }) => [id, standing.points]));
    next = { ...stored, reputation: everyone(content.settlement.brotherhoods), relations: everyone(content.settlement.residents) };
  } else if (body.action === 'orders') {
    next = { ...stored, board: stored.board && { ...stored.board, slots: stored.board.slots.map(() => ({ readyAt: context.now })), weekly: null } };
  } else {
    throw new ApiError(400, 'invalid_action', 'Nie ma takiego testu.');
  }
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}
