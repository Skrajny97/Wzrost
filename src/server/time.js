// Punkty Czasu (Time Points): 1 point skips 1 minute of the current wait, an
// exploration, resting or a camp upgrade. They come only from playing (the
// narrator, levels and rare finds) and are never sold. With fewer points than
// minutes left, the wait gets as much shorter as the points allow.

import { construction, regenPerMinute } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, requirePlayer } from './characters.js';
import { ApiError, json, readJson } from './http.js';

const MINUTE = 60000;
// The page shows a report a second after the end, so a wait skipped to its
// end ends two seconds back, as with "Pomiń czas" in test mode.
const SLACK = 2000;

const nothing = (message) => new ApiError(409, 'nothing_to_skip', message);

export async function skipWithTimePoints(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  if (row.time_points < 1) throw new ApiError(409, 'no_time_points', 'Nie masz Punktów Czasu.');
  const now = context.now;
  const db = context.env.DB;
  const plan = { activity: skipActivity, rest: skipRest, build: skipBuild }[body.target];
  if (!plan) throw new ApiError(400, 'invalid_target', 'Nie wiadomo, co przewinąć.');
  const { spent, statements } = plan(db, player, now);
  // The first statement pays, only if the character and the wait are as seen
  // here; the second moves the wait, only if the first paid. Two taps at once
  // pay and skip once.
  const [paid] = await db.batch(statements);
  if (paid.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ spent, character: characterView(await loadPlayer(db, session.userId), now) });
}

// Minutes the points buy, and how far the wait moves back.
function cost(left, available) {
  const minutes = Math.ceil(left / MINUTE);
  const spent = Math.min(minutes, available);
  return { spent, shift: spent === minutes ? left + SLACK : spent * MINUTE };
}

// The exploration moves into the past; its result still comes from the seed
// saved at its start.
function skipActivity(db, player, now) {
  const { row, activity } = player;
  if (!activity || activity.ends_at <= now) throw nothing('Nie trwa żadna wyprawa.');
  const { spent, shift } = cost(activity.ends_at - now, row.time_points);
  return {
    spent,
    statements: [
      db
        .prepare(
          `UPDATE characters SET time_points = time_points - ?, version = version + 1
           WHERE id = ? AND version = ? AND time_points >= ?
             AND EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND started_at = ? AND ends_at = ?)`,
        )
        .bind(spent, row.id, row.version, spent, row.id, activity.started_at, activity.ends_at),
      db
        .prepare(
          `UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?
           WHERE character_id = ? AND started_at = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)`,
        )
        .bind(shift, shift, row.id, activity.started_at, row.id, row.version + 1),
    ],
  };
}

// HP gets what the skipped minutes of rest would give, at the pace of now
// (with the Ognisko), and the rest goes on from there.
function skipRest(db, player, now) {
  const { row } = player;
  if (player.activity) throw new ApiError(409, 'busy', 'Postać jest na wyprawie, nie odpoczywa.');
  const { hp, maxHp, vitality, rest } = currentHp(player, now);
  if (hp >= maxHp) throw nothing('Postać ma pełne HP.');
  const perMinute = regenPerMinute(maxHp, vitality, content, rest.change?.bonus ?? rest.bonus);
  const minutes = Math.ceil((maxHp - hp) / perMinute);
  const spent = Math.min(minutes, row.time_points);
  const hpAfter = spent === minutes ? maxHp : Math.min(maxHp, Math.floor(hp + perMinute * spent));
  return {
    spent,
    statements: [
      db
        .prepare(
          `UPDATE characters SET time_points = time_points - ?, hp = ?, hp_at = ?, version = version + 1
           WHERE id = ? AND version = ? AND time_points >= ? AND NOT EXISTS (SELECT 1 FROM activities WHERE character_id = ?)`,
        )
        .bind(spent, hpAfter, now, row.id, row.version, spent, row.id),
    ],
  };
}

// The upgrade moves into the past. A production building waiting for the end
// of its upgrade starts producing with it, as in skipBuilding (testing.js).
function skipBuild(db, player, now) {
  const { row } = player;
  const running = construction(player.buildings, now);
  if (!running) throw nothing('W obozie nic się nie buduje.');
  const { spent, shift } = cost(running.endsAt - now, row.time_points);
  return {
    spent,
    statements: [
      db
        .prepare(
          `UPDATE characters SET time_points = time_points - ?, version = version + 1
           WHERE id = ? AND version = ? AND time_points >= ?
             AND EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND ends_at = ?)`,
        )
        .bind(spent, row.id, row.version, spent, row.id, running.buildingId, running.endsAt),
      db
        .prepare(
          `UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?,
             collected_at = CASE WHEN collected_at = ends_at THEN collected_at - ? ELSE collected_at END
           WHERE character_id = ? AND building_id = ? AND ends_at = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)`,
        )
        .bind(shift, shift, shift, row.id, running.buildingId, running.endsAt, row.id, row.version + 1),
    ],
  };
}
