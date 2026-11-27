// The Skrzynia Konta in the camp (DECISIONS.md, "Skrzynia Konta"): a few
// places for items that all the characters of an account share (the
// author: "Skrzynię Konta wspólną dla wszystkich postaci. Mała liczba
// slotów na przedmioty."), and since the mock-ups 843 (the author,
// 12.11.2026: „Skrzynia Konta powinna pozwalać przekładać też mikstury,
// rośliny, wszystko, nawet zasoby, ale miec kłódkę i być zablokowana do 20
// poziomu postaci”) any number of goods: potions, herbs, materials, the Stół
// rozbiórki's parts (0.3.90), minerals and the camp's resources. And gold
// since 19.11.2026 (the author: „dorób złoto możliwe do przenoszenia
// miedzy postaciami w skrzyni konta”): one number for the whole account
// (users.chest_gold), see putGoldInChest. A character
// below the chest's level (chestLock in characters.js) neither puts
// anything in nor takes anything out. A character puts and takes also
// while away, as every change of the bag (DECISIONS.md, "Plecak poza
// obozem"). The character that put an item in takes it back as it was;
// another one gets it marked as from the chest (data.chest): worn from its
// Tier as every item (DECISIONS.md, "Przedmioty według Tieru") and left out
// of its Encyklopedia (ownDiscoveries in the engine). So with goods: the
// pieces a character put in come back to it as they were, and those of
// another character come as got from others (foreign_stacks), as a
// Wymiana's (account-chest.js in the engine). And Talia Systemu's cards,
// from the character's collection into the collection of another
// (chest-cards.js; the mock-ups of 19.11.2026). Many things come out at
// once with "Wyjmij wszystko" and "Wyjmij zaznaczone" (takeManyFromChest).

import { CHEST_GOODS, bagCapacity, campLevels, canUse, chestTakes, gearKey, itemView, knownStack, materialView, tradedLeaving } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { bagPlaces, characterView, chestLock, loadPlayer, requireOffRack, requirePlayer } from './characters.js';
import { cardGoodView, cardsTaken, chestCards, isCardGood, putCardInChest, takeCardFromChest } from './chest-cards.js';
import { content } from './content.js';
import { withoutFavorites } from './favorites.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';
import { FOREIGN_KINDS, counted, foreign, takenOff } from './market.js';
import { SCROLL_COLUMNS, scrollAdds, scrollGoods, scrollHeld } from './scroll-goods.js';
import { addedStacks } from './trades.js';

// The chest holds as many items as the bag of the character played, with
// its camp's upgrades of the bag (the author, 16.11.2026: „Zwiększ
// pojemność skrzyni konta na taką jaka aktualnie ma plecak”).
const slots = (player, now) => bagCapacity(campLevels(player.buildings, now, content()), content());

// The column of the characters row each kind of goods is kept in, and the
// kinds that take the bag's places, a place to a stack (bagPlaces).
const COLUMNS = { resource: 'resources', potion: 'potions', herb: 'herbs', material: 'materials', part: 'parts', mineral: 'minerals', pantry: 'pantry' };
const IN_BAG = new Set(['herb', 'potion']);
const jsonPath = (key) => `$."${key}"`;
// A batch of goods that failed on its assertion: the character or the
// chest's pieces moved meanwhile (atomic.js).
const changed = () => new ApiError(409, 'character_changed', 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.');

// The data's list of a kind of goods; materials are stacks of a material
// and a rarity instead (knownStack).
const listOf = (kind) =>
  ({ resource: content().resources, potion: content().potions, herb: content().herbs, part: content().parts, mineral: content().minerals, scroll: scrollGoods(), pantry: content().pantry })[kind] ?? [];

// A good as the chest shows it, or null for one the data does not know: its
// name in the request's language, as the character's own lists name it (a
// material as "Rzadka skóra wilka"), a material's species for its picture,
// and its place among its kind (the data's order; materials by rarity and
// name, as the Stół rozbiórki lists them). A card ("Karta: Licho") with its
// face (chest-cards.js).
function goodView(kind, id) {
  if (isCardGood(kind)) return cardGoodView(kind, id);
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

// Goods ({ kind, view }: goodView's) in the chest's order: kind by kind in
// CHEST_GOODS's order, then as goodView places them among their kind.
const chestOrder = (a, b) => CHEST_GOODS.indexOf(a.kind) - CHEST_GOODS.indexOf(b.kind) || a.view.rank - b.view.rank || a.view.sortName.localeCompare(b.view.sortName, 'pl');

// The goods in the chest by good: how many pieces in all, and how many of
// them are the character's own, kind by kind in CHEST_GOODS's order; a card
// with its name alone, its face and the copies of it the character has
// (`have`, by "kind:id", chestCards), for what taking it would give.
function goodsOf(rows, have = new Map()) {
  return rows
    .map((row) => ({ row, kind: row.kind, view: CHEST_GOODS.includes(row.kind) ? goodView(row.kind, row.good) : null }))
    .filter(({ view }) => view)
    .sort(chestOrder)
    .map(({ row, view }) => ({
      kind: row.kind,
      id: row.good,
      name: view.name,
      count: row.count,
      own: row.own,
      ...(view.materialId && { materialId: view.materialId }),
      ...(view.face && { cardName: view.cardName, face: view.face, have: have.get(`${row.kind}:${row.good}`) ?? 0 }),
    }));
}

// The chest as the character played sees it: each item with the name of
// the character that put it in, and whether it comes back to this one as
// its own; the goods; the account's gold in it (`gold`: how much, with the
// quick amounts and the words of its row and sheets, data/camp.json
// chest.gold); and where the game has Talia Systemu, the cards of the
// character's collection for "Włóż kartę" (`cards`, chest-cards.js).
async function chestView(db, player, now) {
  const cards = await chestCards(db, player.row);
  const [items, goods, gold] = await db.batch([
    db
      .prepare('SELECT c.id, c.character_id, c.data, o.name FROM chest_items c LEFT JOIN characters o ON o.id = c.character_id WHERE c.user_id = ? ORDER BY c.id')
      .bind(player.row.user_id),
    db
      .prepare('SELECT kind, good, SUM(count) AS count, SUM(CASE WHEN character_id = ? THEN count ELSE 0 END) AS own FROM chest_goods WHERE user_id = ? GROUP BY kind, good')
      .bind(player.row.id, player.row.user_id),
    db.prepare('SELECT chest_gold FROM users WHERE id = ?').bind(player.row.user_id),
  ]);
  const { quick, texts } = content().camp.chest.gold;
  return {
    slots: slots(player, now),
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
        usable: canUse(item.base, gearKey(player.row.class_id, player.row.evolution, content()), content()),
        wornFrom: view.classLevel,
      };
    }),
    goods: goodsOf(goods.results, cards?.have),
    gold: { amount: gold.results[0]?.chest_gold ?? 0, quick, texts },
    ...(cards && { cards: cards.view }),
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
  return json({ chest: lock ? { locked: lock } : await chestView(context.env.DB, player, context.now) });
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
  const full = () => new ApiError(409, 'chest_full', `Skrzynia Konta mieści ${slots(player, context.now)} przedmiotów. Wyjmij coś, żeby włożyć nowy.`);
  const now = context.now;
  const [put] = await db.batch([
    db
      .prepare(
        `INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at)
         SELECT ?, character_id, id, data, created_at, ? FROM items
         WHERE id = ? AND character_id = ? AND slot IS NULL AND (SELECT COUNT(*) FROM chest_items WHERE user_id = ?) < ?`,
      )
      .bind(session.userId, now, item.id, player.row.id, session.userId, slots(player, now)),
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
// good of it the data knows (gold is none: it has requests of its own,
// putGoldInChest) and a whole number of pieces.
function askedGoods(body) {
  const { kind, id, count } = body;
  if (!CHEST_GOODS.includes(kind)) throw new ApiError(400, 'invalid_kind', 'Takich towarów Skrzynia Konta nie przyjmuje.');
  if (typeof id !== 'string' || !goodView(kind, id)) throw new ApiError(400, 'invalid_goods', 'Nie ma takiego towaru.');
  if (!Number.isSafeInteger(count) || count < 1) throw new ApiError(400, 'invalid_count', 'Wybierz co najmniej 1 sztukę.');
  return { kind, id, count, column: COLUMNS[kind] };
}

// The pieces of a good the character holds, as its row keeps them: a
// scroll in a number column of its own (scroll-goods.js, 1061).
const heldOf = (row, column, id) => (column ? (JSON.parse(row[column] ?? '{}')[id] ?? 0) : scrollHeld(row, id));

// POST /api/chest/goods/put { kind, id, count }: pieces of the character's
// goods into the chest, any number of them. Those it had got from others
// go in marked so (`traded`; its own pieces go first, tradedLeaving), to
// come back to it as they were. One batch, while the character is as read
// and still holds the pieces, so two taps at once put them in once.
export async function putGoodsInChest(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const asked = askedGoods(await readJson(context.request));
  // A card of Talia Systemu goes from the character's collection
  // (chest-cards.js).
  if (isCardGood(asked.kind)) {
    await putCardInChest(context, session, player, asked, changed);
    return answer(context, session);
  }
  const { kind, id, count, column } = asked;
  const held = heldOf(row, column, id);
  if (count > held) throw new ApiError(409, 'not_enough', held > 0 ? 'Nie masz tylu.' : 'Nie masz tego towaru.');
  // The camp's resources and the scrolls are in no Encyklopedia, so none is
  // kept for them.
  const traded = kind === 'resource' || kind === 'scroll' ? 0 : tradedLeaving(JSON.parse(row.foreign_stacks ?? '{}')[`${kind}:${id}`] ?? 0, held, count);
  const db = context.env.DB;
  // A scroll leaves its own number column (1061).
  const scroll = kind === 'scroll' ? SCROLL_COLUMNS[id] : null;
  const off = scroll ? null : takenOff(column, { [id]: count });
  await atomically(db, [
    scroll
      ? assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT ${scroll} FROM characters WHERE id = ?) >= ?`, [row.id, row.version, row.id, count])
      : assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND COALESCE((SELECT json_extract(${column}, ?) FROM characters WHERE id = ?), 0) >= ?`, [
          row.id,
          row.version,
          jsonPath(id),
          row.id,
          count,
        ]),
    scroll
      ? db.prepare(`UPDATE characters SET ${scroll} = ${scroll} - ?, version = version + 1 WHERE id = ?`).bind(count, row.id)
      : db.prepare(`UPDATE characters SET ${column} = ${off.sql}, version = version + 1 WHERE id = ?`).bind(...off.binds, row.id),
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
  const asked = askedGoods(await readJson(context.request));
  // A card of Talia Systemu goes into the character's collection
  // (chest-cards.js).
  if (isCardGood(asked.kind)) {
    await takeCardFromChest(context, session, player, asked, changed);
    return answer(context, session);
  }
  const { kind, id, count, column } = asked;
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
  // A scroll comes to its own number column (1061), and is in no
  // Encyklopedia.
  const scroll = kind === 'scroll' ? SCROLL_COLUMNS[id] : null;
  const gain = scroll ? { sql: `${scroll} + ?`, binds: [count] } : counted(column, { [id]: count });
  const others = foreign(plan.foreign > 0 && !scroll ? { [kind]: { [id]: plan.foreign } } : {});
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
    db.prepare(`UPDATE characters SET ${scroll ?? column} = ${gain.sql}, foreign_stacks = ${others.sql}, version = version + 1 WHERE id = ?`).bind(...gain.binds, ...others.binds, row.id),
  ], changed);
  return answer(context, session);
}

// --- Gold ------------------------------------------------------------------
//
// The account's gold in the chest (DECISIONS.md, "Złoto w Skrzyni Konta
// (19.11.2026)"; the author: „dorób złoto możliwe do przenoszenia miedzy
// postaciami w skrzyni konta”): one number (users.chest_gold, migration
// 0161). A character puts in any amount of its gold up to what it has, and
// takes out any amount up to what the chest has, with no fee and no limit,
// as the goods. The padlock holds it as everything in the chest, and like
// the goods it moves also while away. Gold has no Encyklopedia, so whose it
// was is not kept: any character of the account takes any of it, also the
// gold of a character removed since. Each move is one batch that moves the
// character's gold and the chest's together, valid only while the character
// is as read and the chest holds the gold the page showed (`seen`): a second
// tap, or a page that missed a move made meanwhile (another tab, another
// character of the account), gets the chest's "changed meanwhile", and the
// page reads the chest again.

const goldErrors = () => content().camp.chest.gold.texts.errors;
const withGold = (text, gold) => text.replaceAll('{gold}', numberText(gold));

// POST /api/chest/gold/put { amount, seen }: gold of the character's into
// the chest.
export const putGoldInChest = (context) => moveGold(context, true);

// POST /api/chest/gold/take { amount, seen }: gold out of the chest to the
// character.
export const takeGoldFromChest = (context) => moveGold(context, false);

async function moveGold(context, put) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const { amount, seen } = await readJson(context.request);
  const errors = goldErrors();
  if (!Number.isSafeInteger(amount) || amount < 1) throw new ApiError(400, 'invalid_amount', errors.invalid);
  const db = context.env.DB;
  const there = (await db.prepare('SELECT chest_gold FROM users WHERE id = ?').bind(session.userId).first())?.chest_gold ?? 0;
  // The chest is no longer as the page showed it.
  if (seen !== there) throw changed();
  if (put && amount > row.gold) throw new ApiError(409, 'not_enough', row.gold > 0 ? withGold(errors.notEnough, row.gold) : errors.none);
  if (!put && amount > there) throw new ApiError(409, 'not_in_chest', there > 0 ? withGold(errors.notInChest, there) : errors.empty);
  // What leaves the character (a take: less than nothing) comes to the chest.
  const moved = put ? amount : -amount;
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ? AND (SELECT chest_gold FROM users WHERE id = ?) = ?', [
        row.id,
        row.version,
        row.id,
        Math.max(0, moved),
        session.userId,
        there,
      ]),
      db.prepare('UPDATE characters SET gold = gold - ?, version = version + 1 WHERE id = ?').bind(moved, row.id),
      db.prepare('UPDATE users SET chest_gold = chest_gold + ? WHERE id = ?').bind(moved, session.userId),
    ],
    changed,
  );
  return answer(context, session);
}

// --- Many things at once ---------------------------------------------------
//
// "Wyjmij wszystko" and "Wyjmij zaznaczone" (a player's idea the author passed
// on, 27.11.2026: taking things out one by one is tedious; DECISIONS.md,
// "Skrzynia konta: wyjmij wszystko i zaznaczone (27.11.2026)"): everything of
// one tab of the chest (`all`: "items" or "goods", the cards with the goods),
// or the things marked (`items`: the chest's ids of items, `goods`: goods as
// "kind:id"), in one request. Each thing comes out as a single take-out
// takes it, a good whole, with all its pieces: in the chest's order (the
// items as they were put in, then the goods as the chest lists them) each
// comes out while the bag has the places it needs, and what does not fit
// stays; the answer says how many came out of how many (`taken`). A thing
// marked that is no longer in the chest takes nothing out ("changed
// meanwhile": the page reads the chest again). One batch, valid only while
// the character and the chest's rows taken are as read, so two taps at
// once take each thing once. The goods' pieces go into each column as one
// JSON object (addedStacks), so any number of them stays within D1's 100
// bound values.

const TAKE_ALL = ['items', 'goods'];
const invalidTake = () => new ApiError(400, 'invalid_take', 'Wybierz, co wyjąć ze Skrzyni Konta.');

// A good named "kind:id" (a material's id has a colon of its own:
// "material:wolf-pelt:rare"), or null for one the chest does not take.
function goodOfKey(key) {
  if (typeof key !== 'string') return null;
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  return at > 0 && CHEST_GOODS.includes(kind) && goodView(kind, id) ? { kind, id } : null;
}

// What a request asks for: `all` of a tab, or the lists of the things
// marked, at least one, each named once.
function askedMany(body) {
  if (body.all !== undefined) {
    if (!TAKE_ALL.includes(body.all)) throw invalidTake();
    return { all: body.all, items: [], goods: [] };
  }
  const { items = [], goods = [] } = body;
  if (!Array.isArray(items) || !Array.isArray(goods) || items.length + goods.length === 0) throw invalidTake();
  if (!items.every((id) => Number.isSafeInteger(id) && id > 0) || new Set(items).size !== items.length) throw invalidTake();
  if (!goods.every((key) => goodOfKey(key)) || new Set(goods).size !== goods.length) throw invalidTake();
  return { all: null, items, goods };
}

// POST /api/chest/take-many { all } | { items, goods }: many things out of
// the chest at once, as above.
export async function takeManyFromChest(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const asked = askedMany(await readJson(context.request));
  const db = context.env.DB;
  const user = session.userId;
  const [itemRows, goodRows] = await db.batch([
    db
      .prepare('SELECT id FROM chest_items WHERE user_id = ? AND (? OR id IN (SELECT value FROM json_each(?))) ORDER BY id')
      .bind(user, asked.all === 'items' ? 1 : 0, JSON.stringify(asked.items)),
    db
      .prepare("SELECT id, character_id, kind, good, count, traded FROM chest_goods WHERE user_id = ? AND (? OR kind || ':' || good IN (SELECT value FROM json_each(?))) ORDER BY id")
      .bind(user, asked.all === 'goods' ? 1 : 0, JSON.stringify(asked.goods)),
  ]);
  const items = itemRows.results.map((one) => one.id);
  // The goods by good, those the data knows, in the chest's order.
  const byGood = new Map();
  for (const one of goodRows.results) {
    const key = `${one.kind}:${one.good}`;
    if (!byGood.has(key)) byGood.set(key, { kind: one.kind, id: one.good, view: CHEST_GOODS.includes(one.kind) ? goodView(one.kind, one.good) : null, rows: [] });
    byGood.get(key).rows.push({ id: one.id, characterId: one.character_id, count: one.count, traded: one.traded });
  }
  const goods = [...byGood.values()].filter((good) => good.view).sort(chestOrder);
  const all = items.length + goods.length;
  // Nothing there, or a thing marked gone meanwhile: the page missed a change.
  if (all === 0 || (!asked.all && all !== asked.items.length + asked.goods.length)) throw changed();
  // An item takes a place of the bag, and a herb or a potion as many places
  // as the new stacks it makes (bagRoom); the rest takes none.
  const { stack } = content().professionRules;
  let free = bagCapacity(campLevels(player.buildings, context.now, content()), content()) - bagPlaces(player);
  const takenItems = [];
  for (const id of items) {
    if (free < 1) break;
    takenItems.push(id);
    free -= 1;
  }
  const takenGoods = [];
  for (const good of goods) {
    const count = good.rows.reduce((sum, one) => sum + one.count, 0);
    const have = IN_BAG.has(good.kind) ? heldOf(row, COLUMNS[good.kind], good.id) : 0;
    const places = IN_BAG.has(good.kind) ? Math.ceil((have + count) / stack) - Math.ceil(have / stack) : 0;
    if (places > free) continue;
    free -= places;
    takenGoods.push({ ...good, count, foreign: chestTakes(good.rows, row.id, count).foreign });
  }
  const taken = takenItems.length + takenGoods.length;
  if (taken === 0) throw new ApiError(409, 'bag_full', 'Za mało miejsca w plecaku. Zrób w nim miejsce, żeby coś wyjąć.');
  // What the character gets, column by column: the pieces of others as got
  // from others (foreign in market.js), a scroll in its own column (1061),
  // a card into the collection (chest-cards.js).
  const adds = {};
  const others = {};
  const scrolls = {};
  const cards = [];
  for (const good of takenGoods) {
    if (isCardGood(good.kind)) cards.push(good);
    else if (good.kind === 'scroll') scrolls[good.id] = good.count;
    else {
      adds[COLUMNS[good.kind]] = { ...adds[COLUMNS[good.kind]], [good.id]: good.count };
      if (FOREIGN_KINDS.includes(good.kind) && good.foreign > 0) others[`${good.kind}:${good.id}`] = good.foreign;
    }
  }
  const columns = Object.entries(adds);
  const scrolled = scrollAdds(scrolls);
  const anyOthers = Object.keys(others).length > 0;
  const rowsTaken = takenGoods.flatMap((good) => good.rows);
  const conditions = ['(SELECT version FROM characters WHERE id = ?) = ?'];
  const binds = [row.id, row.version];
  if (takenItems.length > 0) {
    conditions.push('(SELECT COUNT(*) FROM chest_items WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))) = ?');
    binds.push(user, JSON.stringify(takenItems), takenItems.length);
  }
  if (rowsTaken.length > 0) {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM json_each(?) AS s WHERE NOT EXISTS (SELECT 1 FROM chest_goods g WHERE g.id = json_extract(s.value, '$[0]') AND g.user_id = ? AND g.count = json_extract(s.value, '$[1]') AND g.traded = json_extract(s.value, '$[2]')))",
    );
    binds.push(JSON.stringify(rowsTaken.map((one) => [one.id, one.count, one.traded])), user);
  }
  await atomically(
    db,
    [
      assertion(db, conditions.join(' AND '), binds),
      ...(takenItems.length > 0
        ? [
            // One the character put in itself comes back as it was (takeFromChest).
            db
              .prepare(
                `INSERT INTO items (character_id, slot, data, created_at)
                 SELECT ?, NULL, CASE WHEN character_id = ? THEN data ELSE json_set(data, '$.chest', 1) END, created_at FROM chest_items
                 WHERE user_id = ? AND id IN (SELECT value FROM json_each(?)) ORDER BY id`,
              )
              .bind(row.id, row.id, user, JSON.stringify(takenItems)),
            db.prepare('DELETE FROM chest_items WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))').bind(user, JSON.stringify(takenItems)),
          ]
        : []),
      ...(rowsTaken.length > 0 ? [db.prepare('DELETE FROM chest_goods WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))').bind(user, JSON.stringify(rowsTaken.map((one) => one.id)))] : []),
      ...cardsTaken(db, row.id, cards, context.now),
      db
        .prepare(
          `UPDATE characters SET ${columns.map(([column]) => `${column} = ${addedStacks(column)}, `).join('')}foreign_stacks = ${anyOthers ? addedStacks('foreign_stacks') : 'foreign_stacks'}${scrolled.sql}, version = version + 1 WHERE id = ?`,
        )
        .bind(...columns.map(([, counts]) => JSON.stringify(counts)), ...(anyOthers ? [JSON.stringify(others)] : []), ...scrolled.binds, row.id),
    ],
    changed,
  );
  return answer(context, session, { taken: { count: taken, of: all } });
}

async function answer(context, session, extra = {}) {
  const player = await loadPlayer(context.env.DB, session.userId);
  return json({ chest: await chestView(context.env.DB, player, context.now), character: characterView(player, context.now), ...extra });
}
