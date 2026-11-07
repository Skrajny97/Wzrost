// The players online (the author, 7.11.2026: "Licznik graczy online.
// Wysuwana zakładka z boku ekranu tylko z ilością graczy"): the accounts
// the game heard from within community.trade.onlineSeconds, as the friends'
// dots count them (community.js). Asking marks the asking account as seen,
// so a player below the Społeczność, whose page does not ask the chat,
// counts too; at most once in SEEN_EVERY, as the chat does (chat.js).

import { content } from './content.js';
import { json } from './http.js';
import { requirePlayable } from './sessions.js';

const SEEN_EVERY = 30000;

// GET /api/online: { count }.
export async function getOnline(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const now = context.now;
  const since = now - content().community.trade.onlineSeconds * 1000;
  await db.prepare('UPDATE users SET seen_at = ? WHERE id = ? AND (seen_at IS NULL OR seen_at < ?)').bind(now, session.userId, now - SEEN_EVERY).run();
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE seen_at >= ?').bind(since).first();
  return json({ count: row?.count ?? 0 });
}
