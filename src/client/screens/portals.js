// The Portale Systemu in the Walka (src/server/portals.js), from character
// level 5 (731 A): each portal with its highest stage won, the fight for
// the next one (its level and the loot of a win, as often as the player
// likes, up to the character's level) and the sweep of the stage won, its
// loot at once, a few times a day. A fight's report opens at once; a
// sweep's loot shows in a toast. Entries come at any time, also during an
// exploration (732 A). A card is its portal's picture with its name
// (data/portals.json, art); a tap on it shows the stage, with nothing of
// the lands (the author, 7.11.2026: "po prostu się klika w te tła Portal
// Złota itp. i pokazuje stopień", "nie ma byc nic o krainach to jest poza
// wyprawami"). The words are shown in the page's language (t(), i18n.js).

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

// A fight for a portal's next stage, with or without the companions as the
// box on the Portale says, its report opened at once: from the portal's card
// and from the top of the report of a stage won (the author, 7.11.2026:
// "dodaj opcje następny portal po pokonaniu jednego stopnia jesli jest
// dostępny […] na samej górze raportu").
export async function fightPortal(portalId, navigate) {
  const { report } = await call('POST', '/api/portals/enter', { portal: portalId, companions: takesCompanions() });
  reportCache.set(String(report.id), report);
  state.freshReport = String(report.id);
  navigate(`#/raport/${report.id}`);
}

// The portals opened with a tap, kept while the page is open: a portal
// stays open after its sweep and on the way back from its fight's report.
const openPortals = new Set();

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
        sweepAllButton(),
        howItWorks(
          t('Walcz o kolejne stopnie portali, ile chcesz. Pokonane stopnie czyścisz: łup od razu, bez walki, {count} razy dziennie w każdym portalu.', { count: view.sweepsPerDay }),
          t(
            'Postać walczy z pełnym HP i bez mikstur, a może zabrać towarzyszy z Kwater (bez Drużyny). Wejść można zawsze, także w czasie wyprawy i pracy w profesji. W każdym portalu za wygraną zgarniesz tylko jego łup: złoto, zasób obozu, materiały stworów albo części do rzemiosła. Na stopniu czekają zwykłe stwory jego poziomu, silniejsze niż w Eksploracji, bez elit i czempionów. Pokonany stopień otwiera następny, najwyżej do stopnia równego poziomowi postaci i do {max}. Za wygraną i za czyszczenie zgarniesz tyle, ile daje około {minutes} minut wyprawy na poziomie stopnia, więc im wyższy stopień, tym większy łup. Czyszczenie daje łup najwyższego pokonanego stopnia. Portale nie dają doświadczenia ani przedmiotów.',
            { max: view.maxStage, minutes: view.lootMinutes },
          ),
        ),
      ),
      view.portals.map(portalCard),
    );
  }

  // "Wyczyść wszystkie" at the top (the author, 7.11.2026): every sweep
  // left today in every portal with a stage won, with how many there are.
  function sweepAllButton() {
    const won = view.portals.filter((portal) => portal.best > 0);
    if (won.length === 0) return null;
    const left = won.reduce((sum, portal) => sum + portal.sweepsLeft, 0);
    return h('button', {
      type: 'button',
      class: 'button button--world portal-sweep-all',
      'data-guide': 'portal-sweep-all',
      disabled: left === 0,
      text: t('Wyczyść wszystkie ({count})', { count: left }),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const result = await call('POST', '/api/portals/sweep-all');
          view = result.portals;
          setCharacter(result.character);
          show();
          toast(result.sweep.text);
        }),
    });
  }

  // The box that takes the companions along, with their names.
  function companionsBox() {
    const box = h('input', { type: 'checkbox', id: 'portal-companions', class: 'avoid-rare-box', checked: takesCompanions(), onChange: () => setTakesCompanions(box.checked) });
    return h('label', { class: 'avoid-rare', for: 'portal-companions' }, box, h('span', { text: t('Zabierz towarzyszy: {names}', { names: view.companions.join(', ') }) }));
  }

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
            'data-guide': `portal-${portal.id}-stage`,
            text: portal.best >= view.maxStage ? t('To ostatni stopień tego portalu. Kolejne stopnie przyjdą później.') : t('Kolejny stopień otworzy się na poziomie postaci {level}.', { level: portal.best + 1 }),
          })
        : [
            h(
              'div',
              { class: 'portal-stage', 'data-guide': `portal-${portal.id}-stage` },
              h('p', { class: 'tower-floor-title', text: t('Stopień {stage} · poz. {level}', { stage: portal.next, level: portal.next }) }),
              h('p', { text: t('Za wygraną zgarniesz: {loot}.', { loot: lootText(portal, portal.nextLoot) }) }),
            ),
            h('button', {
              type: 'button',
              class: 'button button--system',
              text: t('Walcz o stopień {stage}', { stage: portal.next }),
              onClick: (event) => withButton(event.currentTarget, () => fightPortal(portal.id, navigate)),
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

    // The stage reached beside the name, so a closed card tells whether
    // there is anything to climb (the author, 10.11.2026: „Dodaj tez
    // aktualny stopien Portalu obok jego nazwy tak by nie trzeba bylo
    // wchodzic i sprawdzac czy jest maksymalny”): the highest stage won of
    // those open now (up to the character's level and the portal's last),
    // and „maks.” in gold once there is none higher to fight for.
    const stageBadge = ({ best }) => {
      const limit = Math.min(view.maxStage, state.character.level);
      const top = best >= limit;
      return h('span', {
        class: `portal-reached${top ? ' portal-reached--max' : ''}`,
        'aria-label': t('Najwyżej pokonany stopień: {best} z {limit} dostępnych teraz.', { best: formatNumber(best), limit: formatNumber(limit) }),
        text: top ? t('{stage} · maks.', { stage: formatNumber(best) }) : `${formatNumber(best)}/${formatNumber(limit)}`,
      });
    };

    // The picture with the portal's name; a tap anywhere on it shows or
    // hides the rest (the button's ::after spans the picture).
    const open = openPortals.has(portal.id);
    const bodyId = `portal-body-${portal.id}`;
    const body = h(
      'div',
      { class: 'portal-body', id: bodyId, hidden: !open },
      h('p', { class: 'muted', text: portal.description }),
      h('p', { class: 'muted', text: t('Najwyżej pokonany: {best}.', { best: portal.best > 0 ? t('stopień {stage}', { stage: formatNumber(portal.best) }) : t('jeszcze żaden') }) }),
      fight,
      sweep,
    );
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'portal-toggle',
        'aria-expanded': String(open),
        'aria-controls': bodyId,
        'data-guide': `portal-${portal.id}-open`,
        onClick: () => {
          const opening = body.hidden;
          body.hidden = !opening;
          toggle.setAttribute('aria-expanded', String(opening));
          card.classList.toggle('portal-card--open', opening);
          if (opening) openPortals.add(portal.id);
          else openPortals.delete(portal.id);
        },
      },
      h('span', { class: 'portal-name', text: portal.name }),
      stageBadge(portal),
      h('span', { class: 'portal-marker', 'aria-hidden': 'true' }),
    );
    const art = portal.art && placeArt(portal.art);
    const head = h('div', { class: `tower-head portal-head${art ? ' tower-head--art' : ''}` }, h('h2', { class: 'card-title' }, toggle));
    if (art) head.style.setProperty('--place-art', `url("${art}")`);
    const card = h('section', { class: `card tower-card portal-card${open ? ' portal-card--open' : ''}`, 'data-guide': `portal-${portal.id}`, 'aria-label': portal.name }, head, body);
    return card;
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
