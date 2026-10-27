// What waits in the Społeczność: messages someone wrote in the chat since the
// player last read it, invitations to the Znajomi and Upominki to collect.
// The Społeczność tab lights up then (layout.js), as Postać does for free
// points, and so do their parts in its list (screens/community.js). While
// the game is in front, the page asks for them every minute
// (/api/chat/latest in src/server/chat.js); the newest message read stays
// on the device, and so does the chat's light muted.

import { request } from './api.js';
import { isUnlocked, state } from './state.js';

const SEEN_KEY = 'insight-chat-seen';
const MUTED_KEY = 'insight-chat-muted';
const EVERY_MS = 60000;

let latest = 0;
let seen = 0;
let muted = false;
try {
  seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
  muted = localStorage.getItem(MUTED_KEY) === '1';
} catch {
  // Without storage the light goes out until the page is reloaded.
}
let invites = 0;
let gifts = 0;
let askedAt = 0;
const listeners = new Set();

const open = () => Boolean(state.character) && isUnlocked('community');
export const chatNews = () => open() && !muted && latest > seen;
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

// Runs `change` and tells the listeners if a light changed.
function update(change) {
  const was = [chatNews(), friendNews()].join();
  change();
  if (was !== [chatNews(), friendNews()].join()) for (const listener of listeners) listener();
}

// The chat shows messages up to `id`.
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

// "Wycisz powiadomienia czatu": new messages no longer light the tab.
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
    invites = answer.invites ?? 0;
    gifts = answer.gifts ?? 0;
  });
}
