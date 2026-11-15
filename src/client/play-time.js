// The time in the game (993 A; src/server/play-time.js): the page counts
// the seconds while the game is on the screen and was touched (a tap, a
// click, a key, the wheel) in the last idleMinutes, so a game left on for
// the night stops counting; after each such minute it tells the server,
// which counts the minute and pays its Punkt Czasu up to the day's limit.
// The wallet shows the day's count (layout.js, 994). Called every second by
// the game's ticker (app.js), which runs while the game is open.

import { request } from './api.js';
import { state } from './state.js';

const MINUTE = 60000;
let touched = Date.now();
// When the minute being counted began, or null while the game is not in
// front or untouched.
let since = null;
let sending = false;

for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  addEventListener(type, () => (touched = Date.now()), { capture: true, passive: true });
}

export function watchPlayTime() {
  const character = state.character;
  const now = Date.now();
  const idle = (character?.play?.idleMinutes ?? 10) * MINUTE;
  if (!character?.play || document.visibilityState !== 'visible' || now - touched > idle) {
    since = null;
    return;
  }
  if (since === null) since = now;
  if (now - since < MINUTE || sending) return;
  since = now;
  sending = true;
  request('POST', '/api/play')
    .then((answer) => {
      // The point joins the character as the page has it, so the clock's
      // own points (timePointsGain) count on as they were.
      if (!state.character || !answer?.play) return;
      state.character.timePoints += answer.gained ?? 0;
      state.character.play = answer.play;
    })
    .catch(() => {})
    .finally(() => (sending = false));
}
