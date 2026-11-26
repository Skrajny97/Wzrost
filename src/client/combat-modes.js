// The switch over the Walka's five parts: Eksploracja (screens/combat.js),
// Portale (screens/portals.js), Wieże (screens/towers.js), Postrach Krainy
// (world-boss.js) and Kultywacja (cultivation.js). The last two are tabs of
// their own since 24.11.2026 (the author: „Postrach Krainy i Kultywacja
// powinny byc osobnymi zakładkami w Walce”); before, a card on the
// Eksploracja's screen. Each part's screen shows the switch under the page's
// heading with its own option pressed; an option still locked stays there
// with its level ("poz. 15"), as the Portale and the Wieże had it from the
// start. Three over two on a phone, the five in one row where they fit
// (styles.css). A gold dot lights the Postrach Krainy while a Skrzynia Bossa
// waits to be opened and the Kultywacja once a meditation has ended, as the
// Społeczność lights its parts (SECTION_NEWS, screens/community.js); the
// computer's menu lights their shortcuts under Walka the same way
// (layout.js). Its words are shown in the page's language (t(), i18n.js).

import { $$, h } from './dom.js';
import { t } from './i18n.js';
import { activityFinished, isUnlocked, meditationOf, state, unlockInfo } from './state.js';
import { lockLabel } from './ui.js';

// The parts in their order, with the address of each, its icon in the
// computer's menu and its unlock (data/unlocks.json). Their names go
// through t() as they are drawn, as the page loads its English after this
// module.
export const COMBAT_MODES = [
  { id: 'explore', label: 'Eksploracja', hash: '#/walka', icon: 'beast' },
  { id: 'portals', label: 'Portale', hash: '#/portale', icon: 'coin', unlock: 'portals' },
  { id: 'towers', label: 'Wieże', hash: '#/wieze', icon: 'evolution', unlock: 'towers' },
  { id: 'world-boss', label: 'Postrach Krainy', hash: '#/postrach', icon: 'swords', unlock: 'world-boss' },
  { id: 'cultivation', label: 'Kultywacja', hash: '#/kultywacja', icon: 'spirit', unlock: 'cultivation' },
];

// What lights a part, in a few words for a screen reader, or nothing: a
// Skrzynia Bossa to open (state.worldBossChests, from GET /api/character
// and the World Boss's answers) and a Kultywacja's report.
// The Kultywacja's report is the character's or an Awatar's (meditationOf,
// 26.11.2026): either waits on its tab.
const MODE_NEWS = {
  'world-boss': () => (state.worldBossChests ?? 0) > 0 && t('czeka do odebrania'),
  cultivation: () => activityFinished(meditationOf(state.character)?.activity) && t('raport czeka'),
};

// The parts this deployment has (one whose unlock the content lacks is
// left out), each with its lock: the level it waits for while shut.
export function combatModeList() {
  return COMBAT_MODES.filter((mode) => !mode.unlock || unlockInfo(mode.unlock)).map((mode) => ({
    ...mode,
    lock: mode.unlock && !isUnlocked(mode.unlock) ? t('poz. {level}', { level: unlockInfo(mode.unlock).level }) : null,
  }));
}

// The words of a part's dot, or null: never on a part still locked.
export function combatModeNews(id) {
  const mode = COMBAT_MODES.find((one) => one.id === id);
  if (!state.character || !MODE_NEWS[id] || (mode?.unlock && !isUnlocked(mode.unlock))) return null;
  return MODE_NEWS[id]() || null;
}

const newsDot = (words) => h('span', { class: 'community-dot', role: 'img', 'aria-label': words });

// The switch with the part `active` pressed; a tap on another goes to its
// screen. A part's dot stands right after its name (styles.css), clear of
// the tabs on the screen's edges (edge-tabs).
export function combatModes(active, navigate) {
  const option = (mode) => {
    const pressed = mode.id === active;
    const news = combatModeNews(mode.id);
    return h(
      'button',
      {
        type: 'button',
        class: 'segmented-option',
        'data-mode': mode.id,
        'aria-pressed': pressed,
        disabled: Boolean(mode.lock),
        onClick: () => {
          if (!pressed) navigate(mode.hash);
        },
      },
      h('span', { class: 'combat-mode-name' }, t(mode.label), news && newsDot(news)),
      mode.lock && [' ', lockLabel(mode.lock)],
    );
  };
  // The switch measures its own width for one row or two (styles.css).
  return h(
    'div',
    { class: 'combat-modes-frame' },
    h('div', { class: 'segmented combat-modes', role: 'group', 'aria-label': t('Rodzaj walki') }, combatModeList().map(option)),
  );
}

// The dots of the switch on the screen kept right every second (app.js), as
// a meditation ends while the Portale are open.
export function updateCombatModes() {
  for (const name of $$('.combat-modes [data-mode] .combat-mode-name')) {
    const news = combatModeNews(name.parentElement.dataset.mode);
    const dot = name.querySelector('.community-dot');
    if (Boolean(news) === Boolean(dot)) continue;
    if (dot) dot.remove();
    else name.append(newsDot(news));
  }
}
