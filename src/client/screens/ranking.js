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
// The tabs have the look of the Społeczność's row of parts, and the one
// shown last on the device opens first.

import { professionSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { rankingWindow } from '../ranking-window.js';
import { call, state } from '../state.js';
import { framedName, guildTag, howItWorks, withButton } from '../ui.js';

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


export function mountRanking(container) {
  const names = state.content.guildFame.tabs;
  const ids = Object.keys(TAB_ICONS);
  const row = h('div', { class: 'community-tabs ranking-tabs', role: 'tablist', 'aria-label': 'Ranking' });
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

function mountCharacterRanking(container) {
  let by = 'level';
  let gone = false;
  let whole = false;
  let last = null;
  const switcher = h(
    'div',
    { class: 'segmented ranking-by', role: 'group', 'aria-label': 'Kolejność rankingu' },
    ORDERS.map((order) =>
      h('button', {
        type: 'button',
        class: 'segmented-option',
        dataset: { by: order.id },
        text: order.name,
        onClick: () => {
          if (by === order.id) return;
          by = order.id;
          whole = false;
          load();
        },
      }),
    ),
  );
  const place = h('p', { class: 'ranking-place' });
  const board = h('div', { class: 'card ranking' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, switcher, place, board);

  async function load() {
    for (const option of switcher.children) option.setAttribute('aria-pressed', String(option.dataset.by === by));
    const asked = by;
    let answer;
    try {
      answer = await call('GET', `/api/ranking?by=${asked}`);
    } catch (error) {
      if (!gone) fill(board, h('p', { class: 'chat-error', role: 'status', text: error.message }));
      return;
    }
    if (!gone && asked === by) show(answer);
  }

  function show(answer) {
    last = answer;
    const { rows, place: own } = answer;
    place.textContent = own ? `Twoje miejsce: ${formatNumber(own)}.` : '';
    const mine = rows.findIndex((row) => row.own);
    // The rows shown, with a gap (null) only where places are left out.
    const picked = rankingWindow(rows, mine, whole);
    const sorted = (id) => (id === by ? 'ranking-sorted' : undefined);
    // A column of its own order shows only there.
    const columns = ORDERS.filter((order) => !order.own || order.id === by);
    fill(
      board,
      h(
        'table',
        { class: 'ranking-table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', 'aria-label': 'Miejsce', text: '#' }),
            h('th', { scope: 'col', text: 'Postać' }),
            columns.map((order) => h('th', { scope: 'col', class: sorted(order.id), 'aria-sort': order.id === by ? 'descending' : undefined, text: order.column })),
          ),
        ),
        h(
          'tbody',
          {},
          picked.map((row) =>
            row === null
              ? h('tr', { class: 'ranking-gap', 'aria-hidden': 'true' }, h('td', { colspan: String(columns.length + 2), text: '…' }))
              : h(
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
                      'aria-label': `${row.name}: zobacz postać`,
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
      picked.length < rows.length &&
        h('button', {
          type: 'button',
          class: 'button button--world button--small ranking-whole',
          text: `Pokaż całą ${rows.length === 100 ? 'setkę' : 'listę'}`,
          onClick: () => {
            whole = true;
            show(last);
          },
        }),
    );
  }

  load();
  return {
    unmount() {
      gone = true;
    },
  };
}

// The guilds by their Sława: this week's or all of it, the place of the
// character's guild, and how the Sława is counted.
function mountGuildRanking(container) {
  const periods = state.content.guildFame.periods;
  let period = 'week';
  let gone = false;
  const switcher = h(
    'div',
    { class: 'segmented ranking-period', role: 'group', 'aria-label': 'Okres rankingu gildii' },
    Object.entries(periods).map(([id, name]) =>
      h('button', {
        type: 'button',
        class: 'segmented-option',
        dataset: { period: id },
        text: name,
        onClick: () => {
          if (period === id) return;
          period = id;
          load();
        },
      }),
    ),
  );
  const place = h('p', { class: 'ranking-place' });
  const board = h('div', { class: 'card ranking ranking-guilds' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, switcher, place, board);

  async function load() {
    for (const option of switcher.children) option.setAttribute('aria-pressed', String(option.dataset.period === period));
    const asked = period;
    let answer;
    try {
      answer = await call('GET', `/api/ranking/guilds?period=${asked}`);
    } catch (error) {
      if (!gone) fill(board, h('p', { class: 'chat-error', role: 'status', text: error.message }));
      return;
    }
    if (!gone && asked === period) show(answer);
  }

  function show(answer) {
    const { rows, texts } = answer;
    const { columns } = texts;
    place.textContent = answer.place ? filled(texts.own, { place: formatNumber(answer.place) }) : '';
    fill(
      board,
      howItWorks(texts.lead, texts.how),
      rows.length === 0
        ? h('p', { class: 'muted', text: texts.empty })
        : h(
            'table',
            { class: 'ranking-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', 'aria-label': 'Miejsce', text: columns.place }),
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
    );
  }

  load();
  return {
    unmount() {
      gone = true;
    },
  };
}
