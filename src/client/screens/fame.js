// The Sława in the Społeczność (src/server/fame.js, data/fame.json; the
// author, 10.11.2026: „Przydałyby się Punkty Sławy dla postaci, gdzieś jako
// osobny moduł, zdobywane przez wszelakie aktywności, opisane.” and „760
// A”): how it works on top; the character's reward waiting, with
// "Odbierz"; its Punkty Sławy of this week, its place and the time left of
// the week; the week's best, the first of them as the Ranking shows its own
// (ranking-window.js) and the character's own row after them when it
// stands lower; last week's rewarded with their shares of Punkty Systemu;
// and "Za co Sława", the sources with their points, folded as left. A tap
// on a name shows that character (profile.js). `news` redraws the
// Społeczność's row of parts, whose light goes out once the reward is
// taken.

import { fill, h, icon } from '../dom.js';
import { countOf, formatCountdown, formatNumber, plural } from '../format.js';
import { language, t } from '../i18n.js';
import { CLASS_ICONS, SYSTEM_POINTS_ICON } from '../icons.js';
import { openProfile } from '../profile.js';
import { rankingWindow } from '../ranking-window.js';
import { playSound } from '../sound.js';
import { call, serverNow } from '../state.js';
import { foldPart, framedName, guildTag, howItWorks, toast, withButton } from '../ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
// A number with its noun, the forms from the data in the page's language.
const counted = (count, forms) => countOf(count, ...forms);

// A week by its key, the date of its Monday on the Polish clock: "2–8
// listopada", "2–8 November".
function weekName(key) {
  const [year, month, day] = key.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 6));
  const format = new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return typeof format.formatRange === 'function' ? format.formatRange(start, end) : `${format.format(start)} – ${format.format(end)}`;
}

// What is left of the week: days and hours, its last day by the clock.
function weekLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${countOf(days, 'dzień', 'dni', 'dni')} ${Math.floor(hours - days * 24)} h` : formatCountdown(ms);
}

export function mountFame(container, { news = null } = {}) {
  let view = null;
  let gone = false;
  // "Pokaż całą listę": the week's whole table.
  let whole = false;
  // The end of the week asks for the new one once.
  let renewed = false;
  const body = h('div', { class: 'fame' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  const left = h('p', { class: 'muted fame-left', role: 'timer' });
  fill(container, body);
  const timer = setInterval(tick, 1000);

  async function load() {
    let answer;
    try {
      answer = await call('GET', '/api/fame');
    } catch (error) {
      if (!gone) fill(body, h('p', { class: 'chat-error', role: 'status', text: error.message }));
      return;
    }
    if (!gone) show(answer);
  }

  function show(next) {
    view = next;
    news?.();
    fill(body, howItWorks(view.texts.lead, view.texts.how), rewardCard(), ownCard(), weekCard(), lastCard(), sourcesPart());
    tick();
  }

  function tick() {
    if (!view) return;
    const ms = view.week.endsAt - serverNow();
    left.textContent = filled(view.texts.left, { time: weekLeft(ms) });
    if (ms <= 0 && !renewed) {
      renewed = true;
      load();
    }
  }

  // A character of a table: its class, its name to tap, its guild's tag
  // and its mark in the chat, as in the Ranking.
  const who = (row) =>
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
    );
  const head = (columns) => h('thead', {}, h('tr', {}, columns.map(([text, extra]) => h('th', { scope: 'col', ...extra, text }))));
  const gap = (span) => h('tr', { class: 'ranking-gap', 'aria-hidden': 'true' }, h('td', { colspan: String(span), text: '…' }));

  // The reward waiting: each week's place and share, and "Odbierz" for all.
  function rewardCard() {
    const { texts, rewards } = view;
    if (rewards.length === 0) return null;
    return h(
      'section',
      { class: 'card fame-reward', 'aria-labelledby': 'fame-reward-title' },
      h('h2', { class: 'card-title', id: 'fame-reward-title' }, icon('gift', { size: 22 }), texts.reward),
      rewards.map((reward) =>
        h('p', { class: 'fame-reward-line', text: filled(texts.rewardLine, { place: formatNumber(reward.place), week: weekName(reward.week), share: counted(reward.share, texts.systemPointForms) }) }),
      ),
      h('button', { type: 'button', class: 'button button--system', text: texts.claim, onClick: (event) => withButton(event.currentTarget, claim) }),
    );
  }

  async function claim() {
    const answer = await call('POST', '/api/fame/claim');
    playSound('collect');
    toast(filled(answer.texts.claimed, { share: counted(answer.claimed.share, answer.texts.systemPointForms) }));
    if (!gone) show(answer);
  }

  // The character's own points this week, its place and the time left.
  function ownCard() {
    const { texts } = view;
    return h(
      'section',
      { class: 'card fame-own', 'aria-labelledby': 'fame-own-title' },
      h('h2', { class: 'card-title', id: 'fame-own-title' }, icon('star', { size: 22 }), texts.you),
      h(
        'p',
        { class: 'fame-points' },
        h('span', { class: 'fame-points-number', text: formatNumber(view.points) }),
        h('span', { class: 'fame-points-noun', text: plural(view.points, ...texts.pointForms) }),
      ),
      h('p', { class: 'fame-place', text: view.place ? filled(texts.place, { place: formatNumber(view.place) }) : texts.noPoints }),
      left,
    );
  }

  // The week's best: the first of them as in the Ranking, all of them
  // under "Pokaż całą listę", and the character's own row after them when
  // it stands lower, with a gap where places are left out.
  function weekCard() {
    const { texts, rows, ownRow } = view;
    const { columns } = texts;
    const picked = rankingWindow(rows, rows.findIndex((row) => row.own), whole);
    const shown = picked.at(-1)?.place ?? 0;
    const tail = ownRow ? [...(ownRow.place > shown + 1 ? [null] : []), ownRow] : [];
    return h(
      'section',
      { class: 'card ranking fame-week', 'aria-labelledby': 'fame-week-title' },
      h('h2', { class: 'card-title', id: 'fame-week-title', text: texts.week }),
      rows.length === 0
        ? h('p', { class: 'muted', text: texts.empty })
        : h(
            'table',
            { class: 'ranking-table' },
            head([
              ['#', { 'aria-label': t('Miejsce') }],
              [columns.character],
              [columns.points, { class: 'ranking-sorted', 'aria-sort': 'descending' }],
            ]),
            h(
              'tbody',
              {},
              [...picked, ...tail].map((row) =>
                row === null
                  ? gap(3)
                  : h(
                      'tr',
                      { class: row.own ? 'ranking-own' : undefined },
                      h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
                      who(row),
                      h('td', { class: 'ranking-sorted', text: formatNumber(row.points) }),
                    ),
              ),
            ),
          ),
      picked.length < rows.length &&
        h('button', {
          type: 'button',
          class: 'button button--world button--small ranking-whole',
          text: t('Pokaż całą listę'),
          onClick: () => {
            whole = true;
            show(view);
          },
        }),
    );
  }

  // Last week's rewarded: place, character, points and share.
  function lastCard() {
    const { texts, last } = view;
    const { columns } = texts;
    return h(
      'section',
      { class: 'card ranking fame-last', 'aria-labelledby': 'fame-last-title' },
      h('h2', { class: 'card-title', id: 'fame-last-title', text: texts.last }),
      h('p', { class: 'muted fame-dates', text: weekName(last.week) }),
      last.winners.length === 0
        ? h('p', { class: 'muted', text: texts.lastNone })
        : h(
            'table',
            { class: 'ranking-table' },
            head([['#', { 'aria-label': t('Miejsce') }], [columns.character], [columns.points], [columns.share]]),
            h(
              'tbody',
              {},
              last.winners.map((row) =>
                h(
                  'tr',
                  { class: row.own ? 'ranking-own' : undefined },
                  h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
                  who(row),
                  h('td', { text: formatNumber(row.points) }),
                  h('td', { class: 'fame-share' }, h('span', { class: 'fame-share-value', title: t('Punkty Systemu') }, icon(SYSTEM_POINTS_ICON, { size: 14 }), formatNumber(row.share))),
                ),
              ),
            ),
          ),
    );
  }

  // "Za co Sława": each source and its points, then what does not count.
  function sourcesPart() {
    const { texts, sources } = view;
    return h(
      'section',
      { class: 'card fame-sources' },
      foldPart(
        { key: 'fame-sources', title: texts.sources, card: true, id: 'fame-sources-title' },
        h(
          'ul',
          { class: 'fame-source-list', 'aria-labelledby': 'fame-sources-title' },
          sources.map((source) => h('li', { class: 'fame-source' }, h('span', { class: 'fame-source-label', text: source.label }), h('span', { class: 'fame-source-points', text: formatNumber(source.points) }))),
        ),
        texts.notes.map((note) => h('p', { class: 'muted fame-note', text: note })),
      ),
    );
  }

  load();
  return {
    unmount() {
      gone = true;
      clearInterval(timer);
    },
  };
}
