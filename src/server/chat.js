// The chat of the Społeczność tab (DECISIONS.md, "Czat"): the Globalny
// channel for now, with room for more channels in data/chat.json, open from
// the character level of its unlock (community in data/unlocks.json). The
// open chat asks every few seconds for the messages after the last one it
// has. A player writes once they accept the rules, once every few seconds,
// with no links and with rude words masked. As the Play Store asks of
// content made by players, every message can be reported, a player can
// hide the messages of another, a message reported by a few players goes
// down until the moderation looks at it, and the moderation takes messages
// down and silences accounts. The moderation is the author's account (the
// admin) and the accounts the author names moderators in the author's
// panel; the chat marks their characters.

import { isUnlocked } from '../engine/index.js';
import { isAuthor } from './author.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requirePlayable, requireSession } from './sessions.js';

const DAY = 24 * 3600000;
// A silence "na stałe" lasts until the end of the time Date knows.
export const FOREVER = 8.64e15;

// Signs that change how text looks without showing (zero-width, the
// direction of writing), and the control ones such as new lines.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const LINK = /https?:\/\/|www\.|[\p{L}\p{N}-]+\.(?:pl|com|net|org|eu|io|gg|me|tv|ly|xyz|ru|info|app|dev|link|site|online|shop|club|fun)(?![\p{L}\p{N}])/iu;
const WORD = /[\p{L}\p{N}_]+/gu;

const untilFormat = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function channelOf(id) {
  const channel = content.chat.channels.find((entry) => entry.id === id);
  if (!channel) throw new ApiError(404, 'no_channel', 'Nie ma takiego kanału.');
  return channel;
}

const whole = (value) => (/^\d{1,15}$/.test(value ?? '') ? Number(value) : 0);

export function mutedText(until) {
  return until >= FOREVER ? 'Czat jest dla Ciebie wyciszony na stałe.' : `Czat jest dla Ciebie wyciszony do ${untilFormat.format(new Date(until))}.`;
}

// "admin" for the author's account, "moderator" for an account the author
// named, null for everyone else. `row` has the account's login, google_sub
// and chat_moderator.
export const chatRole = (env, row) =>
  isAuthor(env, { login: row.login, google: row.google_sub !== null }) ? 'admin' : row.chat_moderator === 1 ? 'moderator' : null;

// The message as it is kept: one line of visible signs, within the length,
// without links, with the words of data/chat.json turned into stars.
export function cleanText(raw) {
  if (typeof raw !== 'string') throw new ApiError(400, 'empty', 'Napisz wiadomość.');
  const text = raw.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new ApiError(400, 'empty', 'Napisz wiadomość.');
  const { maxLength } = content.chat.rules;
  if ([...text].length > maxLength) throw new ApiError(400, 'too_long', `Wiadomość może mieć najwyżej ${maxLength} znaków.`);
  if (LINK.test(text)) throw new ApiError(400, 'link', 'Linki w czacie są niedozwolone.');
  const words = content.chat.words;
  return text.replace(WORD, (word) => (words.some((part) => word.toLowerCase().includes(part)) ? '*'.repeat([...word].length) : word));
}

const messageView = (row, userId, env) => ({
  id: row.id,
  name: row.name,
  level: row.level,
  classId: row.class_id,
  text: row.text,
  createdAt: row.created_at,
  own: row.user_id === userId,
  role: chatRole(env, row),
});

const blockedList = (db, userId) => db.prepare('SELECT id, name FROM chat_blocks WHERE user_id = ? ORDER BY id').bind(userId);

// The account and its character as the chat needs them, once the character
// reaches the chat's level.
async function requireChatter(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const [characters, accounts] = await db.batch([
    db.prepare("SELECT id, name, level, class_id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId),
    db.prepare('SELECT login, google_sub, chat_moderator, chat_rules_at, chat_muted_until FROM users WHERE id = ?').bind(session.userId),
  ]);
  const character = characters.results[0];
  if (!character) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  if (!isUnlocked('community', character.level, content)) {
    throw new ApiError(403, 'locked', `Społeczność odblokujesz na poziomie postaci ${content.unlocksById.community.level}.`);
  }
  const account = accounts.results[0];
  return { session, character, account, role: chatRole(context.env, account), db };
}

// The moderation: the admin and the moderators, also below the chat's level.
async function requireModeration(context) {
  const session = await requireSession(context);
  const account = await context.env.DB.prepare('SELECT login, google_sub, chat_moderator FROM users WHERE id = ?').bind(session.userId).first();
  const role = chatRole(context.env, account);
  if (!role) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return { session, role, db: context.env.DB };
}

async function requireAdmin(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return { session, db: context.env.DB };
}

// GET /api/chat?channel=global&after=<id>&from=<id>: the newest messages
// after `after` (the last ones of the channel when it is 0), without those
// taken down and those of the players this one hides, and of the messages
// the page shows (from `from` to `after`) the ones taken down since. The
// moderation also hears how many messages wait in the reports.
export async function readChat(context) {
  const { session, account, role, db } = await requireChatter(context);
  const url = new URL(context.request.url);
  const channel = channelOf(url.searchParams.get('channel') ?? 'global');
  const after = whole(url.searchParams.get('after'));
  const from = whole(url.searchParams.get('from'));
  const { userId } = session;
  const [messages, hidden, blocked, reports] = await db.batch([
    db
      .prepare(
        `SELECT m.id, m.user_id, m.name, m.level, m.class_id, m.text, m.created_at, u.login, u.google_sub, u.chat_moderator
         FROM chat_messages m JOIN users u ON u.id = m.user_id
         WHERE m.channel = ? AND m.id > ? AND m.hidden_at IS NULL AND m.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?)
         ORDER BY m.id DESC LIMIT ?`,
      )
      .bind(channel.id, after, userId, content.chat.rules.page),
    db.prepare('SELECT id FROM chat_messages WHERE channel = ? AND id >= ? AND id <= ? AND hidden_at IS NOT NULL').bind(channel.id, from || after, after),
    blockedList(db, userId),
    db.prepare(role ? 'SELECT COUNT(DISTINCT message_id) AS count FROM chat_reports WHERE closed_at IS NULL' : 'SELECT NULL AS count'),
  ]);
  return json({
    channel: channel.id,
    messages: messages.results.reverse().map((row) => messageView(row, userId, context.env)),
    hidden: hidden.results.map((row) => row.id),
    rulesAccepted: Boolean(account.chat_rules_at),
    mutedUntil: account.chat_muted_until > context.now ? account.chat_muted_until : null,
    blocked: blocked.results,
    role,
    reports: role ? reports.results[0].count : undefined,
  });
}

// POST /api/chat/rules: the player accepts the rules of the chat.
export async function acceptChatRules(context) {
  const { session, db } = await requireChatter(context);
  await db.prepare('UPDATE users SET chat_rules_at = COALESCE(chat_rules_at, ?) WHERE id = ?').bind(context.now, session.userId).run();
  return json({ rulesAccepted: true });
}

// POST /api/chat {channel, text}: a message, under the character's name,
// level and class. The channel keeps its last messages and the reported
// ones still waiting for the moderation.
export async function sendChat(context) {
  const { session, character, account, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const channel = channelOf(body.channel ?? 'global');
  const now = context.now;
  const { userId } = session;
  if (!account.chat_rules_at) throw new ApiError(403, 'rules', 'Najpierw zaakceptuj zasady czatu.');
  if (account.chat_muted_until > now) throw new ApiError(403, 'muted', mutedText(account.chat_muted_until));
  const text = cleanText(body.text);
  const { everySeconds, keep } = content.chat.rules;
  const [sent] = await db.batch([
    db
      .prepare(
        `INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE user_id = ? AND created_at > ?)`,
      )
      .bind(channel.id, userId, character.id, character.name, character.level, character.class_id, text, now, userId, now - everySeconds * 1000),
    db
      .prepare(
        `DELETE FROM chat_messages WHERE channel = ?
           AND id <= (SELECT id FROM chat_messages WHERE channel = ? ORDER BY id DESC LIMIT 1 OFFSET ?)
           AND id NOT IN (SELECT message_id FROM chat_reports WHERE closed_at IS NULL)`,
      )
      .bind(channel.id, channel.id, keep),
  ]);
  if (sent.meta.changes !== 1) throw new ApiError(429, 'too_fast', `Za szybko. Kolejną wiadomość wyślesz po ${everySeconds} sekundach.`);
  const row = { ...account, id: sent.meta.last_row_id, user_id: userId, name: character.name, level: character.level, class_id: character.class_id, text, created_at: now };
  return json({ message: messageView(row, userId, context.env) }, 201);
}

// The message a request names, still in the chat, with its writer's account.
async function namedMessage(db, body) {
  const message = Number.isInteger(body.messageId)
    ? await db
        .prepare(
          `SELECT m.id, m.user_id, m.name, m.hidden_at, u.login, u.google_sub, u.chat_moderator
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
        )
        .bind(body.messageId)
        .first()
    : null;
  if (!message) throw new ApiError(404, 'no_message', 'Tej wiadomości już nie ma.');
  return message;
}

// POST /api/chat/report {messageId}: a report for the moderation, once per
// player and message; enough reports take the message down until the
// moderation decides.
export async function reportChat(context) {
  const { session, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request));
  if (message.user_id === session.userId) throw new ApiError(400, 'own', 'Własnej wiadomości nie zgłosisz.');
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO chat_reports (message_id, user_id, created_at) VALUES (?, ?, ?)').bind(message.id, session.userId, context.now),
    db
      .prepare(
        `UPDATE chat_messages SET hidden_at = ? WHERE id = ? AND hidden_at IS NULL
           AND (SELECT COUNT(*) FROM chat_reports WHERE message_id = ? AND closed_at IS NULL) >= ?`,
      )
      .bind(context.now, message.id, message.id, content.chat.rules.hideAfterReports),
  ]);
  return json({ text: 'Zgłoszono. Moderacja sprawdzi tę wiadomość.' });
}

// POST /api/chat/block {messageId}: the player stops seeing the messages of
// the one who wrote it, also of their later characters.
export async function blockInChat(context) {
  const { session, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request));
  if (message.user_id === session.userId) throw new ApiError(400, 'own', 'Siebie nie ukryjesz.');
  await db
    .prepare('INSERT OR IGNORE INTO chat_blocks (user_id, blocked_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(session.userId, message.user_id, message.name, context.now)
    .run();
  return json({ blocked: (await blockedList(db, session.userId).all()).results });
}

// POST /api/chat/unblock {id}: the messages of a hidden player show again.
export async function unblockInChat(context) {
  const { session, db } = await requireChatter(context);
  const body = await readJson(context.request);
  if (Number.isInteger(body.id)) await db.prepare('DELETE FROM chat_blocks WHERE id = ? AND user_id = ?').bind(body.id, session.userId).run();
  return json({ blocked: (await blockedList(db, session.userId).all()).results });
}

// GET /api/chat/reports: for the moderation, the messages with reports not
// decided yet, the longest waiting first; the admin also sees the login of
// the account that wrote each.
export async function chatReports(context) {
  const { role, db } = await requireModeration(context);
  const rows = await db
    .prepare(
      `SELECT m.id, m.name, m.text, m.created_at, m.hidden_at, u.login, u.google_sub, u.chat_moderator, u.chat_muted_until,
         COUNT(*) AS reports, MIN(r.created_at) AS reported_at
       FROM chat_reports r JOIN chat_messages m ON m.id = r.message_id JOIN users u ON u.id = m.user_id
       WHERE r.closed_at IS NULL
       GROUP BY m.id
       ORDER BY reported_at
       LIMIT 100`,
    )
    .all();
  return json({
    reports: rows.results.map((row) => ({
      messageId: row.id,
      name: row.name,
      login: role === 'admin' ? row.login : undefined,
      role: chatRole(context.env, row),
      text: row.text,
      createdAt: row.created_at,
      hidden: row.hidden_at !== null,
      reports: row.reports,
      reportedAt: row.reported_at,
      mutedUntil: row.chat_muted_until > context.now ? row.chat_muted_until : null,
    })),
  });
}

// POST /api/chat/moderate {messageId, action}: the moderation's decision on
// a message. "hide" takes it down, "keep" brings it back, and both close its
// reports; "muteDay" and "muteForever" silence the account that wrote it. A
// moderator decides on no message of the admin or of another moderator.
export async function moderateChat(context) {
  const { role, db } = await requireModeration(context);
  const body = await readJson(context.request);
  const now = context.now;
  const message = await namedMessage(db, body);
  if (role === 'moderator' && chatRole(context.env, message)) throw new ApiError(403, 'protected', 'Wiadomości moderacji nie moderujesz.');
  const close = db.prepare('UPDATE chat_reports SET closed_at = ? WHERE message_id = ? AND closed_at IS NULL').bind(now, message.id);
  const mute = (until) => [db.prepare('UPDATE users SET chat_muted_until = MAX(COALESCE(chat_muted_until, 0), ?) WHERE id = ?').bind(until, message.user_id)];
  const actions = {
    hide: () => [db.prepare('UPDATE chat_messages SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?').bind(now, message.id), close],
    keep: () => [db.prepare('UPDATE chat_messages SET hidden_at = NULL WHERE id = ?').bind(message.id), close],
    muteDay: () => mute(now + DAY),
    muteForever: () => mute(FOREVER),
  };
  if (!Object.hasOwn(actions, body.action)) throw new ApiError(400, 'invalid_action', 'Nieznana decyzja.');
  await db.batch(actions[body.action]());
  return json({ ok: true });
}

// POST /api/author/chat/unmute {login}: only the admin lets an account
// write again.
export async function unmuteInChat(context) {
  const { db } = await requireAdmin(context);
  const body = await readJson(context.request);
  if (typeof body.login !== 'string') throw new ApiError(400, 'invalid_login', 'Nie ma takiego konta.');
  await db.prepare('UPDATE users SET chat_muted_until = NULL WHERE login = ?').bind(body.login).run();
  return json({ ok: true });
}

// POST /api/author/chat/moderator {login, moderator}: only the admin names
// moderators and takes the role back.
export async function setModerator(context) {
  const { db } = await requireAdmin(context);
  const body = await readJson(context.request);
  if (typeof body.login !== 'string' || typeof body.moderator !== 'boolean') throw new ApiError(400, 'invalid_login', 'Nie ma takiego konta.');
  await db.prepare('UPDATE users SET chat_moderator = ? WHERE login = ?').bind(body.moderator ? 1 : 0, body.login).run();
  return json({ ok: true });
}
