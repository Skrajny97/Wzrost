// The Ranking in the Społeczność, in two tabs (the author: "381 A"):
// "Postacie", the Ranking postaci (src/server/community.js): the characters
// highest by their own level, by their class's or by their highest
// profession's, the levels in their columns (the profession's with its
// icon, in its own order), and the player's own place among all of them; a
// tap on a name shows that character (profile.js). "Gildie"
// (src/server/guild-fame.js): the guilds by their Sława of this week or
// from the start ("Ten tydzień", "Od początku"), each with its place, its
// tag and name, its members and its Sława, the character's own guild lit
// and its place above, and how the Sława is counted under "Jak to działa?".
// Both come a page at a time (the author, 10.11.2026: „Ranking max 50
// postaci + przewijanie listy na dalsze pozycje strona po stronie”): at
// most 50 rows, "‹ Poprzednie" and "Następne ›" with the places shown
// ("Miejsca 51–100 z 1234") over and under the table, and "Moje miejsce"
// ("Moja gildia"), which opens the page with the own row lit and brings it
// into sight. The tabs have the look of the Społeczność's row of parts, and
// the one shown last on the device opens first.

import { professionSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { rankingPage } from '../ranking-pages.js';
import { call, state } from '../state.js';
import { framedName, guildTag, howItWorks, withButton } from '../ui.js';

// The orders and their columns, their words shown in the page's language
// (t()).
const ORDERS = [
  { id: 'level', name: 'Poziom postaci', column: 'Poziom' },
  { id: 'class', name: 'Poziom klasy', column: 'Klasa' },
  { id: 'profession', name: 'Poziom Profesji', column: 'Profesja', own: true },
];

const TAB_KEY = 'insight-ranking-tab';
const TAB_ICONS = { characters: 'person', guilds: 'banner' };
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// A profession's level with its icon beside it.
const professionLevel = (profession) =>
  profession && h('span', { class: 'ranking-profession' }, professionSprite(profession.id) ?? icon('leaf', { size: 14 }), formatNumber(profession.level));

// Scrolls the page so `element` shows between the bars that stay over it
// (the top bar and the Społeczność's row of parts above, a phone's menu
// below): its top just below the upper ones, or with `middle` its middle
// in the middle of what is left of the screen. An element in sight already
// stays where it is, unless `middle`.
function bringIntoSight(element, middle = false) {
  const bars = document.querySelector('.community-picker') ?? document.getElementById('topbar');
  const covered = Math.max(0, bars?.getBoundingClientRect().bottom ?? 0);
  // The menu runs along the bottom of a phone's screen (on a computer, down
  // its left side).
  const menu = document.getElementById('nav-main')?.getBoundingClientRect();
  const foot = menu && menu.height > 0 && menu.top > window.innerHeight / 2 ? menu.top : window.innerHeight;
  const box = element.getBoundingClientRect();
  if (!middle && box.top >= covered && box.top < foot) return;
  const shift = middle ? box.top - covered - Math.max(0, (foot - covered - box.height) / 2) : box.top - covered - 8;
  window.scrollTo({ top: Math.max(0, window.scrollY + shift) });
}

// The turns of the pages of a ranking's answer: "‹ Poprzednie", the places
// shown and "Następne ›", each asking for its page (`go`, by its offset);
// nothing while all the rows fit on one page.
function pager(answer, go) {
  const page = rankingPage(answer);
  if (page.previous === null && page.next === null) return null;
  const turn = (text, offset, className) =>
    h('button', {
      type: 'button',
      class: `button button--world button--small ranking-turn ${className}`,
      text,
      disabled: offset === null,
      onClick: (event) => withButton(event.currentTarget, () => go(offset)),
    });
  return h(
    'nav',
    { class: 'ranking-pager', 'aria-label': t('Strony rankingu') },
    turn(t('‹ Poprzednie'), page.previous, 'ranking-turn--back'),
    h('span', { class: 'ranking-range', text: t('Miejsca {from}–{to} z {total}', { from: formatNumber(page.from), to: formatNumber(page.to), total: formatNumber(answer.total) }) }),
    turn(t('Następne ›'), page.next, 'ranking-turn--on'),
  );
}

// The line over the table: the own place in words, and, when the ranking
// has more than one page, the button that opens the page holding it
// (`label`: "Moje miejsce", "Moja gildia"); nothing without a place.
function placeLine(text, answer, label, go) {
  if (!text) return null;
  const page = rankingPage(answer);
  const turns = page.previous !== null || page.next !== null;
  return h(
    'div',
    { class: 'ranking-place-line' },
    h('p', { class: 'ranking-place', text }),
    turns &&
      page.mine !== null &&
      h('button', {
        type: 'button',
        class: 'button button--system button--small ranking-mine',
        text: label,
        onClick: (event) => withButton(event.currentTarget, () => go(page.mine, { mine: true })),
      }),
  );
}

export function mountRanking(container) {
  const names = state.content.guildFame.tabs;
  const ids = Object.keys(TAB_ICONS);
  const row = h('div', { class: 'community-tabs ranking-tabs', role: 'tablist', 'aria-label': t('Ranking') });
  const body = h('div', { class: 'ranking-body' });
  fill(container, row, body);
  let current = null;
  let part = null;
  function show(id) {
    current = id;
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // Remembered for this visit only.
    }
    part?.unmount();
    fill(body);
    part = (id === 'guilds' ? mountGuildRanking : mountCharacterRanking)(body);
    fill(
      row,
      ids.map((tab) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'community-tab',
            'aria-selected': String(tab === current),
            onClick: () => {
              if (tab !== current) show(tab);
            },
          },
          icon(TAB_ICONS[tab], { size: 20, className: 'community-icon' }),
          h('span', { class: 'community-name', text: names[tab] }),
        ),
      ),
    );
  }
  let kept = null;
  try {
    kept = localStorage.getItem(TAB_KEY);
  } catch {
    // The first tab, then.
  }
  show(ids.includes(kept) ? kept : ids[0]);
  return {
    unmount() {
      part?.unmount();
    },
  };
}

// One ranking's list, a page at a time: `ask(offset)` is the address of the
// page from `offset` in the order picked now (its key `key()`), and `draw`
// lays an answer out in `board` and the line over it. A page asked for
// comes only while the order is still the one it was asked in; the page
// turned brings the board's top into sight, and "Moje miejsce" its own
// row, lit, into the middle of the screen.
function pagedList({ ask, key, draw, board }) {
  let gone = false;
  async function load(offset = 0, { mine = false, turned = false } = {}) {
    const asked = key();
    let answer;
    try {
      answer = await call('GET', ask(offset));
    } catch (error) {
      if (!gone && asked === key()) fill(board, h('p', { class: 'chat-error', role: 'status', text: error.message }));
      return;
    }
    if (gone || asked !== key()) return;
    draw(answer);
    const own = mine && board.querySelector('.ranking-own');
    if (own) bringIntoSight(own, true);
    else if (turned) bringIntoSight(board);
  }
  return {
    load,
    // A page turn from the pager, or "Moje miejsce".
    go: (offset, { mine = false } = {}) => load(offset, { mine, turned: !mine }),
    unmount() {
      gone = true;
    },
  };
}

function mountCharacterRanking(container) {
  let by = 'level';
  const switcher = h(
    'div',
    { class: 'segmented ranking-by', role: 'group', 'aria-label': t('Kolejność rankingu') },
    ORDERS.map((order) =>
      h('button', {
        type: 'button',
        class: 'segmented-option',
        dataset: { by: order.id },
        text: t(order.name),
        onClick: () => {
          if (by === order.id) return;
          by = order.id;
          pressed();
          list.load(0);
        },
      }),
    ),
  );
  const place = h('div', { class: 'ranking-place-box' });
  const board = h('div', { class: 'card ranking' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, switcher, place, board);
  const pressed = () => {
    for (const option of switcher.children) option.setAttribute('aria-pressed', String(option.dataset.by === by));
  };
  const list = pagedList({ ask: (offset) => `/api/ranking?by=${by}&offset=${offset}`, key: () => by, draw: show, board });

  function show(answer) {
    const { rows, place: own } = answer;
    fill(place, placeLine(own ? t('Twoje miejsce: {place}.', { place: formatNumber(own) }) : '', answer, t('Moje miejsce'), list.go));
    const sorted = (id) => (id === by ? 'ranking-sorted' : undefined);
    // A column of its own order shows only there.
    const columns = ORDERS.filter((order) => !order.own || order.id === by);
    fill(
      board,
      pager(answer, list.go),
      rows.length === 0
        ? h('p', { class: 'muted', text: t('Nikogo tu jeszcze nie ma.') })
        : h(
            'table',
            { class: 'ranking-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', 'aria-label': t('Miejsce'), text: '#' }),
                h('th', { scope: 'col', text: t('Postać') }),
                columns.map((order) => h('th', { scope: 'col', class: sorted(order.id), 'aria-sort': order.id === by ? 'descending' : undefined, text: t(order.column) })),
              ),
            ),
            h(
              'tbody',
              {},
              rows.map((row) =>
                h(
                  'tr',
                  { class: row.own ? 'ranking-own' : undefined },
                  h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
                  h(
                    'td',
                    { class: 'ranking-name' },
                    h(
                      'span',
                      { class: 'ranking-who' },
                      icon(CLASS_ICONS[row.classId] ?? 'person', { size: 14, className: 'chat-class' }),
                      framedName(
                        h('button', {
                          type: 'button',
                          class: 'chat-name',
                          text: row.name,
                          'aria-label': t('{name}: zobacz postać', { name: row.name }),
                          onClick: (event) => withButton(event.currentTarget, () => openProfile(row.name)),
                        }),
                        row.nameColor,
                      ),
                      guildTag(row.guildTag),
                      row.role && h('span', { class: `chat-role chat-role--${row.role}`, text: `(${row.role})` }),
                    ),
                  ),
                  h('td', { class: sorted('level'), text: formatNumber(row.level) }),
                  h('td', { class: sorted('class'), text: formatNumber(row.classLevel) }),
                  by === 'profession' && h('td', { class: sorted('profession') }, professionLevel(row.profession)),
                ),
              ),
            ),
          ),
      rows.length > 0 && pager(answer, list.go),
    );
  }

  pressed();
  list.load(0);
  return { unmount: list.unmount };
}

// The guilds by their Sława: this week's or all of it, the place of the
// character's guild, and how the Sława is counted.
function mountGuildRanking(container) {
  const periods = state.content.guildFame.periods;
  let period = 'week';
  const switcher = h(
    'div',
    { class: 'segmented ranking-period', role: 'group', 'aria-label': t('Okres rankingu gildii') },
    Object.entries(periods).map(([id, name]) =>
      h('button', {
        type: 'button',
        class: 'segmented-option',
        dataset: { period: id },
        text: name,
        onClick: () => {
          if (period === id) return;
          period = id;
          pressed();
          list.load(0);
        },
      }),
    ),
  );
  const place = h('div', { class: 'ranking-place-box' });
  const board = h('div', { class: 'card ranking ranking-guilds' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, switcher, place, board);
  const pressed = () => {
    for (const option of switcher.children) option.setAttribute('aria-pressed', String(option.dataset.period === period));
  };
  const list = pagedList({ ask: (offset) => `/api/ranking/guilds?period=${period}&offset=${offset}`, key: () => period, draw: show, board });

  function show(answer) {
    const { rows, texts } = answer;
    const { columns } = texts;
    fill(place, placeLine(answer.place ? filled(texts.own, { place: formatNumber(answer.place) }) : '', answer, t('Moja gildia'), list.go));
    fill(
      board,
      howItWorks(texts.lead, texts.how),
      rows.length === 0
        ? h('p', { class: 'muted', text: texts.empty })
        : [
            pager(answer, list.go),
            h(
              'table',
              { class: 'ranking-table' },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  h('th', { scope: 'col', 'aria-label': t('Miejsce'), text: columns.place }),
                  h('th', { scope: 'col', text: columns.guild }),
                  h('th', { scope: 'col', text: columns.members }),
                  h('th', { scope: 'col', class: 'ranking-sorted', 'aria-sort': 'descending', text: columns.fame }),
                ),
              ),
              h(
                'tbody',
                {},
                rows.map((row) =>
                  h(
                    'tr',
                    { class: row.own ? 'ranking-own' : undefined },
                    h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
                    h('td', { class: 'ranking-name' }, h('span', { class: 'ranking-who' }, guildTag(row.tag), h('span', { class: 'ranking-guild', text: row.name }))),
                    h('td', { text: formatNumber(row.members) }),
                    h('td', { class: 'ranking-sorted', text: formatNumber(row.fame) }),
                  ),
                ),
              ),
            ),
            pager(answer, list.go),
          ],
    );
  }

  pressed();
  list.load(0);
  return { unmount: list.unmount };
}
