// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa"): the choice at class level 50 of one of the two paths'
// evolutions, for good. On the test version "Testuj ewolucję" takes any
// evolution of the class at any class level and keeps the skills it had, so
// the test can be undone. Like skills, an evolution is taken only at home,
// and only if the character is as read (its version).

import { evolutionChoices, evolutionView, evolveBlock, evolvedSkills } from '../engine/index.js';
import { characterView, engineCharacter, loadPlayer, requireIdlePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { evolutionTestsFor } from './test-mode.js';

const conflict = () => new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');

function requireTests(context, session) {
  if (!evolutionTestsFor(context.env, session.user.login)) throw new ApiError(403, 'no_tests', 'Test ewolucji działa tylko na wersji testowej.');
}

// POST /api/evolution { evolutionId, test }: take an evolution; `test` only
// on the test version.
export async function takeEvolution(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const test = body.test === true;
  if (test) requireTests(context, session);
  const evolutionId = typeof body.evolutionId === 'string' ? body.evolutionId : '';
  const character = engineCharacter(player.row);
  const block = evolveBlock(character, evolutionId, content, { test });
  if (block) throw new ApiError(block.code === 'unknown_evolution' ? 400 : 409, block.code, block.message);
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET evolution = ?, skills = ?, evolution_undo = ?, version = version + 1 WHERE id = ? AND version = ? AND evolution IS NULL')
    .bind(evolutionId, JSON.stringify(evolvedSkills(evolutionId, content)), test ? player.row.skills : null, player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ evolution: evolutionView(content.evolutionsById[evolutionId], content), character: characterView(fresh, context.now) });
}

// GET /api/evolution/test: every evolution of the class to try (test
// version).
export async function testEvolutions(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  const character = engineCharacter(player.row);
  return json({ evolutions: evolutionChoices(character, content, { all: true }).map((evolution) => evolutionView(evolution, content)) });
}

// POST /api/evolution/undo: back to the class with the skills it had before
// a test evolution (test version).
export async function undoEvolution(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  if (!player.row.evolution_undo) throw new ApiError(409, 'no_test_evolution', 'Cofnąć można tylko ewolucję z testu.');
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET evolution = NULL, skills = evolution_undo, evolution_undo = NULL, version = version + 1 WHERE id = ? AND version = ?')
    .bind(player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ character: characterView(fresh, context.now) });
}
