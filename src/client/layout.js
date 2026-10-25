// The frame around every game screen: the fixed top bar (levels, HP and mana,
// character and class XP, gold and Punkty Systemu with the camp's resources,
// the camp, current activity with the pouch of parts beside it) and the two
// bottom bars, the main menu and the character bar with its own background.

import { materialSprite } from './art.js';
import { $, fill, h, icon } from './dom.js';
import { countOf, formatCountdown, formatMinutes, formatNumber, formatShort } from './format.js';
import { RESOURCE_ICONS, SYSTEM_POINTS_ICON } from './icons.js';
import { activityFinished, currentHp, fullStores, isUnlocked, restRate, serverNow, state, timePointsNow, unlockInfo, walletEntries } from './state.js';
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
  const points = h('span', { class: 'points-value' });
  // Gold and Punkty Systemu in one line; a tap shows the materials under them.
  const wallet = h('ul', { class: 'wallet-list', id: 'wallet-list', hidden: true });
  // When the next Punkt Czasu comes, under its row.
  const timeNote = h('span', { class: 'wallet-note' });
  // The parts for crafting apart from the wallet, by the current activity;
  // the materials have their own tab in the backpack.
  const pouch = h('div', { class: 'pouch-panel', id: 'pouch-panel', hidden: true });
  const pouchButton = h(
    'button',
    {
      type: 'button',
      class: 'pouch-button',
      'aria-label': 'Części do rzemiosła',
      'aria-expanded': 'false',
      'aria-controls': 'pouch-panel',
      onClick: () => showPouch(pouch.hidden),
    },
    icon('pouch', { size: 24 }),
  );
  const goldButton = h(
    'button',
    {
      type: 'button',
      class: 'gold',
      'aria-label': 'Złoto, Punkty Systemu i zasoby',
      'aria-expanded': 'false',
      'aria-controls': 'wallet-list',
      onClick: () => showWallet(wallet.hidden),
    },
    icon('coin', { size: 18 }),
    gold,
    h('span', { class: 'points' }, icon(SYSTEM_POINTS_ICON, { size: 16 }), points),
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
    h('div', { class: 'activity-row' }, pouchButton, activity, pouch),
  );
  topbar = { level, classLevel, gold, points, goldButton, wallet, timeNote, pouch, pouchButton, camp, campLabel, hp, mana, xp, classXp, activity, activityLabel, activityTime };
  updateTopbar();
}

// Gold, Punkty Systemu and Punkty Czasu first, then the materials.
function walletRows(timePoints) {
  const [gold, ...materials] = walletEntries();
  const row = (iconName, name, amount, kind, note) =>
    h(
      'li',
      { class: `wallet-item${kind ? ` wallet-item--${kind}` : ''}` },
      icon(iconName, { size: 18 }),
      h('span', { class: 'wallet-name' }, name, note),
      h('span', { class: 'wallet-amount', text: formatNumber(amount) }),
    );
  return [
    row('coin', gold.name, gold.amount, 'gold'),
    row(SYSTEM_POINTS_ICON, 'Punkty Systemu', state.character.systemPoints, 'system'),
    row('hourglass', 'Punkty Czasu', timePoints, 'time', topbar.timeNote),
    ...materials.map((entry, index) => row(RESOURCE_ICONS[entry.id] ?? 'unknown', entry.name, entry.amount, index === 0 && 'materials')),
  ];
}

// Opens or closes the list of resources under the gold.
export function showWallet(open) {
  if (!topbar) return;
  if (open) showPouch(false);
  topbar.wallet.hidden = !open;
  topbar.goldButton.setAttribute('aria-expanded', String(open));
  topbar.walletKey = null;
  if (open) refreshWallet();
}

// Redrawn only when an amount changes, not on every tick; the time to the
// next Punkt Czasu counts down on its own.
function refreshWallet(now = serverNow()) {
  const { points, nextAt } = timePointsNow(state.character, now);
  topbar.timeNote.textContent = `+1 za ${formatCountdown(nextAt - now)}`;
  const key = JSON.stringify([state.character.systemPoints, points, ...walletEntries().map((entry) => entry.amount)]);
  if (key === topbar.walletKey) return;
  topbar.walletKey = key;
  fill(topbar.wallet, ...walletRows(points));
}

// The parts made, with the way to the table.
function pouchRows(character) {
  const { crafting } = character;
  const table = character.camp.buildings.find((building) => building.crafts);
  const parts = crafting.parts.filter((part) => part.count > 0);
  const row = (art, name, color, count) =>
    h(
      'li',
      { class: 'wallet-item pouch-item' },
      h('span', { class: 'pouch-art' }, art),
      h('span', { class: 'wallet-name', vars: { '--rarity': color }, text: name }),
      h('span', { class: 'wallet-amount', text: formatNumber(count) }),
    );
  const tableText =
    crafting.queue.length > 0
      ? `Na stole: ${countOf(crafting.queue.length, 'zlecenie', 'zlecenia', 'zleceń')}`
      : table?.level > 0
        ? 'Stół rzemieślniczy'
        : 'Zbuduj Stół rzemieślniczy w obozie';
  return [
    h('p', { class: 'pouch-title', id: 'pouch-parts', text: 'Części do rzemiosła' }),
    parts.length === 0
      ? h('p', { class: 'pouch-empty', text: 'Stół rzemieślniczy robi je z materiałów i rozebranych przedmiotów.' })
      : h(
          'ul',
          { class: 'pouch-list', 'aria-labelledby': 'pouch-parts' },
          parts.map((part) => row(materialSprite(part.id) ?? icon('hammer', { size: 24 }), part.name, part.color, part.count)),
        ),
    table && h('a', { class: 'pouch-link', href: `#/oboz/${table.id}`, onClick: () => showPouch(false) }, h('span', { text: tableText }), icon('chevron', { size: 16 })),
  ];
}

// Opens or closes the parts under the pouch; the wallet closes.
export function showPouch(open) {
  if (!topbar) return;
  if (open) showWallet(false);
  topbar.pouch.hidden = !open;
  topbar.pouchButton.setAttribute('aria-expanded', String(open));
  topbar.pouchKey = null;
  if (open) refreshPouch();
}

// Redrawn only when a count or the queue changes.
function refreshPouch() {
  const character = state.character;
  const { crafting } = character;
  const table = character.camp.buildings.find((building) => building.crafts);
  const key = JSON.stringify([crafting.parts.map((part) => part.count), crafting.queue.length, table?.level]);
  if (key === topbar.pouchKey) return;
  topbar.pouchKey = key;
  fill(topbar.pouch, ...pouchRows(character));
}

// A tap anywhere else, or Escape, closes the list.
document.addEventListener('click', (event) => {
  if (topbar && !topbar.wallet.hidden && !topbar.wallet.contains(event.target) && !topbar.goldButton.contains(event.target)) {
    showWallet(false);
  }
  if (topbar && !topbar.pouch.hidden && !topbar.pouch.contains(event.target) && !topbar.pouchButton.contains(event.target)) {
    showPouch(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !topbar) return;
  if (!topbar.wallet.hidden) showWallet(false);
  if (!topbar.pouch.hidden) showPouch(false);
});

export function updateTopbar(now = serverNow()) {
  const character = state.character;
  if (!topbar || !character) return;
  topbar.level.textContent = `POZ. ${character.level}`;
  topbar.classLevel.textContent = `${character.className.toUpperCase()} ${character.classLevel}`;
  topbar.gold.textContent = formatShort(character.gold);
  topbar.points.textContent = formatShort(character.systemPoints);
  topbar.goldButton.setAttribute(
    'aria-label',
    `Złoto: ${formatNumber(character.gold)}, Punkty Systemu: ${formatNumber(character.systemPoints)}. Zasoby`,
  );
  if (!topbar.wallet.hidden) refreshWallet(now);
  if (!topbar.pouch.hidden) refreshPouch();
  // The camp shows the time left of the building being upgraded.
  const building = character.camp.construction;
  const busy = Boolean(building) && now < building.endsAt;
  // A dot when a production building's store is full and waits.
  const ready = fullStores(character, now).length > 0;
  topbar.camp.classList.toggle('camp-button--busy', busy);
  topbar.camp.classList.toggle('camp-button--ready', ready);
  topbar.campLabel.textContent = busy ? formatCountdown(building.endsAt - now) : 'Obóz';
  const labels = [busy && `budowa: ${building.name}`, ready && 'pełny magazyn'].filter(Boolean);
  topbar.camp.setAttribute('aria-label', labels.length > 0 ? `Obóz, ${labels.join(', ')}` : 'Obóz');
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
  // The camp's tab is the tent in the top bar.
  const camp = $('.camp-button');
  if (active === 'oboz') camp?.setAttribute('aria-current', 'page');
  else camp?.removeAttribute('aria-current');
  const main = $('#nav-main');
  const character = $('#nav-character');
  main.hidden = kind !== 'main';
  character.hidden = kind !== 'character';
  if (kind === 'main') fill(main, ...MAIN_TABS.map((tab) => navButton(tab, active)));
  else fill(character, ...CHARACTER_TABS.map((tab) => navButton(tab, active, onBack)));
}

