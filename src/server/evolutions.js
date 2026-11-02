// Class evolutions (evolutions.js in the engine; DECISIONS.md, "Ewolucje:
// budowa" and "Druga ewolucja klas"): the choice at class level 50 of one of
// the two paths' evolutions, for good, and at class level 100 the one form
// that evolution grows into. On the test version "Testuj ewolucję" takes
// any evolution of the class, or the second form of the one the character
// has, at any class level and keeps the skills it had, so the test can be
// undone. Like skills, an evolution is taken only at home, and only if the
// character is as read (its version). After the first evolution the stat
// points can be reset once, for free, decided at once (decidePointsReset).
// Where the deployment has the evolutions off (features.js) there are none.

import { evolutionChoices, evolutionOf, evolutionView, evolveBlock, evolvedSkills, nextFormOf, spentPoints } from '../engine/index.js';
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

// POST /api/evolution { evolutionId, test }: take an evolution, or the
// second form of the one the character has; `test` only on the test
// version. With stat points spent, the first evolution's free reset waits
// for the player's decision; a second form keeps the points as they are (a
// reset still waiting stays). A test keeps the skills from before the
// first test, so "Cofnij ewolucję" goes back to them.
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
  const target = content.evolutionsById[evolutionId];
  const reset = target.from ? (player.row.evolution_reset ?? 0) : spentPoints(character) > 0 ? 1 : 0;
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET evolution = ?, skills = ?, evolution_undo = CASE WHEN ? THEN COALESCE(evolution_undo, skills) ELSE evolution_undo END,
         evolution_reset = ?, version = version + 1
       WHERE id = ? AND version = ? AND evolution IS ?`,
    )
    .bind(evolutionId, JSON.stringify(evolvedSkills(evolutionId, content)), test ? 1 : 0, reset, player.row.id, player.row.version, target.from ?? null)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ evolution: evolutionView(target, content, character), character: characterView(fresh, context.now) });
}

// GET /api/evolution/test: every evolution of the class to try, or the
// second form of the one the character has (test version).
export async function testEvolutions(context) {
  requireEvolutions();
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  const character = engineCharacter(player.row);
  const current = evolutionOf(character, content);
  const list = current ? [nextFormOf(current, content)].filter(Boolean) : evolutionChoices(character, content, { all: true });
  return json({ evolutions: list.map((evolution) => evolutionView(evolution, content, character)) });
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

// Where "Cofnij ewolucję" goes back to: the evolution whose skills were
// kept before the test (a first evolution taken for good, before a test of
// its second form), or the class.
function evolutionBefore(kept) {
  const skills = JSON.parse(kept ?? '{}');
  return Object.keys(skills).map((id) => content.skillsById[id]?.evolution).find(Boolean) ?? null;
}

// POST /api/evolution/test-level: on the test version the character at the
// first evolution's class level at once (the author: "Zmień moją postać na
// testowym by miała 50 poziom klasy, bo nie chce mi się przeklikiwać
// tego"); a test evolution is undone first, so the evolution is then chosen
// as in the game. A character that took one for good stays as it is. With
// ?level=100 (the second evolution's level), a character with a first
// evolution, taken for good or tried, gets that class level and keeps it,
// so its second form is then taken as in the game.
export async function testClassLevel(context) {
  requireEvolutions();
  const { session, player } = await requireIdlePlayer(context);
  requireTests(context, session);
  const row = player.row;
  const levels = content.balance.progression.classEvolutionLevels;
  const db = context.env.DB;
  const asked = Number(new URL(context.request.url).searchParams.get('level'));
  if (asked === levels[1]) {
    const current = evolutionOf(engineCharacter(row), content);
    if (!current || current.from) throw new ApiError(409, 'not_first', 'Najpierw potrzebna jest pierwsza ewolucja, bez drugiej.');
    const raised = await db
      .prepare('UPDATE characters SET class_level = MAX(class_level, ?), class_xp = 0, version = version + 1 WHERE id = ? AND version = ?')
      .bind(asked, row.id, row.version)
      .run();
    if (raised.meta.changes !== 1) throw conflict();
    const fresh = await loadPlayer(db, session.userId);
    return json({ character: characterView(fresh, context.now) });
  }
  // What stays once the tests are undone: an evolution taken for good stays.
  if (row.evolution_undo ? evolutionBefore(row.evolution_undo) : row.evolution) throw new ApiError(409, 'evolved', 'Ta postać przeszła już ewolucję.');
  const result = await db
    .prepare(
      `UPDATE characters SET class_level = MAX(class_level, ?), class_xp = 0,
         evolution = CASE WHEN evolution_undo IS NULL THEN evolution END, skills = COALESCE(evolution_undo, skills), evolution_undo = NULL,
         points = COALESCE(points_undo, points), points_undo = NULL, evolution_reset = CASE WHEN evolution_undo IS NULL THEN evolution_reset ELSE 0 END,
         version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(levels[0], row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ character: characterView(fresh, context.now) });
}

// POST /api/evolution/undo: back to where the test started, the class or
// the first evolution taken for good, with the skills it had then, and the
// stat points if they were reset (test version). Back at a first
// evolution taken for good, its free reset of the stat points, if still
// waiting, waits on.
export async function undoEvolution(context) {
  requireEvolutions();
  const { session, player } = await requireBuildPlayer(context);
  requireTests(context, session);
  if (!player.row.evolution_undo) throw new ApiError(409, 'no_test_evolution', 'Cofnąć można tylko ewolucję z testu.');
  const back = evolutionBefore(player.row.evolution_undo);
  const db = context.env.DB;
  const result = await db
    .prepare(
      'UPDATE characters SET evolution = ?, skills = evolution_undo, evolution_undo = NULL, points = COALESCE(points_undo, points), points_undo = NULL, evolution_reset = ?, version = version + 1 WHERE id = ? AND version = ?',
    )
    .bind(back, back ? (player.row.evolution_reset ?? 0) : 0, player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) throw conflict();
  const fresh = await loadPlayer(db, session.userId);
  return json({ character: characterView(fresh, context.now) });
}
