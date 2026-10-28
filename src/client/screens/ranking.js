// The Ranking postaci in the Społeczność (src/server/community.js): the
// characters highest by their own level, by their class's or by their
// highest profession's, the levels in their columns (the profession's with
// its icon, in its own order), and the player's own place among all of them.
// A tap on a name shows that character (profile.js).

import { professionSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call } from '../state.js';
import { withButton } from '../ui.js';

const ORDERS = [
  { id: 'level', name: 'Poziom postaci', column: 'Poziom' },
  { id: 'class', name: 'Poziom klasy', column: 'Klasa' },
  { id: 'profession', name: 'Poziom Profesji', column: 'Profesja', own: true },
];

// A profession's level with its icon beside it.
const professionLevel = (profession) =>
  profession && h('span', { class: 'ranking-profession' }, professionSprite(profession.id) ?? icon('leaf', { size: 14 }), formatNumber(profession.level));

export function mountRanking(container) {
  let by = 'level';
  let gone = false;
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

  function show({ rows, place: own }) {
    place.textContent = own ? `Twoje miejsce: ${formatNumber(own)}.` : '';
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
                  h('button', {
                    type: 'button',
                    class: 'chat-name',
                    text: row.name,
                    'aria-label': `${row.name}: zobacz postać`,
                    onClick: (event) => withButton(event.currentTarget, () => openProfile(row.name)),
                  }),
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
    );
  }

  load();
  return {
    unmount() {
      gone = true;
    },
  };
}
