// The chat of the Społeczność tab (DECISIONS.md, "Czat"): the Globalny and
// the Wymiana channels of data/chat.json, and the private conversations of
// two characters beside them, open from the character level of its unlock
// (community in data/unlocks.json). A message in the Wymiana can show items
// from the writer's bag, as they were when it was sent, for offers made in
// words. A character closes a private conversation until a newer message
// comes. The open chat asks every few seconds for the messages after the
// last one it has. A player writes once they accept the rules, once every few seconds,
// with no links and with rude words masked. As the Play Store asks of
// content made by players, every message can be reported, a player can
// hide the messages of another, a message reported by a few players goes
// down until the moderation looks at it, and the moderation takes messages
// down and silences accounts. The moderation is the author's account (the
// admin) and the accounts the author names moderators in the author's
// panel; the chat marks their characters.

import { isUnlocked, itemView } from '../engine/index.js';
import { isAuthor } from './author.js';
import { content } from './content.js';
import { friendNews } from './community.js';
import { partyNews } from './parties.js';
import { tradeNews } from './trades.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';
import { requirePlayable, requireSession } from './sessions.js';

const DAY = 24 * 3600000;
// How often the time the game last asked is written down: who is online
// for a Wymiana (trades.js).
const SEEN_EVERY = 30000;
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

// The channel of the private messages, each with its recipient.
const PRIVATE = 'private';
// The messages between two characters, either way (`m` is chat_messages).
const PAIR = '((m.character_id = ? AND m.recipient_id = ?) OR (m.character_id = ? AND m.recipient_id = ?))';
const pairOf = (one, other) => [one, other, other, one];

// The other character of a private conversation: another player's, played
// now or set aside (it reads the message when its player plays it again).
async function partnerOf(db, character, id, userId) {
  const other = id > 0 ? await db.prepare(`SELECT id, user_id, name, level FROM characters WHERE id = ? AND ${OWN_CHARACTERS}`).bind(id).first() : null;
  if (!other) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (other.id === character.id || other.user_id === userId) throw new ApiError(400, 'self', 'Do siebie nie napiszesz.');
  return other;
}

// The private conversations of a character, the most recent first, each
// with the other character and the newest message that one wrote, without
// the players it hides and those it closed, until a newer message comes.
const conversationsOf = (db, userId, characterId) =>
  db
    .prepare(
      `SELECT c.id, c.name, c.class_id, s.latest
       FROM (SELECT CASE WHEN m.character_id = ? THEN m.recipient_id ELSE m.character_id END AS other,
                    MAX(m.id) AS last, MAX(CASE WHEN m.character_id != ? THEN m.id END) AS latest
             FROM chat_messages m
             WHERE m.channel = '${PRIVATE}' AND (m.character_id = ? OR m.recipient_id = ?) AND m.hidden_at IS NULL
             GROUP BY other) s
       JOIN characters c ON c.id = s.other
       LEFT JOIN chat_closed x ON x.character_id = ? AND x.other_id = s.other
       WHERE c.${OWN_CHARACTERS} AND c.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?) AND (x.last_id IS NULL OR s.last > x.last_id)
       ORDER BY s.last DESC LIMIT ?`,
    )
    .bind(characterId, characterId, characterId, characterId, characterId, userId, content.chat.rules.conversations);
const conversationView = (row) => ({ id: row.id, name: row.name, classId: row.class_id, latest: row.latest ?? 0 });

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
  characterId: row.character_id,
  name: row.name,
  level: row.level,
  classId: row.class_id,
  text: row.text,
  createdAt: row.created_at,
  own: row.user_id === userId,
  role: chatRole(env, row),
  ...(row.items && { items: JSON.parse(row.items) }),
});

// An item a Wymiana message shows: what its sheet tells.
const offeredItem = (item) => {
  const view = itemView(item, content);
  return {
    name: view.name,
    base: view.base,
    slot: view.slot,
    slotName: view.slotName,
    level: view.level,
    upgrade: view.upgrade,
    rarity: view.rarity,
    rarityName: view.rarityName,
    color: view.color,
    properties: view.properties,
    classNames: view.classNames,
    classLevel: view.classLevel,
  };
};

// The items of the writer's bag a message names by id, in that order: in a
// channel that has items, at most rules.items of them, none twice.
async function offeredItems(db, channel, characterId, ids) {
  if (ids === undefined || (Array.isArray(ids) && ids.length === 0)) return null;
  if (!channel?.items) throw new ApiError(400, 'no_items_here', 'Przedmioty pokażesz tylko w kanale Wymiana.');
  const most = content.chat.rules.items;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger) || new Set(ids).size !== ids.length) throw new ApiError(400, 'bad_items', 'Nie ma takich przedmiotów.');
  if (ids.length > most) throw new ApiError(400, 'too_many_items', `Jedna wiadomość pokaże najwyżej ${most} przedmioty.`);
  const rows = await db
    .prepare(`SELECT id, data FROM items WHERE character_id = ? AND slot IS NULL AND id IN (${ids.map(() => '?').join(', ')})`)
    .bind(characterId, ...ids)
    .all();
  const byId = new Map(rows.results.map((row) => [row.id, JSON.parse(row.data)]));
  if (byId.size !== ids.length) throw new ApiError(409, 'not_in_bag', 'Pokażesz tylko przedmioty z plecaka, nie założone.');
  return ids.map((id) => offeredItem(byId.get(id)));
}

const blockedList = (db, userId) => db.prepare('SELECT id, name FROM chat_blocks WHERE user_id = ? ORDER BY id').bind(userId);

// The account and its character as the chat needs them, once the character
// reaches the chat's level.
export async function requireChatter(context) {
  const session = await requirePlayable(context);
  const db = context.env.DB;
  const [characters, accounts] = await db.batch([
    db.prepare("SELECT id, name, level, class_id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId),
    db.prepare('SELECT login, google_sub, chat_moderator, chat_rules_at, chat_muted_until, trade_off, seen_at FROM users WHERE id = ?').bind(session.userId),
  ]);
  const character = characters.results[0];
  if (!character) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  if (!isUnlocked('community', character.level, content)) {
    throw new ApiError(403, 'locked', `Społeczność odblokujesz na poziomie postaci ${content.unlocksById.community.level}.`);
  }
  const account = accounts.results[0];
  if (!(context.now - (account.seen_at ?? 0) < SEEN_EVERY)) {
    await db.prepare('UPDATE users SET seen_at = ? WHERE id = ?').bind(context.now, session.userId).run();
  }
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

// GET /api/chat?channel=global&after=<id>&from=<id>, or ?with=<character
// id> for a private conversation: the newest messages after `after` (the
// last ones when it is 0), without those taken down and those of the
// players this one hides, and of the messages the page shows (from `from`
// to `after`) the ones taken down since, with the private conversations for
// the tabs. The moderation also hears how many messages wait in the reports.
export async function readChat(context) {
  const { session, character, account, role, db } = await requireChatter(context);
  const url = new URL(context.request.url);
  const withId = whole(url.searchParams.get('with'));
  const other = withId ? await partnerOf(db, character, withId, session.userId) : null;
  const channel = other ? null : channelOf(url.searchParams.get('channel') ?? 'global');
  const where = other ? `m.channel = '${PRIVATE}' AND ${PAIR}` : 'm.channel = ?';
  const binds = other ? pairOf(character.id, other.id) : [channel.id];
  const after = whole(url.searchParams.get('after'));
  const from = whole(url.searchParams.get('from'));
  const { userId } = session;
  const [messages, hidden, blocked, reports, conversations] = await db.batch([
    db
      .prepare(
        `SELECT m.id, m.user_id, m.character_id, m.name, COALESCE(c.level, m.level) AS level, m.class_id, m.text, m.items, m.created_at, u.login, u.google_sub, u.chat_moderator
         FROM chat_messages m JOIN users u ON u.id = m.user_id LEFT JOIN characters c ON c.id = m.character_id
         WHERE ${where} AND m.id > ? AND m.hidden_at IS NULL AND m.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?)
         ORDER BY m.id DESC LIMIT ?`,
      )
      .bind(...binds, after, userId, content.chat.rules.page),
    db.prepare(`SELECT m.id FROM chat_messages m WHERE ${where} AND m.id >= ? AND m.id <= ? AND m.hidden_at IS NOT NULL`).bind(...binds, from || after, after),
    blockedList(db, userId),
    db.prepare(role ? 'SELECT COUNT(DISTINCT message_id) AS count FROM chat_reports WHERE closed_at IS NULL' : 'SELECT NULL AS count'),
    conversationsOf(db, userId, character.id),
  ]);
  return json({
    channel: other ? PRIVATE : channel.id,
    with: other && { id: other.id, name: other.name },
    messages: messages.results.reverse().map((row) => messageView(row, userId, context.env)),
    hidden: hidden.results.map((row) => row.id),
    conversations: conversations.results.map(conversationView),
    rulesAccepted: Boolean(account.chat_rules_at),
    mutedUntil: account.chat_muted_until > context.now ? account.chat_muted_until : null,
    blocked: blocked.results,
    role,
    reports: role ? reports.results[0].count : undefined,
  });
}

// What a character has read, as POST /api/chat/seen keeps it: the newest
// message of the Globalny and of each private conversation, by the other
// character's id.
function seenOf(text) {
  let seen;
  try {
    seen = JSON.parse(text ?? '{}');
  } catch {
    seen = {};
  }
  const entries = Object.entries(seen?.private ?? {}).map(([other, id]) => [other, whole(String(id))]);
  return { global: whole(String(seen?.global ?? 0)), private: Object.fromEntries(entries.filter(([other, id]) => whole(other) && id)) };
}

// GET /api/chat/latest: the newest message someone else wrote in the
// Globalny that this player may read, the private conversations with the
// newest message of each other character, the Upominki and invitations
// waiting in Znajomi (community.js), for the light on the Społeczność tab,
// a Wymiana proposed or going on (trades.js), and what the character has
// read on any of its devices.
export async function latestChat(context) {
  const { session, character, db } = await requireChatter(context);
  const [row, conversations, friends, trade, read, partyInvites] = await Promise.all([
    db
      .prepare(
        `SELECT MAX(id) AS id FROM chat_messages
         WHERE channel = ? AND hidden_at IS NULL AND user_id != ? AND user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?)`,
      )
      .bind(content.chat.channels[0].id, session.userId, session.userId)
      .first(),
    conversationsOf(db, session.userId, character.id).all(),
    friendNews(db, character.id, context.now),
    tradeNews(db, character.id, context.now),
    db.prepare('SELECT chat_seen FROM characters WHERE id = ?').bind(character.id).first(),
    partyNews(db, character.id),
  ]);
  return json({ latest: row.id ?? 0, conversations: conversations.results.map(conversationView), ...friends, partyInvites, trade, seen: seenOf(read?.chat_seen) });
}

// POST /api/chat/seen {global: id}, or {with: character id, id}: the
// character has read the Globalny, or its private conversation with that
// character, up to message `id` on one of its devices; the others hear it
// from /api/chat/latest and put out the light (the tester: a message read
// on the computer still waited as new on the phone). A mark only goes
// forward.
export async function markChatSeen(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const read = await db.prepare('SELECT chat_seen FROM characters WHERE id = ?').bind(character.id).first();
  const seen = seenOf(read?.chat_seen);
  const global = Number.isInteger(body.global) && body.global > 0 ? body.global : 0;
  const other = Number.isInteger(body.with) && body.with > 0 ? body.with : 0;
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : 0;
  let changed = false;
  if (global > seen.global) {
    seen.global = global;
    changed = true;
  }
  if (other && id > (seen.private[other] ?? 0)) {
    seen.private[other] = id;
    changed = true;
  }
  if (changed) await db.prepare('UPDATE characters SET chat_seen = ? WHERE id = ?').bind(JSON.stringify(seen), character.id).run();
  return json({ seen });
}

// POST /api/chat/rules: the player accepts the rules of the chat.
export async function acceptChatRules(context) {
  const { session, db } = await requireChatter(context);
  await db.prepare('UPDATE users SET chat_rules_at = COALESCE(chat_rules_at, ?) WHERE id = ?').bind(context.now, session.userId).run();
  return json({ rulesAccepted: true });
}

// A private message goes only to a character that has the Społeczność,
// and not between two players when either hides the other.
async function privateAllowed(db, userId, other) {
  if (!isUnlocked('community', other.level, content)) {
    throw new ApiError(409, 'locked', `${other.name} nie ma jeszcze Społeczności. Otworzy się na ${content.unlocksById.community.level}. poziomie.`);
  }
  const [hiding, hidden] = await db.batch([
    db.prepare('SELECT 1 FROM chat_blocks WHERE user_id = ? AND blocked_id = ?').bind(userId, other.user_id),
    db.prepare('SELECT 1 FROM chat_blocks WHERE user_id = ? AND blocked_id = ?').bind(other.user_id, userId),
  ]);
  if (hiding.results.length > 0) throw new ApiError(403, 'hiding', `${other.name} jest wśród ukrytych postaci. Pokaż ją nad czatem, żeby napisać.`);
  if (hidden.results.length > 0) throw new ApiError(403, 'refused', `${other.name} nie przyjmuje Twoich wiadomości.`);
}

// POST /api/chat {channel, text}, or {with: character id, text} for a
// private message: a message under the character's name, level and class.
// The channel keeps its last messages, a private conversation its last
// privateKeep, and both the reported ones still waiting for the moderation.
export async function sendChat(context) {
  const { session, character, account, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const other = Number.isInteger(body.with) ? await partnerOf(db, character, body.with, session.userId) : null;
  const channel = other ? null : channelOf(body.channel ?? 'global');
  const now = context.now;
  const { userId } = session;
  if (!account.chat_rules_at) throw new ApiError(403, 'rules', 'Najpierw zaakceptuj zasady czatu.');
  if (account.chat_muted_until > now) throw new ApiError(403, 'muted', mutedText(account.chat_muted_until));
  const text = cleanText(body.text);
  if (other) await privateAllowed(db, userId, other);
  const offered = await offeredItems(db, channel, character.id, body.items);
  const items = offered && JSON.stringify(offered);
  const { everySeconds, keep, privateKeep } = content.chat.rules;
  const where = other ? `m.channel = '${PRIVATE}' AND ${PAIR}` : 'm.channel = ?';
  const binds = other ? pairOf(character.id, other.id) : [channel.id];
  const [sent] = await db.batch([
    db
      .prepare(
        `INSERT INTO chat_messages (channel, user_id, character_id, recipient_id, name, level, class_id, text, items, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE user_id = ? AND created_at > ?)`,
      )
      .bind(other ? PRIVATE : channel.id, userId, character.id, other?.id ?? null, character.name, character.level, character.class_id, text, items, now, userId, now - everySeconds * 1000),
    db
      .prepare(
        `DELETE FROM chat_messages WHERE id IN (SELECT m.id FROM chat_messages m WHERE ${where}
           AND m.id <= (SELECT m.id FROM chat_messages m WHERE ${where} ORDER BY m.id DESC LIMIT 1 OFFSET ?)
           AND m.id NOT IN (SELECT message_id FROM chat_reports WHERE closed_at IS NULL))`,
      )
      .bind(...binds, ...binds, other ? privateKeep : keep),
  ]);
  if (sent.meta.changes !== 1) throw new ApiError(429, 'too_fast', `Za szybko. Kolejną wiadomość wyślesz po ${everySeconds} sekundach.`);
  const row = { ...account, id: sent.meta.last_row_id, user_id: userId, character_id: character.id, name: character.name, level: character.level, class_id: character.class_id, text, items, created_at: now };
  return json({ message: messageView(row, userId, context.env) }, 201);
}

// POST /api/chat/close {with: character id}: the private conversation
// leaves the tabs of this character until a message newer than its last one
// comes, either way. Opening it from a character's sheet brings it back.
export async function closeChat(context) {
  const { session, character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const other = await partnerOf(db, character, Number.isInteger(body.with) ? body.with : 0, session.userId);
  await db
    .prepare(
      `INSERT INTO chat_closed (character_id, other_id, last_id)
       VALUES (?, ?, COALESCE((SELECT MAX(m.id) FROM chat_messages m WHERE m.channel = '${PRIVATE}' AND ${PAIR}), 0))
       ON CONFLICT (character_id, other_id) DO UPDATE SET last_id = excluded.last_id`,
    )
    .bind(character.id, other.id, ...pairOf(character.id, other.id))
    .run();
  return json({ closed: other.id });
}

// The message a request names, still in the chat, with its writer's
// account. A private one only its two characters see, and the moderation;
// `character` is the one who asks, none for the moderation.
async function namedMessage(db, body, character = null) {
  const message = Number.isInteger(body.messageId)
    ? await db
        .prepare(
          `SELECT m.id, m.channel, m.user_id, m.character_id, m.recipient_id, m.name, m.hidden_at, u.login, u.google_sub, u.chat_moderator
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
        )
        .bind(body.messageId)
        .first()
    : null;
  const unseen = message?.channel === PRIVATE && character && ![message.character_id, message.recipient_id].includes(character.id);
  if (!message || unseen) throw new ApiError(404, 'no_message', 'Tej wiadomości już nie ma.');
  return message;
}

// POST /api/chat/report {messageId}: a report for the moderation, once per
// player and message; enough reports take the message down until the
// moderation decides.
export async function reportChat(context) {
  const { session, character, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request), character);
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
  const { session, character, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request), character);
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
      `SELECT m.id, m.channel, m.name, m.text, m.created_at, m.hidden_at, u.login, u.google_sub, u.chat_moderator, u.chat_muted_until,
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
      private: row.channel === PRIVATE,
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
