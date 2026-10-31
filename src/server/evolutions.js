// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa"): the choice at class level 50 of one of the two paths'
// evolutions, for good. On the test version "Testuj ewolucję" takes any
// evolution of the class at any class level and keeps the skills it had, so
// the test can be undone. Like skills, an evolution is taken only at home,
// and only if the character is as read (its version). After it the stat
// points can be reset once, for free, decided at once (decidePointsReset).
// Where the deployment has the evolutions off (features.js) there are none.

import { evolutionChoices, evolutionView, evolveBlock, evolvedSkills, spentPoints } from '../engine/index.js';
import { characterView, engineCharacter, loadPlayer, requireBuildPlayer, requireIdlePlayer } from './characters.js';
import { content } from './content.js';
import { evolutionsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { evolutionTestsFor } from './test-mode.js';

const conflict = () => new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');

function requireEvolutions() {
  if (!evolutionsOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
}

function requireTests(context, session) {
  if (!evolutionTestsFor(context.env, session.user.login)) throw new ApiError(403, 'no_tests', 'Test ewolucji działa tylko na wersji testowej.');
}

// POST /api/evolution { evolutionId, test }: take an evolution; `test` only
// on the test version. With stat points spent, their free reset waits for
// the player's decision.
export async function takeEvolution(context) {
  requireEvolutions();
  const { session, player } = await requireBuildPlayer(context);
  const body = await readJson(context.request);
  const test = body.test === true;
  if (test) requireTests(context, session);
  const evolutionId = typeof body.evolutionId === 'string' ? body.evolutionId : '';
  const character = engineCharacter(player.row);
  const block = evolveBlock(character, evolutionId, content, { test });
  if (block) throw new ApiError(block.code === 'unknown_evolution' ? 400 : 409, block.code, block.message);
  const db = context.env.DB;
  const result = await db
    .prepare(
      'UPDATE characters SET evolution = ?, skills = ?, evolution_undo = ?, evolution_reset = ?, version = version + 1 WHERE id = ? AND version = ? AND evolution IS NULL',
    )
    .bind(
      evolutionId,
      JSON.stringify(evolvedSkills(evolutionId, content)),
      test ? player.row.skills : null,
      spentPoints(character) > 0 ? 1 : 0,
      player.row.id,
      player.row.version,
    )
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ evolution: evolutionView(content.evolutionsById[evolutionId], content), character: characterView(fresh, context.now) });
}

// GET /api/evolution/test: every evolution of the class to try (test
// version).
export async function testEvolutions(context) {
  requireEvolutions();
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  const character = engineCharacter(player.row);
  return json({ evolutions: evolutionChoices(character, content, { all: true }).map((evolution) => evolutionView(evolution, content)) });
}

// POST /api/evolution/points { reset }: the free reset of the stat points
// after an evolution (the author: "darmowe jednorazowo"): all the points
// back in the pool, or kept as they are; either way the offer is gone.
// Asked again (from another device, say), nothing changes. On the test
// version the points before the reset wait for "Cofnij ewolucję".
export async function decidePointsReset(context) {
  requireEvolutions();
  const { session, player } = await requireBuildPlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  if (!row.evolution_reset) return json({ reset: false, character: characterView(player, context.now) });
  const reset = body.reset === true;
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET points = ?, points_undo = ?, evolution_reset = 0, version = version + 1 WHERE id = ? AND version = ?')
    .bind(reset ? '{}' : row.points, reset && row.evolution_undo ? row.points : null, row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ reset, character: characterView(fresh, context.now) });
}

// POST /api/evolution/undo: back to the class with the skills it had before
// a test evolution, and the stat points if they were reset (test version).
// POST /api/evolution/test-level: on the test version the character at the
// first evolution's class level at once (the author: "Zmień moją postać na
// testowym by miała 50 poziom klasy, bo nie chce mi się przeklikiwać
// tego"); a test evolution is undone first, so the evolution is then chosen
// as in the game. A character that took one for good stays as it is.
export async function testClassLevel(context) {
  requireEvolutions();
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  const row = player.row;
  if (row.evolution && !row.evolution_undo) throw new ApiError(409, 'evolved', 'Ta postać przeszła już ewolucję.');
  const level = content.balance.progression.classEvolutionLevels[0];
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET class_level = MAX(class_level, ?), class_xp = 0,
         evolution = CASE WHEN evolution_undo IS NULL THEN evolution END, skills = COALESCE(evolution_undo, skills), evolution_undo = NULL,
         points = COALESCE(points_undo, points), points_undo = NULL, evolution_reset = CASE WHEN evolution_undo IS NULL THEN evolution_reset ELSE 0 END,
         version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(level, row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ character: characterView(fresh, context.now) });
}

export async function undoEvolution(context) {
  requireEvolutions();
  const { session, player } = await requireBuildPlayer(context);
  requireTests(context, session);
  if (!player.row.evolution_undo) throw new ApiError(409, 'no_test_evolution', 'Cofnąć można tylko ewolucję z testu.');
  const db = context.env.DB;
  const result = await db
    .prepare(
      'UPDATE characters SET evolution = NULL, skills = evolution_undo, evolution_undo = NULL, points = COALESCE(points_undo, points), points_undo = NULL, evolution_reset = 0, version = version + 1 WHERE id = ? AND version = ?',
    )
    .bind(player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ character: characterView(fresh, context.now) });
}
