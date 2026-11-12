// The Skrzynia Konta in the camp (DECISIONS.md, "Skrzynia Konta"): a few
// places for items that all the characters of an account share (the
// author: "Skrzynię Konta wspólną dla wszystkich postaci. Mała liczba
// slotów na przedmioty."), and since the mock-ups 843 (the author,
// 12.11.2026: „Skrzynia Konta powinna pozwalać przekładać też mikstury,
// rośliny, wszystko, nawet zasoby, ale miec kłódkę i być zablokowana do 20
// poziomu postaci”) any number of goods: potions, herbs, materials, minerals
// and the camp's resources. Gold stays with its character. A character
// below the chest's level (chestLock in characters.js) neither puts
// anything in nor takes anything out. A character puts and takes also
// while away, as every change of the bag (DECISIONS.md, "Plecak poza
// obozem"). The character that put an item in takes it back as it was;
// another one gets it marked as from the chest (data.chest): worn from its
// Tier as every item (DECISIONS.md, "Przedmioty według Tieru") and left out
// of its Encyklopedia (ownDiscoveries in the engine). So with goods: the
// pieces a character put in come back to it as they were, and those of
// another character come as got from others (foreign_stacks), as a
// Wymiana's (account-chest.js in the engine).

import { CHEST_GOODS, bagCapacity, campLevels, canUse, chestTakes, itemView, knownStack, materialView, tradedLeaving } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { bagPlaces, characterView, chestLock, loadPlayer, requireOffRack, requirePlayer } from './characters.js';
import { content } from './content.js';
import { withoutFavorites } from './favorites.js';
import { ApiError, json, readJson } from './http.js';
import { counted, foreign, takenOff } from './market.js';

const slots = () => content().balance.account.chestSlots;

// The column of the characters row each kind of goods is kept in, and the
// kinds that take the bag's places, a place to a stack (bagPlaces).
const COLUMNS = { resource: 'resources', potion: 'potions', herb: 'herbs', material: 'materials', mineral: 'minerals' };
const IN_BAG = new Set(['herb', 'potion']);
const jsonPath = (key) => `$."${key}"`;
// A batch of goods that failed on its assertion: the character or the
// chest's pieces moved meanwhile (atomic.js).
const changed = () => new ApiError(409, 'character_changed', 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.');

// The data's list of a kind of goods; materials are stacks of a material
// and a rarity instead (knownStack).
const listOf = (kind) => ({ resource: content().resources, potion: content().potions, herb: content().herbs, mineral: content().minerals })[kind] ?? [];

// A good as the chest shows it, or null for one the data does not know: its
// name in the request's language, as the character's own lists name it (a
// material as "Rzadka skóra wilka"), a material's species for its picture,
// and its place among its kind (the data's order; materials by rarity and
// name, as the Stół rozbiórki lists them).
function goodView(kind, id) {
  if (kind === 'material') {
    if (!knownStack(id, content())) return null;
    const material = materialView(id, 0, content());
    const rank = content().rarities.findIndex((rarity) => rarity.id === material.rarity);
    return { name: material.label.charAt(0).toUpperCase() + material.label.slice(1), materialId: material.materialId, rank, sortName: material.name };
  }
  const list = listOf(kind);
  const rank = list.findIndex((one) => one.id === id);
  return rank < 0 ? null : { name: list[rank].name, rank, sortName: '' };
}

// The goods in the chest by good: how many pieces in all, and how many of
// them are the character's own, kind by kind in CHEST_GOODS's order.
function goodsOf(rows) {
  return rows
    .map((row) => ({ row, view: CHEST_GOODS.includes(row.kind) ? goodView(row.kind, row.good) : null }))
    .filter(({ view }) => view)
    .sort(
      (a, b) =>
        CHEST_GOODS.indexOf(a.row.kind) - CHEST_GOODS.indexOf(b.row.kind) || a.view.rank - b.view.rank || a.view.sortName.localeCompare(b.view.sortName, 'pl'),
    )
    .map(({ row, view }) => ({ kind: row.kind, id: row.good, name: view.name, count: row.count, own: row.own, ...(view.materialId && { materialId: view.materialId }) }));
}

// The chest as the character played sees it: each item with the name of
// the character that put it in, and whether it comes back to this one as
// its own; and the goods.
async function chestView(db, player) {
  const [items, goods] = await db.batch([
    db
      .prepare('SELECT c.id, c.character_id, c.data, o.name FROM chest_items c LEFT JOIN characters o ON o.id = c.character_id WHERE c.user_id = ? ORDER BY c.id')
      .bind(player.row.user_id),
    db
      .prepare('SELECT kind, good, SUM(count) AS count, SUM(CASE WHEN character_id = ? THEN count ELSE 0 END) AS own FROM chest_goods WHERE user_id = ? GROUP BY kind, good')
      .bind(player.row.id, player.row.user_id),
  ]);
  return {
    slots: slots(),
    items: items.results.map((row) => {
      const item = JSON.parse(row.data);
      const own = row.character_id === player.row.id;
      // Another character's item comes out as the Skrzynia Konta's (take),
      // worn from its own level and its base's, whichever is higher.
      const view = itemView(own ? item : { ...item, chest: 1 }, content());
      return {
        ...view,
        id: row.id,
        from: row.name ?? null,
        own,
        // Its class can wear it, and from which level of the class.
        usable: canUse(item.base, player.row.class_id, content()),
        wornFrom: view.classLevel,
      };
    }),
    goods: goodsOf(goods.results),
  };
}

// The padlock (chestLock): below the chest's level a character neither
// puts anything in nor takes anything out, items or goods.
function requireOpen(row) {
  const lock = chestLock(row);
  if (lock) throw new ApiError(403, 'chest_locked', `Skrzynia Konta otworzy się na ${lock.level}. poziomie postaci.`);
}

// GET /api/chest: the chest, or below its level only the level it opens at.
export async function getChest(context) {
  const { player } = await requirePlayer(context);
  const lock = chestLock(player.row);
  return json({ chest: lock ? { locked: lock } : await chestView(context.env.DB, player) });
}

// POST /api/chest/put { itemId }: an item from the bag into the chest, while
// it has room. One statement checks the room and the item and the next
// removes the item only once the chest has it, so two taps at once cannot
// overfill the chest.
export async function putInChest(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => candidate.id === body.itemId);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  requireOffRack(player, item);
  const db = context.env.DB;
  const full = () => new ApiError(409, 'chest_full', `Skrzynia Konta mieści ${slots()} przedmiotów. Wyjmij coś, żeby włożyć nowy.`);
  const now = context.now;
  const [put] = await db.batch([
    db
      .prepare(
        `INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at)
         SELECT ?, character_id, id, data, created_at, ? FROM items
         WHERE id = ? AND character_id = ? AND slot IS NULL AND (SELECT COUNT(*) FROM chest_items WHERE user_id = ?) < ?`,
      )
      .bind(session.userId, now, item.id, player.row.id, session.userId, slots()),
    db
      .prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND slot IS NULL AND EXISTS (SELECT 1 FROM chest_items WHERE user_id = ? AND item_id = ? AND put_at = ?)')
      .bind(item.id, player.row.id, session.userId, item.id, now),
    // A favourite no longer, once in the chest (favorites.js): it comes
    // out as a new item, of whichever character takes it. And the
    // character's version moves with its bag (the code review, 12.11.2026:
    // the scrapper of a tower's win, which had read the bag before, sold
    // the item put away meanwhile and gave its gem back too, so the gem
    // was both in the chest and in the minerals).
    db
      .prepare(`UPDATE characters SET favorites = ${withoutFavorites}, version = version + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM chest_items WHERE user_id = ? AND item_id = ? AND put_at = ?)`)
      .bind(JSON.stringify([item.id]), player.row.id, session.userId, item.id, now),
  ]);
  if (put.meta.changes !== 1) throw full();
  return answer(context, session);
}

// POST /api/chest/take { id }: an item from the chest into the bag, while the
// bag has room; one the character put in itself comes back as it was.
export async function takeFromChest(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const stored = Number.isInteger(body.id) ? await db.prepare('SELECT id FROM chest_items WHERE id = ? AND user_id = ?').bind(body.id, session.userId).first() : null;
  if (!stored) throw new ApiError(404, 'not_in_chest', 'Tego przedmiotu nie ma już w Skrzyni Konta.');
  if (bagPlaces(player) >= bagCapacity(campLevels(player.buildings, context.now, content()), content())) {
    throw new ApiError(409, 'bag_full', 'Plecak jest pełny. Zrób w nim miejsce, żeby wyjąć przedmiot.');
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO items (character_id, slot, data, created_at)
         SELECT ?, NULL, CASE WHEN character_id = ? THEN data ELSE json_set(data, '$.chest', 1) END, created_at FROM chest_items WHERE id = ? AND user_id = ?`,
      )
      .bind(player.row.id, player.row.id, stored.id, session.userId),
    db.prepare('DELETE FROM chest_items WHERE id = ? AND user_id = ?').bind(stored.id, session.userId),
    // The version moves with the bag, as at "Włóż".
    db.prepare('UPDATE characters SET version = version + 1 WHERE id = ? AND changes() = 1').bind(player.row.id),
  ]);
  return answer(context, session);
}

// The goods a request names, { kind, id, count }: a kind the chest takes, a
// good of it the data knows (gold is none: it stays with its character) and
// a whole number of pieces.
function askedGoods(body) {
  const { kind, id, count } = body;
  if (!CHEST_GOODS.includes(kind)) throw new ApiError(400, 'invalid_kind', 'Takich towarów Skrzynia Konta nie przyjmuje.');
  if (typeof id !== 'string' || !goodView(kind, id)) throw new ApiError(400, 'invalid_goods', 'Nie ma takiego towaru.');
  if (!Number.isSafeInteger(count) || count < 1) throw new ApiError(400, 'invalid_count', 'Wybierz co najmniej 1 sztukę.');
  return { kind, id, count, column: COLUMNS[kind] };
}

// The pieces of a good the character holds, as its row keeps them.
const heldOf = (row, column, id) => JSON.parse(row[column] ?? '{}')[id] ?? 0;

// POST /api/chest/goods/put { kind, id, count }: pieces of the character's
// goods into the chest, any number of them. Those it had got from others
// go in marked so (`traded`; its own pieces go first, tradedLeaving), to
// come back to it as they were. One batch, while the character is as read
// and still holds the pieces, so two taps at once put them in once.
export async function putGoodsInChest(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const { kind, id, count, column } = askedGoods(await readJson(context.request));
  const held = heldOf(row, column, id);
  if (count > held) throw new ApiError(409, 'not_enough', held > 0 ? 'Nie masz tylu.' : 'Nie masz tego towaru.');
  // The camp's resources are in no Encyklopedia, so none is kept for them.
  const traded = kind === 'resource' ? 0 : tradedLeaving(JSON.parse(row.foreign_stacks ?? '{}')[`${kind}:${id}`] ?? 0, held, count);
  const off = takenOff(column, { [id]: count });
  const db = context.env.DB;
  await atomically(db, [
    assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND COALESCE((SELECT json_extract(${column}, ?) FROM characters WHERE id = ?), 0) >= ?`, [
      row.id,
      row.version,
      jsonPath(id),
      row.id,
      count,
    ]),
    db.prepare(`UPDATE characters SET ${column} = ${off.sql}, version = version + 1 WHERE id = ?`).bind(...off.binds, row.id),
    db
      .prepare(
        `INSERT INTO chest_goods (user_id, character_id, kind, good, count, traded) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, character_id, kind, good) DO UPDATE SET count = count + excluded.count, traded = traded + excluded.traded`,
      )
      .bind(session.userId, row.id, kind, id, count, traded),
  ], changed);
  return answer(context, session);
}

// How many pieces of a herb or a potion the bag takes now: the room left in
// its last stack and a stack to each free place (as the Prośby Gildii
// count it, guild-requests.js).
function bagRoom(player, column, id, now) {
  const { stack } = content().professionRules;
  const free = Math.max(0, bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player));
  const have = heldOf(player.row, column, id);
  return Math.ceil(have / stack) * stack - have + free * stack;
}

// POST /api/chest/goods/take { kind, id, count }: pieces of a good out of
// the chest to the character, its own first, then the others' (chestTakes
// in the engine); herbs and potions while the bag has the places for them.
// The pieces of another character, and those of its own it had got from
// others, come as got from others, which its Encyklopedia leaves out
// (foreign in market.js), as a Wymiana's. One batch, while the character
// and the chest's rows of the good are as read, so two taps at once take
// each piece once.
export async function takeGoodsFromChest(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const { kind, id, count, column } = askedGoods(await readJson(context.request));
  const db = context.env.DB;
  const rows = (
    await db.prepare('SELECT id, character_id, count, traded FROM chest_goods WHERE user_id = ? AND kind = ? AND good = ? ORDER BY id').bind(session.userId, kind, id).all()
  ).results.map((one) => ({ id: one.id, characterId: one.character_id, count: one.count, traded: one.traded }));
  const plan = chestTakes(rows, row.id, count);
  if (!plan) {
    const there = rows.reduce((sum, one) => sum + one.count, 0);
    throw new ApiError(409, 'not_in_chest', there > 0 ? `W Skrzyni Konta jest tylko ${there} szt.` : 'Tego towaru nie ma już w Skrzyni Konta.');
  }
  if (IN_BAG.has(kind)) {
    const room = bagRoom(player, column, id, context.now);
    if (count > room) throw new ApiError(409, 'bag_full', room > 0 ? `W plecaku zmieści się jeszcze ${room} szt.` : 'Plecak jest pełny. Zrób w nim miejsce, żeby wyjąć ten towar.');
  }
  const gain = counted(column, { [id]: count });
  const others = foreign(plan.foreign > 0 ? { [kind]: { [id]: plan.foreign } } : {});
  await atomically(db, [
    assertion(db, ['(SELECT version FROM characters WHERE id = ?) = ?', ...plan.takes.map(() => 'EXISTS (SELECT 1 FROM chest_goods WHERE id = ? AND user_id = ? AND count = ? AND traded = ?)')].join(' AND '), [
      row.id,
      row.version,
      ...plan.takes.flatMap((take) => [take.row.id, session.userId, take.row.count, take.row.traded]),
    ]),
    ...plan.takes.map((take) =>
      take.gone
        ? db.prepare('DELETE FROM chest_goods WHERE id = ?').bind(take.row.id)
        : db.prepare('UPDATE chest_goods SET count = count - ?, traded = traded - ? WHERE id = ?').bind(take.count, take.traded, take.row.id),
    ),
    db.prepare(`UPDATE characters SET ${column} = ${gain.sql}, foreign_stacks = ${others.sql}, version = version + 1 WHERE id = ?`).bind(...gain.binds, ...others.binds, row.id),
  ], changed);
  return answer(context, session);
}

async function answer(context, session) {
  const player = await loadPlayer(context.env.DB, session.userId);
  return json({ chest: await chestView(context.env.DB, player), character: characterView(player, context.now) });
}
