// "Pomiń czas" in test mode (test-mode.js). For an account without test mode,
// and with test mode off, these routes do not exist.

import { construction } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, requirePlayer } from './characters.js';
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

// "Pomiń czas" in the camp: the building being upgraded is ready now. With
// nothing being built, the stores of the production buildings are full.
export async function skipBuilding(context) {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const db = context.env.DB;
  const now = context.now;
  const running = construction(player.buildings, now);
  if (running) {
    // Two seconds into the past, like the hunt above; a production building
    // waiting for the end of the upgrade starts with it.
    const shift = Math.max(0, running.endsAt - (now - 2000));
    await db
      .prepare(
        `UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?,
           collected_at = CASE WHEN collected_at = ends_at THEN collected_at - ? ELSE collected_at END
         WHERE character_id = ? AND building_id = ?`,
      )
      .bind(shift, shift, shift, player.row.id, running.buildingId)
      .run();
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
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}
