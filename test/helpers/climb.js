// A character strong enough to win in the Wieże in a test: since 0.2.11
// floor 1 is of level 50 and the System makes its creatures stronger (three
// times since 0.2.12), so a character without gear loses there. The
// realistic player of tools/difficulty-sim.mjs at level 200: its warrior
// with the main path's evolution, skills and points, and its gear.

import { playerOf } from '../../tools/difficulty-sim.mjs';
import { content } from './content.js';

export const strongClimber = () => {
  const { character, equipped } = playerOf('realistic', 'warrior', 200, content);
  return { character, equipped };
};

export const climbingGear = () => strongClimber().equipped;

export async function wearClimbingGear(database, characterId) {
  const insert = database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)');
  await database.batch(climbingGear().map((item) => insert.bind(characterId, item.slot, JSON.stringify(item))));
}

// The stored character made that warrior, with its gear worn.
export async function makeClimber(database, characterId) {
  const { character } = strongClimber();
  await database
    .prepare('UPDATE characters SET level = ?, class_level = ?, points = ?, skills = ?, evolution = ? WHERE id = ?')
    .bind(character.level, character.classLevel, JSON.stringify(character.points), JSON.stringify(character.skills), character.evolution, characterId)
    .run();
  await wearClimbingGear(database, characterId);
}
