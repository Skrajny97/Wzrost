// The Przechowalnia of the Warsztat and the Szlifiernia (842, the author,
// 12.11.2026: "Niech w warsztacie będzie przechowalnia niech to nie trafia
// od razu do plecaka i można od razu z pozycji przechowalni rozbierać i
// sprzedawać wyprodukowane albo wlozyc do plecaka jesli jest miejsce"): what
// the orders of the character and of its Awatar make waits here, out of the
// bag and with no limit (storage_items, migration 0120; workshop.js and
// jewelcraft.js put it there). The items marked on the page ({ ids }) go to
// the bag, all of them while it has room for all, to the scrapper for the
// bag's price, or onto the Stół rozbiórki, as the bag's "Rozbierz kilka"
// does (salvageOrders in crafting.js). Each counts only the items still
// there, so two taps at once do it once.

import { bagCapacity, campBonus, campLevels, sellPrice } from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { content } from './content.js';
import { bagPlaces, characterView, loadPlayer, requirePlayer } from './characters.js';
import { markedIds, salvageOrders } from './crafting.js';
import { ApiError, json, readJson } from './http.js';

// The character and the items it marked, all of them still in its
// Przechowalnia.
async function marked(context) {
  const { session, player } = await requirePlayer(context);
  const ids = markedIds(await readJson(context.request), 'Zaznacz przedmioty w Przechowalni.');
  const items = ids.map((id) => player.stored.find((item) => item.id === id));
  if (items.includes(undefined)) throw new ApiError(404, 'item_not_found', 'Któregoś z tych przedmiotów nie ma już w Przechowalni.');
  return { session, player, ids, list: JSON.stringify(ids), items };
}

// The marked rows of the character's Przechowalnia, as SQL after WHERE.
const MARKED = 'character_id = ? AND id IN (SELECT value FROM json_each(?))';

const answer = async (context, session, result) => json({ ...result, character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });

// "Do plecaka": the marked items into the bag, all of them or none, while
// it has room for every one. Saved only while the character is as read and
// every item is still there, so the room counted is the bag's now.
export async function takeStored(context) {
  const { session, player, ids, list, items } = await marked(context);
  const { row } = player;
  const free = bagCapacity(campLevels(player.buildings, context.now, content()), content()) - bagPlaces(player);
  if (items.length > free) {
    throw new ApiError(409, 'bag_full', `Na zaznaczone przedmioty (${items.length}) brakuje miejsca w plecaku: wolnych miejsc jest ${Math.max(0, free)}.`);
  }
  const db = context.env.DB;
  await atomically(db, [
    sameVersion(db, row),
    assertion(db, `(SELECT COUNT(*) FROM storage_items WHERE ${MARKED}) = ?`, [row.id, list, ids.length]),
    db.prepare('UPDATE characters SET version = version + 1 WHERE id = ? AND version = ?').bind(row.id, row.version),
    db.prepare(`INSERT INTO items (character_id, slot, data, created_at) SELECT character_id, NULL, data, created_at FROM storage_items WHERE ${MARKED} ORDER BY id`).bind(row.id, list),
    db.prepare(`DELETE FROM storage_items WHERE ${MARKED}`).bind(row.id, list),
  ]);
  return answer(context, session, { taken: { count: items.length } });
}

// A number written into a query, which must be a whole one.
const whole = (value) => {
  if (!Number.isSafeInteger(value)) throw new Error(`Not a whole number: ${value}`);
  return value;
};

// "Sprzedaj": the scrapper buys the marked items for the bag's price, with
// the Skup złomu's bonus (sellPrice). The gold is summed in the batch over
// the rows still there, as the bag's sale does (soldGold in inventory.js),
// so an item sold twice at once pays once.
export async function sellStored(context) {
  const { session, player, list, items } = await marked(context);
  const { row } = player;
  const bonus = campBonus(campLevels(player.buildings, context.now, content()), 'sellPrice', content());
  const prices = items.map((item) => `WHEN ${whole(item.id)} THEN ${whole(sellPrice(item, content(), bonus))}`).join(' ');
  const db = context.env.DB;
  const [, gone] = await db.batch([
    db
      .prepare(`UPDATE characters SET gold = gold + (SELECT COALESCE(SUM(CASE id ${prices} ELSE 0 END), 0) FROM storage_items WHERE ${MARKED}), version = version + 1 WHERE id = ?`)
      .bind(row.id, list, row.id),
    db.prepare(`DELETE FROM storage_items WHERE ${MARKED}`).bind(row.id, list),
  ]);
  const count = gone.meta.changes;
  const gold = count === items.length ? items.reduce((sum, item) => sum + sellPrice(item, content(), bonus), 0) : 0;
  return answer(context, session, { sold: { count, gold } });
}

// "Rozbierz": the marked items onto the Stół rozbiórki, as the bag's
// "Rozbierz kilka" (salvageOrders in crafting.js), all of them or none; an
// order taken off the queue gives them back here.
export async function salvageStored(context) {
  const { session, player, items } = await marked(context);
  return answer(context, session, { salvaged: await salvageOrders(context, player, items, { stored: true }) });
}
