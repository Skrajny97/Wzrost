// The Próby Gildii's card for the Gildia's page (src/server/guild-trials.js;
// DECISIONS.md, "Próby i Prośby Gildii"; the author: "345 A"): the guild's
// bar of the week with its thresholds, each with its chest for this
// character and "Otwórz" once it may open it; last week's chests still to
// open; the board of the week as far as it is open today, every trial
// running at once with its meter (nothing to take, the author's 617),
// "Wykonana" or why it is shut, with how many more come tomorrow (615 A);
// and the
// "Wkład tygodnia", who finished how many trials. The card asks for the
// Próby itself and takes its words from the answer (data/guilds.json,
// trials.texts), in the page's language; its own few words go through t()
// (i18n.js). mountGuildTrials(container) adds the card to the
// container and gives { unmount() }, which takes it away.

import { goldArt, timePointsArt } from './art.js';
import { checkGuildTodo } from './chat-news.js';
import { materialIcon } from './craft-table.js';
import { fill, h, icon } from './dom.js';
import { formatNumber, plural } from './format.js';
import { t } from './i18n.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { call } from './state.js';
import { foldPart, howItWorks, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The picture of a trial's kind, as the narrator's quests have theirs.
const KIND_ICONS = {
  killAny: 'beast',
  explore: 'swords',
  towers: 'stone',
  gatherAny: 'leaf',
  brewAny: 'flask',
  makeAny: 'hammer',
  process: 'pouch',
  salvage: 'hammer',
  orders: 'house',
  upgrade: 'ore',
  gifts: 'gift',
};

// A chest's contents in a row of small pictures: gold, Punkty Czasu, the
// material and Punkty Systemu, each with its count.
export function chestContents(chest, label) {
  return h(
    'ul',
    { class: 'guild-chest', 'aria-label': label },
    chest.gold > 0 && h('li', { title: t('Złoto') }, goldArt(16), h('span', { text: formatNumber(chest.gold) })),
    chest.timePoints > 0 && h('li', { title: t('Punkty Czasu') }, timePointsArt(16), h('span', { text: formatNumber(chest.timePoints) })),
    chest.materials.map((material) => h('li', { title: material.name }, materialIcon(material.materialId, 16), h('span', { text: `${material.name} ×${formatNumber(material.count)}` }))),
    chest.systemPoints > 0 &&
      h('li', { title: t('Punkty Systemu') }, icon(SYSTEM_POINTS_ICON, { size: 16, className: 'guild-chest-system' }), h('span', { text: formatNumber(chest.systemPoints) })),
  );
}

export function mountGuildTrials(container) {
  let view = null;
  let gone = false;
  const card = h('section', { class: 'card guild-trials', 'aria-labelledby': 'guild-trials-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(card);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  async function claim(week, threshold) {
    const answer = await call('POST', '/api/guild/trials/claim', { week, threshold });
    checkGuildTodo({ now: true });
    show(answer);
    toast(answer.chest.text);
  }

  const title = () => h('h2', { class: 'card-title', id: 'guild-trials-title', text: view.texts.title });
  const subtitle = (text) => h('h3', { class: 'guild-subtitle', text });
  const trials = (count) => `${formatNumber(count)} ${plural(count, ...view.texts.trialForms)}`;
  const kindIcon = (kind) => icon(KIND_ICONS[kind] ?? 'unknown', { size: 22, className: 'guild-trial-icon' });

  // A meter as the Bestia's bar: `value` of `max`, with marks at `marks`.
  function meter({ label, value, max, text, kind, marks = [] }) {
    const bar = h('div', { class: 'meter-fill' });
    bar.style.width = `${max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0}%`;
    const ticks = marks.map((mark) => {
      const tick = h('span', { class: 'guild-meter-mark', 'aria-hidden': 'true' });
      tick.style.left = `${(mark / max) * 100}%`;
      return tick;
    });
    return h(
      'div',
      { class: `meter meter--${kind} guild-meter` },
      h('div', { class: 'meter-label' }, h('span', { text: label }), h('span', { class: 'meter-value', text })),
      h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value }, bar, ticks),
    );
  }

  // A threshold with its chest: "Otwórz" once this character may open it.
  function thresholdRow(bar, threshold) {
    const { texts } = view;
    const status = threshold.claimed
      ? h('span', { class: 'chip guild-chip', text: texts.claimed })
      : threshold.ready
        ? h('button', {
            type: 'button',
            class: 'button button--system button--small',
            text: texts.open,
            onClick: (event) => withButton(event.currentTarget, () => claim(bar.week, threshold.index)),
          })
        : threshold.reached && h('span', { class: 'guild-threshold-reached', role: 'img', 'aria-label': t('osiągnięty') }, icon('check', { size: 18 }));
    return h(
      'li',
      { class: `guild-threshold${threshold.reached ? ' guild-threshold--reached' : ''}` },
      h('div', { class: 'guild-threshold-head' }, h('span', { class: 'guild-threshold-name', text: filled(texts.threshold, { number: threshold.index + 1, need: trials(threshold.need) }) }), status),
      chestContents(threshold.chest, texts.chest),
    );
  }

  // The guild's bar of the week, its thresholds with their chests folded
  // under it: open while a chest waits to be opened, else as left.
  function barPart() {
    const { bar, texts } = view;
    const top = bar.thresholds.at(-1).need;
    const next = bar.thresholds.find((threshold) => !threshold.reached);
    const ready = bar.thresholds.some((threshold) => threshold.ready);
    return h(
      'div',
      { class: 'guild-part' },
      subtitle(texts.bar),
      meter({
        label: texts.points,
        value: bar.points,
        max: top,
        text: filled(texts.barValue, { points: formatNumber(bar.points), need: formatNumber(top) }),
        kind: 'xp',
        marks: bar.thresholds.slice(0, -1).map((threshold) => threshold.need),
      }),
      foldPart(
        {
          key: 'guild-trials-rewards',
          title: texts.rewards,
          line: next ? filled(texts.rewardsNext, { need: trials(next.need) }) : texts.rewardsAll,
          open: false,
          force: ready,
          dot: ready,
        },
        h(
          'ol',
          { class: 'guild-thresholds' },
          bar.thresholds.map((threshold) => thresholdRow(bar, threshold)),
        ),
      ),
      !bar.contributed && h('p', { class: 'muted', text: texts.contribute }),
    );
  }

  // Last week's chests this character may still open.
  function previousPart() {
    const { previous, texts } = view;
    if (!previous) return null;
    return h(
      'div',
      { class: 'guild-part guild-previous' },
      subtitle(texts.previous),
      h('p', { class: 'muted', text: texts.previousUntil }),
      h(
        'ol',
        { class: 'guild-thresholds' },
        previous.thresholds.filter((threshold) => threshold.ready).map((threshold) => thresholdRow(previous, threshold)),
      ),
    );
  }

  // A trial's state on the board: "Wykonana", or nothing while it runs
  // (its meter shows how far it is) or is shut (its lock says why).
  function trialState(trial) {
    const { texts } = view;
    if (trial.state === 'done') return h('span', { class: 'chip guild-chip guild-chip--done' }, icon('check', { size: 14 }), texts.done);
    return null;
  }

  // The board folds under its title (the author: „zeby dalo sie zwijać
  // chociazby tablica prób”), which says how many of today's trials are
  // done. Every open trial runs at once, with nothing to take (the
  // author's 617), each with its meter; under the list how many trials come
  // tomorrow and how many finished ones wait for the bar (615 A).
  function boardPart() {
    const { trials: board, day, texts } = view;
    const done = board.filter((trial) => trial.state === 'done').length;
    const line = filled(texts.boardLine, { done: formatNumber(done), open: formatNumber(board.length) });
    return h(
      'div',
      // The narrator's line about the Próby rings the board's title and the
      // words under it (narrator.js).
      { class: 'guild-part guild-board', 'data-guide': 'guild-trials-board' },
      foldPart(
        { key: 'guild-trials-board', title: texts.board, line },
        h('p', { class: 'muted small', text: texts.fromOpening }),
        h(
          'ul',
          { class: 'guild-trials-list' },
          board.map((trial) =>
            h(
              'li',
              { class: `guild-trial guild-trial--${trial.state}` },
              kindIcon(trial.kind),
              h(
                'div',
                { class: 'guild-trial-body' },
                h('p', { class: 'guild-trial-words', text: trial.text }),
                trial.note && h('p', { class: 'guild-trial-note', text: trial.note }),
                trial.lock && h('p', { class: 'guild-trial-lock' }, icon('lock', { size: 14 }), h('span', { text: trial.lock })),
                trial.state === 'active' &&
                  meter({
                    label: texts.progress,
                    value: trial.progress,
                    max: trial.count,
                    text: filled(texts.progressValue, { progress: formatNumber(trial.progress), count: formatNumber(trial.count) }),
                    kind: 'class-xp',
                  }),
              ),
              trialState(trial),
            ),
          ),
        ),
        day.later > 0 && h('p', { class: 'muted small', text: filled(texts.later, { count: formatNumber(day.later) }) }),
        day.soon > 0 && h('p', { class: 'muted small', text: filled(texts.soon, { count: formatNumber(day.soon) }) }),
      ),
    );
  }

  // The "Wkład tygodnia": who finished how many trials, the part over the
  // cap marked, folded under the number of them.
  function membersPart() {
    const { members, texts } = view;
    if (members.length === 0) return h('div', { class: 'guild-part' }, subtitle(texts.members), h('p', { class: 'muted', text: texts.empty }));
    return h(
      'div',
      { class: 'guild-part' },
      foldPart(
        { key: 'guild-trials-members', title: texts.members, line: filled(texts.membersLine, { count: formatNumber(members.length) }), open: false },
        h(
            'ol',
            { class: 'guild-ranking' },
            members.map((member) =>
              h(
                'li',
                { class: `guild-row${member.own ? ' guild-row--own' : ''}` },
                h('span', { class: 'guild-row-name', text: member.name }),
                h('span', { class: 'guild-row-value', text: [trials(member.count), member.count > member.counted && filled(texts.capped, { cap: member.counted })].filter(Boolean).join(' · ') }),
              ),
            ),
          ),
      ),
    );
  }

  function render() {
    const { texts } = view;
    const how = howItWorks(texts.intro, texts.how);
    if (!view.guild) {
      fill(card, title(), h('p', { class: 'muted', text: texts.noGuild }), how);
      return;
    }
    // The board first (the author: "Tablicę prób w próbach daj na sam szczyt").
    fill(card, title(), boardPart(), how, barPart(), previousPart(), membersPart());
  }

  call('GET', '/api/guild/trials')
    .then(show)
    .catch((error) => {
      if (!gone) fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Prób Gildii.') }));
    });

  return {
    unmount() {
      gone = true;
      card.remove();
    },
  };
}
