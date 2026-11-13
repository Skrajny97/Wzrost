// The Ranking członków, a card of the Gildia tab (screens/guild.js; the
// server's guild-members.js; DECISIONS.md, "Ranking członków gildii (897
// A)"; mock-ups 897.1 and 897.2): the guild's members by the Sława each of
// them brought the guild ("Aktywność") or by what each of them gave to the
// Siedziba ("Wpłaty"), this week or from the start, the own row lit and its
// place under the table. A tap on a member of "Aktywność" unfolds where its
// Sława comes from; under "Od początku" of "Wpłaty", a line of the donations
// from before the game wrote who gave them. The words come with the answer
// (data/guilds.json, members), in the page's language. "Kto ile wpłacił" in
// the Siedziba (guild-seat.js) opens the card on "Wpłaty" from the start
// (askDonations()), brought into sight.

import { goldArt, resourceArt } from './art.js';
import { fill, h, icon } from './dom.js';
import { dateFormat, formatNumber } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { call } from './state.js';
import { framedName, howItWorks } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// What "Kto ile wpłacił" asks the next card to show, or null.
let asked = null;
export function askDonations() {
  asked = { view: 'donations', period: 'all' };
}

// The card, filled once its answer comes; it stays the same element while
// the Gildia tab draws its cards anew.
export function guildRankingCard() {
  let answer = null;
  let view = 'activity';
  let period = 'week';
  const bring = asked !== null;
  if (asked) ({ view, period } = asked);
  asked = null;
  // The members unfolded in "Aktywność", by id.
  const open = new Set();
  const card = h('section', { class: 'card members-ranking', 'aria-labelledby': 'members-ranking-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  // A member: its class, and its name in its frame's colour.
  const who = (row) =>
    h('span', { class: 'ranking-who' }, icon(CLASS_ICONS[row.classId] ?? 'person', { size: 14, className: 'chat-class' }), framedName(h('span', { class: 'members-ranking-name', text: row.name }), row.nameColor));

  // Two or more options in a row, the one shown pressed.
  const switcher = (options, current, label, pick) =>
    h(
      'div',
      { class: 'segmented ranking-period', role: 'group', 'aria-label': label },
      Object.entries(options).map(([id, name]) =>
        h('button', {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': String(id === current),
          text: name,
          onClick: () => {
            if (id === current) return;
            pick(id);
            render();
          },
        }),
      ),
    );

  const head = (sorted) => {
    const { columns } = answer.texts;
    return h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col', 'aria-label': t('Miejsce'), text: columns.place }),
        h('th', { scope: 'col', text: columns.member }),
        h('th', { scope: 'col', class: 'ranking-sorted', 'aria-sort': 'descending', text: sorted }),
      ),
    );
  };

  // "Aktywność": each member's Sława, a tap unfolding its parts.
  function activityTable(rows) {
    const toggle = (row) => {
      if (open.has(row.id)) open.delete(row.id);
      else open.add(row.id);
      render();
      card.querySelector(`[data-member="${row.id}"]`)?.focus();
    };
    return h(
      'table',
      { class: 'ranking-table members-ranking-table' },
      head(answer.texts.columns.fame),
      h(
        'tbody',
        {},
        rows.flatMap((row) => {
          const unfolded = open.has(row.id);
          const name =
            row.parts.length > 0
              ? h(
                  'button',
                  { type: 'button', class: 'members-ranking-toggle', dataset: { member: String(row.id) }, 'aria-expanded': String(unfolded), onClick: () => toggle(row) },
                  who(row),
                  icon('chevron', { size: 14, className: 'members-ranking-chevron' }),
                )
              : who(row);
          const line = h(
            'tr',
            { class: row.own ? 'ranking-own' : undefined },
            h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
            h('td', { class: 'ranking-name' }, name),
            h('td', { class: 'ranking-sorted', text: formatNumber(row.fame) }),
          );
          if (!unfolded) return [line];
          return [
            line,
            h(
              'tr',
              { class: `members-ranking-parts${row.own ? ' ranking-own' : ''}` },
              h('td', {}),
              h(
                'td',
                { colspan: '2' },
                h(
                  'ul',
                  { class: 'members-ranking-parts-list' },
                  row.parts.map((part) => h('li', {}, `${part.name} `, h('b', { text: formatNumber(part.points) }))),
                ),
              ),
            ),
          ];
        }),
      ),
    );
  }

  // "Wpłaty": each member's gold and, under its name, the pieces of each
  // resource above nothing; from the start, the donations of before the
  // game wrote who gave them, under all.
  function donationsTable(rows) {
    const resources = (row) => {
      const given = row.resources.filter((one) => one.count > 0);
      return (
        given.length > 0 &&
        h(
          'span',
          { class: 'members-ranking-resources' },
          given.map((one) => h('span', { class: 'members-ranking-resource', title: one.name }, resourceArt(one.id, 16), h('span', { class: 'visually-hidden', text: `${one.name}: ` }), formatNumber(one.count))),
        )
      );
    };
    return h(
      'table',
      { class: 'ranking-table members-ranking-table' },
      head(answer.texts.columns.gold),
      h(
        'tbody',
        {},
        rows.map((row) =>
          h(
            'tr',
            { class: row.own ? 'ranking-own' : undefined },
            h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
            h('td', { class: 'ranking-name' }, who(row), resources(row)),
            h('td', { class: 'ranking-sorted' }, h('span', { class: 'members-ranking-gold' }, goldArt(16), formatNumber(row.gold))),
          ),
        ),
        period === 'all' && answer.earlier && h('tr', { class: 'members-ranking-earlier' }, h('td', {}), h('td', { colspan: '2', text: answer.earlier })),
      ),
    );
  }

  // The card's top just under the bars that stay over the page (the top
  // bar and the Gildia's tabs), once the Gildia tab has put it in its place
  // (its answer may come after the card's own).
  function bringIntoSight(tries = 50) {
    if (!card.isConnected) {
      if (tries > 0) setTimeout(() => bringIntoSight(tries - 1), 100);
      return;
    }
    // The tabs' bottom once they stick under the top bar, as they do when
    // the page scrolls down to the card.
    const picker = document.querySelector('.community-picker');
    const covered = picker ? (Number.parseFloat(getComputedStyle(picker).top) || 0) + picker.offsetHeight : 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - covered - 8) });
  }

  function render() {
    const { texts } = answer;
    const rows = answer[view][period];
    const own = rows.find((row) => row.own);
    const place = own && filled(texts.own, { place: formatNumber(own.place), count: formatNumber(rows.length) });
    const tap = view === 'activity' && rows.some((row) => row.parts.length > 0) && texts.tap;
    const since = dateFormat.format(new Date(`${answer.since}T12:00:00Z`));
    fill(
      card,
      h('h2', { class: 'card-title', id: 'members-ranking-title' }, icon('trophy', { size: 22 }), texts.title),
      h(
        'div',
        { class: 'members-ranking-switchers' },
        switcher(texts.views, view, texts.title, (id) => {
          view = id;
        }),
        switcher(texts.periods, period, t('Okres rankingu członków'), (id) => {
          period = id;
        }),
      ),
      view === 'activity' ? activityTable(rows) : donationsTable(rows),
      (place || tap) && h('p', { class: 'muted members-ranking-place', text: [place, tap].filter(Boolean).join(' ') }),
      howItWorks(
        texts.lead,
        texts.how.map((line) => filled(line, { since })),
      ),
    );
  }

  call('GET', '/api/guild/ranking')
    .then((next) => {
      answer = next;
      render();
      if (bring) bringIntoSight();
    })
    .catch((error) => fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać rankingu członków.') })));
  return card;
}
