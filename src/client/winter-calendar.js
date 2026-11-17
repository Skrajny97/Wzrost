// Szczodre Gody (1044; the author's 1028, the window as on the mock-ups
// accepted on 17.11.2026, 1044.1): the calendar of 1–24 December, one reward
// a day for coming into the game, in a window like the series of days
// (daily-streak.js): 24 windows, today's lit, those taken ticked, those
// missed lost (1044.1a A), the 24th the winter set (1044.2 B). The window
// opens by itself at the first visit of a calendar's day, after the series
// of days' window; closed without taking, it comes back at the next visit
// that day. A thin tab on the left edge, under the series' tab, shows
// today's day while the calendar runs, gold while its reward waits, and
// opens the window at a tap.

import { goldArt, scrollArt, timePointsArt } from './art.js';
import { streakSettled } from './daily-streak.js';
import { h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, withButton } from './ui.js';

const ART = 20;
const words = () => state.content.winter.texts;
const picture = (src, alt = '') => h('img', { class: 'streak-pack', src, alt, width: ART, height: ART });
const line = (art, text, title = null) => h('span', { class: 'streak-reward', title }, art, h('span', { text }));

// A day's rewards in its window: the winter set, a decoration, a potion, a
// scroll, packs of cards, gold, Punkty Czasu and Punkty Systemu.
function rewardLines(day) {
  return [
    day.cosmetics.length > 0 && line(icon('gift', { size: ART }), words().set, day.cosmetics.map((one) => one.name).join(', ')),
    day.decoration && line(picture(`/art/winter/${day.decoration.art}.png`, day.decoration.name), words().decoration, day.decoration.name),
    day.potion && line(picture(`/art/potions/${day.potion.id}.png`, day.potion.name), `×${day.potion.count}`, day.potion.name),
    day.scroll && line(scrollArt(day.scroll.id, ART), words().scroll, day.scroll.name),
    day.packs > 0 && line(picture('/art/cards/pack.png'), `×${day.packs}`, t('Pakiet kart')),
    day.gold > 0 && line(goldArt(ART), formatNumber(day.gold)),
    day.timePoints > 0 && line(timePointsArt(ART), formatNumber(day.timePoints)),
    day.systemPoints > 0 && line(icon(SYSTEM_POINTS_ICON, { size: ART }), formatNumber(day.systemPoints)),
  ];
}

/**
 * The window of the calendar: `view` { today: today's day (1–24), taken:
 * whether today's reward is taken, days: [{ day, state: 'taken' | 'missed'
 * | 'today' | 'later', gold, timePoints, systemPoints, packs, potion,
 * scroll, decoration, cosmetics }] }; `take` takes today's reward; `note`
 * what it gave, said under the windows.
 * @param {Record<string, any>} view
 * @param {() => Promise<void>} take
 * @param {string | null} [note]
 */
export function openWinter(view, take, note = null) {
  const last = view.days[view.days.length - 1].day;
  const tile = (day) =>
    h(
      'li',
      {
        class: [
          'streak-day',
          'winter-day',
          day.state === 'taken' && 'streak-day--taken',
          day.day === view.today && 'streak-day--today',
          day.state === 'missed' && 'winter-day--missed',
          day.state === 'later' && 'winter-day--later',
          day.day === last && 'streak-day--last winter-day--last',
        ]
          .filter(Boolean)
          .join(' '),
        'aria-current': day.day === view.today ? 'date' : null,
      },
      h('span', { class: 'streak-day-name', text: t(words().dayName, { day: day.day }) }),
      h('span', { class: 'streak-day-rewards' }, rewardLines(day)),
      day.state === 'taken' && h('span', { class: 'streak-day-check', 'aria-label': t('odebrane') }, icon('check', { size: 14 })),
      day.state === 'missed' && h('span', { class: 'winter-day-missed', text: words().missed }),
    );
  openSheet(
    h('h2', { class: 'sheet-title', text: words().title }),
    h('p', { class: 'sheet-text', text: words().lead }),
    h('ol', { class: 'streak-days winter-days', 'aria-label': words().days }, view.days.map(tile)),
    note && h('p', { class: 'sheet-text winter-note', text: note }),
    view.taken
      ? h('p', { class: 'sheet-text streak-done', text: view.today === last ? words().done : words().taken })
      : h('button', { type: 'button', class: 'button button--system', text: t(words().take, { day: view.today }), onClick: (event) => withButton(event.currentTarget, take) }),
    view.taken && h('button', { type: 'button', class: 'button button--world', text: t('Zamknij'), onClick: closeSheet }),
  );
}

// What today's reward gave beyond the window's tick: a decoration for the
// camp, or the winter set waiting in the Sklep Systemu.
const noteOf = (reward) => (reward?.decoration ? t(words().decorationGot, { name: reward.decoration.name }) : reward?.cosmetics?.length ? words().setGot : null);

// The tab on the left edge, under the series of days' (1041): today's day
// of the calendar, gold and glowing while its reward waits; hidden outside
// the calendar's days.
let tab = null;
function showTab() {
  if (!tab) return;
  tab.hidden = !calendar;
  if (!calendar) return;
  tab.classList.toggle('streak-tab--waiting', !calendar.taken);
  tab.querySelector('.streak-tab-day').textContent = String(calendar.today);
  tab.setAttribute('aria-label', t(calendar.taken ? words().tabTaken : words().tabWaiting, { day: calendar.today }));
}

export function mountWinterTab(view) {
  if (tab) return;
  const edge = view.querySelector('.edge-tabs--left');
  if (!edge) return;
  tab = h(
    'button',
    { type: 'button', class: 'streak-tab winter-tab', hidden: true, onClick: (event) => withButton(event.currentTarget, openFromTab) },
    icon('snowflake', { size: 14 }),
    h('span', { class: 'streak-tab-day' }),
  );
  edge.append(tab);
}

// Today's reward taken from the window: the window and the tab anew, with
// what it gave.
async function take() {
  const data = await call('POST', '/api/winter');
  calendar = data.winter;
  showTab();
  if (calendar) openWinter(calendar, take, noteOf(data.reward));
  else closeSheet();
}

// The window from the tab, with the calendar as it stands now.
async function openFromTab() {
  const data = await call('GET', '/api/winter');
  calendar = data.winter;
  offered = true;
  showTab();
  if (calendar) openWinter(calendar, take);
}

// The window offered by itself, once a visit, while today's reward waits:
// the calendar asked for once, and the window opened at the first moment
// with nothing else on the screen, once the series of days has had its
// turn (streakSettled). Called every second (app.js).
let asked = false;
let offered = false;
let calendar = null;
let retryAt = 0;
// Each character its own calendar: another character played, asked anew.
let owner = null;
export function offerWinter() {
  if (!state.character) return;
  if (state.character.name !== owner) {
    owner = state.character.name;
    asked = false;
    offered = false;
    calendar = null;
    retryAt = 0;
    showTab();
  }
  if (offered) return;
  if (!asked) {
    if (Date.now() < retryAt) return;
    asked = true;
    call('GET', '/api/winter')
      .then((data) => {
        calendar = data.winter;
        showTab();
      })
      .catch(() => {
        asked = false;
        retryAt = Date.now() + 60000;
      });
    return;
  }
  if (!calendar || calendar.taken || !streakSettled()) return;
  if (document.querySelector('dialog[open]') || !document.querySelector('#toast')?.hidden) return;
  offered = true;
  openWinter(calendar, take);
}
