// What waits in the Społeczność: messages someone wrote in the Globalny or
// in a private conversation since the player last read them, invitations
// to the Znajomi, Upominki to collect or to send today and a Wymiana
// proposed or going on.
// The Społeczność tab lights up then (layout.js), as Postać does for free
// points, and so do their parts in its list and the chat's tabs
// (screens/community.js). While the game is in front, the page asks for
// them every 15 seconds (/api/chat/latest in src/server/chat.js), which
// also keeps the player online for a Wymiana. The newest messages read go
// to the server too (/api/chat/seen), so a message read on the computer
// no longer waits as new on the phone; the Globalny's light muted stays on
// the device. Private messages light it even then.

import { request } from './api.js';
import { isUnlocked, state } from './state.js';

const SEEN_KEY = 'insight-chat-seen';
const GUILD_KEY = 'insight-chat-guild-seen';
const PRIVATE_KEY = 'insight-chat-private-seen';
const MUTED_KEY = 'insight-chat-muted';
const EVERY_MS = 15000;

let latest = 0;
let seen = 0;
// The character's guild (src/server/guilds.js) with the newest message of
// its channel by someone else, or null, and the newest one read there.
let guild = null;
let guildSeenId = 0;
// Invitations to guilds waiting.
let guildInvites = 0;
// The newest message read in each private conversation, by the other
// character's id.
let privateSeen = {};
let muted = false;
try {
  seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
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

const open = () => Boolean(state.character) && isUnlocked('community');
export const globalNews = () => open() && !muted && latest > seen;
export const conversationNews = (id, newest = conversations.find((entry) => entry.id === id)?.latest ?? 0) => open() && newest > (privateSeen[id] ?? 0);
// The guild's channel: messages there light the chat like private ones.
export const guildChannel = () => (open() ? guild : null);
export const guildChannelNews = () => Boolean(guildChannel()) && guild.latest > guildSeenId;
export const chatNews = () => globalNews() || guildChannelNews() || conversations.some((entry) => conversationNews(entry.id, entry.latest));
export const friendNews = () => open() && invites + gifts + unsent > 0;
export const partyNews = () => open() && isUnlocked('party') && partyInvites > 0;
export const guildNews = () => open() && guildInvites > 0;
export const liveTrade = () => (open() ? trade : null);
// A proposal to this character, or a trade going on.
export const tradeNews = () => Boolean(liveTrade()) && !(trade.state === 'proposed' && trade.proposer);
export const communityNews = () => chatNews() || friendNews() || partyNews() || guildNews() || tradeNews();
export const chatMuted = () => muted;

// The tab's light in words, for a screen reader.
export const communityNewsText = () =>
  tradeNews()
    ? trade.state === 'proposed'
      ? 'propozycja wymiany czeka'
      : 'trwa wymiana'
    : chatNews()
      ? 'nowe wiadomości na czacie'
      : partyNews()
        ? 'zaproszenie do drużyny czeka'
        : guildNews()
          ? 'zaproszenie do gildii czeka'
          : invites > 0
        ? 'zaproszenie do znajomych czeka'
        : gifts > 0
          ? 'upominek czeka'
          : 'upominek do wysłania';

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
    guildChannelNews(),
    friendNews(),
    partyNews(),
    guildNews(),
    guild?.name,
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

// A private conversation asked for on a character's sheet (profile.js),
// for the Społeczność to open.
let wanted = null;
export function wantConversation(person) {
  wanted = person;
  for (const listener of listeners) listener();
}
export function takeConversation() {
  const person = wanted;
  wanted = null;
  return person;
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
  keep({ global: id });
}

// "Wycisz powiadomienia czatu": new messages of the Globalny no longer
// light the tab.
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
    // What the character read on its other devices.
    seen = Math.max(seen, answer.seen?.global ?? 0);
    guildSeenId = Math.max(guildSeenId, answer.seen?.guild ?? 0);
    for (const [other, id] of Object.entries(answer.seen?.private ?? {})) privateSeen = { ...privateSeen, [other]: Math.max(privateSeen[other] ?? 0, id) };
  });
  if (answer.seen) keep(null);
}
