// The narrator's introduction (data/tutorial.json): the page shows a card or
// a pointer at its moment and tells the server once it has been read, so it
// is not shown again on another device. "Pomiń wprowadzenie" marks them all
// as read and plays the first steps for the player, so that both ways start
// the game the same. A chapter after the introduction (the Umiejętności) has
// its own "Pomiń", which marks only its lines.

import { buildingLevel, construction, longestHunt, missingFor, upgradeCost } from '../engine/index.js';
import { beginBuilding, completeBuilding } from './camp.js';
import { characterView, loadPlayer, requirePlayer, walletOf } from './characters.js';
import { content, firstSteps, tutorialChapters, tutorialLines, tutorialPart } from './content.js';
import { beginHunt, finishHunt } from './hunts.js';
import { ApiError, json, readJson } from './http.js';
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
    const read = JSON.parse(row.tutorial);
    if (chapter === null && !read.includes('ending')) await playFirstSteps(db, session.userId, context.now);
    // The part's lines are read, and the other parts' stay as they were.
    const part = tutorialPart(chapter);
    const kept = tutorialLines.filter((id) => part.includes(id) || read.includes(id));
    await db.prepare('UPDATE characters SET tutorial = ? WHERE id = ?').bind(JSON.stringify(kept), row.id).run();
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
