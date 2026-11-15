// The time in the game (993 A; src/engine/play-time.js): POST /api/play,
// sent by the page once a minute while the game is on the screen and was
// touched lately (src/client/play-time.js), counts the minute and pays its
// Punkt Czasu, up to the day's limit. Light, as it comes every minute: the
// character's own two columns, no settling of what time brought, and no new
// version of the character, so an action sent in the same moment still
// saves (as the Punkty Czasu of the clock, characters.js). Two pages count
// once: the minute is saved only where the stored one is as read.

import { playMinute, playView } from '../engine/index.js';
import { content } from './content.js';
import { ApiError, json } from './http.js';
import { requirePlayable } from './sessions.js';

// The stored minutes, or null before the first.
export const storedPlay = (row) => (row.play_time ? JSON.parse(row.play_time) : null);

export async function countPlayMinute(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const row = await db.prepare("SELECT id, play_time FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
  if (!row) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  const stored = storedPlay(row);
  const { play, gained, counted } = playMinute(stored, context.now, content());
  if (!counted) return json({ gained: 0, play: playView(stored, context.now, content()) });
  const result = await db
    .prepare('UPDATE characters SET play_time = ?, time_points = time_points + ? WHERE id = ? AND play_time IS ?')
    .bind(JSON.stringify(play), gained, row.id, row.play_time)
    .run();
  // Another page counted the same minute first.
  if (result.meta.changes !== 1) return json({ gained: 0, play: playView(stored, context.now, content()) });
  return json({ gained, play: playView(play, context.now, content()) });
}
