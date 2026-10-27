// Whether someone wrote in the chat since the player last read it: the
// Społeczność tab lights up then (layout.js), as Postać does for free
// points. While the game is in front, the page asks for the newest message
// someone else wrote every minute (src/server/chat.js); the newest one read
// on the chat stays on the device.

import { request } from './api.js';
import { isUnlocked, state } from './state.js';

const SEEN_KEY = 'insight-chat-seen';
const EVERY_MS = 60000;

let latest = 0;
let seen = 0;
try {
  seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
} catch {
  // Without storage the light goes out until the page is reloaded.
}
let askedAt = 0;
let listener = null;

export const chatNews = () => isUnlocked('community') && latest > seen;

// What happens when the light changes (app.js redraws the bar).
export function onChatNews(callback) {
  listener = callback;
}

// The chat shows messages up to `id`.
export function chatSeen(id) {
  if (id <= seen) return;
  const was = chatNews();
  seen = id;
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // Kept for this page only.
  }
  if (was !== chatNews()) listener?.();
}

// Asks the server for the newest message, at most once a minute unless
// `now` is set; nothing while the page is in the background.
export async function checkChat({ now = false } = {}) {
  if (!state.character || !isUnlocked('community') || document.hidden) return;
  if (!now && Date.now() - askedAt < EVERY_MS) return;
  askedAt = Date.now();
  const was = chatNews();
  try {
    latest = (await request('GET', '/api/chat/latest')).latest ?? 0;
  } catch {
    return;
  }
  if (was !== chatNews()) listener?.();
}
