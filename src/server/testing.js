// "Pomiń czas" in test mode (test-mode.js), and the narrator's Umiejętności
// and Profesje once more. For an account without test mode, and with test
// mode off, these routes do not exist.

import { construction } from '../engine/index.js';
import { content, tutorialPart } from './content.js';
import { completeBuilding } from './camp.js';
import { characterView, currentHp, loadPlayer, loadSettled, requirePlayer } from './characters.js';
import { ApiError, json } from './http.js';
import { testMode, testModeFor } from './test-mode.js';

const notFound = () => new ApiError(404, 'not_found', 'Nie znaleziono.');

// "Pomiń czas": the current wait ends now. A hunt is moved into the past, so
// its report can be claimed at once; its result still comes from the seed
// saved at the start. Without a hunt, HP is full again.
export async function skipTime(context) {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const db = context.env.DB;
  const now = context.now;
  const activity = player.activity;
  // Two seconds into the past, because the page shows the report a second
  // after the end. The work of the Awatar Systemu (avatar.js) ends with it.
  const end = (table, work) => {
    const shift = Math.max(0, work.ends_at - (now - 2000));
    return db
      .prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ? AND started_at = ?`)
      .bind(shift, shift, player.row.id, work.started_at)
      .run();
  };
  if (player.avatarActivity) await end('avatar_activities', player.avatarActivity);
  if (activity) {
    await end('activities', activity);
  } else {
    const { maxHp } = currentHp(player, now);
    await db
      .prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?')
      .bind(maxHp, now, player.row.id)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

// "Pomiń czas" in the camp: the building being upgraded is ready now. With
// nothing being built, the stores of the production buildings are full.
export async function skipBuilding(context) {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const db = context.env.DB;
  const now = context.now;
  if (construction(player.buildings, now)) {
    await completeBuilding(db, player, now);
  } else {
    const filling = content.buildings.filter((building) => building.effect.kind === 'production' && player.buildings[building.id]);
    if (filling.length > 0) {
      await db.batch(
        filling.map((building) => {
          const { level } = player.buildings[building.id];
          const full = now - building.effect.storageHours * level * 3600000 - 1000;
          return db.prepare('UPDATE buildings SET collected_at = ? WHERE character_id = ? AND building_id = ?').bind(full, player.row.id, building.id);
        }),
      );
    }
  }
  // The next waiting build starts at once.
  return json({ character: characterView(await loadSettled(db, session.userId, now), now) });
}

// The narrator's Umiejętności chapter from the start, to check it: the
// skills learned are forgotten, so their points come back, and the chapter's
// lines are unread again. It starts on any screen but a report.
export const repeatSkillsTour = (context) => repeatChapter(context, 'skills', "skills = '{}', ");

// The Profesje chapter from the start: only its lines are unread again, and
// the professions keep their levels. It starts on any screen but a report or
// the character's, after the Umiejętności chapter if that one waits too.
export const repeatProfessionsTour = (context) => repeatChapter(context, 'professions');

// A chapter's lines unread again, with `reset` (SQL assignments) done too.
async function repeatChapter(context, chapterId, reset = '') {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const row = player.row;
  if (row.tutorial === null) throw new ApiError(409, 'no_tutorial', 'Ta postać nie ma wprowadzenia.');
  const db = context.env.DB;
  const chapter = new Set(tutorialPart(chapterId));
  const read = JSON.parse(row.tutorial).filter((id) => !chapter.has(id));
  await db
    .prepare(`UPDATE characters SET ${reset}tutorial = ?, version = version + 1 WHERE id = ?`)
    .bind(JSON.stringify(read), row.id)
    .run();
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}
