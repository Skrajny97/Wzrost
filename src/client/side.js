// The side column on a computer (474 A): the chat the whole length of the
// column, always in sight beside the game, its rooms in tabs on top. The
// narrator's quests unroll from his face in the top bar, as on a phone (the
// author: "562 B", after a tester's note that they took the column's top).
// On a phone the column is not there and the chat is in the Społeczność.

import { $, fill, h } from './dom.js';
import { desktopLayout } from './layout-mode.js';
import { mountChat } from './screens/community.js';
import { isUnlocked, state, unlockInfo } from './state.js';

// Wide enough for the column beside the game (styles.css hides it below).
const roomy = window.matchMedia('(min-width: 1280px)');
roomy.addEventListener('change', () => updateSide());

let shown = null; // { chat, chatBody, bar, scroller } while the column is there
let measured = false;

// The column starts under the top bar, whose height changes with what it
// shows (styles.css, --topbar-height).
function measureTopbar() {
  if (measured || typeof ResizeObserver !== 'function') return;
  const topbar = $('#topbar');
  if (!topbar) return;
  measured = true;
  new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`)).observe(topbar);
}

// The column as the layout and the character want it now: there on a
// computer while a character plays, its chat once the Społeczność opens.
export function updateSide() {
  const side = $('#side');
  const there = desktopLayout() && roomy.matches && Boolean(state.character) && !$('#view-game').hidden;
  side.hidden = !there;
  if (!there) {
    hideSide();
    return;
  }
  measureTopbar();
  if (!shown) {
    const bar = h('div', { class: 'side-chat-bar' });
    const chatBody = h('div', { class: 'side-chat-body' });
    const scroller = h('div', { class: 'side-chat-scroll' }, chatBody);
    fill(side, h('section', { class: 'side-chat', 'aria-label': 'Czat' }, h('h2', { class: 'side-title', text: 'Czat' }), bar, scroller));
    shown = { chat: null, chatBody, bar, scroller };
  }
  if (!shown.chat && isUnlocked('community')) {
    shown.chat = mountChat(shown.chatBody, { bar: shown.bar, id: 'side-chat', scroller: shown.scroller });
  } else if (!shown.chat) {
    const level = unlockInfo('community')?.level;
    fill(shown.chatBody, h('p', { class: 'muted side-note', text: level ? `Czat otworzy się razem ze Społecznością, na poziomie ${level}.` : 'Czat otworzy się razem ze Społecznością.' }));
  }
}

function hideSide() {
  if (!shown) return;
  shown.chat?.unmount();
  fill($('#side'));
  shown = null;
}
