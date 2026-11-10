// What waits in the chat and in the Społeczność: messages someone wrote in
// the Globalny or in a private conversation since the player last read
// them, invitations to the Znajomi, Upominki to collect or to send today and
// a Wymiana proposed or going on.
// The chat's news light the round chat button (chat-bubble.js) and the
// chat's tabs (screens/community.js, mountChat); the rest lights the
// Społeczność tab (layout.js), as Postać does for free points, and its parts
// in its list. The chat is no part of the Społeczność any more (the author,
// 10.11.2026: „tylko z zakładki”). While the game is in front, the page asks for
// them every 15 seconds (/api/chat/latest in src/server/chat.js), which
// also keeps the player online for a Wymiana. The newest messages read go
// to the server too (/api/chat/seen), so a message read on the computer
// no longer waits as new on the phone; the Globalny's light muted stays on
// the device. Private messages light it even then, and so does a message
// that tags the character with "@" (src/server/mentions.js), in any
// channel, the Wymiana too, until the character has read that channel.
// "The Globalny" here is the chat's first channel, which a page in English
// has the English one for (chatChannels in src/server/content.js); its
// mark goes to the server under that channel's own id.

import { request } from './api.js';
import { t } from './i18n.js';
import { isUnlocked, state } from './state.js';

const SEEN_KEY = 'insight-chat-seen';
const CHANNELS_KEY = 'insight-chat-channels-seen';
const GUILD_KEY = 'insight-chat-guild-seen';
const PRIVATE_KEY = 'insight-chat-private-seen';
const MUTED_KEY = 'insight-chat-muted';
const EVERY_MS = 15000;

let latest = 0;
let seen = 0;
// The newest message read in the other channels (the Wymiana), by its id.
let channelSeen = {};
// The newest message of each channel that tags the character
// (src/server/mentions.js): { global, trade, guild, private: { [other]: id } }.
let tagged = { private: {} };
// The character's guild (src/server/guilds.js) with the newest message of
// its channel by someone else, or null, and the newest one read there.
let guild = null;
let guildSeenId = 0;
// Invitations to guilds waiting.
let guildInvites = 0;
// What waits in the character's guild (src/server/guild-todo.js): {trials,
// beast, expedition, requests, chest}, each true when there is something to
// do, or null.
let guildTodo = null;
let todoAskedAt = 0;
const TODO_EVERY_MS = 60000;
// The newest message read in each private conversation, by the other
// character's id.
let privateSeen = {};
let muted = false;
try {
  seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
  channelSeen = JSON.parse(localStorage.getItem(CHANNELS_KEY) ?? '{}') ?? {};
  guildSeenId = Number(localStorage.getItem(GUILD_KEY)) || 0;
  privateSeen = JSON.parse(localStorage.getItem(PRIVATE_KEY) ?? '{}') ?? {};
  muted = localStorage.getItem(MUTED_KEY) === '1';
} catch {
  // Without storage the light goes out until the page is reloaded.
}
// The private conversations, each with the newest message of the other.
let conversations = [];
let invites = 0;
let gifts = 0;
// Friends without an Upominek from this character today.
let unsent = 0;
// Invitations to a Drużyna waiting (parties.js).
let partyInvites = 0;
// The character's live Wymiana: { id, state, proposer, other }, or null.
let trade = null;
let askedAt = 0;
const listeners = new Set();
// Told the end of the character's activity at each check (app.js).
let activityListener = null;

const open = () => Boolean(state.character) && isUnlocked('community');
// The Globalny: the first channel, whose news the bell mutes.
const globalId = () => state.content?.chat?.channels[0]?.id ?? 'global';
const channelMark = (id) => (id === globalId() ? seen : (channelSeen[id] ?? 0));
// A message that tags the character waits unread in channel `id` (the
// guild's: 'guild'), or with `other` in the private conversation with that
// character.
export function mentionNews(id, other = null) {
  if (!open()) return false;
  if (other !== null) return (tagged.private[other] ?? 0) > (privateSeen[other] ?? 0);
  if (id === 'guild') return Boolean(guild) && (tagged.guild ?? 0) > guildSeenId;
  return (tagged[id] ?? 0) > channelMark(id);
}
// A tag of the character waiting in any channel or conversation.
export const anyMentionNews = () =>
  Object.keys(tagged).some((id) => id !== 'private' && mentionNews(id)) || Object.keys(tagged.private).some((other) => mentionNews(null, Number(other)));
export const globalNews = () => open() && ((!muted && latest > seen) || mentionNews(globalId()));
export const conversationNews = (id, newest = conversations.find((entry) => entry.id === id)?.latest ?? 0) => open() && newest > (privateSeen[id] ?? 0);
// The guild's channel: messages there light the chat like private ones.
export const guildChannel = () => (open() ? guild : null);
export const guildChannelNews = () => Boolean(guildChannel()) && guild.latest > guildSeenId;
export const chatNews = () => globalNews() || guildChannelNews() || conversations.some((entry) => conversationNews(entry.id, entry.latest)) || anyMentionNews();
// The light of a channel's tab: the Globalny's and the guild's for any
// news, the other channels' (the Wymiana) for a tag only.
export const channelNews = (id) => (id === 'guild' ? guildChannelNews() : id === globalId() ? globalNews() : mentionNews(id));
// The channel where the newest tag waits unread, for the chat to open on:
// its id ('guild' for the guild's), or null; private conversations light
// their own tabs.
export function mentionChannel() {
  const waiting = Object.keys(tagged).filter((id) => id !== 'private' && mentionNews(id));
  return waiting.sort((a, b) => (tagged[b] ?? 0) - (tagged[a] ?? 0))[0] ?? null;
}
export const friendNews = () => open() && invites + gifts + unsent > 0;
export const partyNews = () => open() && isUnlocked('party') && partyInvites > 0;
export const guildNews = () => open() && guildInvites > 0;
// Something to do in the guild: in its part `part` (trials, beast,
// requests), or in any (the author: a trial not taken lights the dot).
export const guildTodoNews = (part) => open() && Boolean(guild) && Boolean(guildTodo) && (part ? Boolean(guildTodo[part]) : Object.values(guildTodo).some(Boolean));
export const liveTrade = () => (open() ? trade : null);
// A proposal to this character, or a trade going on.
export const tradeNews = () => Boolean(liveTrade()) && !(trade.state === 'proposed' && trade.proposer);
// A reward of the Punkty Sławy waiting (state.fame, src/server/fame.js),
// until it is taken in the Sława.
export const fameNews = () => open() && Boolean(state.fame?.reward);
export const communityNews = () => friendNews() || partyNews() || guildNews() || guildTodoNews() || tradeNews() || fameNews();
export const chatMuted = () => muted;

// The tab's light in words, for a screen reader.
export const communityNewsText = () =>
  tradeNews()
    ? trade.state === 'proposed'
      ? t('propozycja wymiany czeka')
      : t('trwa wymiana')
    : partyNews()
        ? t('zaproszenie do drużyny czeka')
        : guildNews()
          ? t('zaproszenie do gildii czeka')
          : guildTodoNews()
            ? t('w gildii czeka coś do zrobienia')
          : fameNews()
            ? t('nagroda Sławy czeka')
          : invites > 0
        ? t('zaproszenie do znajomych czeka')
        : gifts > 0
          ? t('upominek czeka')
          : t('upominek do wysłania');

// What happens when a light changes (app.js redraws the bar); the returned
// function stops it.
export function onChatNews(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// The lights as words, to tell when one changed.
const lights = () =>
  [
    globalNews(),
    ...Object.keys(tagged).filter((id) => id !== 'private').map((id) => `${id}:${mentionNews(id)}`),
    ...Object.keys(tagged.private).map((other) => `@${other}:${mentionNews(null, Number(other))}`),
    guildChannelNews(),
    friendNews(),
    partyNews(),
    guildNews(),
    guild?.name,
    JSON.stringify(guildTodo),
    trade && `${trade.id}:${trade.state}:${trade.proposer}`,
    ...conversations.map((entry) => `${entry.id}:${conversationNews(entry.id, entry.latest)}`),
  ].join();

// Runs `change` and tells the listeners if a light changed.
function update(change) {
  const was = lights();
  change();
  if (was !== lights()) for (const listener of listeners) listener();
}

// The private conversations as the chat last heard them.
export function conversationsSeen(list) {
  update(() => {
    conversations = list;
  });
}

// Keeps the marks read on this device, and with `tell` on the server too,
// for the character's other devices.
function keep(tell) {
  try {
    localStorage.setItem(SEEN_KEY, String(seen));
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channelSeen));
    localStorage.setItem(GUILD_KEY, String(guildSeenId));
    localStorage.setItem(PRIVATE_KEY, JSON.stringify(privateSeen));
  } catch {
    // Kept for this page only.
  }
  if (tell) request('POST', '/api/chat/seen', tell).catch(() => {});
}

// The conversation with character `other` shows messages up to `id`.
export function privateRead(other, id) {
  if (id <= (privateSeen[other] ?? 0)) return;
  update(() => {
    privateSeen = { ...privateSeen, [other]: id };
  });
  keep({ with: Number(other), id });
}

// A private conversation asked for on a character's sheet (profile.js), for
// the chat to open: the side column's on a computer (side.js), else the
// Czat's own screen (screens/chat.js). Whether a chat on the screen took it
// at once; if not, the Czat takes it when it opens.
let wanted = null;
export function wantConversation(person) {
  wanted = person;
  for (const listener of listeners) listener();
  return wanted === null;
}
export function takeConversation() {
  const person = wanted;
  wanted = null;
  return person;
}

// "Oznacz" on a character's sheet opened away from the chat (profile.js):
// the name for the Globalny's line of the chat. Whether a chat on the
// screen took it at once; if not, the Czat takes it when it opens.
let wantedTag = null;
export function wantMention(name) {
  wantedTag = name;
  for (const listener of listeners) listener();
  return wantedTag === null;
}
export function takeMention() {
  const name = wantedTag;
  wantedTag = null;
  return name;
}

// The guild's channel shows messages up to `id`.
export function guildRead(id) {
  if (id <= guildSeenId) return;
  update(() => {
    guildSeenId = id;
  });
  keep({ guild: id });
}

// The Gildia as its screen last saw it (screens/guild.js): the guild, for
// the chat's tab, and the invitations waiting.
export function guildSeen(view) {
  update(() => {
    guild = view.guild ? { name: view.guild.name, tag: view.guild.tag, latest: guild?.latest ?? 0 } : null;
    guildInvites = view.invites?.length ?? 0;
  });
}

// The Globalny shows messages up to `id`.
export function chatSeen(id) {
  if (id <= seen) return;
  update(() => {
    seen = id;
  });
  keep({ [globalId()]: id });
}

// Channel `channelId` shows messages up to `id`: the Globalny, or another
// one (the Wymiana), with a mark of its own.
export function channelRead(channelId, id) {
  if (channelId === globalId()) {
    chatSeen(id);
    return;
  }
  if (id <= (channelSeen[channelId] ?? 0)) return;
  update(() => {
    channelSeen = { ...channelSeen, [channelId]: id };
  });
  keep({ [channelId]: id });
}

// "Wycisz powiadomienia czatu": new messages of the Globalny no longer
// light the round chat button nor the chat's tab.
export function setChatMuted(value) {
  update(() => {
    muted = value;
    try {
      localStorage.setItem(MUTED_KEY, value ? '1' : '0');
    } catch {
      // Kept for this page only.
    }
  });
}

// The Wymiana as its screen last saw it (screens/trade.js), live or over.
export function tradeSeen(view) {
  update(() => {
    trade = view && ['proposed', 'open', 'locked'].includes(view.state) ? { id: view.id, state: view.state, proposer: view.proposer, other: view.other.name } : null;
  });
}

// The Znajomi as the server last described them (/api/friends): the
// invitations waiting, the Upominki the character may still collect today
// and the friends it has not sent one to yet.
export function friendsSeen(view) {
  update(() => {
    invites = view.incoming.length;
    gifts = Math.min(view.gifts.waiting, Math.max(0, view.gifts.claimsPerDay - view.gifts.claimedToday));
    unsent = view.friends.filter((friend) => !friend.sentToday).length;
  });
}

// The Drużyna as its screen last saw it (screens/party.js): the invitations
// waiting.
export function partySeen(view) {
  update(() => {
    partyInvites = view.invites?.length ?? 0;
  });
}

// Asks the server for the newest message, what waits in the Znajomi and the
// Wymiana, at most every 15 seconds unless `now` is set; nothing while the
// page is in the background.
export async function checkChat({ now = false } = {}) {
  if (!open() || document.hidden) return;
  if (!now && Date.now() - askedAt < EVERY_MS) return;
  askedAt = Date.now();
  let answer;
  try {
    answer = await request('GET', '/api/chat/latest');
  } catch {
    return;
  }
  update(() => {
    latest = answer.latest ?? 0;
    conversations = answer.conversations ?? [];
    invites = answer.invites ?? 0;
    gifts = answer.gifts ?? 0;
    unsent = answer.unsent ?? 0;
    partyInvites = answer.partyInvites ?? 0;
    guild = answer.guild ?? null;
    guildInvites = answer.guildInvites ?? 0;
    trade = answer.trade ?? null;
    tagged = { ...answer.mentions, private: answer.mentions?.private ?? {} };
    // What the character read on its other devices.
    seen = Math.max(seen, answer.seen?.[globalId()] ?? 0);
    for (const [id, mark] of Object.entries(answer.seen ?? {})) {
      if (!['private', 'guild', globalId()].includes(id) && Number.isInteger(mark)) channelSeen = { ...channelSeen, [id]: Math.max(channelSeen[id] ?? 0, mark) };
    }
    guildSeenId = Math.max(guildSeenId, answer.seen?.guild ?? 0);
    for (const [other, id] of Object.entries(answer.seen?.private ?? {})) privateSeen = { ...privateSeen, [other]: Math.max(privateSeen[other] ?? 0, id) };
  });
  if (answer.seen) keep(null);
  if (answer.activityEndsAt !== undefined) activityListener?.(answer.activityEndsAt);
  checkGuildTodo();
}

// Asks what waits in the character's guild, about once a minute unless
// `now` is set (after an action in the guild), and only in a guild.
export async function checkGuildTodo({ now = false } = {}) {
  if (!open() || !guild) {
    if (guildTodo) update(() => (guildTodo = null));
    return;
  }
  if (!now && Date.now() - todoAskedAt < TODO_EVERY_MS) return;
  todoAskedAt = Date.now();
  let answer;
  try {
    answer = await request('GET', '/api/guild/todo');
  } catch {
    return;
  }
  update(() => {
    guildTodo = answer.todo ?? null;
  });
}

// The end of the character's activity, as each check hears it: a Drużyna's
// trip moves when another member skips its time (src/server/time.js).
export function onActivityEnds(listener) {
  activityListener = listener;
}
