// The frame around every game screen: the fixed top bar (levels, HP and mana,
// character and class XP, gold with the camp's resources, the camp, current
// activity) and the two bottom bars, the main menu and the character bar with
// its own background.

import { $, fill, h, icon } from './dom.js';
import { formatCountdown, formatMinutes, formatNumber } from './format.js';
import { RESOURCE_ICONS } from './icons.js';
import { activityFinished, currentHp, isUnlocked, restRate, serverNow, state, unlockInfo, walletEntries } from './state.js';
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
  // Tapping the gold shows the resources under it.
  const wallet = h('ul', { class: 'wallet-list', id: 'wallet-list', hidden: true });
  const goldButton = h(
    'button',
    {
      type: 'button',
      class: 'gold',
      'aria-label': 'Złoto i zasoby',
      'aria-expanded': 'false',
      'aria-controls': 'wallet-list',
      onClick: () => showWallet(wallet.hidden),
    },
    icon('coin', { size: 18 }),
    gold,
  );
  const campLabel = h('span', { class: 'camp-label' });
  const camp = h('a', { class: 'camp-button', href: '#/oboz', 'aria-label': 'Obóz' }, icon('tent'), campLabel);
  const hp = meter({ label: 'HP', value: 0, max: 0, kind: 'hp' });
  const mana = meter({ label: 'MANA', value: 0, max: 0, kind: 'mana' });
  const xp = meter({ label: 'XP POSTACI', value: 0, max: 0, kind: 'xp' });
  const classXp = meter({ label: 'XP KLASY', value: 0, max: 0, kind: 'class-xp' });
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
        goldButton,
        camp,
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Ustawienia', onClick: onSettings }, icon('gear')),
      ),
    ),
    wallet,
    // Two rows: HP over mana, character XP over class XP.
    h('div', { class: 'meters' }, hp.element, xp.element, mana.element, classXp.element),
    activity,
  );
  topbar = { level, classLevel, gold, goldButton, wallet, camp, campLabel, hp, mana, xp, classXp, activity, activityLabel, activityTime };
  updateTopbar();
}

function walletRows() {
  return walletEntries().map((entry) =>
    h(
      'li',
      { class: 'wallet-item' },
      icon(RESOURCE_ICONS[entry.id] ?? 'unknown', { size: 18 }),
      h('span', { class: 'wallet-name', text: entry.name }),
      h('span', { class: 'wallet-amount', text: formatNumber(entry.amount) }),
    ),
  );
}

// Opens or closes the list of resources under the gold.
export function showWallet(open) {
  if (!topbar) return;
  topbar.wallet.hidden = !open;
  topbar.goldButton.setAttribute('aria-expanded', String(open));
  topbar.walletKey = null;
  if (open) refreshWallet();
}

// Redrawn only when an amount changes, not on every tick.
function refreshWallet() {
  const key = JSON.stringify(walletEntries().map((entry) => entry.amount));
  if (key === topbar.walletKey) return;
  topbar.walletKey = key;
  fill(topbar.wallet, ...walletRows());
}

// A tap anywhere else, or Escape, closes the list.
document.addEventListener('click', (event) => {
  if (topbar && !topbar.wallet.hidden && !topbar.wallet.contains(event.target) && !topbar.goldButton.contains(event.target)) {
    showWallet(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && topbar && !topbar.wallet.hidden) showWallet(false);
});

export function updateTopbar(now = serverNow()) {
  const character = state.character;
  if (!topbar || !character) return;
  topbar.level.textContent = `POZ. ${character.level}`;
  topbar.classLevel.textContent = `${character.className.toUpperCase()} ${character.classLevel}`;
  topbar.gold.textContent = formatNumber(character.gold);
  if (!topbar.wallet.hidden) refreshWallet();
  // The camp shows the time left of the building being upgraded.
  const building = character.camp.construction;
  const busy = Boolean(building) && now < building.endsAt;
  topbar.camp.classList.toggle('camp-button--busy', busy);
  topbar.campLabel.textContent = busy ? formatCountdown(building.endsAt - now) : 'Obóz';
  topbar.camp.setAttribute('aria-label', busy ? `Obóz, budowa: ${building.name}` : 'Obóz');
  topbar.hp.set(currentHp(character, now), character.maxHp);
  topbar.mana.set(character.mana, character.maxMana);
  topbar.xp.set(character.xp, character.xpToNext);
  topbar.classXp.set(character.classXp, character.classXpToNext);

  const activity = character.activity;
  const { activityLabel, activityTime } = topbar;
  topbar.activity.classList.toggle('activity--done', activityFinished(activity, now));
  if (activity) {
    activityLabel.textContent = `EKSPLORACJA · ${activity.areaName}`;
    activityTime.textContent = activityFinished(activity, now) ? 'RAPORT GOTOWY' : formatCountdown(activity.endsAt - now);
  } else {
    const hpNow = currentHp(character, now);
    activityLabel.textContent = 'ODPOCZYNEK';
    activityTime.textContent =
      hpNow >= character.maxHp
        ? 'PEŁNE HP'
        : `PEŁNE HP ZA ${formatMinutes(Math.ceil((character.maxHp - hpNow) / restRate(character)))}`.toUpperCase();
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

