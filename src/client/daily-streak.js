// The reward for days in a row (1029; the author: „Nagroda za kolejne dni
// gry”, „wszystko super wymyślone”): seven days, each giving more than the
// one before, the seventh a pack of cards; a day missed starts the run
// anew. The window opens by itself at the first visit of the day, once the
// narrator's introduction is over; closed without taking, it comes back at
// the next visit that day.

import { goldArt, timePointsArt } from './art.js';
import { h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { narratorIdle } from './narrator.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, withButton } from './ui.js';

const ART = 20;

// One reward's line in a day's tile: its picture and its amount.
function rewardLines(day) {
  return [
    day.packs > 0 && h('span', { class: 'streak-reward' }, h('img', { class: 'streak-pack', src: '/art/cards/pack.png', alt: '', width: ART, height: ART }), h('span', { text: t('Pakiet kart') })),
    day.gold > 0 && h('span', { class: 'streak-reward' }, goldArt(ART), h('span', { text: formatNumber(day.gold) })),
    day.timePoints > 0 && h('span', { class: 'streak-reward' }, timePointsArt(ART), h('span', { text: formatNumber(day.timePoints) })),
    day.systemPoints > 0 && h('span', { class: 'streak-reward' }, icon(SYSTEM_POINTS_ICON, { size: ART }), h('span', { text: formatNumber(day.systemPoints) })),
  ];
}

/**
 * The window of the run: `view` { day: today's place in the run (1–7),
 * taken: whether today's reward is taken, fresh: whether the run started
 * anew today after a day missed, days: [{ day, gold, timePoints, packs,
 * systemPoints }] }; `take` takes today's reward.
 * @param {Record<string, any>} view
 * @param {() => Promise<void>} take
 */
export function openStreak(view, take) {
  const tile = (day) =>
    h(
      'li',
      {
        class: `streak-day${day.day < view.day || (day.day === view.day && view.taken) ? ' streak-day--taken' : ''}${day.day === view.day ? ' streak-day--today' : ''}${day.day === 7 ? ' streak-day--last' : ''}`,
        'aria-current': day.day === view.day ? 'date' : null,
      },
      h('span', { class: 'streak-day-name', text: t('Dzień {day}', { day: day.day }) }),
      h('span', { class: 'streak-day-rewards' }, rewardLines(day)),
      (day.day < view.day || (day.day === view.day && view.taken)) && h('span', { class: 'streak-day-check', 'aria-label': t('odebrane') }, icon('check', { size: 16 })),
    );
  openSheet(
    h('p', { class: 'system-label', text: '[ SYSTEM ]' }),
    h('h2', { class: 'sheet-title', text: t('Nagroda za kolejne dni') }),
    h('p', { class: 'sheet-text', text: t('Wracaj codziennie: każdy kolejny dzień daje więcej, a 7. dnia czeka pakiet kart. Opuszczony dzień zaczyna serię od nowa.') }),
    view.fresh && view.day === 1 && h('p', { class: 'sheet-text streak-fresh', text: t('Wczoraj zabrakło Cię w grze, więc seria zaczyna się od 1. dnia.') }),
    h('ol', { class: 'streak-days', 'aria-label': t('Dni serii') }, view.days.map(tile)),
    view.taken
      ? h('p', { class: 'sheet-text streak-done', text: view.day < 7 ? t('Odebrane. Wróć jutro po dzień {day}.', { day: view.day + 1 }) : t('Seria ukończona. Jutro zaczyna się nowa.') })
      : h('button', { type: 'button', class: 'button button--system', text: t('Odbierz nagrodę dnia {day}', { day: view.day }), onClick: (event) => withButton(event.currentTarget, take) }),
    view.taken && h('button', { type: 'button', class: 'button button--world', text: t('Zamknij'), onClick: closeSheet }),
  );
}

// The window offered by itself, once a visit (the page loaded), while
// today's reward waits: the series asked for once, and the window opened
// at the first moment with nothing else on the screen (no window, no
// message), the narrator's introduction over and the narrator quiet. Taken,
// the window shows the day ticked. Called every second (app.js).
let asked = false;
let offered = false;
let streak = null;
// After a failed ask, the next a minute later.
let retryAt = 0;
export function offerStreak() {
  if (!state.character || offered) return;
  if (!asked) {
    if (Date.now() < retryAt) return;
    asked = true;
    call('GET', '/api/streak')
      .then((data) => {
        streak = data.streak;
      })
      .catch(() => {
        asked = false;
        retryAt = Date.now() + 60000;
      });
    return;
  }
  if (!streak || streak.taken) return;
  if (document.querySelector('dialog[open]') || !document.querySelector('#toast')?.hidden) return;
  const read = state.character.tutorial;
  if (read !== null && (!read.includes('ending') || !narratorIdle())) return;
  offered = true;
  const take = async () => {
    const data = await call('POST', '/api/streak');
    streak = data.streak;
    openStreak(streak, take);
  };
  openStreak(streak, take);
}
