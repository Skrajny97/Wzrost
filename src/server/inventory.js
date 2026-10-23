// Wearing, taking off and throwing away items.

import { content } from './content.js';
import { characterView, loadPlayer, requireIdlePlayer } from './characters.js';
import { ApiError, json } from './http.js';

function findItem(player, id) {
  const item = player.items.find((candidate) => String(candidate.id) === id);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  return item;
}

async function respond(context, session) {
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function equipItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'already_equipped', 'Ten przedmiot jest już założony.');
  if (content.slotsById[item.slot].locked) throw new ApiError(403, 'slot_locked', 'Ten slot jest jeszcze zablokowany.');

  // Whatever was in the slot goes back to the bag first.
  const db = context.env.DB;
  await db.batch([
    db.prepare('UPDATE items SET slot = NULL WHERE character_id = ? AND slot = ?').bind(player.row.id, item.slot),
    db.prepare('UPDATE items SET slot = ? WHERE id = ? AND character_id = ?').bind(item.slot, item.id, player.row.id),
  ]);
  return respond(context, session);
}

export async function unequipItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (!item.equippedSlot) throw new ApiError(409, 'not_equipped', 'Ten przedmiot nie jest założony.');
  await context.env.DB.prepare('UPDATE items SET slot = NULL WHERE id = ? AND character_id = ?')
    .bind(item.id, player.row.id)
    .run();
  return respond(context, session);
}

export async function discardItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  await context.env.DB.prepare('DELETE FROM items WHERE id = ? AND character_id = ?').bind(item.id, player.row.id).run();
  return respond(context, session);
}
