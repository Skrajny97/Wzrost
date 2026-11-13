// The players online (the author, 7.11.2026: "Licznik graczy online.
// Wysuwana zakładka z boku ekranu tylko z ilością graczy"): a tab on the
// right edge of the game, at the edge of the main column on a computer,
// that slides out with the count of players online and back in at the next
// tap. The count is asked once a minute while the page is in sight
// (src/server/online.js), and at once when the tab slides out. The tabs on
// that edge stand in one column (#edge-tabs), where the way back to a hidden
// round chat button comes under this one (chat-bubble.js).
// While the tab is out, a second tab under it, "Lista", opens their list
// (the author, 13.11.2026: "Dodaj opcje otwierania listy graczy online pod
// zieloną kropka ilu graczy online jest"): the character each of them plays
// now, as the chat names its writer, the highest level first; a tap on a
// name shows that character (profile.js).

import { request } from './api.js';
import { h, icon } from './dom.js';
import { formatNumber, plural } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { call } from './state.js';
import { framedName, guildTag, openSheet, withButton } from './ui.js';

const EVERY_MS = 60000;

let tab = null;
let listTab = null;
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

// One player in the list, as a chat line names its writer: the class, the
// account's name before the character's ("Wędrowiec (Radomira)"), the
// guild's tag, the role in the chat and the level; the player's own row lit.
function playerRow(player) {
  return h(
    'li',
    { class: player.own ? 'online-player online-player--own' : 'online-player' },
    icon(CLASS_ICONS[player.classId] ?? 'person', { size: 16, className: 'chat-class' }),
    framedName(
      h(
        'button',
        {
          type: 'button',
          class: player.account ? 'chat-name chat-name--account' : 'chat-name',
          'aria-label': t('{name}: zobacz postać', { name: player.name }),
          onClick: (event) => withButton(event.currentTarget, () => openProfile(player.name)),
        },
        player.account ? [h('span', { class: 'chat-account', text: player.account }), h('span', { class: 'chat-character', text: ` (${player.name})` })] : player.name,
      ),
      player.nameColor,
      player.name,
    ),
    guildTag(player.guildTag),
    player.role && h('span', { class: `chat-role chat-role--${player.role}`, text: `(${player.role})` }),
    h('span', { class: 'chat-level online-player-level', text: t('poz. {level}', { level: player.level }) }),
  );
}

// The list in a sheet: how many play, then the players.
async function openList() {
  const view = await call('GET', '/api/online/players');
  count = view.count;
  show();
  const more = view.count - view.players.length;
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Gracze online ({count})', { count: formatNumber(view.count) }) }),
    h('p', { class: 'sheet-text', text: t('Stuknij imię, żeby zobaczyć postać.') }),
    h('ul', { class: 'online-players' }, view.players.map(playerRow)),
    more > 0 && h('p', { class: 'sheet-text online-more', text: t('Poza listą: {count}.', { count: formatNumber(more) }) }),
  );
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
        listTab.hidden = !open;
        if (open) ask();
      },
    },
    h('span', { class: 'online-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'online-body' }, h('strong', { class: 'online-count', text: '…' }), h('span', { class: 'online-label', text: t('graczy online') })),
  );
  listTab = h(
    'button',
    {
      type: 'button',
      class: 'online-list-tab',
      hidden: true,
      'aria-label': t('Lista graczy online'),
      onClick: (event) => withButton(event.currentTarget, openList),
    },
    icon('people', { size: 18 }),
    h('span', { text: t('Lista') }),
  );
  view.append(h('div', { class: 'edge-tabs', id: 'edge-tabs' }, tab, listTab));
  ask();
}

// Called every second by the page's ticker (app.js).
export function checkOnline() {
  if (!tab || document.hidden || Date.now() - askedAt < EVERY_MS) return;
  ask();
}
