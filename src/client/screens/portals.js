// The Portale Systemu in the Walka (src/server/portals.js), from character
// level 5 (731 A): each portal with its highest stage won, the fight for
// the next one (its inner region, its level and the loot of a win,
// as often as the player likes, up to the character's level) and the sweep
// of the stage won, its loot at once, a few times a day. A fight's report
// opens at once; a sweep's loot shows in a toast. Entries come at any
// time, also during an exploration (732 A). Over a card its portal's
// picture, when it has one (data/portals.json, art). The words are shown
// in the page's language (t(), i18n.js).

import { areaArt } from '../area-art.js';
import { placeArt } from '../art.js';
import { fill, h } from '../dom.js';
import { formatNumber } from '../format.js';
import { language, t } from '../i18n.js';
import { call, isUnlocked, reportCache, setCharacter, state, unlockInfo } from '../state.js';
import { howItWorks, systemPanel, toast, withButton } from '../ui.js';
import { combatModes } from './towers.js';

// A name inside a sentence: small in Polish ("drewno +9"), as written in
// English ("Wood +9").
const inText = (name) => (language() === 'en' ? name : name.toLowerCase());

// Whether the character takes its companions into the portals (the author:
// "Możliwość zabrania towarzyszy"), remembered on this device; at first yes.
const COMPANIONS_KEY = 'insight.portalCompanions';
function takesCompanions() {
  try {
    return localStorage.getItem(COMPANIONS_KEY) !== 'off';
  } catch {
    return true;
  }
}
function setTakesCompanions(value) {
  try {
    localStorage.setItem(COMPANIONS_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the box starts ticked on the next visit.
  }
}

export function mountPortals(container, { navigate }) {
  let view = null;
  let gone = false;
  let level = state.character.level;

  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })), combatModes('portals', navigate)];

  function show(message) {
    if (gone) return;
    if (message) {
      fill(container, ...heading(), systemPanel(message));
      return;
    }
    fill(
      container,
      ...heading(),
      h(
        'section',
        { class: 'card towers-intro' },
        view.companions.length > 0 && companionsBox(),
        howItWorks(
          t('Walcz o kolejne stopnie portali, ile chcesz. Pokonane stopnie czyścisz: łup od razu, bez walki, {count} razy dziennie w każdym portalu.', { count: view.sweepsPerDay }),
          t(
            'Postać walczy z pełnym HP i bez mikstur, a może zabrać towarzyszy z Kwater (bez Drużyny). Wejść można zawsze, także w czasie wyprawy i pracy w profesji. W każdym portalu za wygraną zgarniesz tylko jego łup: złoto, zasób obozu, materiały stworów albo części do rzemiosła. Stopień ma zwykłe stwory krainy swoich poziomów, silniejsze niż w Eksploracji, bez elit i czempionów. Pokonany stopień otwiera następny, najwyżej do stopnia równego poziomowi postaci i do {max}. Za wygraną i za czyszczenie zgarniesz tyle, ile daje około {minutes} minut wyprawy na poziomie stopnia, więc im wyższy stopień, tym większy łup. Czyszczenie daje łup najwyższego pokonanego stopnia. Portale nie dają doświadczenia ani przedmiotów.',
            { max: view.maxStage, minutes: view.lootMinutes },
          ),
        ),
      ),
      view.portals.map(portalCard),
    );
  }

  // The box that takes the companions along, with their names.
  function companionsBox() {
    const box = h('input', { type: 'checkbox', id: 'portal-companions', class: 'avoid-rare-box', checked: takesCompanions(), onChange: () => setTakesCompanions(box.checked) });
    return h('label', { class: 'avoid-rare', for: 'portal-companions' }, box, h('span', { text: t('Zabierz towarzyszy: {names}', { names: view.companions.join(', ') }) }));
  }

  // The inner region of a stage: the one whose levels hold it, past the
  // last land its last place (portalArea in the engine).
  const regionOf = (stage) => view.regions.find((region) => region.from <= stage && stage <= region.to) ?? view.regions.reduce((last, region) => (region.to > last.to ? region : last));

  // A loot of `pieces` in words: its gold, or so many pieces of the portal's
  // goods (the server counts them: portalAmount in the engine).
  function lootText(portal, pieces) {
    const resource = portal.resource && state.content.resources.find((one) => one.id === portal.resource);
    if (portal.loot === 'gold') return t('{gold} złota', { gold: formatNumber(pieces) });
    if (portal.loot === 'resource') return `${inText(resource?.name ?? portal.resource)} +${formatNumber(pieces)}`;
    if (portal.loot === 'material') return t('materiały stworów stopnia ×{count}', { count: formatNumber(pieces) });
    return `${inText(portal.part)} ×${formatNumber(pieces)}`;
  }

  function portalCard(portal) {
    const fight =
      portal.next === null
        ? h('p', {
            class: 'muted',
            text: portal.best >= view.maxStage ? t('To ostatni stopień tego portalu. Kolejne przyjdą z nowymi krainami.') : t('Kolejny stopień otworzy się na poziomie postaci {level}.', { level: portal.best + 1 }),
          })
        : [
            h(
              'div',
              { class: 'tower-floor' },
              h('span', { class: 'area-circle tower-circle' }, areaArt(regionOf(portal.next).id)),
              h(
                'div',
                { class: 'tower-floor-text' },
                h('p', { class: 'tower-floor-title', text: t('Stopień {stage} · poz. {level}', { stage: portal.next, level: portal.next }) }),
                h('p', { text: `${regionOf(portal.next).name} (${regionOf(portal.next).regionName})` }),
                h('p', { text: t('Za wygraną zgarniesz: {loot}.', { loot: lootText(portal, portal.nextLoot) }) }),
              ),
            ),
            h('button', {
              type: 'button',
              class: 'button button--system',
              text: t('Walcz o stopień {stage}', { stage: portal.next }),
              onClick: (event) =>
                withButton(event.currentTarget, async () => {
                  const { report } = await call('POST', '/api/portals/enter', { portal: portal.id, companions: takesCompanions() });
                  reportCache.set(String(report.id), report);
                  state.freshReport = String(report.id);
                  navigate(`#/raport/${report.id}`);
                }),
            }),
          ];
    const sweep =
      portal.best > 0 && [
        h('p', {
          class: 'muted',
          text: t('Czyszczenie stopnia {stage}: {loot}. Na dziś zostało: {left} z {perDay}.', { stage: portal.best, loot: lootText(portal, portal.sweepLoot), left: portal.sweepsLeft, perDay: view.sweepsPerDay }),
        }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          disabled: portal.sweepsLeft === 0,
          text: t('Wyczyść stopień {stage}', { stage: portal.best }),
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const result = await call('POST', '/api/portals/sweep', { portal: portal.id });
              view = result.portals;
              setCharacter(result.character);
              show();
              toast(result.sweep.text);
            }),
        }),
      ];

    const art = portal.art && placeArt(portal.art);
    const head = h('div', { class: `tower-head${art ? ' tower-head--art' : ''}` }, h('h2', { class: 'card-title', text: portal.name }));
    if (art) head.style.setProperty('--place-art', `url("${art}")`);
    return h(
      'section',
      { class: 'card tower-card', 'data-guide': `portal-${portal.id}`, 'aria-label': portal.name },
      head,
      h('p', { class: 'muted', text: portal.description }),
      h('p', { class: 'muted', text: t('Najwyżej pokonany: {best}.', { best: portal.best > 0 ? t('stopień {stage}', { stage: formatNumber(portal.best) }) : t('jeszcze żaden') }) }),
      fight,
      sweep,
    );
  }

  if (!isUnlocked('portals')) {
    const unlock = unlockInfo('portals');
    show(t('Portale odblokujesz na poziomie postaci {level}. Twój poziom: {own}.', { level: unlock.level, own: state.character.level }));
    return { unmount() {} };
  }

  fill(container, ...heading(), h('p', { class: 'muted', text: t('Wczytywanie…') }));
  const load = () =>
    call('GET', '/api/portals').then(({ portals }) => {
      view = portals;
      show();
    });
  load().catch((error) => show(error.message ?? t('Nie udało się wczytać Portali.')));

  return {
    // The character changed: with a new level a stage higher opens, so the
    // cards again, as they are now.
    update() {
      if (!view || state.character.level === level) return;
      level = state.character.level;
      load().catch(() => {});
    },
    unmount() {
      gone = true;
    },
  };
}
