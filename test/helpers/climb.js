// Gear for a character that has to win in the Wieże in a test: since 0.2.11
// floor 1 is of level 50 and the System doubles its creatures, so a
// character without gear loses there. The realistic player's kit of
// tools/difficulty-sim.mjs at level 200 (no evolution), worn.

import { playerOf } from '../../tools/difficulty-sim.mjs';
import { content } from './content.js';

export const climbingGear = () => playerOf('realistic-noevo', 'warrior', 200, content).equipped;

export async function wearClimbingGear(database, characterId) {
  const insert = database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)');
  await database.batch(climbingGear().map((item) => insert.bind(characterId, item.slot, JSON.stringify(item))));
}
