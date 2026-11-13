// The chat of the Społeczność tab (DECISIONS.md, "Czat"): the Globalny and
// the Wymiana channels of data/chat.json, the English one where English is
// on (chatChannels in content.js), and the private conversations of
// two characters beside them, open from the character level of its unlock
// (community in data/unlocks.json). A message in the Wymiana can show items
// from the writer's bag, as they were when it was sent, for offers made in
// words. A character closes a private conversation until a newer message
// comes. The open chat asks every few seconds for the messages after the
// last one it has. A player writes once they accept the rules, once every few seconds,
// with no links and with rude words masked (both lists, the Polish and the
// English, in every channel); only the admin writes links,
// bare or with a label, "[Changelog - 1](https://…)", which the chat shows
// as the label (the author: "Daj mi - adminowi możliwość dawania linków w
// czacie" and "żebym mógł gdzies taki link podpisać jako Changelog - 1"). As the Play Store asks of
// content made by players, every message can be reported, a player can
// hide the messages of another, a message reported by a few players goes
// down until the moderation looks at it, and the moderation takes messages
// down and silences accounts. The moderation is the author's account (the
// admin) and the accounts the author names moderators in the author's
// panel; the chat marks their characters. "@" and a character's whole name
// tag it in a message (mentions.js). Where English is on, a message in the
// other language than the reader's has "A→ Przetłumacz", a machine's
// translation (translate.js).

import { isUnlocked, itemView, questPeriod } from '../engine/index.js';
import { isAuthor } from './author.js';
import { chatChannels, content } from './content.js';
import { friendNews } from './community.js';
import { nameColorOf } from './cosmetics.js';
import { guildChannel, guildNews, guildOf, guildTagSql } from './guilds.js';
import { findMentions, mentionPeople, mentionsSaved, mentionsSql, mentionsView, newestMentions } from './mentions.js';
import { chatAccountName } from './names.js';
import { partyNews } from './parties.js';
import { tradeNews } from './trades.js';
import { duelNews } from './card-duel.js';
import { ApiError, json, readJson } from './http.js';
import { language, t } from './i18n.js';
import { OWN_CHARACTERS } from './roles.js';
import { requirePlayable, requireSession } from './sessions.js';
import { guessLanguage, translateText, translationOn } from './translate.js';

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
// An address: http(s), www., a name with a known domain ending, or any
// name with a two-letter or longer ending and a path ("gra.co/konto").
// Endings that are words of their own in Polish ("co", "to", "no") count
// only with a path, so "Hej.co tam?" is no link. The text is read with
// wide letters as plain ones and every kind of full stop as a dot (review
// of 12.11.2026: "gra．pl" with a full-width dot passed).
const LINK =
  /https?:\/\/|www\.|[\p{L}\p{N}-]+\.(?:pl|com|net|org|eu|io|gg|me|tv|ly|xyz|ru|info|app|dev|link|site|online|shop|club|fun|top|uk|de|us|ua|cz|sk|biz|cc|live|store|tk|ml|gq|cf|click|icu|cn|su|vip|life|world|space|website|tech|page|ws|fr|nl|au|gift|games|rocks|buzz|work|wtf|ai|gl|ink|cam|bond|cyou|sbs|cfd|mobi|asia|network|digital|email|center|news|blog|cloud|host|art|xn--[a-z0-9-]+)(?![\p{L}\p{N}])|[\p{L}\p{N}-]+\.\p{L}{2,}\//iu;
const asRead = (text) => text.normalize('NFKC').replace(/[\u3002\uff61\uff0e]/g, '.');
const WORD = /[\p{L}\p{N}_]+/gu;
// An admin's link: a label in square brackets with its address in round
// ones, or a bare address; http(s) only, the address without spaces.
export const ADMIN_LINK = /\[([^[\]]{1,80})\]\((https?:\/\/[^\s()]{1,500})\)|(https?:\/\/[^\s()]{1,500})/giu;

// The end of a silence, Polish time, as the request's language writes it:
// "06.11, 14:30", in English "06/11, 14:30".
const untilOptions = { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
const untilFormats = { pl: new Intl.DateTimeFormat('pl-PL', untilOptions), en: new Intl.DateTimeFormat('en-GB', untilOptions) };

// A channel of this server (chatChannels): the English one only where
// English is on.
function channelOf(id) {
  const channel = chatChannels().find((entry) => entry.id === id);
  if (!channel) throw new ApiError(404, 'no_channel', 'Nie ma takiego kanału.');
  return channel;
}

const whole = (value) => (/^\d{1,15}$/.test(value ?? '') ? Number(value) : 0);

// The channel of the private messages, each with its recipient.
const PRIVATE = 'private';
// The channel of the character's guild (guilds.js), kept as "guild:<id>".
const GUILD = 'guild';

// The guild channel a request names: the one of the asking character's
// guild, which only its members read and write in.
async function guildChannelFor(db, character) {
  const guild = await guildOf(db, character.id);
  if (!guild) throw new ApiError(403, 'no_guild', 'Nie należysz do gildii.');
  return guildChannel(guild.id);
}
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
    .bind(characterId, characterId, characterId, characterId, characterId, userId, content().chat.rules.conversations);
const conversationView = (row) => ({ id: row.id, name: row.name, classId: row.class_id, latest: row.latest ?? 0 });

// Why a silenced account cannot write, in the request's language, which
// writes the date its own way.
export function mutedText(until) {
  if (until >= FOREVER) return t('Czat jest dla Ciebie wyciszony na stałe.');
  return t('Czat jest dla Ciebie wyciszony do {until}.', { until: (untilFormats[language()] ?? untilFormats.pl).format(new Date(until)) });
}

// "admin" for the author's account, "moderator" for an account the author
// named, null for everyone else. `row` has the account's login, google_sub
// and chat_moderator.
export const chatRole = (env, row) =>
  isAuthor(env, { login: row.login, google: row.google_sub !== null }) ? 'admin' : row.chat_moderator === 1 ? 'moderator' : null;

// The message as it is kept: one line of visible signs, within the length,
// without links, with the words of data/chat.json turned into stars, of
// both lists (words, wordsEn) in every channel and language. The
// admin's (`admin`) may hold links (ADMIN_LINK): a labelled one counts as
// its label towards the length, the whole message stays within
// linkMaxLength signs, and the addresses keep their letters, stars only in
// the words around them and in the labels.
export function cleanText(raw, { admin = false } = {}) {
  if (typeof raw !== 'string') throw new ApiError(400, 'empty', 'Napisz wiadomość.');
  const text = raw.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new ApiError(400, 'empty', 'Napisz wiadomość.');
  const { maxLength, linkMaxLength } = content().chat.rules;
  const shown = admin ? text.replace(ADMIN_LINK, (whole, label) => label ?? whole) : text;
  if ([...shown].length > maxLength || [...text].length > linkMaxLength) throw new ApiError(400, 'too_long', `Wiadomość może mieć najwyżej ${maxLength} znaków.`);
  const words = [...content().chat.words, ...(content().chat.wordsEn ?? [])];
  const masked = (part) => part.replace(WORD, (word) => (words.some((bad) => word.toLowerCase().includes(bad)) ? '*'.repeat([...word].length) : word));
  if (!admin) {
    if (LINK.test(asRead(text))) throw new ApiError(400, 'link', 'Linki w czacie są niedozwolone.');
    return masked(text);
  }
  // The admin's: the words between the links and the labels masked, the
  // addresses as written.
  let kept = '';
  let at = 0;
  for (const found of text.matchAll(ADMIN_LINK)) {
    kept += masked(text.slice(at, found.index));
    const [whole, label, address] = found;
    kept += label === undefined ? whole : `[${masked(label)}](${address})`;
    at = found.index + whole.length;
  }
  return kept + masked(text.slice(at));
}

// The message as the chat shows it: the admin's links as their labels, a
// bare address left out (mentions.js reads the tags in it, and a phone
// notification its beginning).
export function shownText(text) {
  return String(text).replace(ADMIN_LINK, (whole, label) => label ?? '');
}

// A message of the System (the Loteria's result in the Globalny,
// casino.js) shows as the System's: its words and time only. `readerId`:
// the character that reads, whom the message may tag (mentions.js).
const messageView = (row, userId, env, readerId) =>
  row.system ? { id: row.id, system: true, text: row.text, createdAt: row.created_at, own: false } : playerMessageView(row, userId, env, readerId);

const playerMessageView = (row, userId, env, readerId) => ({
  id: row.id,
  characterId: row.character_id,
  name: row.name,
  // The writer's account's name now, before the character's, "Wędrowiec
  // (Radomira)" (832 A, names.js), or null.
  account: chatAccountName(row.account_name, row.name),
  // The writer's guild now, in square brackets beside its name (guilds.js).
  guildTag: row.guild_tag ?? null,
  // The writer's name in its frame's colour now, or null (cosmetics.js).
  nameColor: nameColorOf(row.cosmetics),
  level: row.level,
  classId: row.class_id,
  text: row.text,
  createdAt: row.created_at,
  own: row.user_id === userId,
  role: chatRole(env, row),
  ...(row.items && { items: JSON.parse(row.items) }),
  // The names it tags, as written, and whether it tags the reader.
  ...mentionsView(JSON.parse(row.mentions ?? '[]'), readerId),
  // The language it is written in, where the chat translates (translate.js).
  ...(translationOn(env) && { language: guessLanguage(shownText(row.text), row.writer_language) }),
});

// An item a Wymiana message shows: what its sheet tells.
const offeredItem = (item) => {
  const view = itemView(item, content());
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
  const most = content().chat.rules.items;
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
    db.prepare("SELECT id, name, level, class_id, cosmetics FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId),
    db.prepare('SELECT login, google_sub, chat_moderator, chat_rules_at, chat_muted_until, trade_off, seen_at, language, account_name FROM users WHERE id = ?').bind(session.userId),
  ]);
  const character = characters.results[0];
  if (!character) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  if (!isUnlocked('community', character.level, content())) {
    throw new ApiError(403, 'locked', `Społeczność odblokujesz na poziomie postaci ${content().unlocksById.community.level}.`);
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
  const asked = url.searchParams.get('channel') ?? 'global';
  const guild = !other && asked === GUILD ? await guildChannelFor(db, character) : null;
  const channel = other || guild ? null : channelOf(asked);
  const where = other ? `m.channel = '${PRIVATE}' AND ${PAIR}` : 'm.channel = ?';
  const binds = other ? pairOf(character.id, other.id) : [guild ?? channel.id];
  const after = whole(url.searchParams.get('after'));
  const from = whole(url.searchParams.get('from'));
  const { userId } = session;
  const [messages, hidden, blocked, reports, conversations] = await db.batch([
    db
      .prepare(
        `SELECT m.id, m.user_id, m.character_id, m.name, COALESCE(c.level, m.level) AS level, m.class_id, m.text, m.items, m.created_at, m.system, u.login, u.google_sub, u.chat_moderator, u.language AS writer_language, u.account_name,
                c.cosmetics, ${guildTagSql('m.character_id')} AS guild_tag, ${mentionsSql('m.id')} AS mentions
         FROM chat_messages m JOIN users u ON u.id = m.user_id LEFT JOIN characters c ON c.id = m.character_id
         WHERE ${where} AND m.id > ? AND m.hidden_at IS NULL AND (m.system = 1 OR m.user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?))
         ORDER BY m.id DESC LIMIT ?`,
      )
      .bind(...binds, after, userId, content().chat.rules.page),
    db.prepare(`SELECT m.id FROM chat_messages m WHERE ${where} AND m.id >= ? AND m.id <= ? AND m.hidden_at IS NOT NULL`).bind(...binds, from || after, after),
    blockedList(db, userId),
    db.prepare(role ? 'SELECT COUNT(DISTINCT message_id) AS count FROM chat_reports WHERE closed_at IS NULL' : 'SELECT NULL AS count'),
    conversationsOf(db, userId, character.id),
  ]);
  return json({
    channel: other ? PRIVATE : guild ? GUILD : channel.id,
    with: other && { id: other.id, name: other.name },
    messages: messages.results.reverse().map((row) => messageView(row, userId, context.env, character.id)),
    hidden: hidden.results.map((row) => row.id),
    conversations: conversations.results.map(conversationView),
    rulesAccepted: Boolean(account.chat_rules_at),
    mutedUntil: account.chat_muted_until > context.now ? account.chat_muted_until : null,
    blocked: blocked.results,
    role,
    reports: role ? reports.results[0].count : undefined,
  });
}

// The channels whose reading a character keeps, besides the private
// conversations: the Globalny, the Wymiana (where tags light it,
// mentions.js), the English one where English is on, and the guild's,
// under "guild".
const seenChannels = () => [...chatChannels().map((channel) => channel.id), GUILD];

// What a character has read, as POST /api/chat/seen keeps it: the newest
// message of each channel and of each private conversation, by the other
// character's id.
function seenOf(text) {
  let seen;
  try {
    seen = JSON.parse(text ?? '{}');
  } catch {
    seen = {};
  }
  const entries = Object.entries(seen?.private ?? {}).map(([other, id]) => [other, whole(String(id))]);
  return {
    ...Object.fromEntries(seenChannels().map((id) => [id, whole(String(seen?.[id] ?? 0))])),
    private: Object.fromEntries(entries.filter(([other, id]) => whole(other) && id)),
  };
}

// GET /api/chat/latest: the newest message someone else wrote in the
// Globalny that this player may read (the page's first channel, the English
// one for a page in English: chatChannels), the private conversations with
// the newest message of each other character, the newest message of each
// channel that tags the character (mentions.js), the Upominki and
// invitations waiting in Znajomi (community.js), for the light on the
// Społeczność tab, a Wymiana proposed or going on (trades.js), what the
// character has read on any of its devices, and when its activity ends: a
// Drużyna's trip moves when another member skips its time (time.js), and
// the page follows. Also a live card match challenged or going on
// (card-duel.js), its deadlines kept as it is read.
export async function latestChat(context) {
  const { session, character, db } = await requireChatter(context);
  // The guild's channel and the invitations to guilds (guilds.js).
  const guild = await guildOf(db, character.id);
  // The System's messages light it for everyone, the winner too.
  const newest = `SELECT MAX(id) AS id FROM chat_messages
         WHERE channel = ? AND hidden_at IS NULL AND (system = 1 OR (user_id != ? AND user_id NOT IN (SELECT blocked_id FROM chat_blocks WHERE user_id = ?)))`;
  const [row, conversations, friends, trade, read, partyInvites, guildRow, guildInvites, activity, mentions, duel] = await Promise.all([
    db.prepare(newest).bind(chatChannels({ own: true })[0].id, session.userId, session.userId).first(),
    conversationsOf(db, session.userId, character.id).all(),
    friendNews(db, character.id, context.now),
    tradeNews(db, character.id, context.now),
    db.prepare('SELECT chat_seen FROM characters WHERE id = ?').bind(character.id).first(),
    partyNews(db, character.id),
    guild ? db.prepare(newest).bind(guildChannel(guild.id), session.userId, session.userId).first() : null,
    guildNews(db, character.id),
    db.prepare('SELECT ends_at FROM activities WHERE character_id = ?').bind(character.id).first(),
    newestMentions(db, character.id, session.userId, guild ? guildChannel(guild.id) : null),
    duelNews(db, character.id, context.now),
  ]);
  return json({
    latest: row.id ?? 0,
    conversations: conversations.results.map(conversationView),
    mentions,
    ...friends,
    partyInvites,
    trade,
    duel,
    guild: guild && { name: guild.name, tag: guild.tag, latest: guildRow?.id ?? 0 },
    guildInvites,
    seen: seenOf(read?.chat_seen),
    activityEndsAt: activity?.ends_at ?? null,
  });
}

// POST /api/chat/seen {global: id}, {trade: id}, {english: id} where
// English is on, {guild: id}, or {with:
// character id, id}: the character has read a channel, or its private
// conversation with that character, up to message `id` on one of its
// devices; the others hear it from /api/chat/latest and put out the light
// (the tester: a message read on the computer still waited as new on the
// phone). A mark only goes forward.
export async function markChatSeen(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const marks = Object.fromEntries(seenChannels().map((id) => [id, Number.isInteger(body[id]) && body[id] > 0 ? body[id] : 0]));
  const other = Number.isInteger(body.with) && body.with > 0 ? body.with : 0;
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : 0;
  // A conversation is marked only by a message of it, so the record keeps
  // real conversations only (the code review: any number grew it).
  const known =
    other > 0 && id > 0 && (await db.prepare(`SELECT 1 AS ok FROM chat_messages m WHERE m.id = ? AND m.channel = ? AND ${PAIR}`).bind(id, PRIVATE, ...pairOf(character.id, other)).first());
  // Saved only over the record as read, read again when another device
  // saved meanwhile, so a mark never goes back.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const read = await db.prepare('SELECT chat_seen FROM characters WHERE id = ?').bind(character.id).first();
    const seen = seenOf(read?.chat_seen);
    let changed = false;
    for (const key of seenChannels()) {
      if (marks[key] > seen[key]) {
        seen[key] = marks[key];
        changed = true;
      }
    }
    if (known && id > (seen.private[other] ?? 0)) {
      seen.private[other] = id;
      changed = true;
    }
    if (!changed) return json({ seen });
    const saved = await db.prepare('UPDATE characters SET chat_seen = ? WHERE id = ? AND chat_seen IS ?').bind(JSON.stringify(seen), character.id, read?.chat_seen ?? null).run();
    if (saved.meta.changes === 1) return json({ seen });
  }
  throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
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
  if (!isUnlocked('community', other.level, content())) {
    throw new ApiError(409, 'locked', `${other.name} nie ma jeszcze Społeczności. Otworzy się na ${content().unlocksById.community.level}. poziomie.`);
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
// The characters it tags with "@" are kept with it (mentions.js); a
// message refused tags nobody.
export async function sendChat(context) {
  const { session, character, account, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const other = Number.isInteger(body.with) ? await partnerOf(db, character, body.with, session.userId) : null;
  const guild = !other && body.channel === GUILD ? await guildChannelFor(db, character) : null;
  const channel = other || guild ? null : channelOf(body.channel ?? 'global');
  const now = context.now;
  const { userId } = session;
  if (!account.chat_rules_at) throw new ApiError(403, 'rules', 'Najpierw zaakceptuj zasady czatu.');
  if (account.chat_muted_until > now) throw new ApiError(403, 'muted', mutedText(account.chat_muted_until));
  const text = cleanText(body.text, { admin: isAuthor(context.env, session.user) });
  if (other) await privateAllowed(db, userId, other);
  const offered = await offeredItems(db, channel, character.id, body.items);
  const items = offered && JSON.stringify(offered);
  const tags = await findMentions(db, shownText(text), { userId, channel: other ? PRIVATE : (guild ?? channel.id), recipientId: other?.id ?? null }, now);
  const { everySeconds, keep, privateKeep } = content().chat.rules;
  const where = other ? `m.channel = '${PRIVATE}' AND ${PAIR}` : 'm.channel = ?';
  const binds = other ? pairOf(character.id, other.id) : [guild ?? channel.id];
  const [sent] = await db.batch([
    db
      .prepare(
        `INSERT INTO chat_messages (channel, user_id, character_id, recipient_id, name, level, class_id, text, items, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE user_id = ? AND created_at > ? AND system = 0)`,
      )
      .bind(other ? PRIVATE : (guild ?? channel.id), userId, character.id, other?.id ?? null, character.name, character.level, character.class_id, text, items, now, userId, now - everySeconds * 1000),
    db
      .prepare(
        `DELETE FROM chat_messages WHERE id IN (SELECT m.id FROM chat_messages m WHERE ${where}
           AND m.id <= (SELECT m.id FROM chat_messages m WHERE ${where} ORDER BY m.id DESC LIMIT 1 OFFSET ?)
           AND m.id NOT IN (SELECT message_id FROM chat_reports WHERE closed_at IS NULL))`,
      )
      .bind(...binds, ...binds, other ? privateKeep : keep),
  ]);
  if (sent.meta.changes !== 1) throw new ApiError(429, 'too_fast', `Za szybko. Kolejną wiadomość wyślesz po ${everySeconds} sekundach.`);
  const id = sent.meta.last_row_id;
  // The message is written: tags that fail to keep do not undo it.
  let kept = [];
  if (tags.length > 0) {
    try {
      await db.batch(mentionsSaved(db, id, tags, now));
      kept = tags;
    } catch (error) {
      console.error(error);
    }
  }
  const row = {
    ...account,
    id,
    user_id: userId,
    character_id: character.id,
    name: character.name,
    level: character.level,
    class_id: character.class_id,
    cosmetics: character.cosmetics,
    text,
    items,
    created_at: now,
    writer_language: account.language,
    mentions: JSON.stringify(kept.map((tag) => ({ id: tag.characterId, text: tag.written }))),
  };
  return json({ message: messageView(row, userId, context.env, character.id) }, 201);
}

// Whether the character reads the message: in a channel of this server, in
// its guild's, or a private one it wrote or got; never one taken down, the
// System's, or one of a player it hides.
async function readable(db, character, userId, row) {
  if (!row || row.hidden_at !== null || row.system) return false;
  if (row.channel === PRIVATE) {
    if (row.character_id !== character.id && row.recipient_id !== character.id) return false;
  } else if (row.channel.startsWith(`${GUILD}:`)) {
    const guild = await guildOf(db, character.id);
    if (!guild || guildChannel(guild.id) !== row.channel) return false;
  } else if (!chatChannels().some((channel) => channel.id === row.channel)) return false;
  return !(await db.prepare('SELECT 1 FROM chat_blocks WHERE user_id = ? AND blocked_id = ?').bind(userId, row.user_id).first());
}

// POST /api/chat/translate {id}: the message in the language the player
// plays in, by the machine (714 A, translate.js). A translation made once
// is kept for everyone who asks in that language; a new one counts towards
// the account's rules.translations of the day (Polish time) and is given
// back when the translator gives nothing.
export async function translateChat(context) {
  const { session, character, db } = await requireChatter(context);
  const { env, now } = context;
  if (!translationOn(env)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const body = await readJson(context.request);
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : 0;
  const row = id
    ? await db
        .prepare(
          `SELECT m.id, m.channel, m.user_id, m.character_id, m.recipient_id, m.text, m.system, m.hidden_at, u.language AS writer_language
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
        )
        .bind(id)
        .first()
    : null;
  if (!(await readable(db, character, session.userId, row))) throw new ApiError(404, 'no_message', 'Nie ma takiej wiadomości.');
  const target = language();
  const text = shownText(row.text);
  const source = guessLanguage(text, row.writer_language);
  if (source === target) return json({ id, text });
  const kept = await db.prepare('SELECT text FROM chat_translations WHERE message_id = ? AND language = ?').bind(id, target).first();
  if (kept) return json({ id, text: kept.text });
  const most = content().chat.rules.translations;
  const day = questPeriod('daily', now, content()).key;
  // One more of the day's, only while some are left; SQLite reads the old
  // day in all assignments.
  const counted = await db
    .prepare(
      `UPDATE users SET translations_used = CASE WHEN translations_day = ? THEN translations_used + 1 ELSE 1 END,
         translations_returned = CASE WHEN translations_day = ? THEN translations_returned ELSE 0 END, translations_day = ?
       WHERE id = ? AND (translations_day IS NOT ? OR translations_used < ?)`,
    )
    .bind(day, day, day, session.userId, day, most)
    .run();
  if (counted.meta.changes !== 1) throw new ApiError(429, 'translations_used', `Dzisiejsze tłumaczenia (${most}) są już wykorzystane. Nowe od północy.`);
  const translated = await translateText(env, text, source, target);
  if (!translated) {
    // A failed one goes back to the day's, at most as many times a day as
    // the day has (review of 12.11.2026: a text the translator answers with
    // nothing could be sent to it without end).
    await db
      .prepare(
        `UPDATE users SET translations_used = translations_used - 1, translations_returned = translations_returned + 1
         WHERE id = ? AND translations_day = ? AND translations_used > 0 AND translations_returned < ?`,
      )
      .bind(session.userId, day, most)
      .run();
    throw new ApiError(502, 'translate_failed', 'Tłumaczenie się nie udało. Spróbuj za chwilę.');
  }
  await db.prepare('INSERT OR IGNORE INTO chat_translations (message_id, language, text, created_at) VALUES (?, ?, ?, ?)').bind(id, target, translated, now).run();
  return json({ id, text: translated });
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

// GET /api/chat/people: whom "@" suggests in the line to write in besides
// those who wrote in the channel shown: the character's friends and the
// members of its guild (mentions.js).
export async function chatPeople(context) {
  const { session, character, db } = await requireChatter(context);
  return json(await mentionPeople(db, character.id, session.userId));
}

// The message a request names, still in the chat, with its writer's
// account. A private one only its two characters see, and the moderation;
// `character` is the one who asks, none for the moderation.
async function namedMessage(db, body, character = null) {
  const message = Number.isInteger(body.messageId)
    ? await db
        .prepare(
          `SELECT m.id, m.channel, m.user_id, m.character_id, m.recipient_id, m.name, m.hidden_at, m.system, u.login, u.google_sub, u.chat_moderator
           FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
        )
        .bind(body.messageId)
        .first()
    : null;
  const unseen = message?.channel === PRIVATE && character && ![message.character_id, message.recipient_id].includes(character.id);
  // A guild's message only its members see, and the moderation.
  const outside = message?.channel.startsWith(`${GUILD}:`) && character && (await guildOf(db, character.id).then((guild) => !guild || guildChannel(guild.id) !== message.channel));
  if (!message || unseen || outside) throw new ApiError(404, 'no_message', 'Tej wiadomości już nie ma.');
  return message;
}

// POST /api/chat/report {messageId}: a report for the moderation, once per
// player and message; enough reports take the message down until the
// moderation decides.
export async function reportChat(context) {
  const { session, character, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request), character);
  if (message.system) throw new ApiError(400, 'system', 'Komunikatu Systemu nie zgłosisz.');
  if (message.user_id === session.userId) throw new ApiError(400, 'own', 'Własnej wiadomości nie zgłosisz.');
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO chat_reports (message_id, user_id, created_at) VALUES (?, ?, ?)').bind(message.id, session.userId, context.now),
    db
      .prepare(
        `UPDATE chat_messages SET hidden_at = ? WHERE id = ? AND hidden_at IS NULL
           AND (SELECT COUNT(*) FROM chat_reports WHERE message_id = ? AND closed_at IS NULL) >= ?`,
      )
      .bind(context.now, message.id, message.id, content().chat.rules.hideAfterReports),
  ]);
  return json({ text: t('Zgłoszono. Moderacja sprawdzi tę wiadomość.') });
}

// POST /api/chat/block {messageId}: the player stops seeing the messages of
// the one who wrote it, also of their later characters.
export async function blockInChat(context) {
  const { session, character, db } = await requireChatter(context);
  const message = await namedMessage(db, await readJson(context.request), character);
  if (message.system) throw new ApiError(400, 'system', 'Komunikatu Systemu nie ukryjesz.');
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
      guild: row.channel.startsWith(`${GUILD}:`),
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
  // The System's message silences nobody: its account is the winner's.
  if (message.system && body.action.startsWith('mute')) throw new ApiError(400, 'system', 'Komunikat Systemu nikogo nie wycisza.');
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
