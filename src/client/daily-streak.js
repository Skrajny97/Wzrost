// The reward for days in a row (1029; the author: „Nagroda za kolejne dni
// gry”, „wszystko super wymyślone”): seven days, each giving more than the
// one before, the seventh a pack of cards; a day missed starts the run
// anew. The window opens by itself at the first visit of the day, once the
// narrator's introduction is over; closed without taking, it comes back at
// the next visit that day. A thin tab on the left edge (1041; the author:
// „Ikonka jakaś albo napis serii dni niech wyświetla się z drugiego boku
// może jak zakładka graczy online - coś cieniutkiego”) shows the day of the
// series, gold while its reward waits, and opens the window at a tap.

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

// The tab on the left edge (1041): today's day of the series out of all,
// gold and glowing while today's reward waits; hidden till the series is
// known. Opposite the players online (online.js), at the main column's edge
// on a computer.
let tab = null;
function showTab() {
  if (!tab) return;
  tab.hidden = !streak;
  if (!streak) return;
  const days = streak.days.length;
  tab.classList.toggle('streak-tab--waiting', !streak.taken);
  tab.querySelector('.streak-tab-day').textContent = `${streak.day}/${days}`;
  tab.setAttribute('aria-label', streak.taken ? t('Seria dni: dzień {day} z {days}, nagroda odebrana', { day: streak.day, days }) : t('Seria dni: dzień {day} z {days}, nagroda czeka', { day: streak.day, days }));
}

export function mountStreakTab(view) {
  if (tab) return;
  tab = h(
    'button',
    { type: 'button', class: 'streak-tab', hidden: true, onClick: (event) => withButton(event.currentTarget, openFromTab) },
    icon('calendar', { size: 14 }),
    h('span', { class: 'streak-tab-day' }),
  );
  view.append(h('div', { class: 'edge-tabs edge-tabs--left' }, tab));
}

// Today's reward taken from the window: the window and the tab anew.
async function take() {
  const data = await call('POST', '/api/streak');
  streak = data.streak;
  showTab();
  openStreak(streak, take);
}

// The window from the tab, with the series as it stands now.
async function openFromTab() {
  const data = await call('GET', '/api/streak');
  streak = data.streak;
  offered = true;
  showTab();
  openStreak(streak, take);
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
// Each character its own series: another character played, asked anew.
let owner = null;
// Whether the series has had its turn this visit: known, and its window
// shown or today's reward taken. Szczodre Gody's calendar waits for it
// (winter-calendar.js), so the two windows do not open at once.
export const streakSettled = () => streak !== null && (streak.taken || offered);
export function offerStreak() {
  if (!state.character) return;
  if (state.character.name !== owner) {
    owner = state.character.name;
    asked = false;
    offered = false;
    streak = null;
    retryAt = 0;
    showTab();
  }
  if (offered) return;
  if (!asked) {
    if (Date.now() < retryAt) return;
    asked = true;
    call('GET', '/api/streak')
      .then((data) => {
        streak = data.streak;
        showTab();
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
  openStreak(streak, take);
}
