// The narrator's introduction (data/tutorial.json): the page shows a card or
// a pointer at its moment and tells the server once it has been read, so it
// is not shown again on another device. "Pomiń wprowadzenie" marks them all
// as read and plays the first steps for the player, so that both ways start
// the game the same. A chapter after the introduction (the Umiejętności) has
// its own "Pomiń", which marks only its lines. "Pomijaj objaśnienia
// narratora" in the settings is the account's (users.skip_tutorials): a new
// character of the account starts as after "Pomiń wprowadzenie", and the
// page passes each chapter as its "Pomiń" does (src/client/narrator.js).

import { buildingLevel, construction, longestHunt, missingFor, upgradeCost } from '../engine/index.js';
import { beginBuilding, completeBuilding } from './camp.js';
import { characterView, loadPlayer, requirePlayer, walletOf } from './characters.js';
import { content, firstSteps, tutorialChapters, tutorialLines, tutorialPart } from './content.js';
import { beginHunt, finishHunt } from './hunts.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';
import { spendTimePoints } from './time.js';

export async function seeTutorial(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  if (row.tutorial === null) throw new ApiError(409, 'no_tutorial', 'Ta postać nie ma wprowadzenia.');
  const db = context.env.DB;
  if (body.skip === true) {
    const chapter = body.chapter ?? null;
    if (chapter !== null && !tutorialChapters.includes(chapter)) throw new ApiError(400, 'invalid_chapter', 'Nie ma takiej części wprowadzenia.');
    await skipPart(db, session.userId, row, chapter, context.now);
  } else {
    if (!tutorialLines.includes(body.card)) throw new ApiError(400, 'invalid_card', 'Nie ma takiej kwestii narratora.');
    // Added in the database, so two cards read at once are both kept.
    await db
      .prepare(
        `UPDATE characters SET tutorial = json_insert(tutorial, '$[#]', ?)
         WHERE id = ? AND tutorial IS NOT NULL AND NOT EXISTS (SELECT 1 FROM json_each(characters.tutorial) WHERE value = ?)`,
      )
      .bind(body.card, row.id, body.card)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// A part skipped (`chapter`, or null for the introduction): its lines are
// read, and the other parts' stay as they were. The introduction skipped
// before its ending has the first steps played for the player first. The
// lines are the data's, in its order, of the part or read by the moment of
// saving, in one statement: with "Pomijaj objaśnienia narratora" the page
// passes the parts due one after another, so another part skipped at the
// same moment stays read too (the code review of 0.1.77).
async function skipPart(db, userId, row, chapter, now) {
  if (chapter === null && !JSON.parse(row.tutorial).includes('ending')) await playFirstSteps(db, userId, now);
  await db
    .prepare(
      `UPDATE characters SET tutorial = (
         SELECT json_group_array(line.value) FROM json_each(?) AS line
         WHERE line.value IN (SELECT value FROM json_each(?)) OR line.value IN (SELECT value FROM json_each(characters.tutorial))
       )
       WHERE id = ? AND tutorial IS NOT NULL`,
    )
    .bind(JSON.stringify(tutorialLines), JSON.stringify(tutorialPart(chapter)), row.id)
    .run();
}

// A new character of an account with "Pomijaj objaśnienia narratora" on
// (characters.js, createCharacter): its introduction is skipped as by
// "Pomiń wprowadzenie", so its first card, which asks about it, never shows.
export async function skipIntroduction(db, userId, now) {
  const player = await loadPlayer(db, userId);
  if (player && player.row.tutorial !== null) await skipPart(db, userId, player.row, null, now);
}

// POST /api/tutorial/settings {skip}: "Pomijaj objaśnienia narratora" on
// the account, for all its characters, or off again. It changes nothing
// read: a part passed stays passed, and those to come show again once off.
export async function setTutorialSettings(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  if (typeof body.skip !== 'boolean') throw new ApiError(400, 'invalid_settings', 'Nieprawidłowe ustawienie.');
  await context.env.DB.prepare('UPDATE users SET skip_tutorials = ? WHERE id = ?').bind(body.skip ? 1 : 0, session.userId).run();
  return json({ skip: body.skip });
}

// What the introduction has the player do (firstSteps), done for them when
// it is skipped: the first exploration, as long as the start allows, skipped
// with Time Points as the narrator asks, its report claimed (levels and the
// first weapon, worn at once), and the first building built. Only the steps
// not done yet are done. The free stat points stay for the player to spend.
// A step the character no longer allows (a conflict, say) ends the steps;
// the introduction is skipped all the same.
async function playFirstSteps(db, userId, now) {
  const { areaId, buildingId } = firstSteps;
  try {
    let player = await loadPlayer(db, userId);
    const reports = await db.prepare('SELECT COUNT(*) AS count FROM reports WHERE character_id = ?').bind(player.row.id).first();
    if (reports.count === 0) {
      if (!player.activity) {
        await beginHunt(db, player, { areaId, minutes: longestHunt(player.row.level, content) }, now);
        player = await loadPlayer(db, userId);
      }
      if (player.activity.ends_at > now && player.row.time_points > 0) {
        await spendTimePoints(db, player, 'activity', now);
        player = await loadPlayer(db, userId);
      }
      if (player.activity.ends_at <= now) {
        await finishHunt(db, player, now);
        player = await loadPlayer(db, userId);
      }
    }
    const building = content.buildingsById[buildingId];
    if (buildingLevel(player.buildings[building.id], now) > 0) return;
    if (!construction(player.buildings, now)) {
      if (missingFor(upgradeCost(building, 1), walletOf(player.row)).length > 0) return;
      await beginBuilding(db, player, building.id, now);
      player = await loadPlayer(db, userId);
    }
    if (construction(player.buildings, now)?.buildingId === building.id) await completeBuilding(db, player, now);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
}
