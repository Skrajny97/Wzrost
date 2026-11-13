// The players online (the author, 7.11.2026: "Licznik graczy online.
// Wysuwana zakładka z boku ekranu tylko z ilością graczy"): the accounts
// the game heard from within community.trade.onlineSeconds, as the friends'
// dots count them (community.js). Asking marks the asking account as seen,
// so a player below the Społeczność, whose page does not ask the chat,
// counts too; at most once in SEEN_EVERY, as the chat does (chat.js).
// Their list (the author, 13.11.2026: "Dodaj opcje otwierania listy graczy
// online pod zieloną kropka ilu graczy online jest"): the character each of
// those accounts plays now, as the chat shows it.

import { chatRole } from './chat.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { guildTagSql } from './guilds.js';
import { json } from './http.js';
import { chatAccountName } from './names.js';
import { requirePlayable } from './sessions.js';

const SEEN_EVERY = 30000;
// The most rows the list holds; more players than that come as a number.
export const LIST_MAX = 200;

// Marks the asking account as seen and gives the moment from which an
// account counts as online.
async function seen(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const now = context.now;
  await db.prepare('UPDATE users SET seen_at = ? WHERE id = ? AND (seen_at IS NULL OR seen_at < ?)').bind(now, session.userId, now - SEEN_EVERY).run();
  return { session, db, since: now - content().community.trade.onlineSeconds * 1000 };
}

// GET /api/online: { count }.
export async function getOnline(context) {
  const { db, since } = await seen(context);
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE seen_at >= ?').bind(since).first();
  return json({ count: row?.count ?? 0 });
}

// GET /api/online/players: { count, players }: the count as above and the
// characters played now on those accounts, the highest level first, then
// the highest class level and the name, at most LIST_MAX of them; each as
// a chat line names its writer: the account's name before the character's,
// its guild's tag, its role in the chat and its level. An account with no
// character in play (choosing one) counts without a row.
export async function getOnlinePlayers(context) {
  const { session, db, since } = await seen(context);
  const [counted, rows] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count FROM users WHERE seen_at >= ?').bind(since),
    db
      .prepare(
        `SELECT c.name, c.class_id, c.level, c.class_level, c.cosmetics, u.id AS user_id, u.login, u.google_sub, u.chat_moderator, u.account_name,
                ${guildTagSql('c.id')} AS guild_tag
         FROM users u JOIN characters c ON c.user_id = u.id AND c.role = 'player'
         WHERE u.seen_at >= ?
         ORDER BY c.level DESC, c.class_level DESC, c.name_key
         LIMIT ?`,
      )
      .bind(since, LIST_MAX),
  ]);
  return json({
    count: counted.results[0]?.count ?? 0,
    players: rows.results.map((row) => ({
      name: row.name,
      account: chatAccountName(row.account_name, row.name),
      nameColor: nameColorOf(row.cosmetics),
      guildTag: row.guild_tag ?? null,
      role: chatRole(context.env, row),
      classId: row.class_id,
      level: row.level,
      classLevel: row.class_level,
      own: row.user_id === session.userId,
    })),
  });
}
