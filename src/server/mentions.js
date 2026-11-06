// Mentions in the chat (DECISIONS.md, "Oznaczanie na czacie (634 A)"; the
// author: "Potrzebujemy tez funkcji oznaczania na czacie"): "@" and a
// character's whole name in a message tag that character (mentionPlaces in
// the engine) when it reads the message's channel: any character with the
// Społeczność in the Globalny and the Wymiana, a member of the guild in
// the guild's channel, the other one in a private conversation. Never a
// character of the writer's own account, nor one whose player hides the
// writer in the chat; a message refused (silenced writer, rules not
// accepted, too fast, a link) tags nobody, as it is not written. A message
// tags at most mentions.perMessage characters (data/chat.json).
//
// The tags are kept in chat_mentions (migrations/0082_chat_mentions.sql) as
// long as their message: the message shows gilded to the one it tags, and
// the tab of its channel and the Społeczność light until the tagged
// character has read that channel (chat_seen, chat.js), on any device. A
// tag goes to the tagged player's phones too, with the next minute's
// notifications (push.js): at most one from the same writer to the same
// character within mentions.pushEveryMinutes, and none once the message is
// read, taken down or its writer hidden.

import { gendered, isUnlocked, mentionPlaces, pickMentions } from '../engine/index.js';
import { shownText } from './chat.js';
import { content } from './content.js';
import { accountLanguage, runInLanguage } from './i18n.js';
import { OWN_CHARACTERS } from './roles.js';

const tuning = () => content().chat.mentions;
// D1 binds at most 100 values to a statement: the names one message looks
// up, the longest first at each "@".
const MOST_NAMES = 90;
// The channels of the private messages and of the guilds (chat.js,
// guildChannel in guilds.js).
const PRIVATE = 'private';
const GUILD_PREFIX = 'guild:';

// The characters a message tags: `text` as the chat shows it (shownText),
// `userId` the writer's account, `channel` where it goes ('global',
// 'trade', 'guild:<id>', or 'private' with its `recipientId`), at `now`.
// Each with the name as written and whether a phone notification goes for
// it: [{ characterId, written, push }].
export async function findMentions(db, text, { userId, channel, recipientId = null }, now) {
  const places = mentionPlaces(text);
  if (places.length === 0) return [];
  const keys = [...new Set(places.flatMap((place) => place.names.map((name) => name.key)))].slice(0, MOST_NAMES);
  const found = await db
    .prepare(
      `SELECT c.id, c.user_id, c.name_key, c.level, (SELECT g.guild_id FROM guild_members g WHERE g.character_id = c.id) AS guild_id,
              EXISTS (SELECT 1 FROM chat_blocks b WHERE b.user_id = c.user_id AND b.blocked_id = ?) AS hiding
       FROM characters c WHERE c.name_key IN (${keys.map(() => '?').join(', ')}) AND c.${OWN_CHARACTERS}`,
    )
    .bind(userId, ...keys)
    .all();
  const reads = (row) =>
    row.user_id !== userId &&
    !row.hiding &&
    isUnlocked('community', row.level, content()) &&
    (channel === PRIVATE ? row.id === recipientId : channel.startsWith(GUILD_PREFIX) ? row.guild_id !== null && `${GUILD_PREFIX}${row.guild_id}` === channel : true);
  // First the longest name some character has at each "@", and only then
  // whether that character may be tagged (pickMentions).
  const tagged = pickMentions(places, new Map(found.results.map((row) => [row.name_key, row])))
    .filter(({ character }) => reads(character))
    .slice(0, tuning().perMessage);
  if (tagged.length === 0) return [];
  // The characters this writer's tags already sent a notification to lately.
  const ids = tagged.map(({ character }) => character.id);
  const notified = await db
    .prepare(
      `SELECT DISTINCT x.character_id FROM chat_mentions x JOIN chat_messages m ON m.id = x.message_id
       WHERE x.push = 1 AND x.created_at > ? AND m.user_id = ? AND x.character_id IN (${ids.map(() => '?').join(', ')})`,
    )
    .bind(now - tuning().pushEveryMinutes * 60000, userId, ...ids)
    .all();
  const quiet = new Set(notified.results.map((row) => row.character_id));
  return tagged.map(({ character, written }) => ({ characterId: character.id, written, push: !quiet.has(character.id) }));
}

// The statements that keep the tags of message `messageId`.
export const mentionsSaved = (db, messageId, tags, now) =>
  tags.map(({ characterId, written, push }) =>
    db
      .prepare('INSERT OR IGNORE INTO chat_mentions (message_id, character_id, written, push, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(messageId, characterId, written, push ? 1 : 0, now),
  );

// SQL for the tags of the message whose id `column` holds, as JSON:
// [{"id": the tagged character's id, "text": its name as written}].
export const mentionsSql = (column) =>
  `(SELECT json_group_array(json_object('id', x.character_id, 'text', x.written)) FROM chat_mentions x WHERE x.message_id = ${column})`;

// What a message shows of its tags (`tags` as mentionsSql gives them) to
// the character `readerId`: the names as written, for the page to mark
// them, and whether it tags this character.
export function mentionsView(tags, readerId) {
  if (!Array.isArray(tags) || tags.length === 0) return {};
  return { mentions: tags.map((tag) => tag.text), ...(tags.some((tag) => tag.id === readerId) && { mentioned: true }) };
}

// The newest message of each channel that tags the character, still there
// and not by a player it hides, for the lights of the chat: { global,
// trade, guild, private: { [the other character's id]: id } }, 0 where
// none. The guild's only in the channel of its guild now
// (`guildChannelNow`, null outside a guild).
export async function newestMentions(db, characterId, userId, guildChannelNow) {
  const rows = await db
    .prepare(
      `SELECT m.channel, CASE WHEN m.channel = '${PRIVATE}' THEN m.character_id ELSE 0 END AS other, MAX(x.message_id) AS id
       FROM chat_mentions x JOIN chat_messages m ON m.id = x.message_id
       WHERE x.character_id = ? AND m.hidden_at IS NULL AND m.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?)
       GROUP BY m.channel, other`,
    )
    .bind(characterId, userId)
    .all();
  const newest = { ...Object.fromEntries(content().chat.channels.map((channel) => [channel.id, 0])), guild: 0, private: {} };
  for (const row of rows.results) {
    if (row.channel === PRIVATE) newest.private[row.other] = row.id;
    else if (row.channel.startsWith(GUILD_PREFIX)) {
      if (row.channel === guildChannelNow) newest.guild = row.id;
    } else if (Object.hasOwn(newest, row.channel)) newest[row.channel] = row.id;
  }
  return newest;
}

// The characters "@" suggests besides those who wrote in the channel shown
// (the page has them): the friends of the character and the members of its
// guild, without the player's own characters, each with its id, name and
// class, by name.
export async function mentionPeople(db, characterId, userId) {
  const [friends, guild] = await db.batch([
    db
      .prepare(
        `SELECT o.id, o.name, o.class_id FROM friends f JOIN characters o ON o.id = CASE WHEN f.character_id = ? THEN f.friend_id ELSE f.character_id END
         WHERE (f.character_id = ? OR f.friend_id = ?) AND f.accepted_at IS NOT NULL AND o.user_id != ? AND o.${OWN_CHARACTERS}
         ORDER BY o.name_key`,
      )
      .bind(characterId, characterId, characterId, userId),
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id FROM guild_members mine JOIN guild_members g ON g.guild_id = mine.guild_id JOIN characters c ON c.id = g.character_id
         WHERE mine.character_id = ? AND c.user_id != ? AND c.${OWN_CHARACTERS}
         ORDER BY c.name_key`,
      )
      .bind(characterId, userId),
  ]);
  const person = (row) => ({ id: row.id, name: row.name, classId: row.class_id });
  return { friends: friends.results.map(person), guild: guild.results.map(person) };
}

// The words of a template with {key} put in; a function, so that "$" in a
// message stays as written.
const filled = (template, words) => template.replace(/\{(\w+)\}/g, (_, key) => String(words[key] ?? ''));

// The beginning of a message, at most `most` signs, cut with "…".
function beginning(text, most) {
  const signs = Array.from(text);
  return signs.length <= most ? text : `${signs.slice(0, most - 1).join('').trimEnd()}…`;
}

const channelName = (channel) =>
  channel === PRIVATE
    ? tuning().texts.channels.private
    : channel.startsWith(GUILD_PREFIX)
      ? tuning().texts.channels.guild
      : (content().chat.channels.find((entry) => entry.id === channel)?.name ?? channel);

// The phone notifications of the tags made after `from` up to `to`: Map of
// user id → [{ tag, url, at, title, body }], oldest first. Only to a played
// character whose player has a phone signed up, while its message is still
// there, the character has not read its channel that far (chat_seen) and
// does not hide its writer, and in a guild's channel only while the
// character is still in that guild. "Mira oznaczyła Cię na czacie: …", a
// woman's verb for a female writer; in the language of the tagged player's
// account, as the cron runs outside any request (push.js).
export async function mentionNotices(db, from, to) {
  const rows = await db
    .prepare(
      `SELECT x.message_id, x.created_at, c.user_id, m.channel, m.character_id AS writer_id, m.text, w.name, w.appearance,
              (SELECT u.language FROM users u WHERE u.id = c.user_id) AS language,
              CASE WHEN json_valid(c.chat_seen) THEN json_extract(c.chat_seen,
                CASE WHEN m.channel = '${PRIVATE}' THEN '$.private."' || m.character_id || '"'
                     WHEN m.channel LIKE '${GUILD_PREFIX}%' THEN '$.guild'
                     ELSE '$.' || m.channel END) END AS seen
       FROM chat_mentions x
       JOIN chat_messages m ON m.id = x.message_id
       JOIN characters c ON c.id = x.character_id
       JOIN characters w ON w.id = m.character_id
       WHERE x.push = 1 AND x.created_at > ? AND x.created_at <= ? AND c.role = 'player'
         AND c.user_id IN (SELECT user_id FROM push_subscriptions WHERE gone_at IS NULL)
         AND m.hidden_at IS NULL
         AND m.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = c.user_id)
         AND (m.channel NOT LIKE '${GUILD_PREFIX}%' OR m.channel = (SELECT '${GUILD_PREFIX}' || g.guild_id FROM guild_members g WHERE g.character_id = c.id))
       ORDER BY x.created_at, x.message_id`,
    )
    .bind(from, to)
    .all();
  const due = new Map();
  for (const row of rows.results) {
    if ((Number(row.seen) || 0) >= row.message_id) continue;
    const notice = runInLanguage(accountLanguage(row.language), () => {
      const { texts, pushLength } = tuning();
      const words = { channel: channelName(row.channel), name: row.name, text: beginning(shownText(row.text), pushLength) };
      return {
        // One writer's newer tag takes the place of its older one on the phone.
        tag: `mention-${row.writer_id}`,
        url: '#/spolecznosc/czat',
        at: row.created_at,
        title: filled(texts.pushTitle, words),
        body: filled(gendered(texts.pushBody, row.appearance), words),
      };
    });
    due.set(row.user_id, [...(due.get(row.user_id) ?? []), notice]);
  }
  return due;
}
