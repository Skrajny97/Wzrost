// Test mode (TEST_MODE "on" in wrangler.jsonc): a way to try the game without
// waiting. With test mode off, these routes do not exist.

import { construction } from '../engine/index.js';
import { characterView, currentHp, loadPlayer, requirePlayer } from './characters.js';
import { ApiError, json } from './http.js';

export const testMode = (env) => env.TEST_MODE === 'on';

// "Pomiń czas": the current wait ends now. A hunt is moved into the past, so
// its report can be claimed at once; its result still comes from the seed
// saved at the start. Without a hunt, HP is full again.
export async function skipTime(context) {
  if (!testMode(context.env)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const now = context.now;
  const activity = player.activity;
  if (activity) {
    // Two seconds into the past, because the page shows the report a second after the end.
    const shift = Math.max(0, activity.ends_at - (now - 2000));
    await db
      .prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ? AND started_at = ?')
      .bind(shift, shift, player.row.id, activity.started_at)
      .run();
  } else {
    const { maxHp } = currentHp(player, now);
    await db
      .prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?')
      .bind(maxHp, now, player.row.id)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

// "Pomiń czas" in the camp: the building being upgraded is ready now.
export async function skipBuilding(context) {
  if (!testMode(context.env)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const now = context.now;
  const running = construction(player.buildings, now);
  if (running) {
    // Two seconds into the past, like the hunt above.
    const shift = Math.max(0, running.endsAt - (now - 2000));
    await db
      .prepare('UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ? AND building_id = ?')
      .bind(shift, shift, player.row.id, running.buildingId)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}
