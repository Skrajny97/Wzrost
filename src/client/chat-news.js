// What waits in the Społeczność: messages someone wrote in the Globalny or
// in a private conversation since the player last read them, invitations
// to the Znajomi and Upominki to collect. The Społeczność tab lights up then
// (layout.js), as Postać does for free points, and so do their parts in its
// list and the chat's tabs (screens/community.js). While the game is in
// front, the page asks for them every minute (/api/chat/latest in
// src/server/chat.js); the newest messages read stay on the device, and so
// does the Globalny's light muted. Private messages light it even then.

import { request } from './api.js';
import { isUnlocked, state } from './state.js';

const SEEN_KEY = 'insight-chat-seen';
const PRIVATE_KEY = 'insight-chat-private-seen';
const MUTED_KEY = 'insight-chat-muted';
const EVERY_MS = 60000;

let latest = 0;
let seen = 0;
// The newest message read in each private conversation, by the other
// character's id.
let privateSeen = {};
let muted = false;
try {
  seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
  privateSeen = JSON.parse(localStorage.getItem(PRIVATE_KEY) ?? '{}') ?? {};
  muted = localStorage.getItem(MUTED_KEY) === '1';
} catch {
  // Without storage the light goes out until the page is reloaded.
}
// The private conversations, each with the newest message of the other.
let conversations = [];
let invites = 0;
let gifts = 0;
let askedAt = 0;
const listeners = new Set();

const open = () => Boolean(state.character) && isUnlocked('community');
export const globalNews = () => open() && !muted && latest > seen;
export const conversationNews = (id, newest = conversations.find((entry) => entry.id === id)?.latest ?? 0) => open() && newest > (privateSeen[id] ?? 0);
export const chatNews = () => globalNews() || conversations.some((entry) => conversationNews(entry.id, entry.latest));
export const friendNews = () => open() && invites + gifts > 0;
export const communityNews = () => chatNews() || friendNews();
export const chatMuted = () => muted;

// The tab's light in words, for a screen reader.
export const communityNewsText = () =>
  chatNews() ? 'nowe wiadomości na czacie' : invites > 0 ? 'zaproszenie do znajomych czeka' : 'upominek czeka';

// What happens when a light changes (app.js redraws the bar); the returned
// function stops it.
export function onChatNews(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// The lights as words, to tell when one changed.
const lights = () => [globalNews(), friendNews(), ...conversations.map((entry) => `${entry.id}:${conversationNews(entry.id, entry.latest)}`)].join();

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

// The conversation with character `other` shows messages up to `id`.
export function privateRead(other, id) {
  if (id <= (privateSeen[other] ?? 0)) return;
  update(() => {
    privateSeen = { ...privateSeen, [other]: id };
    try {
      localStorage.setItem(PRIVATE_KEY, JSON.stringify(privateSeen));
    } catch {
      // Kept for this page only.
    }
  });
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

// The Globalny shows messages up to `id`.
export function chatSeen(id) {
  if (id <= seen) return;
  update(() => {
    seen = id;
    try {
      localStorage.setItem(SEEN_KEY, String(id));
    } catch {
      // Kept for this page only.
    }
  });
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

// The Znajomi as the server last described them (/api/friends): the
// invitations waiting, and the Upominki the character may still collect today.
export function friendsSeen(view) {
  update(() => {
    invites = view.incoming.length;
    gifts = Math.min(view.gifts.waiting, Math.max(0, view.gifts.claimsPerDay - view.gifts.claimedToday));
  });
}

// Asks the server for the newest message and what waits in the Znajomi, at
// most once a minute unless `now` is set; nothing while the page is in the
// background.
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
  });
}
