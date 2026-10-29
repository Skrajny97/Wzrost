// The Encyklopedia (DECISIONS.md, "Encyklopedia"; encyclopedia.js in the
// engine): what the character has got, by tabs and tiers, and its chests.
// What the character holds is written down with every request
// (settleDiscoveries in characters.js); a chest opens once, only if the
// character is as read (its version), so two taps give one reward.

import { encyclopediaChest, encyclopediaView } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';

const recordOf = (row) => ({
  discovered: JSON.parse(row.discovered ?? '{}'),
  claimed: JSON.parse(row.encyclopedia ?? '[]'),
  met: JSON.parse(row.met ?? '[]'),
  levels: { level: row.level, classLevel: row.class_level, professions: JSON.parse(row.professions ?? '{}') },
});

// GET /api/encyclopedia: every tab with its entries and chests.
export async function readEncyclopedia(context) {
  const { player } = await requirePlayer(context);
  return json({ encyclopedia: encyclopediaView(recordOf(player.row), content) });
}

// POST /api/encyclopedia/chest {id}: a chest of a full set or of a count
// of discoveries.
export async function openEncyclopediaChest(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  const record = recordOf(row);
  const found = encyclopediaChest(typeof body.id === 'string' ? body.id : '', record.discovered, record.claimed, content);
  if (found.code === 'no_chest') throw new ApiError(404, 'no_chest', 'Nie ma takiej skrzyni.');
  if (found.code === 'opened') throw new ApiError(409, 'opened', 'Ta skrzynia jest już otwarta.');
  if (found.code === 'not_ready') throw new ApiError(409, 'not_ready', `Skrzynia otworzy się po odkryciu wszystkiego, czego wymaga (${found.entry.have} z ${found.entry.need}).`);
  const { gold, timePoints, systemPoints = 0 } = found.chest;
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, encyclopedia = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(gold, timePoints, systemPoints, JSON.stringify([...record.claimed, found.entry.id]), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const fresh = await loadPlayer(db, session.userId);
  return json({ chest: { gold, timePoints, systemPoints }, encyclopedia: encyclopediaView(recordOf(fresh.row), content), character: characterView(fresh, context.now) });
}
