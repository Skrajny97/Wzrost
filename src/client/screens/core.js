// The Rdzeń, a tab of the Postać (src/server/core.js; DECISIONS.md,
// "Labirynt Systemu i Rdzeń", 858–865), once the character has beaten its
// first guardian of the Labirynt Systemu; before it, the locked tab's words
// (screens/locked.js). The Rdzeń's picture with its sockets, each absorbed
// Artefakt in its element's colour over as many sockets as it takes, the
// free ones empty (858 v2 A: the sockets, no number); the resonance of the
// elements, the gem set in it (in the Szlifiernia), the Odłamki and what
// the whole Rdzeń gives; then the Artefakty absorbed (Ulepsz, Rozpuść) and
// those of the Skrytka Rdzenia (Wchłoń, Ulepsz, Rozbij). The words are
// shown in the page's language (t(), i18n.js).

import { labyrinthArt } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { buildLocked, buildLockedText, call, isUnlocked, state } from '../state.js';
import { confirmAction, howItWorks, systemLink, systemPanel, withButton } from '../ui.js';
import { lockedScreen } from './locked.js';
import { artifactPlaceholder } from '../labyrinth.js';

const ART = 32;
const CORE_ART = 96;

export function mountCore(container, options) {
  if (!isUnlocked('core')) return lockedScreen('core', 'Rdzeń')(container, options);
  let view = null;
  let gone = false;

  const heading = () => h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Rdzeń') }));

  function show(message) {
    if (gone) return;
    if (message) {
      fill(container, heading(), systemPanel(message));
      return;
    }
    const away = buildLocked(state.character);
    fill(
      container,
      heading(),
      coreCard(),
      away && systemPanel(buildLockedText(state.character, t('Artefakty w Rdzeniu zmienisz'))),
      resonanceCard(),
      effectsCard(),
      listCard(t('Wchłonięte'), view.absorbed, true, t('Rdzeń nie ma jeszcze Artefaktów. Wchłoń je ze Skrytki poniżej.')),
      listCard(t('Skrytka Rdzenia'), view.stored, false, t('Skrytka jest pusta. Artefakty zostawiają strażnicy Labiryntu Systemu i czempioni Wież.')),
      h(
        'section',
        { class: 'card towers-intro' },
        // The explanation in short points, one thing each (the author,
        // 14.11.2026: „ten opis jest niezrozumiały, pierwsze zdanie pod Jak to
        // działa w ogóle jakies kalekie”; „po co pisac nigdy mniej niż 3, skoro
        // Rdzeń odblokowuje sie na 30tym?”).
        howItWorks(t('Artefakty z Labiryntu Systemu wchłaniasz do Rdzenia na stałe. Każdy daje postaci cechy swojego żywiołu.'), [
          t('Gniazda: Rdzeń ma jedno gniazdo na każde {per} poziomów postaci.', { per: view.perSockets }),
          t('Wielkość: mały Artefakt zajmuje 1 gniazdo i ma 1 cechę. Średni zajmuje 2 gniazda i ma 2 cechy. Duży zajmuje 3 gniazda i ma 2 cechy oraz zdolność.'),
          t('Ulepszanie: Odłamki ulepszają Artefakt aż do +10 i to zawsze się udaje. Każdy stopień to +10% do jego liczb. Odłamki zdobędziesz z Labiryntu lub dodatkowe – rozbijając Artefakt ze Skrytki.'),
          t('Rezonans: 2, 4 i 6 Artefaktów tego samego żywiołu dają coraz większą premię tego żywiołu.'),
          t('Klejnot: klejnot oprawiony w Rdzeń w Szlifierni podnosi liczby wszystkich Artefaktów w Rdzeniu.'),
          t('Rozpuszczanie: Artefakt zostaje w Rdzeniu, dopóki go nie rozpuścisz. Wtedy znika, a Ty odzyskujesz połowę Odłamków włożonych w jego ulepszanie.'),
          t('Artefakty i Odłamki należą tylko do tej postaci.'),
        ]),
      ),
    );
  }

  // The Rdzeń's picture over its sockets: each absorbed Artefakt over its
  // sockets in its element's colour, then the free sockets; the Odłamki and
  // the gem beside it.
  function coreCard() {
    const taken = view.absorbed.map((artifact) => {
      const chip = h(
        'span',
        { class: `core-socket core-socket--taken core-socket--${artifact.sockets}`, title: artifact.name, 'aria-label': artifact.name },
        labyrinthArt(`artifact-${artifact.element}`, 24, artifactPlaceholder(artifact.color)),
      );
      chip.style.setProperty('--element', artifact.color);
      return chip;
    });
    const free = Array.from({ length: view.free }, () => h('span', { class: 'core-socket core-socket--free', 'aria-hidden': 'true' }));
    const corePicture = labyrinthArt('core', CORE_ART, h('span', { class: 'core-placeholder' }, icon('core', { size: 56 })));
    return h(
      'section',
      { class: 'card core-card', 'aria-label': t('Rdzeń') },
      h('div', { class: 'core-picture' }, corePicture),
      h('div', { class: 'core-sockets', role: 'img', 'aria-label': t('Gniazda Rdzenia: zajęte przez Artefakty i wolne') }, taken, free),
      h(
        'div',
        { class: 'core-stock' },
        h('span', { class: 'core-shards' }, labyrinthArt('shards', ART, h('span', { class: 'shards-placeholder' }, icon('ore', { size: 20 }))), h('span', { text: t('Odłamki Rdzenia: {count}', { count: formatNumber(view.shards) }) })),
        h(
          'span',
          { class: 'core-gem' },
          view.gem
            ? h('span', { class: 'item-name', vars: { '--rarity': view.gem.color }, text: t('Klejnot: {gem}, +{bonus}% liczb Artefaktów', { gem: view.gem.name, bonus: Math.round(view.gem.bonus * 100) }) })
            : t('Bez klejnotu. Oprawisz go w Szlifierni.'),
        ),
      ),
      !view.gem && state.character.professions?.jewelcrafting && systemLink('#/profesje/jubilerstwo', t('Do Szlifierni')),
    );
  }

  function resonanceCard() {
    if (view.resonance.length === 0) return null;
    return h(
      'section',
      { class: 'card core-resonance', 'aria-labelledby': 'core-resonance-title' },
      h('h2', { class: 'section-title', id: 'core-resonance-title', text: t('Rezonans') }),
      h(
        'ul',
        { class: 'core-resonance-list' },
        view.resonance.map((one) => {
          const dot = h('span', { class: 'core-element-dot' });
          dot.style.setProperty('--element', one.color);
          return h(
            'li',
            {},
            dot,
            h('span', { class: 'core-resonance-name', text: `${one.elementName}: ${one.count}` }),
            h('span', { class: one.text ? 'core-resonance-on' : 'muted', text: one.text ?? t('rezonans od {count}', { count: one.next }) }),
            one.text && one.next !== null && h('span', { class: 'muted small', text: t('przy {count}: {bonus}', { count: one.next, bonus: one.nextText }) }),
          );
        }),
      ),
    );
  }

  function effectsCard() {
    if (view.effects.length === 0) return null;
    return h(
      'section',
      { class: 'card core-effects', 'aria-labelledby': 'core-effects-title' },
      h('h2', { class: 'section-title', id: 'core-effects-title', text: t('Rdzeń daje postaci') }),
      h('ul', { class: 'core-effect-list' }, view.effects.map((line) => h('li', { text: line }))),
    );
  }

  function listCard(title, artifacts, absorbed, empty) {
    return h(
      'section',
      { class: `card core-list${absorbed ? '' : ' core-list--stash'}`, 'aria-label': title },
      h('h2', { class: 'section-title', text: artifacts.length > 0 ? `${title} (${formatNumber(artifacts.length)})` : title }),
      artifacts.length === 0 ? h('p', { class: 'muted', text: empty }) : h('ul', { class: 'core-artifacts' }, artifacts.map((artifact) => artifactCard(artifact, absorbed))),
    );
  }

  // An Artefakt: its picture, name in its rarity's colour, size, sockets and
  // upgrade, its traits and ability, and what can be done with it.
  function artifactCard(artifact, absorbed) {
    const away = buildLocked(state.character);
    const fits = view.free >= artifact.sockets;
    const upgrade = artifact.nextCost === null
      ? h('button', { type: 'button', class: 'button button--world button--small', disabled: true, text: t('Ulepszony do końca') })
      : h('button', {
          type: 'button',
          class: 'button button--world button--small',
          disabled: view.shards < artifact.nextCost || (absorbed && away),
          text: t('Ulepsz do +{level}: {cost} Odł.', { level: artifact.upgrade + 1, cost: formatNumber(artifact.nextCost) }),
          onClick: (event) => withButton(event.currentTarget, () => act('/api/core/upgrade', artifact.id)),
        });
    const actions = absorbed
      ? [
          upgrade,
          h('button', {
            type: 'button',
            class: 'button button--world button--small',
            disabled: away,
            text: t('Rozpuść'),
            onClick: async (event) => {
              const button = event.currentTarget;
              const sure = await confirmAction({
                title: t('Rozpuścić Artefakt?'),
                text: t('{name} zniknie na zawsze i zwolni gniazda. Wróci połowa Odłamków włożonych w jego ulepszanie: {shards}.', { name: artifact.name, shards: formatNumber(artifact.dissolveShards) }),
                confirmLabel: t('Rozpuść'),
                danger: true,
              });
              if (sure) await withButton(button, () => act('/api/core/dissolve', artifact.id));
            },
          }),
        ]
      : [
          h('button', {
            type: 'button',
            class: 'button button--system button--small',
            disabled: !fits || away,
            text: fits ? t('Wchłoń') : t('Za mało wolnych gniazd'),
            onClick: async (event) => {
              const button = event.currentTarget;
              const sure = await confirmAction({
                title: t('Wchłonąć Artefakt?'),
                text: t('{name} zajmie gniazda Rdzenia na stałe. Zwolnisz je, tylko rozpuszczając go.', { name: artifact.name }),
                confirmLabel: t('Wchłoń'),
              });
              if (sure) await withButton(button, () => act('/api/core/absorb', artifact.id));
            },
          }),
          upgrade,
          h('button', {
            type: 'button',
            class: 'button button--world button--small',
            text: t('Rozbij: +{shards} Odł.', { shards: formatNumber(artifact.breakShards) }),
            onClick: async (event) => {
              const button = event.currentTarget;
              const sure = await confirmAction({
                title: t('Rozbić Artefakt?'),
                text: t('{name} rozpadnie się na Odłamki Rdzenia: {shards}.', { name: artifact.name, shards: formatNumber(artifact.breakShards) }),
                confirmLabel: t('Rozbij'),
                danger: true,
              });
              if (sure) await withButton(button, () => act('/api/core/break', artifact.id));
            },
          }),
        ];
    const art = labyrinthArt(`artifact-${artifact.element}`, ART, artifactPlaceholder(artifact.color));
    return h(
      'li',
      { class: 'core-artifact' },
      h(
        'div',
        { class: 'core-artifact-head' },
        art,
        h(
          'div',
          { class: 'core-artifact-title' },
          h('span', { class: 'item-name', vars: { '--rarity': artifact.rarityColor }, text: artifact.upgrade > 0 ? `${artifact.name} +${artifact.upgrade}` : artifact.name }),
          h('span', { class: 'muted small', text: t('{rarity} · {element} · gniazda: {sockets}', { rarity: artifact.rarityName, element: artifact.elementName, sockets: artifact.sockets }) }),
        ),
      ),
      h('ul', { class: 'core-traits' }, artifact.traits.map((trait) => h('li', { text: trait.text })), artifact.ability && h('li', { class: 'core-ability' }, h('strong', { text: `${artifact.ability.name}: ` }), artifact.ability.text)),
      h('div', { class: 'core-actions' }, actions),
    );
  }

  async function act(path, id) {
    const result = await call('POST', path, { id });
    view = result.core;
    show();
  }

  // From the Labirynt's "Odbierz Artefakty" (940, labyrinth.js), the Skrytka
  // in sight under the top bar, once the Rdzeń is shown.
  let toStash = options?.params?.part === 'skrytka';
  function stashInSight() {
    const stash = toStash && container.querySelector('.core-list--stash');
    toStash = false;
    if (!stash) return;
    const covered = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + stash.getBoundingClientRect().top - Math.max(0, covered) - 8) });
  }

  fill(container, heading(), h('p', { class: 'muted', text: t('Wczytywanie…') }));
  call('GET', '/api/core')
    .then(({ core }) => {
      view = core;
      show();
      stashInSight();
    })
    .catch((error) => show(error.message ?? t('Nie udało się wczytać Rdzenia.')));

  return {
    update() {
      if (view) show();
    },
    unmount() {
      gone = true;
    },
  };
}
