// The frame around every game screen: the fixed top bar (levels, the
// narrator's quests, HP and mana, character and class XP, gold and Punkty
// Systemu with the camp's resources, the camp, current activity with the
// Encyklopedia beside it) and the two bottom bars, the main menu and the
// character bar with its own background. On a computer the menu runs down
// the left, with the camp among its tabs and each open part of the game's
// shortcuts under its tab, and the top bar shows the camp's resources and
// the Punkty Czasu beside the gold (505–508 A).

import { encyclopediaArt, goldArt, narratorFace, resourceArt, timePointsArt } from './art.js';
import { bestiaryReady } from './bestiary.js';
import { activeBuffs, bonusList, fightsLeft } from './bonuses.js';
import { communityNews, communityNewsText } from './chat-news.js';
import { $, fill, h, icon } from './dom.js';
import { formatCountdown, formatMinutes, formatNumber, formatShort } from './format.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { MERCENARIES_HASH } from './mercenaries.js';
import { anyClaimable, showQuests } from './quests.js';
import { SECTION_ICONS, SECTION_NEWS, sectionHash } from './screens/community.js';
import { activityFinished, currentHp, fullStores, isUnlocked, restRate, serverNow, state, timePointsNow, unlockInfo, walletEntries } from './state.js';
import { meter, toast } from './ui.js';
import { newsWaiting, openNews } from './news.js';
import { desktopLayout } from './layout-mode.js';
import { t } from './i18n.js';

// A profession's work, by the kind of its activity: its screen, its name
// in the top bar and the profession doing it.
const WORK_SCREENS = {
  herbs: { href: '#/profesje/zielarstwo', label: 'ZIELARSTWO', profession: 'herbalism' },
  potions: { href: '#/profesje/alchemia', label: 'ALCHEMIA', profession: 'alchemy' },
  items: { href: '#/profesje/rzemieslnictwo', label: 'RZEMIEŚLNICTWO', profession: 'crafting' },
  minerals: { href: '#/profesje/gornictwo', label: 'GÓRNICTWO', profession: 'mining' },
  jewels: { href: '#/profesje/jubilerstwo', label: 'JUBILERSTWO', profession: 'jewelcrafting' },
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

// On a computer the camp is a tab of the menu like the others, under Walka
// (508 A; the player: "obóz dodany, w tym górnym HUD, wydaje się być mało
// intuicyjny"); on a phone it stays the tent in the top bar.
const CAMP_TAB = { id: 'oboz', label: 'Obóz', icon: 'tent', href: '#/oboz' };
const DESKTOP_TABS = [...MAIN_TABS.slice(0, 2), CAMP_TAB, ...MAIN_TABS.slice(2)];

const CHARACTER_TABS = [
  { id: 'back', label: 'Powrót', icon: 'back' },
  { id: 'stats', label: 'Statystyki', icon: 'stats', href: '#/postac/statystyki', unlock: 'stats' },
  { id: 'skills', label: 'Umiejętności', icon: 'skills', href: '#/postac/umiejetnosci', unlock: 'skills' },
  { id: 'evolution', label: 'Ewolucja', icon: 'evolution', href: '#/postac/ewolucja', unlock: 'evolution' },
  { id: 'core', label: 'Rdzeń', icon: 'core', href: '#/postac/rdzen', unlock: 'core', system: true },
];

let topbar = null;

// The tabs' labels and the works' names are written in Polish and shown in
// the page's language (t(), i18n.js).

// The coin and the core of Punkty Systemu in one size, one over the other, so
// the two numbers start in one column (the author: the coin "wielkościowo i
// pozycją zbliżona do Punktów Systemu").
const TOPBAR_ICON = 20;
// The resources' pictures never go under 24 px (art.js), so the Punkty
// Czasu's hourglass beside them has that size too.
const STOCK_ICON = 24;

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
  const encyclopedia = h('a', { class: 'encyclopedia-button', href: '#/encyklopedia', 'aria-label': t('Encyklopedia') }, encyclopediaArt(28));
  // On a computer the camp's resources and the Punkty Czasu stand beside the
  // gold, always in sight (505 A; the player: "Sporo jest jeszcze miejsca na
  // HUD'zie na PC"); on a phone they wait in the list under it, and
  // styles.css hides them there. A tap on them opens the list too.
  const stock = [
    ...state.content.resources.map((resource) => ({ id: resource.id, name: resource.name, art: resourceArt(resource.id, STOCK_ICON) })),
    { id: 'time', name: t('Punkty Czasu'), art: timePointsArt(STOCK_ICON) },
  ].map((entry) => {
    const value = h('span', { class: 'gold-stock-value' });
    return { ...entry, value, element: h('span', { class: `gold-stock gold-stock--${entry.id}`, title: entry.name }, entry.art, value) };
  });
  const goldButton = h(
    'button',
    {
      type: 'button',
      class: 'gold',
      'aria-label': t('Złoto, Punkty Systemu i zasoby'),
      'aria-expanded': 'false',
      'aria-controls': 'wallet-list',
      onClick: () => showWallet(wallet.hidden),
    },
    h('span', { class: 'gold-row', title: t('Złoto') }, goldArt(TOPBAR_ICON), gold),
    h('span', { class: 'points', title: t('Punkty Systemu') }, icon(SYSTEM_POINTS_ICON, { size: TOPBAR_ICON }), points),
    stock.map((entry) => entry.element),
  );
  // The narrator waits with his quests between the levels and the gold.
  const quests = h(
    'button',
    {
      type: 'button',
      class: 'quest-button',
      'data-guide': 'quests',
      'aria-label': t('Zadania od narratora'),
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onClick: () => showQuests(),
    },
    narratorFace(),
  );
  // The Sklep Systemu beside him, the System's stall (the author: "jakąś
  // specjalną ikonę"), open since its cosmetics came (screens/shop.js).
  const shop = h('a', { class: 'system-shop', href: '#/sklep', 'aria-label': t('Sklep Systemu') }, icon('shop', { size: 24 }));
  const campLabel = h('span', { class: 'camp-label' });
  const camp = h('a', { class: 'camp-button', href: '#/oboz', 'aria-label': t('Obóz') }, icon('tent'), campLabel);
  const hp = meter({ label: 'HP', value: 0, max: 0, kind: 'hp' });
  const mana = meter({ label: 'MANA', value: 0, max: 0, kind: 'mana' });
  const xp = meter({ label: t('XP POSTACI'), value: 0, max: 0, kind: 'xp' });
  const classXp = meter({ label: t('XP KLASY'), value: 0, max: 0, kind: 'class-xp' });
  const activityLabel = h('span', { class: 'activity-label' });
  const activityTime = h('span', { class: 'activity-time' });
  const activity = h('a', { class: 'activity', href: '#/walka' }, activityLabel, activityTime);
  // The potions for a time drunk from the bag (potions.js): how long the
  // longest of them still works on explorations. A tap unfolds under the
  // row what the bonuses are, as on Postać (the author: „niech po kliknięciu
  // w kafelek bonusów wyświetla się pod spodem co to za bonusy”).
  const speedTime = h('span', { class: 'speed-chip-time' });
  const bonusDrop = h('div', { class: 'bonus-drop', id: 'bonus-drop', hidden: true });
  const speed = h(
    'button',
    { type: 'button', class: 'speed-chip', hidden: true, 'aria-expanded': 'false', 'aria-controls': 'bonus-drop', onClick: () => showBonuses(bonusDrop.hidden) },
    icon('flask', { size: 16 }),
    speedTime,
  );

  // The settings, with a dot for the author when players' bug reports wait.
  // A class of its own, which the narrator points at: the label changes with
  // the bug reports waiting for the author (664).
  const settings = h('button', { type: 'button', class: 'icon-button settings-button', 'aria-label': t('Ustawienia'), onClick: onSettings }, icon('gear'));
  // "Co nowego?" beside them (594 C): the latest entries, with a yellow dot
  // while an entry the account has not seen waits (news.js).
  const news = h('button', { type: 'button', class: 'icon-button news-button', 'aria-label': t('Co nowego?'), onClick: () => openNews().catch((error) => toast(error.message)) }, icon('scroll'));

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
        news,
        settings,
      ),
    ),
    wallet,
    // Two rows: HP over mana, character XP over class XP.
    h('div', { class: 'meters' }, hp.element, xp.element, mana.element, classXp.element),
    h('div', { class: 'activity-row' }, encyclopedia, speed, activity, bonusDrop),
  );
  topbar = {
    settings,
    news,
    level,
    classLevel,
    className,
    classNumber,
    quests,
    gold,
    points,
    stock,
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
    bonusDrop,
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
    row(icon(SYSTEM_POINTS_ICON, { size: WALLET_ICON }), t('Punkty Systemu'), state.character.systemPoints, 'system'),
    row(timePointsArt(WALLET_ICON), t('Punkty Czasu'), timePoints, 'time', topbar.timeNote),
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
  topbar.timeNote.textContent = t('+1 za {time}', { time: formatCountdown(nextAt - now) });
  const key = JSON.stringify([state.character.systemPoints, points, ...walletEntries().map((entry) => entry.amount)]);
  if (key === topbar.walletKey) return;
  topbar.walletKey = key;
  fill(topbar.wallet, ...walletRows(points));
}

// Opens or closes the bonuses at work under the bonus tile.
function showBonuses(open) {
  if (!topbar) return;
  const list = open ? bonusList(state.character) : null;
  topbar.bonusDrop.hidden = !list;
  topbar.speed.setAttribute('aria-expanded', String(Boolean(list)));
  topbar.bonusKey = list ? JSON.stringify(activeBuffs(state.character)) : null;
  fill(topbar.bonusDrop, list);
}

// A tap anywhere else, or Escape, closes the lists.
document.addEventListener('click', (event) => {
  if (topbar && !topbar.wallet.hidden && !topbar.wallet.contains(event.target) && !topbar.goldButton.contains(event.target)) {
    showWallet(false);
  }
  if (topbar && !topbar.bonusDrop.hidden && !topbar.bonusDrop.contains(event.target) && !topbar.speed.contains(event.target)) {
    showBonuses(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !topbar) return;
  if (!topbar.wallet.hidden) showWallet(false);
  if (!topbar.bonusDrop.hidden) showBonuses(false);
});

export function updateTopbar(now = serverNow()) {
  const character = state.character;
  if (!topbar || !character) return;
  topbar.level.textContent = t('POZ. {level}', { level: character.level });
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
  // The resources and the Punkty Czasu beside the gold on a computer, the
  // hourglass saying under the mouse when the next point comes.
  const time = timePointsNow(character, now);
  const stocked = topbar.stock.map((entry) => {
    const amount = entry.id === 'time' ? time.points : (character.resources[entry.id] ?? 0);
    entry.value.textContent = formatShort(amount);
    if (entry.id === 'time') entry.element.title = t('{name}: +1 za {time}', { name: entry.name, time: formatCountdown(time.nextAt - now) });
    return `, ${entry.name}: ${formatNumber(amount)}`;
  });
  topbar.goldButton.setAttribute(
    'aria-label',
    t('Złoto: {gold}, Punkty Systemu: {points}{stock}. Zasoby', { gold: formatNumber(character.gold), points: formatNumber(character.systemPoints), stock: desktopLayout() ? stocked.join('') : '' }),
  );
  // With the Zbieracz Systemu the camp's resources pulse with the System's
  // blue, as over the camp's board on a phone (753 A; styles.css).
  topbar.goldButton.classList.toggle('gold--collector', Boolean(character.camp?.collector?.owned));
  if (!topbar.wallet.hidden) refreshWallet(now);
  // A dot on the settings when players' bug reports wait for the author.
  const reports = state.user?.bugReports ?? 0;
  topbar.settings.classList.toggle('settings-button--ready', reports > 0);
  topbar.settings.setAttribute('aria-label', reports > 0 ? t('Ustawienia, nowe zgłoszenia błędów: {count}', { count: reports }) : t('Ustawienia'));
  // A dot on the scroll while a new entry of "Co nowego?" waits.
  const unread = newsWaiting();
  topbar.news.classList.toggle('news-button--ready', unread);
  topbar.news.setAttribute('aria-label', unread ? t('Co nowego?, nowy wpis') : t('Co nowego?'));
  // A dot when a chest of the Encyklopedia or a Bestiariusz waits.
  const chests = (character.encyclopedia?.ready ?? 0) + bestiaryReady(character, state.content);
  topbar.encyclopedia.classList.toggle('encyclopedia-button--ready', chests > 0);
  topbar.encyclopedia.setAttribute('aria-label', chests > 0 ? t('Encyklopedia, skrzynie do otwarcia') : t('Encyklopedia'));
  // A dot when a quest's reward or a chest waits.
  const waiting = anyClaimable(character);
  topbar.quests.classList.toggle('quest-button--ready', waiting);
  topbar.quests.setAttribute('aria-label', waiting ? t('Zadania od narratora, nagrody do odebrania') : t('Zadania od narratora'));
  // The camp shows the time left of the building being upgraded, and a dot
  // when a production building's store is full and waits.
  const camp = campNow(now);
  topbar.camp.classList.toggle('camp-button--busy', camp.busy);
  topbar.camp.classList.toggle('camp-button--ready', camp.ready);
  topbar.campLabel.textContent = camp.busy ? formatCountdown(camp.building.endsAt - now) : t(CAMP_TAB.label);
  topbar.camp.setAttribute('aria-label', camp.said);
  updateNavTimers(now);
  topbar.hp.set(currentHp(character, now), character.maxHp);
  topbar.mana.set(character.mana, character.maxMana);
  topbar.xp.set(character.xp, character.xpToNext);
  topbar.classXp.set(character.classXp, character.classXpToNext);

  // The strengthening potions at work: the most fights one has left (they
  // go when a report is claimed).
  const buffs = activeBuffs(character);
  const left = Math.max(0, ...buffs.map((buff) => buff.fights));
  topbar.speed.hidden = !(left > 0);
  if (left > 0) {
    topbar.speedTime.textContent = fightsLeft(left);
    topbar.speed.setAttribute('aria-label', buffs.map((buff) => t('{name}, jeszcze {fights}', { name: buff.label, fights: fightsLeft(buff.fights) })).join('; '));
  }
  // The open list follows the bonuses: redrawn when one changes, closed
  // when none is left.
  if (!topbar.bonusDrop.hidden && JSON.stringify(buffs) !== topbar.bonusKey) showBonuses(left > 0);

  const activity = character.activity;
  const { activityLabel, activityTime } = topbar;
  topbar.activity.classList.toggle('activity--done', activityFinished(activity, now));
  // A profession's work leads to its screen, a mercenary's offer or service
  // to the Karczma's Najemnicy tab (mercenaries.js), the rest to Walka.
  const work = WORK_SCREENS[activity?.kind];
  const serving = activity?.kind === 'mercenary';
  topbar.activity.setAttribute('href', work ? work.href : serving ? MERCENARIES_HASH : '#/walka');
  if (activity) {
    activityLabel.textContent = work
      ? t('{work} · {place}', { work: t(work.label), place: activity.placeName })
      : serving
        ? t('USŁUGA NAJEMNA · {place}', { place: activity.placeName })
        : t('EKSPLORACJA · {area}', { area: activity.areaName });
    activityTime.textContent = activityFinished(activity, now)
      ? serving
        ? activity.service?.hired
          ? t('ZAPŁATA CZEKA')
          : t('OGŁOSZENIE WYGASŁO')
        : t('RAPORT GOTOWY')
      : formatCountdown(activity.endsAt - now);
  } else {
    const hpNow = currentHp(character, now);
    activityLabel.textContent = t('ODPOCZYNEK');
    activityTime.textContent =
      hpNow >= character.maxHp
        ? t('PEŁNE HP')
        : t('PEŁNE HP ZA {time}', { time: formatMinutes(Math.ceil((character.maxHp - hpNow) / restRate(character))) }).toUpperCase();
  }
}

// Builds a bottom bar; `active` is the id of the highlighted tab.
// Free stat points light Postać and Statystyki with a gold dot, a skill to
// choose or a Skill Point to spend lights Postać and Umiejętności, an
// evolution to choose lights Postać and Ewolucja, an invitation, an Upominek
// or a Wymiana lights Społeczność (chat-news.js; a message in the chat lights
// the round chat button instead, chat-bubble.js), an order of the Osada that
// can be delivered lights Osada, as a quest's reward lights the narrator's
// face in the top bar.
const pointsWaiting = () => (state.character?.freePoints ?? 0) > 0 && isUnlocked('stats');
const skillsWaiting = () => Boolean(state.character?.skills?.ready) && isUnlocked('skills');
// The evolutions to choose from, or the form the evolution grows into.
const evolutionWaiting = () => ((state.character?.evolution?.choices?.length ?? 0) > 0 || Boolean(state.character?.evolution?.next)) && isUnlocked('evolution');
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
// The build under way in the camp and whether a production building's
// store is full and waits: the tent in the top bar shows both on a phone,
// the camp's tab in the menu on a computer.
function campNow(now = serverNow()) {
  const building = state.character.camp.construction;
  const busy = Boolean(building) && now < building.endsAt;
  const ready = fullStores(state.character, now).length > 0;
  return { building, busy, ready, said: [t(CAMP_TAB.label), busy && t('budowa: {name}', { name: building.name }), ready && t('pełny magazyn')].filter(Boolean).join(', ') };
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
  oboz: () => Boolean(state.character) && campNow().ready,
};
const WAITING_TEXTS = { walka: 'raport czeka', profesje: 'raport czeka', evolution: 'ewolucja czeka', osada: 'zlecenie czeka', oboz: 'pełny magazyn' };
function waitingText(id) {
  if (id === 'spolecznosc') return communityNewsText();
  if (WAITING_TEXTS[id]) return t(WAITING_TEXTS[id]);
  if (id === 'postac' && !pointsWaiting() && !skillsWaiting()) return t(WAITING_TEXTS.evolution);
  return id === 'skills' || (id === 'postac' && !pointsWaiting()) ? t('umiejętność czeka') : t('wolne punkty do rozdania');
}

function navButton(tab, active, onBack) {
  const unlocked = !tab.unlock || isUnlocked(tab.unlock);
  const unlock = tab.unlock && unlockInfo(tab.unlock);
  const lockText = unlocked ? null : unlock.level ? t('poz. {level}', { level: unlock.level }) : unlock.classLevel ? t('poz. kl. {level}', { level: unlock.classLevel }) : t('zablokowane');
  const ready = WAITING[tab.id]?.() ?? false;
  const label = t(tab.label);
  const children = [
    h('span', { class: 'nav-icon' }, icon(tab.icon), !unlocked && icon('lock', { size: 12, className: 'nav-lock' })),
    h('span', { class: 'nav-label', text: label }),
    lockText && h('span', { class: 'nav-hint', text: lockText }),
  ];
  const props = {
    class: ['nav-item', tab.system && 'nav-item--system', !unlocked && 'nav-item--locked', ready && 'nav-item--ready'].filter(Boolean).join(' '),
    'aria-current': tab.id === active ? 'page' : undefined,
    'aria-label': lockText ? t('{label}, zablokowane ({lock})', { label, lock: lockText }) : ready ? t('{label}, {waiting}', { label, waiting: waitingText(tab.id) }) : label,
  };
  if (tab.id === 'back') return h('button', { ...props, type: 'button', onClick: onBack }, children);
  return h('a', { ...props, href: tab.href }, children);
}

// The shortcuts under a tab of the computer's menu while its part of the
// game is open, as the character's tabs stand under Postać (507 A; the
// player: "fajnie jakby w HUD na PC po lewej stronie walka, profesje,
// osada itp były rozwijane tak jak postać z dodatkowymi skrótami"): the
// screen's own tabs or places, in their order. Each is { id, label, icon,
// href, lock, ready }: `lock` names, in a few words, what one the game does
// not open yet waits for; it is no link then, as its tab on the screen
// cannot be pressed either. `ready` lights it with the gold dot its main
// tab has for it (a report, news), as Statystyki under Postać.
const PROFESSION_ICONS = { herbalism: 'leaf', alchemy: 'flask', crafting: 'hammer', mining: 'ore', jewelcrafting: 'ring' };
const PLACE_ICONS = { board: 'check', enchanter: 'skills', hermitage: 'hood', stable: 'beast', tavern: 'chat', market: 'coin', tannery: 'pouch', herbalist: 'leaf', forge: 'hammer', casino: 'dice', arena: 'swords' };
const PARTS = {
  // Eksploracja, Portale and Wieże, as over the Walka (screens/towers.js).
  walka: () => {
    const portals = unlockInfo('portals');
    const towers = unlockInfo('towers');
    // The Labirynt Systemu, where the game has it.
    const labyrinth = unlockInfo('labyrinth');
    return [
      { id: 'explore', label: t('Eksploracja'), icon: 'beast', href: '#/walka', ready: tabTime('walka').ready, readyText: t('raport czeka') },
      portals && { id: 'portals', label: t('Portale'), icon: 'coin', href: '#/portale', lock: !isUnlocked('portals') && t('poz. {level}', { level: portals.level }) },
      towers && { id: 'towers', label: t('Wieże'), icon: 'evolution', href: '#/wieze', lock: !isUnlocked('towers') && t('poz. {level}', { level: towers.level }) },
      labyrinth && { id: 'labyrinth', label: t('Labirynt'), icon: 'core', href: '#/walka/labirynt', lock: !isUnlocked('labyrinth') && t('poz. {level}', { level: labyrinth.level }) },
    ];
  },
  // The professions as their squares on the tab (screens/professions.js),
  // a work's report lighting its own.
  profesje: () => {
    const professions = state.character.professions;
    if (!professions) return [];
    const now = serverNow();
    const done = [state.character.activity, professions.avatar?.activity].filter((work) => WORK_SCREENS[work?.kind] && activityFinished(work, now));
    return professions.list.map((profession) => {
      const screen = Object.values(WORK_SCREENS).find((one) => one.profession === profession.id);
      return (
        screen && {
          id: screen.href.split('/').pop(),
          label: profession.name,
          icon: PROFESSION_ICONS[profession.id] ?? 'leaf',
          href: screen.href,
          lock: profession.soon ? t('wkrótce') : profession.locked && t('poz. {level}', { level: profession.unlockLevel }),
          ready: done.some((work) => WORK_SCREENS[work.kind] === screen),
          readyText: t('raport czeka'),
        }
      );
    });
  },
  // The places of the Osada's board (data/settlement.json).
  osada: () =>
    state.character.settlementOpen
      ? (state.content.settlementPlaces ?? []).map((place) => ({ id: place.id, label: place.name, icon: PLACE_ICONS[place.id] ?? 'house', href: `#/osada/${place.id}`, lock: place.soon && t('wkrótce') }))
      : [],
  // The parts of the Społeczność, as its tabs (screens/community.js), each
  // with the light of its news.
  spolecznosc: () =>
    isUnlocked('community')
      ? state.content.community.sections.map((section) => ({
          id: section.id,
          label: section.name,
          icon: SECTION_ICONS[section.id] ?? 'unknown',
          href: sectionHash(section.id),
          lock: section.soon && t('wkrótce'),
          ready: Boolean(SECTION_NEWS[section.id]?.()),
          readyText: t('nowe'),
        }))
      : [],
};

function partItem(part, current) {
  const children = [
    h('span', { class: 'nav-icon' }, icon(part.icon), part.lock && icon('lock', { size: 12, className: 'nav-lock' })),
    h('span', { class: 'nav-label', text: part.label }),
    part.lock && h('span', { class: 'nav-hint', text: part.lock }),
  ];
  const props = {
    class: ['nav-item', part.lock && 'nav-item--locked', part.ready && 'nav-item--ready'].filter(Boolean).join(' '),
    'aria-label': part.lock ? t('{label}, zablokowane ({lock})', { label: part.label, lock: part.lock }) : part.ready ? t('{label}, {waiting}', { label: part.label, waiting: part.readyText }) : part.label,
  };
  if (part.lock) return h('span', { ...props, 'aria-disabled': 'true' }, children);
  return h('a', { ...props, href: part.href, 'aria-current': part.id === current ? 'page' : undefined }, children);
}

// The shortcuts under the tab lit, or nothing while its part is closed.
function partsList(tab, current) {
  const parts = (PARTS[tab.id]?.() ?? []).filter(Boolean);
  if (parts.length === 0) return null;
  return h('div', { class: 'nav-parts', role: 'group', 'aria-label': t(tab.label) }, parts.map((part) => partItem(part, current)));
}

// `part` is the part of the game shown on the screen (app.js): the
// shortcut lit under its tab on a computer.
export function updateNav({ kind, active, part = null, onBack }) {
  // The camp's tab is the tent in the top bar, on a computer its tab in the
  // menu.
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
  // On a computer the main menu stays down the left, with the character's
  // own tabs under its Postać while they are open (474 A), and the
  // shortcuts of another part of the game under its tab (507 A).
  const desktop = desktopLayout();
  main.hidden = kind !== 'main' && !desktop;
  character.hidden = kind !== 'character';
  // A tab whose part the deployment has off (no unlock in the content, as
  // the Ewolucja in the live game) is not there.
  const characterTabs = CHARACTER_TABS.filter((tab) => !tab.unlock || unlockInfo(tab.unlock));
  if (desktop) {
    const lit = kind === 'main' ? active : 'postac';
    fill(main, ...DESKTOP_TABS.map((tab) => [navButton(tab, lit), tab.id === lit && partsList(tab, part)]));
  } else if (kind === 'main') fill(main, ...MAIN_TABS.map((tab) => navButton(tab, active)));
  if (kind === 'character') fill(character, ...characterTabs.map((tab) => navButton(tab, active, onBack)));
  updateNavTimers();
}

// The time left of the exploration on the Walka tab and of the work in a
// profession on the Profesje tab, and their dots once a report waits. A tab
// still locked keeps its level. On a computer the camp's tab counts a build
// down too, and has its dot while a store is full.
export function updateNavTimers(now = serverNow()) {
  for (const [id, tab] of Object.entries(TIMED)) {
    const item = $(`#nav-main > .nav-item[href="#/${id}"]`);
    const label = item && $('.nav-label', item);
    if (!label || item.classList.contains('nav-item--locked')) continue;
    const { work, running, ready } = tabTime(id, now);
    item.classList.toggle('nav-item--busy', running);
    item.classList.toggle('nav-item--ready', ready);
    label.textContent = running ? formatCountdown(work.endsAt - now) : t(tab.label);
    item.setAttribute('aria-label', [t(tab.label), running && `${t(tab.doing)}: ${label.textContent}`, ready && t('raport czeka')].filter(Boolean).join(', '));
  }
  const camp = $(`#nav-main > .nav-item[href="${CAMP_TAB.href}"]`);
  const label = camp && $('.nav-label', camp);
  if (!label || !state.character) return;
  const { building, busy, ready, said } = campNow(now);
  camp.classList.toggle('nav-item--busy', busy);
  camp.classList.toggle('nav-item--ready', ready);
  label.textContent = busy ? formatCountdown(building.endsAt - now) : t(CAMP_TAB.label);
  camp.setAttribute('aria-label', said);
}

