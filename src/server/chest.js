// The Skrzynia Konta in the camp (DECISIONS.md, "Skrzynia Konta"): a few
// places for items that all the characters of an account share (the
// author: "Skrzynię Konta wspólną dla wszystkich postaci. Mała liczba
// slotów na przedmioty."). Items only: gold, resources, herbs, potions and
// materials stay with their character (177 A). A character puts and takes
// at home, as every change of the bag. The character that put an item in
// takes it back as it was; another one gets it marked as from the chest
// (data.chest): worn from its Tier as every item (DECISIONS.md, "Przedmioty
// według Tieru") and left out of its Encyklopedia (ownDiscoveries in the
// engine).

import { bagCapacity, campLevels, canUse, itemView } from '../engine/index.js';
import { bagPlaces, characterView, loadPlayer, requireOffRack, requirePlayer } from './characters.js';
import { content } from './content.js';
import { withoutFavorites } from './favorites.js';
import { ApiError, json, readJson } from './http.js';

const slots = () => content().balance.account.chestSlots;

// The chest as the character played sees it: each item with the name of
// the character that put it in, and whether it comes back to this one as
// its own.
async function chestView(db, player) {
  const rows = await db
    .prepare('SELECT c.id, c.character_id, c.data, o.name FROM chest_items c LEFT JOIN characters o ON o.id = c.character_id WHERE c.user_id = ? ORDER BY c.id')
    .bind(player.row.user_id)
    .all();
  return {
    slots: slots(),
    items: rows.results.map((row) => {
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
  };
}

// GET /api/chest
export async function getChest(context) {
  const { player } = await requirePlayer(context);
  return json({ chest: await chestView(context.env.DB, player) });
}

// POST /api/chest/put { itemId }: an item from the bag into the chest, while
// it has room. One statement checks the room and the item and the next
// removes the item only once the chest has it, so two taps at once cannot
// overfill the chest.
export async function putInChest(context) {
  const { session, player } = await requirePlayer(context);
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
    // out as a new item, of whichever character takes it.
    db
      .prepare(`UPDATE characters SET favorites = ${withoutFavorites} WHERE id = ? AND EXISTS (SELECT 1 FROM chest_items WHERE user_id = ? AND item_id = ? AND put_at = ?)`)
      .bind(JSON.stringify([item.id]), player.row.id, session.userId, item.id, now),
  ]);
  if (put.meta.changes !== 1) throw full();
  return answer(context, session);
}

// POST /api/chest/take { id }: an item from the chest into the bag, while the
// bag has room; one the character put in itself comes back as it was.
export async function takeFromChest(context) {
  const { session, player } = await requirePlayer(context);
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
  ]);
  return answer(context, session);
}

async function answer(context, session) {
  const player = await loadPlayer(context.env.DB, session.userId);
  return json({ chest: await chestView(context.env.DB, player), character: characterView(player, context.now) });
}
