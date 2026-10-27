// The Bestiariusz of an inner region: its creatures (areaDangers in the
// engine), each by name once met, and a chest that opens once all are, with
// gold, Punkty Czasu and Punkty Systemu (bestiaryChest). Each chest opens
// once, and only if the character is as read (its version), so two taps
// give one reward.

import { bestiaryChest, bestiaryFull } from '../engine/index.js';
import { content } from './content.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// { area }: the chest of an inner region whose creatures are all met.
export async function openBestiaryChest(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const area = typeof body.area === 'string' ? content.areasById[body.area] : undefined;
  if (!area) throw new ApiError(404, 'no_area', 'Nie ma takiego regionu.');
  const row = player.row;
  const opened = JSON.parse(row.bestiary ?? '[]');
  if (opened.includes(area.id)) throw new ApiError(409, 'opened', 'Ta skrzynia jest już otwarta.');
  if (!bestiaryFull(area, JSON.parse(row.met ?? '[]'), content)) {
    throw new ApiError(409, 'not_ready', 'Skrzynia otworzy się, gdy poznasz wszystkie stwory tego regionu.');
  }
  const chest = bestiaryChest(area, content);
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, bestiary = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(chest.gold, chest.timePoints, chest.systemPoints, JSON.stringify([...opened, area.id]), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  return json({ chest, character: characterView(await loadPlayer(db, session.userId), context.now) });
}
