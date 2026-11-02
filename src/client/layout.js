// The frame around every game screen: the fixed top bar (levels, the
// narrator's quests, HP and mana, character and class XP, gold and Punkty
// Systemu with the camp's resources, the camp, current activity with the
// Encyklopedia beside it) and the two bottom bars, the main menu and the
// character bar with its own background.

import { encyclopediaArt, goldArt, narratorFace, resourceArt, timePointsArt } from './art.js';
import { bestiaryReady } from './bestiary.js';
import { activeBuffs, updateBonusTimes } from './bonuses.js';
import { communityNews, communityNewsText } from './chat-news.js';
import { $, fill, h, icon } from './dom.js';
import { formatCountdown, formatMinutes, formatNumber, formatShort } from './format.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { anyClaimable, showQuests } from './quests.js';
import { activityFinished, currentHp, fullStores, isUnlocked, restRate, serverNow, state, timePointsNow, unlockInfo, walletEntries } from './state.js';
import { meter } from './ui.js';

// A profession's work, by the kind of its activity: its screen and its name
// in the top bar.
const WORK_SCREENS = {
  herbs: { href: '#/profesje/zielarstwo', label: 'ZIELARSTWO' },
  potions: { href: '#/profesje/alchemia', label: 'ALCHEMIA' },
  items: { href: '#/profesje/rzemieslnictwo', label: 'RZEMIEŚLNICTWO' },
};

const MAIN_TABS = [
  { id: 'postac', label: 'Postać', icon: 'person', href: '#/postac' },
  { id: 'walka', label: 'Walka', icon: 'swords', href: '#/walka' },
  { id: 'profesje', label: 'Profesje', icon: 'leaf', href: '#/profesje', unlock: 'professions' },
  { id: 'osada', label: 'Osada', icon: 'house', href: '#/osada', unlock: 'settlement' },
  { id: 'spolecznosc', label: 'Społeczność', icon: 'people', href: '#/spolecznosc', unlock: 'community' },
];
// The Dziennik is at the top of the settings (app.js); the Społeczność took
// its place in the bar.

const CHARACTER_TABS = [
  { id: 'back', label: 'Powrót', icon: 'back' },
  { id: 'stats', label: 'Statystyki', icon: 'stats', href: '#/postac/statystyki', unlock: 'stats' },
  { id: 'skills', label: 'Umiejętności', icon: 'skills', href: '#/postac/umiejetnosci', unlock: 'skills' },
  { id: 'evolution', label: 'Ewolucja', icon: 'evolution', href: '#/postac/ewolucja', unlock: 'evolution' },
  { id: 'core', label: 'Rdzeń', icon: 'core', href: '#/postac/rdzen', unlock: 'core', system: true },
];

let topbar = null;

// The coin and the core of Punkty Systemu in one size, one over the other, so
// the two numbers start in one column (the author: the coin "wielkościowo i
// pozycją zbliżona do Punktów Systemu").
const TOPBAR_ICON = 20;

export function buildTopbar(onSettings) {
  const level = h('span', { class: 'badge badge--system' });
  // The class's name gives way on a narrow phone, its level never does.
  const className = h('span', { class: 'badge-name' });
  const classNumber = h('span', { class: 'badge-number' });
  const classLevel = h('span', { class: 'badge badge--world' }, className, classNumber);
  const gold = h('span', { class: 'gold-value' });
  const points = h('span', { class: 'points-value' });
  // Gold over Punkty Systemu, like the levels on the other side, so the
  // narrator's face fits between them; a tap shows the materials under them.
  const wallet = h('ul', { class: 'wallet-list', id: 'wallet-list', hidden: true });
  // When the next Punkt Czasu comes, under its row.
  const timeNote = h('span', { class: 'wallet-note' });
  // The Encyklopedia by the current activity, where the pouch of parts was
  // (the parts have their tab in the backpack); a dot when a chest waits
  // there or in a Bestiariusz.
  const encyclopedia = h('a', { class: 'encyclopedia-button', href: '#/encyklopedia', 'aria-label': 'Encyklopedia' }, encyclopediaArt(28));
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
    h('span', { class: 'gold-row' }, goldArt(TOPBAR_ICON), gold),
    h('span', { class: 'points' }, icon(SYSTEM_POINTS_ICON, { size: TOPBAR_ICON }), points),
  );
  // The narrator waits with his quests between the levels and the gold.
  const quests = h(
    'button',
    {
      type: 'button',
      class: 'quest-button',
      'data-guide': 'quests',
      'aria-label': 'Zadania od narratora',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onClick: () => showQuests(),
    },
    narratorFace(),
  );
  // The Sklep Systemu beside him, the System's stall (the author: "jakąś
  // specjalną ikonę"), open since its cosmetics came (screens/shop.js).
  const shop = h('a', { class: 'system-shop', href: '#/sklep', 'aria-label': 'Sklep Systemu' }, icon('shop', { size: 24 }));
  const campLabel = h('span', { class: 'camp-label' });
  const camp = h('a', { class: 'camp-button', href: '#/oboz', 'aria-label': 'Obóz' }, icon('tent'), campLabel);
  const hp = meter({ label: 'HP', value: 0, max: 0, kind: 'hp' });
  const mana = meter({ label: 'MANA', value: 0, max: 0, kind: 'mana' });
  const xp = meter({ label: 'XP POSTACI', value: 0, max: 0, kind: 'xp' });
  const classXp = meter({ label: 'XP KLASY', value: 0, max: 0, kind: 'class-xp' });
  const activityLabel = h('span', { class: 'activity-label' });
  const activityTime = h('span', { class: 'activity-time' });
  const activity = h('a', { class: 'activity', href: '#/walka' }, activityLabel, activityTime);
  // The potions for a time drunk from the bag (potions.js): how long the
  // longest of them still works on explorations.
  const speedTime = h('span', { class: 'speed-chip-time' });
  const speed = h('a', { class: 'speed-chip', href: '#/postac', hidden: true }, icon('flask', { size: 16 }), speedTime);

  // The settings, with a dot for the author when players' bug reports wait.
  const settings = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Ustawienia', onClick: onSettings }, icon('gear'));

  const element = $('#topbar');
  fill(element,
    h(
      'div',
      { class: 'topbar-row' },
      h('div', { class: 'topbar-badges' }, level, classLevel),
      h('div', { class: 'topbar-middle' }, quests, shop),
      h(
        'div',
        { class: 'topbar-right' },
        goldButton,
        camp,
        settings,
      ),
    ),
    wallet,
    // Two rows: HP over mana, character XP over class XP.
    h('div', { class: 'meters' }, hp.element, xp.element, mana.element, classXp.element),
    h('div', { class: 'activity-row' }, encyclopedia, speed, activity),
  );
  topbar = {
    settings,
    level,
    classLevel,
    className,
    classNumber,
    quests,
    gold,
    points,
    goldButton,
    wallet,
    timeNote,
    encyclopedia,
    camp,
    campLabel,
    hp,
    mana,
    xp,
    classXp,
    activity,
    activityLabel,
    activityTime,
    speed,
    speedTime,
  };
  updateTopbar();
}

// Gold, Punkty Systemu and Punkty Czasu first, then the materials, all in
// one size, so the names stand in one column.
const WALLET_ICON = 24;
function walletRows(timePoints) {
  const [gold, ...materials] = walletEntries();
  const row = (art, name, amount, kind, note) =>
    h(
      'li',
      { class: `wallet-item${kind ? ` wallet-item--${kind}` : ''}` },
      art,
      h('span', { class: 'wallet-name' }, name, note),
      h('span', { class: 'wallet-amount', text: formatNumber(amount) }),
    );
  return [
    row(goldArt(WALLET_ICON), gold.name, gold.amount, 'gold'),
    row(icon(SYSTEM_POINTS_ICON, { size: WALLET_ICON }), 'Punkty Systemu', state.character.systemPoints, 'system'),
    row(timePointsArt(WALLET_ICON), 'Punkty Czasu', timePoints, 'time', topbar.timeNote),
    ...materials.map((entry, index) => row(resourceArt(entry.id, WALLET_ICON), entry.name, entry.amount, index === 0 && 'materials')),
  ];
}

// Opens or closes the list of resources under the gold.
export function showWallet(open) {
  if (!topbar) return;
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

// A tap anywhere else, or Escape, closes the list.
document.addEventListener('click', (event) => {
  if (topbar && !topbar.wallet.hidden && !topbar.wallet.contains(event.target) && !topbar.goldButton.contains(event.target)) {
    showWallet(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !topbar) return;
  if (!topbar.wallet.hidden) showWallet(false);
});

export function updateTopbar(now = serverNow()) {
  const character = state.character;
  if (!topbar || !character) return;
  topbar.level.textContent = `POZ. ${character.level}`;
  // The class by its short name, so the bar fits a phone (Woj for Wojownik);
  // an evolution by the first letters of its name (Bar for Barbarzyńca).
  const short = character.evolution?.current
    ? character.className.slice(0, 3)
    : (state.content?.classes.find((cls) => cls.id === character.classId)?.short ?? character.className);
  topbar.className.textContent = short.toUpperCase();
  topbar.classNumber.textContent = String(character.classLevel);
  topbar.classLevel.setAttribute('aria-label', `${character.className} ${character.classLevel}`);
  topbar.gold.textContent = formatShort(character.gold);
  topbar.points.textContent = formatShort(character.systemPoints);
  topbar.goldButton.setAttribute(
    'aria-label',
    `Złoto: ${formatNumber(character.gold)}, Punkty Systemu: ${formatNumber(character.systemPoints)}. Zasoby`,
  );
  if (!topbar.wallet.hidden) refreshWallet(now);
  // A dot on the settings when players' bug reports wait for the author.
  const reports = state.user?.bugReports ?? 0;
  topbar.settings.classList.toggle('settings-button--ready', reports > 0);
  topbar.settings.setAttribute('aria-label', reports > 0 ? `Ustawienia, nowe zgłoszenia błędów: ${reports}` : 'Ustawienia');
  // A dot when a chest of the Encyklopedia or a Bestiariusz waits.
  const chests = (character.encyclopedia?.ready ?? 0) + bestiaryReady(character, state.content);
  topbar.encyclopedia.classList.toggle('encyclopedia-button--ready', chests > 0);
  topbar.encyclopedia.setAttribute('aria-label', chests > 0 ? 'Encyklopedia, skrzynie do otwarcia' : 'Encyklopedia');
  // A dot when a quest's reward or a chest waits.
  const waiting = anyClaimable(character);
  topbar.quests.classList.toggle('quest-button--ready', waiting);
  topbar.quests.setAttribute('aria-label', waiting ? 'Zadania od narratora, nagrody do odebrania' : 'Zadania od narratora');
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
  updateNavTimers(now);
  topbar.hp.set(currentHp(character, now), character.maxHp);
  topbar.mana.set(character.mana, character.maxMana);
  topbar.xp.set(character.xp, character.xpToNext);
  topbar.classXp.set(character.classXp, character.classXpToNext);

  // Their time runs down only on an exploration, until `until`; the lists of
  // them on Postać and before "Wyrusz" run down with it.
  const buffs = activeBuffs(character, now);
  const left = Math.max(0, ...buffs.map((buff) => buff.left));
  updateBonusTimes(character, now);
  topbar.speed.hidden = !(left > 0);
  if (left > 0) {
    topbar.speedTime.textContent = formatCountdown(left);
    topbar.speed.setAttribute('aria-label', buffs.map((buff) => `${buff.label}, jeszcze ${formatCountdown(buff.left)} wypraw`).join('; '));
  }

  const activity = character.activity;
  const { activityLabel, activityTime } = topbar;
  topbar.activity.classList.toggle('activity--done', activityFinished(activity, now));
  // A profession's work leads to its screen, the rest to Walka.
  const work = WORK_SCREENS[activity?.kind];
  topbar.activity.setAttribute('href', work ? work.href : '#/walka');
  if (activity) {
    activityLabel.textContent = work ? `${work.label} · ${activity.placeName}` : `EKSPLORACJA · ${activity.areaName}`;
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
// Free stat points light Postać and Statystyki with a gold dot, a skill to
// choose or a Skill Point to spend lights Postać and Umiejętności, an
// evolution to choose lights Postać and Ewolucja, and a message someone wrote
// in the chat lights Społeczność (chat-news.js), an order of the Osada that
// can be delivered lights Osada, as a quest's reward lights the narrator's
// face in the top bar.
const pointsWaiting = () => (state.character?.freePoints ?? 0) > 0 && isUnlocked('stats');
const skillsWaiting = () => Boolean(state.character?.skills?.ready) && isUnlocked('skills');
const evolutionWaiting = () => (state.character?.evolution?.choices?.length ?? 0) > 0 && isUnlocked('evolution');
const settlementWaiting = () => Boolean(state.character?.settlementWaiting) && isUnlocked('settlement');
// While the character explores or works in a profession, the tab of that
// activity counts its time down in the System's light, as the camp counts a
// build; then a dot says the report waits (updateNavTimers, every second).
// The Awatar Systemu's work, once done, lights the Profesje tab too.
const TIMED = {
  walka: { label: 'Walka', kinds: ['hunt'], doing: 'eksploracja' },
  profesje: { label: 'Profesje', kinds: Object.keys(WORK_SCREENS), doing: 'praca' },
};
function tabTime(id, now = serverNow()) {
  const activity = state.character?.activity;
  const work = activity && TIMED[id].kinds.includes(activity.kind) ? activity : null;
  const running = Boolean(work) && !activityFinished(work, now);
  const avatar = id === 'profesje' && state.character?.professions?.avatar?.activity;
  const ready = (Boolean(work) && !running) || (Boolean(avatar) && activityFinished(avatar, now));
  return { work, running, ready };
}
const WAITING = {
  postac: () => pointsWaiting() || skillsWaiting() || evolutionWaiting(),
  stats: pointsWaiting,
  skills: skillsWaiting,
  evolution: evolutionWaiting,
  spolecznosc: communityNews,
  osada: settlementWaiting,
  walka: () => tabTime('walka').ready,
  profesje: () => tabTime('profesje').ready,
};
const WAITING_TEXTS = { walka: 'raport czeka', profesje: 'raport czeka', evolution: 'ewolucja czeka', osada: 'zlecenie czeka' };
function waitingText(id) {
  if (id === 'spolecznosc') return communityNewsText();
  if (WAITING_TEXTS[id]) return WAITING_TEXTS[id];
  if (id === 'postac' && !pointsWaiting() && !skillsWaiting()) return WAITING_TEXTS.evolution;
  return id === 'skills' || (id === 'postac' && !pointsWaiting()) ? 'umiejętność czeka' : 'wolne punkty do rozdania';
}

function navButton(tab, active, onBack) {
  const unlocked = !tab.unlock || isUnlocked(tab.unlock);
  const unlock = tab.unlock && unlockInfo(tab.unlock);
  const lockText = unlocked ? null : unlock.level ? `poz. ${unlock.level}` : unlock.classLevel ? `poz. kl. ${unlock.classLevel}` : 'zablokowane';
  const ready = WAITING[tab.id]?.() ?? false;
  const children = [
    h('span', { class: 'nav-icon' }, icon(tab.icon), !unlocked && icon('lock', { size: 12, className: 'nav-lock' })),
    h('span', { class: 'nav-label', text: tab.label }),
    lockText && h('span', { class: 'nav-hint', text: lockText }),
  ];
  const props = {
    class: ['nav-item', tab.system && 'nav-item--system', !unlocked && 'nav-item--locked', ready && 'nav-item--ready'].filter(Boolean).join(' '),
    'aria-current': tab.id === active ? 'page' : undefined,
    'aria-label': lockText ? `${tab.label}, zablokowane (${lockText})` : ready ? `${tab.label}, ${waitingText(tab.id)}` : tab.label,
  };
  if (tab.id === 'back') return h('button', { ...props, type: 'button', onClick: onBack }, children);
  return h('a', { ...props, href: tab.href }, children);
}

export function updateNav({ kind, active, onBack }) {
  // The camp's tab is the tent in the top bar.
  const camp = $('.camp-button');
  if (active === 'oboz') camp?.setAttribute('aria-current', 'page');
  else camp?.removeAttribute('aria-current');
  const encyclopedia = $('.encyclopedia-button');
  if (active === 'encyklopedia') encyclopedia?.setAttribute('aria-current', 'page');
  else encyclopedia?.removeAttribute('aria-current');
  const shop = $('.system-shop');
  if (active === 'sklep') shop?.setAttribute('aria-current', 'page');
  else shop?.removeAttribute('aria-current');
  const main = $('#nav-main');
  const character = $('#nav-character');
  main.hidden = kind !== 'main';
  character.hidden = kind !== 'character';
  // A tab whose part the deployment has off (no unlock in the content, as
  // the Ewolucja in the live game) is not there.
  const characterTabs = CHARACTER_TABS.filter((tab) => !tab.unlock || unlockInfo(tab.unlock));
  if (kind === 'main') fill(main, ...MAIN_TABS.map((tab) => navButton(tab, active)));
  else fill(character, ...characterTabs.map((tab) => navButton(tab, active, onBack)));
  updateNavTimers();
}

// The time left of the exploration on the Walka tab and of the work in a
// profession on the Profesje tab, and their dots once a report waits. A tab
// still locked keeps its level.
export function updateNavTimers(now = serverNow()) {
  for (const [id, tab] of Object.entries(TIMED)) {
    const item = $(`#nav-main .nav-item[href="#/${id}"]`);
    const label = item && $('.nav-label', item);
    if (!label || item.classList.contains('nav-item--locked')) continue;
    const { work, running, ready } = tabTime(id, now);
    item.classList.toggle('nav-item--busy', running);
    item.classList.toggle('nav-item--ready', ready);
    label.textContent = running ? formatCountdown(work.endsAt - now) : tab.label;
    item.setAttribute('aria-label', [tab.label, running && `${tab.doing}: ${label.textContent}`, ready && 'raport czeka'].filter(Boolean).join(', '));
  }
}

