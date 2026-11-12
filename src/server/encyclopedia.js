// The Encyklopedia (DECISIONS.md, "Encyklopedia"; encyclopedia.js in the
// engine): what the character has got, by tabs and tiers, and its chests.
// What the character holds is written down with every request
// (settleDiscoveries in characters.js); a chest opens once, only if the
// character is as read (its version), so two taps give one reward. Where
// the game has Talia Systemu (CARDS, cards.js) its tab "Karty" shows the
// collection by land with its bonus (card-collection.js in the engine);
// elsewhere there is no such tab.

import { cardCollectionView, encyclopediaChest, encyclopediaView } from '../engine/index.js';
import { cardCollection } from './cards.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { cardsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';

const recordOf = (row) => ({
  discovered: JSON.parse(row.discovered ?? '{}'),
  claimed: JSON.parse(row.encyclopedia ?? '[]'),
  met: JSON.parse(row.met ?? '[]'),
  levels: { level: row.level, classLevel: row.class_level, professions: JSON.parse(row.professions ?? '{}') },
});

// The book of a character's row: its tabs, with the cards' where the game
// has them.
async function bookOf(db, row) {
  const book = encyclopediaView(recordOf(row), content());
  if (!cardsOn() || !content().cards) return { ...book, tabs: book.tabs.filter((tab) => tab.id !== 'cards') };
  return { ...book, cards: cardCollectionView(await cardCollection(db, row.id), content()) };
}

// GET /api/encyclopedia: every tab with its entries and chests.
export async function readEncyclopedia(context) {
  const { player } = await requirePlayer(context);
  return json({ encyclopedia: await bookOf(context.env.DB, player.row) });
}

// POST /api/encyclopedia/chest {id}: a chest of a full set or of a count
// of discoveries.
export async function openEncyclopediaChest(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  const record = recordOf(row);
  const found = encyclopediaChest(typeof body.id === 'string' ? body.id : '', record.discovered, record.claimed, content());
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
  return json({ chest: { gold, timePoints, systemPoints }, encyclopedia: await bookOf(db, fresh.row), character: characterView(fresh, context.now) });
}
