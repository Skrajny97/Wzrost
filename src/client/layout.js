// The frame around every game screen: the fixed top bar (levels, HP, mana,
// gold, current activity) and the two bottom bars, the main menu and the
// character bar with its own background.

import { $, fill, h, icon } from './dom.js';
import { formatCountdown, formatMinutes, formatNumber } from './format.js';
import { activityFinished, currentHp, isUnlocked, serverNow, state, unlockInfo } from './state.js';
import { meter } from './ui.js';

const MAIN_TABS = [
  { id: 'postac', label: 'Postać', icon: 'person', href: '#/postac' },
  { id: 'walka', label: 'Walka', icon: 'swords', href: '#/walka' },
  { id: 'profesje', label: 'Profesje', icon: 'leaf', href: '#/profesje', unlock: 'professions' },
  { id: 'osada', label: 'Osada', icon: 'house', href: '#/osada', unlock: 'settlement' },
  { id: 'dziennik', label: 'Dziennik', icon: 'book', href: '#/dziennik' },
];

const CHARACTER_TABS = [
  { id: 'back', label: 'Powrót', icon: 'back' },
  { id: 'stats', label: 'Statystyki', icon: 'stats', href: '#/postac/statystyki', unlock: 'stats' },
  { id: 'skills', label: 'Umiejętności', icon: 'skills', href: '#/postac/umiejetnosci', unlock: 'skills' },
  { id: 'core', label: 'Rdzeń', icon: 'core', href: '#/postac/rdzen', unlock: 'core', system: true },
];

let topbar = null;

export function buildTopbar(onSettings) {
  const level = h('span', { class: 'badge badge--system' });
  const classLevel = h('span', { class: 'badge badge--world' });
  const gold = h('span', { class: 'gold-value' });
  const hp = meter({ label: 'HP', value: 0, max: 0, kind: 'hp' });
  const mana = meter({ label: 'MANA', value: 0, max: 0, kind: 'mana' });
  const activityLabel = h('span', { class: 'activity-label' });
  const activityTime = h('span', { class: 'activity-time' });
  const activity = h('a', { class: 'activity', href: '#/walka' }, activityLabel, activityTime);

  const element = $('#topbar');
  fill(element,
    h(
      'div',
      { class: 'topbar-row' },
      h('div', { class: 'topbar-badges' }, level, classLevel),
      h(
        'div',
        { class: 'topbar-right' },
        h('span', { class: 'gold', 'aria-label': 'Złoto' }, icon('coin', { size: 18 }), gold),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Ustawienia', onClick: onSettings }, icon('gear')),
      ),
    ),
    h('div', { class: 'meters' }, hp.element, mana.element),
    activity,
  );
  topbar = { level, classLevel, gold, hp, mana, activity, activityLabel, activityTime };
  updateTopbar();
}

export function updateTopbar(now = serverNow()) {
  const character = state.character;
  if (!topbar || !character) return;
  topbar.level.textContent = `POZ. ${character.level}`;
  topbar.classLevel.textContent = `${character.className.toUpperCase()} ${character.classLevel}`;
  topbar.gold.textContent = formatNumber(character.gold);
  topbar.hp.set(currentHp(character, now), character.maxHp);
  topbar.mana.set(character.mana, character.maxMana);

  const activity = character.activity;
  const { activityLabel, activityTime } = topbar;
  topbar.activity.classList.toggle('activity--done', activityFinished(activity, now));
  if (activity) {
    activityLabel.textContent = `POLOWANIE · ${activity.regionName}`;
    activityTime.textContent = activityFinished(activity, now) ? 'RAPORT GOTOWY' : formatCountdown(activity.endsAt - now);
  } else {
    const hpNow = currentHp(character, now);
    activityLabel.textContent = 'ODPOCZYNEK';
    activityTime.textContent =
      hpNow >= character.maxHp
        ? 'PEŁNE HP'
        : `PEŁNE HP ZA ${formatMinutes(Math.ceil((character.maxHp - hpNow) / character.regen.perMinute))}`.toUpperCase();
  }
}

// Builds a bottom bar; `active` is the id of the highlighted tab.
function navButton(tab, active, onBack) {
  const unlocked = !tab.unlock || isUnlocked(tab.unlock);
  const unlock = tab.unlock && unlockInfo(tab.unlock);
  const lockText = unlocked ? null : unlock.level ? `poz. ${unlock.level}` : 'zablokowane';
  const children = [
    h('span', { class: 'nav-icon' }, icon(tab.icon), !unlocked && icon('lock', { size: 12, className: 'nav-lock' })),
    h('span', { class: 'nav-label', text: tab.label }),
    lockText && h('span', { class: 'nav-hint', text: lockText }),
  ];
  const props = {
    class: ['nav-item', tab.system && 'nav-item--system', !unlocked && 'nav-item--locked'].filter(Boolean).join(' '),
    'aria-current': tab.id === active ? 'page' : undefined,
    'aria-label': lockText ? `${tab.label}, zablokowane (${lockText})` : tab.label,
  };
  if (tab.id === 'back') return h('button', { ...props, type: 'button', onClick: onBack }, children);
  return h('a', { ...props, href: tab.href }, children);
}

export function updateNav({ kind, active, onBack }) {
  const main = $('#nav-main');
  const character = $('#nav-character');
  main.hidden = kind !== 'main';
  character.hidden = kind !== 'character';
  if (kind === 'main') fill(main, ...MAIN_TABS.map((tab) => navButton(tab, active)));
  else fill(character, ...CHARACTER_TABS.map((tab) => navButton(tab, active, onBack)));
}

