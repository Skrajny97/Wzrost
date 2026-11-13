// The players online (the author, 7.11.2026: "Licznik graczy online.
// Wysuwana zakładka z boku ekranu tylko z ilością graczy"): a tab on the
// right edge of the game, at the edge of the main column on a computer,
// that slides out with the count of players online and back in at the next
// tap. The count is asked once a minute while the page is in sight
// (src/server/online.js), and at once when the tab slides out. The tabs on
// that edge stand in one column (#edge-tabs), where the way back to a hidden
// round chat button comes under this one (chat-bubble.js).

import { request } from './api.js';
import { h } from './dom.js';
import { formatNumber, plural } from './format.js';
import { t } from './i18n.js';

const EVERY_MS = 60000;

let tab = null;
let count = null;
let askedAt = 0;

async function ask() {
  askedAt = Date.now();
  try {
    count = (await request('GET', '/api/online')).count;
  } catch {
    return;
  }
  show();
}

function show() {
  if (!tab) return;
  tab.querySelector('.online-count').textContent = count === null ? '…' : formatNumber(count);
  // The words in the count's form: "1 gracz", "2 gracze", "5 graczy" (the
  // code review of 13.11.2026: "1 graczy online" when one played).
  if (count !== null) tab.querySelector('.online-label').textContent = plural(count, 'gracz online', 'gracze online', 'graczy online');
}

// Puts the tab into the game view once; `checkOnline` keeps it fresh.
export function mountOnline(view) {
  if (tab) return;
  tab = h(
    'button',
    {
      type: 'button',
      class: 'online-tab',
      'aria-expanded': 'false',
      'aria-label': t('Gracze online'),
      onClick: () => {
        const open = tab.getAttribute('aria-expanded') !== 'true';
        tab.setAttribute('aria-expanded', String(open));
        if (open) ask();
      },
    },
    h('span', { class: 'online-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'online-body' }, h('strong', { class: 'online-count', text: '…' }), h('span', { class: 'online-label', text: t('graczy online') })),
  );
  view.append(h('div', { class: 'edge-tabs', id: 'edge-tabs' }, tab));
  ask();
}

// Called every second by the page's ticker (app.js).
export function checkOnline() {
  if (!tab || document.hidden || Date.now() - askedAt < EVERY_MS) return;
  ask();
}
