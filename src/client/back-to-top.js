// "Na górę" (a player, poz. 33, in the game's chat: „guzik powrotu na górę
// zakładki. Niektóre [po] zwinięciu wszystkich tekstów są długie i trzeba
// sporo przewijać.”; the author, 19.11.2026: „mądre pomysły”; DECISIONS.md,
// "Przycisk „Na górę” (makiety, 19.11.2026)"): a small round button with an
// arrow up, in the look of the round chat button (chat-bubble.js), that
// shows once a screen of the game is scrolled down more than one and a half
// screen heights, and glides back to its top (at once with the game's
// animations off, motion.js). The page itself scrolls, on a phone and in
// the computer's layout alike (the menu and the side column stand sticky
// beside the game's column), so the button watches the window. Short
// screens never get that far, so it never shows there.
//
// It stands by the right edge of the game's column (on a computer just
// past the column's text, where there is room), as low as it can without
// covering a control that floats over the page: the bottom bars, the round
// chat button (it stands over it while that one waits by the right edge),
// the bars a screen holds at its bottom ("Wyrusz", a card match's buttons,
// the chat's line), the tabs on the edges, the narrator and the toasts.
// While it shows, the screen leaves room under its last row for it
// (styles.css, .with-top-button), so it covers no button at the end of a
// page. Its name comes from the data (texts.json, page.toTop).

import { $, h, icon } from './dom.js';
import { motionOn } from './motion.js';
import { state } from './state.js';

const SIZE = 44;
const GAP = 10;
// How far down it shows, in screen heights.
const FROM = 1.5;
// The controls that float over the page, which it keeps clear of.
const CONTROLS = [
  '#menu .nav',
  '.pending-bar',
  '.chat-bubble',
  '.chat-bubble-bin:not([hidden])',
  '.edge-tabs > *',
  '.start-bar',
  '.chat-footer',
  '.cards-actions',
  '.salvage-bar',
  '.quests-page .narrator-actions',
  '.narrator-show',
  '.guide-note',
  '.toast:not([hidden])',
].join(', ');

let button = null;
let frame = 0;

// The rectangles of the floating controls on the screen now: those fixed
// over the page or held at its bottom (sticky), not the ones in the flow.
function controls() {
  return [...document.querySelectorAll(CONTROLS)]
    .filter((element) => {
      if (element.closest('[hidden]')) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const fixed = (node) => {
        for (let up = node; up && up !== document.body; up = up.parentElement) {
          const position = getComputedStyle(up).position;
          if (position === 'fixed' || position === 'sticky') return true;
        }
        return false;
      };
      return fixed(element);
    })
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight);
}

// Where it stands: by the right edge of the game's column, then up past
// every control it would cover; null when no room is left under the top
// bar.
function spot() {
  const width = document.documentElement.clientWidth;
  const screen = $('#screen')?.getBoundingClientRect();
  const side = $('#side');
  const desktop = document.documentElement.dataset.layout === 'desktop';
  // On a computer: past the column's text where its grid cell has room, or
  // inside its right edge (the cell ends at the side column, or the window).
  const cellRight = side && !side.hidden && getComputedStyle(side).display !== 'none' ? side.getBoundingClientRect().left : width;
  const right = desktop && screen ? Math.min(cellRight - 16, screen.right + 16 + SIZE) : width - 14;
  const x = Math.round(right - SIZE);
  const rects = controls();
  let y = window.innerHeight - (desktop ? 24 : GAP) - SIZE;
  for (let pass = 0; pass < rects.length + 1; pass += 1) {
    const hit = rects.find((rect) => rect.left < x + SIZE + GAP && rect.right > x - GAP && rect.top < y + SIZE + GAP && rect.bottom > y - GAP);
    if (!hit) break;
    y = hit.top - GAP - SIZE;
  }
  const top = ($('#topbar')?.getBoundingClientRect().bottom ?? 0) + GAP;
  return y < top ? null : { x, y: Math.round(y) };
}

// Shown far enough down a screen of the game, where there is room for it;
// placed anew at each look.
function update() {
  frame = 0;
  if (!button) return;
  const game = $('#view-game');
  const far = window.scrollY > window.innerHeight * FROM;
  const wanted = Boolean(state.character) && Boolean(game) && !game.hidden && far && !document.querySelector('.guide');
  const at = wanted ? spot() : null;
  const show = Boolean(at);
  document.documentElement.classList.toggle('with-top-button', show);
  if (!show) {
    button.classList.remove('top-button--shown');
    button.hidden = true;
    return;
  }
  button.style.left = `${at.x}px`;
  button.style.top = `${at.y}px`;
  const label = state.content?.page?.toTop ?? '';
  button.setAttribute('aria-label', label);
  button.title = label;
  if (button.hidden) {
    button.hidden = false;
    // In the next frame, so it fades in.
    requestAnimationFrame(() => button?.classList.add('top-button--shown'));
  }
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(update);
};

// Back to the top of the screen: gliding, or at once with the animations
// off; the screen's title takes the focus, as a new screen's does.
function toTop() {
  window.scrollTo({ top: 0, behavior: motionOn() ? 'smooth' : 'auto' });
  $('#screen .page-title')?.focus({ preventScroll: true });
}

export function mountBackToTop() {
  if (button) return;
  button = h('button', { type: 'button', class: 'top-button', hidden: true, onClick: toTop }, icon('top', { size: 22 }));
  document.body.append(button);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  // The round chat button moved or let go glides to its edge first.
  document.addEventListener('pointerup', () => setTimeout(schedule, 250), true);
  // Controls that come and go (the chat button, the narrator, the toasts).
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(document.body, { childList: true });
  schedule();
}
