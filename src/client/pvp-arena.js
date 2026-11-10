// The Arena in the Osada (src/server/pvp-arena.js; the author's 762 A:
// „Musimy zacząć też pracować nad Areną PvP, bo rośnie baza graczy”), under
// its place's heading on the Osada's place screen (screens/settlement.js),
// in two tabs as the Salon Gier's. "Walki": the character's rating, its
// place on the week's table and the fights left today; its last fight with
// the result, the rating's move and its playback (arena.js, the playback of
// every fight, not this Arena); the defences since the last visit; the
// three rivals, each with its bust, class, level and rating, what a win or
// a loss with it would bring and "Walcz", a tap on its name opening the
// character's card (profile.js). "Tabela tygodnia": the rewards waiting
// for "Odbierz", this week's table (all of its places, at most 50, the
// character's own row lit, as a page of the Ranking), the rewards of the
// places and the season. The rules wait under "Jak to
// działa?". The words are the data's (data/settlement.json, arena.texts),
// in the page's language; the panel's own few go through t().
//
// The Osada's place screen mounts the panel once and keeps it while it
// redraws itself, as the Salon Gier's, so a redraw never asks the server
// again; the defences shown at the look stay while the panel lives.

import { createArena } from './arena.js';
import { h, icon } from './dom.js';
import { countOf, formatDecimal, formatHours, formatNumber } from './format.js';
import { chestContents } from './guild-trials.js';
import { language, t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { motionOn } from './motion.js';
import { openProfile } from './profile.js';
import { call, serverNow } from './state.js';
import { howItWorks, systemPanel, toast, withButton } from './ui.js';
import { bust } from './screens/select.js';

const TABS = ['fights', 'table'];

// One of the Arena's texts with its {…} filled in: numbers as the game
// writes them, words as they are.
const say = (text, values = {}) =>
  text.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? (typeof values[key] === 'number' ? formatNumber(values[key]) : values[key]) : whole));

// A rating's move with its sign: "+16", "−9", "0".
const signed = (change) => (change > 0 ? `+${formatNumber(change)}` : change < 0 ? `−${formatNumber(-change)}` : '0');

// What is left of a week or a month: days, then hours.
function timeLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? countOf(days, 'dzień', 'dni', 'dni') : formatHours(Math.max(hours, 1 / 60));
}

// A week by its Monday ("2026-11-09") as "9.11", in English "9/11".
const weekLabel = (key) => {
  const [, month, day] = key.split('-').map(Number);
  return language() === 'en' ? `${day}/${month}` : `${day}.${month}`;
};

// A character's name that opens its card, as in the Ranking.
const nameButton = (name) =>
  h('button', {
    type: 'button',
    class: 'chat-name',
    text: name,
    'aria-label': t('{name}: zobacz postać', { name }),
    onClick: (event) => withButton(event.currentTarget, () => openProfile(name)),
  });

export function mountPvpArena(holder) {
  let view = null;
  let failure = null;
  let gone = false;
  let timer = null;
  let tab = 'fights';
  // The defences shown at this look, kept while the panel lives: the server
  // shows each once.
  let defences = null;
  // The fight just fought: its playback starts at once, and its card comes
  // into sight.
  let fresh = false;
  // The playback of the last fight, kept while it is the same fight, so a
  // redraw does not start it again.
  let playback = null;
  // The newest answer's number, so an older one never draws over it.
  let asked = 0;

  // A later look's defences (the Arena asked again at midnight) join those
  // shown before.
  function take(answer) {
    view = answer.arena;
    if (answer.arena.defences) defences = [...answer.arena.defences, ...(defences ?? [])];
  }

  async function load() {
    asked += 1;
    const mine = asked;
    try {
      const answer = await call('GET', '/api/settlement/arena');
      if (mine !== asked) return;
      take(answer);
      failure = null;
    } catch (error) {
      if (mine !== asked) return;
      // With the Arena already on the screen, it stays and the game asks
      // again in half a minute (as the Salon Gier does).
      if (view && error.status !== 403 && error.status !== 404) {
        if (gone) return;
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    if (!gone) render();
  }

  // An action's answer is the Arena after it, newer than any on its way.
  const apply = (answer) => {
    asked += 1;
    take(answer);
    if (!gone) render();
  };

  function tabs() {
    const names = { fights: view.texts.tabFights, table: view.texts.tabTable };
    return h(
      'div',
      { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': t('Arena') },
      TABS.map((id) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chat-tab',
            role: 'tab',
            'data-guide': `arena-tab-${id}`,
            'aria-selected': String(tab === id),
            onClick: () => {
              tab = id;
              render();
            },
          },
          h('span', { class: 'chat-tab-name', text: names[id] }),
          id === 'table' && view.rewards.due.length > 0 && h('span', { class: 'community-dot', role: 'img', 'aria-label': t('czeka do odebrania') }),
        ),
      ),
    );
  }

  // The character's rating, its place this week and the fights left today,
  // or why it cannot fight now.
  function statusCard() {
    const { texts, fights } = view;
    return h(
      'section',
      { class: 'card stack pvp-arena-status', 'data-guide': 'arena-status' },
      h('p', { class: 'muted', text: texts.intro }),
      h('p', { class: 'pvp-arena-rating', text: say(texts.rating, { rating: view.rating }) }),
      h('p', { class: 'pvp-arena-place', text: view.place ? say(texts.place, { place: view.place }) : texts.noPlace }),
      h('p', {}, h('span', { class: `chip${fights.left > 0 ? ' chip--success' : ''}`, text: say(texts.fightsLeft, { left: fights.left, perDay: fights.perDay }) })),
      fights.left === 0 && h('p', { class: 'muted', text: texts.used }),
      view.blocked && h('p', { class: 'region-warning', text: view.blocked }),
    );
  }

  // The last fight: who with, how it went, the rating's move, and the fight
  // itself played back.
  function lastCard() {
    const { last, texts } = view;
    if (!last) return null;
    if (!playback || playback.at !== last.at) {
      playback?.view.stop();
      playback = { at: last.at, view: createArena(last.fight, { autoplay: fresh ? 'now' : 'visible' }) };
    }
    const card = h(
      'section',
      { class: `card stack pvp-arena-last pvp-arena-last--${last.result}`, 'aria-labelledby': 'pvp-arena-last-title', 'data-guide': 'arena-last' },
      h('h2', { class: 'card-title', id: 'pvp-arena-last-title', text: texts.last }),
      h('p', { class: 'pvp-arena-result' }, say(texts[last.result], { name: last.rival.name })),
      h('p', { class: 'muted', text: say(texts.change, { before: last.before, after: last.after, change: signed(last.change) }) }),
      playback.view.element,
    );
    if (fresh) {
      fresh = false;
      requestAnimationFrame(() => card.scrollIntoView({ block: 'start', behavior: motionOn() ? 'smooth' : 'auto' }));
    }
    return card;
  }

  // The defences since the last visit, as the server told them at the look.
  function defencesCard() {
    if (!defences) return null;
    const { texts } = view;
    const key = { win: 'defenceWin', loss: 'defenceLoss', draw: 'defenceDraw' };
    return h(
      'section',
      { class: 'card stack pvp-arena-defences', 'aria-labelledby': 'pvp-arena-defences-title' },
      h('h2', { class: 'card-title', id: 'pvp-arena-defences-title', text: texts.defences }),
      defences.length === 0
        ? h('p', { class: 'muted', text: texts.noDefences })
        : h(
            'ul',
            { class: 'pvp-arena-list' },
            defences.map((one) =>
              h('li', { class: `pvp-arena-defence pvp-arena-defence--${one.result}`, text: say(texts[key[one.result]], { name: one.name, className: one.className, level: one.level, change: signed(one.change) }) }),
            ),
          ),
    );
  }

  // A rival: its bust, its name (its card at a tap), class, level and
  // rating, what a win and a loss would bring, and "Walcz".
  function rivalCard(rival) {
    const { texts, fights } = view;
    const shut = fights.left === 0 || Boolean(view.blocked);
    return h(
      'li',
      { class: 'card pvp-arena-rival' },
      h('span', { class: 'select-portrait pvp-arena-portrait', 'aria-hidden': 'true' }, bust(rival)),
      h(
        'div',
        { class: 'pvp-arena-rival-text' },
        h('p', { class: 'pvp-arena-rival-name' }, nameButton(rival.name)),
        h('p', { class: 'pvp-arena-rival-line', text: say(texts.rival, { className: rival.className, level: rival.level, rating: rival.rating }) }),
        h('p', { class: 'muted pvp-arena-stake', text: say(texts.stake, { win: rival.stakes.win, loss: Math.abs(rival.stakes.loss) }) }),
      ),
      h('button', {
        type: 'button',
        class: 'button button--world pvp-arena-fight',
        text: texts.fight,
        disabled: shut,
        'aria-label': `${texts.fight}: ${rival.name}`,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', '/api/settlement/arena/fight', { rivalId: rival.id });
            fresh = true;
            apply(answer);
          }),
      }),
    );
  }

  function rivalsPart() {
    const { texts } = view;
    return h(
      'section',
      { class: 'stack pvp-arena-rivals', 'aria-labelledby': 'pvp-arena-rivals-title', 'data-guide': 'arena-rivals' },
      h('h2', { class: 'pvp-arena-heading', id: 'pvp-arena-rivals-title', text: texts.rivals }),
      view.rivals.length === 0 ? h('p', { class: 'muted', text: texts.noRivals }) : h('ul', { class: 'pvp-arena-list stack' }, view.rivals.map(rivalCard)),
    );
  }

  function fightsTab() {
    const { texts, numbers } = view;
    return [
      statusCard(),
      lastCard(),
      defencesCard(),
      rivalsPart(),
      howItWorks(null, [
        say(texts.rules, { perDay: numbers.perDay, hpFactor: formatDecimal(numbers.hpFactor), moves: numbers.moves }),
        // Where armour counts at less than all of it (772).
        ...(numbers.armor < 100 ? [say(texts.armorRule, { armor: numbers.armor })] : []),
        say(texts.ratingRules, { start: numbers.start, share: numbers.share }),
      ]),
    ];
  }

  // A reward of a frozen week waiting for "Odbierz".
  function dueCard(due) {
    const { texts } = view;
    return h(
      'section',
      { class: 'card stack pvp-arena-due', 'data-guide': 'arena-reward' },
      h('p', { text: say(texts.due, { place: due.place, date: weekLabel(due.week) }) }),
      chestContents({ gold: due.gold, timePoints: 0, materials: [], systemPoints: due.systemPoints }, texts.rewards),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: texts.claim,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', '/api/settlement/arena/claim', { week: due.week });
            apply(answer);
            toast(texts.claimed);
          }),
      }),
    );
  }

  // This week's table, as a page of the Ranking: all of its places (at
  // most 50), the character's own row lit.
  function tableCard() {
    const { texts, table } = view;
    const rows = table.rows;
    return h(
      'section',
      { class: 'card ranking pvp-arena-table', 'data-guide': 'arena-table' },
      h('p', { class: 'muted', text: say(texts.tableEnds, { time: timeLeft(table.endsAt - serverNow()) }) }),
      table.own ? h('p', { class: 'ranking-place', text: say(texts.ownPlace, { place: table.own.place, rating: table.own.rating }) }) : h('p', { class: 'muted', text: texts.noPlace }),
      rows.length === 0
        ? h('p', { class: 'muted', text: texts.tableEmpty })
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
                h('th', { scope: 'col', text: t('Poziom') }),
                h('th', { scope: 'col', class: 'ranking-sorted', 'aria-sort': 'descending', text: t('Ocena') }),
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
                  h('td', { class: 'ranking-name' }, h('span', { class: 'ranking-who' }, icon(CLASS_ICONS[row.classId] ?? 'person', { size: 14, className: 'chat-class' }), nameButton(row.name))),
                  h('td', { text: formatNumber(row.level) }),
                  h('td', { class: 'ranking-sorted', text: formatNumber(row.rating) }),
                ),
              ),
            ),
          ),
    );
  }

  // The rewards of the places, at the character's level.
  function rewardsCard() {
    const { texts, rewards } = view;
    const places = ({ from, to }) => (to === null ? say(texts.tierRest, { from }) : to === from ? say(texts.tierOne, { from }) : say(texts.tierMany, { from, to }));
    return h(
      'section',
      { class: 'card stack pvp-arena-rewards', 'aria-labelledby': 'pvp-arena-rewards-title' },
      h('h2', { class: 'card-title', id: 'pvp-arena-rewards-title', text: texts.rewards }),
      h(
        'ul',
        { class: 'pvp-arena-list pvp-arena-tiers' },
        rewards.tiers.map((tier) => h('li', { class: 'pvp-arena-tier' }, h('span', { class: 'pvp-arena-tier-places', text: places(tier) }), chestContents({ ...tier, timePoints: 0, materials: [] }, places(tier)))),
      ),
    );
  }

  function tableTab() {
    const { texts, numbers } = view;
    return [
      ...view.rewards.due.map(dueCard),
      tableCard(),
      rewardsCard(),
      h('p', { class: 'muted pvp-arena-season', text: say(texts.season, { time: timeLeft(view.season.endsAt - serverNow()), share: numbers.share, start: numbers.start }) }),
      howItWorks(null, texts.tableRules),
    ];
  }

  function render() {
    clearTimeout(timer);
    if (failure) {
      holder.replaceChildren(systemPanel(failure.message));
      return;
    }
    if (!view) {
      holder.replaceChildren(h('p', { class: 'muted', text: t('Wczytywanie Areny…') }));
      return;
    }
    holder.replaceChildren(h('div', { class: 'stack pvp-arena' }, tabs(), tab === 'fights' ? fightsTab() : tableTab()));
    // At midnight the fights come back, on Monday the table closes: the
    // Arena is asked again then.
    const next = Math.min(view.fights.endsAt, view.table.endsAt);
    timer = setTimeout(load, Math.max(5000, next - serverNow() + 60000));
  }

  render();
  load();
  return {
    refresh: () => {
      if (!gone) render();
    },
    unmount() {
      gone = true;
      clearTimeout(timer);
      playback?.view.stop();
    },
  };
}
