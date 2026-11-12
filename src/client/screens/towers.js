// The Wieże in the Walka (src/server/towers.js), from character level 50:
// the entries left today and each tower with its next floor: always the
// first one not won yet, never one lower or higher (the author, 7.11.2026:
// "stopień po prostu masz konkretny i nie mozesz zejsc nizej ani wyżej").
// The card shows the floor's inner region, its
// level (floor 1 is of the towers' firstFloorLevel, each next one a level
// higher) and what waits there (an elite of every fifth floor in every other
// lap of the regions, a champion with its trophy while its floor is not
// won yet, the tower's chest not taken yet), who climbs beside the
// character in the Wieża Drużyn, and
// "Wejdź", whose report opens at once. While the character is on an
// exploration, or its report waits, the towers wait for it (towers.js).
// Over each card its tower,
// huge and grim (data/towers.json, place; the author: "ogromne budzące
// grozę Wieże"). The words are shown in the page's language (t(),
// i18n.js); English counts the floors without ordinals ("Every 25 floors").

import { areaArt } from '../area-art.js';
import { placeArt } from '../art.js';
import { fill, h } from '../dom.js';
import { formatDecimal, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { activityFinished, call, isUnlocked, reportCache, state, unlockInfo } from '../state.js';
import { howItWorks, lockLabel, systemLink, systemPanel, withButton } from '../ui.js';

// "Eksploracja", "Portale" and "Wieże" over the Walka, as in
// screens/combat.js, in the page's language (t(), i18n.js): the Walka tab
// shows them from the start, a locked one with its level.
export function combatModes(active, navigate) {
  const option = (label, hash, pressed, id) => {
    const locked = Boolean(id) && !isUnlocked(id);
    const info = id && unlockInfo(id);
    return h(
      'button',
      {
        type: 'button',
        class: 'segmented-option',
        'aria-pressed': pressed,
        disabled: locked,
        onClick: () => {
          if (!pressed) navigate(hash);
        },
      },
      locked ? [label, ' ', lockLabel(t('poz. {level}', { level: info.level }))] : label,
    );
  };
  // The Labirynt Systemu, where the game has it (its unlock in the content):
  // four parts, two by two on a phone (styles.css).
  const labyrinth = Boolean(unlockInfo('labyrinth'));
  return h(
    'div',
    { class: `segmented ${labyrinth ? 'segmented--four combat-modes--four' : 'segmented--three'}`, role: 'group', 'aria-label': t('Rodzaj walki') },
    option(t('Eksploracja'), '#/walka', active === 'explore', null),
    option(t('Portale'), '#/portale', active === 'portals', 'portals'),
    option(t('Wieże'), '#/wieze', active === 'towers', 'towers'),
    labyrinth && option(t('Labirynt'), '#/walka/labirynt', active === 'labyrinth', 'labyrinth'),
  );
}

export function mountTowers(container, { navigate }) {
  let view = null;
  let gone = false;

  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })), combatModes('towers', navigate)];

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
        h('p', { class: 'towers-entries', 'data-guide': 'towers-entries', text: t('Wejścia na dziś: {left} z {perDay}. Nowe od północy.', { left: view.left, perDay: view.perDay }) }),
        howItWorks(
          t('Wejście to jedna walka na pierwszym niezdobytym piętrze, z wynikiem od razu.'),
          t(
            'Postać walczy z pełnym HP, bez mikstur i bez ich bonusów. W czasie pracy w profesji wejść można, a w czasie wyprawy Wieże czekają na powrót postaci. Piętro 1 ma poziom {first}, a każde następne o jeden więcej. Postać wchodzi zawsze na pierwsze niezdobyte piętro, bez względu na swój poziom: wygrana prowadzi piętro wyżej, a po przegranej czeka to samo piętro. Piętro ma stwory jednego regionu, po kolei przez wszystkie krainy, a System je wzmacnia: obrażenia ×{damage}, HP ×{hp}. W Wieży Drużyn to wzmocnienie mnoży się jeszcze przez liczbę walczących po stronie drużyny. {elites} Na zwykłych piętrach czasem czeka elita. Co {championEvery}. piętro czeka czempion, a co {chestEvery}. piętro daje skrzynię Wieży.',
            {
              first: view.firstFloorLevel,
              damage: formatDecimal(view.strength[0]),
              hp: formatDecimal(view.strength[1]),
              elites: eliteText(),
              championEvery: view.championEvery,
              chestEvery: view.chestEvery,
            },
          ),
        ),
      ),
      exploring() && systemPanel(exploring(), activityFinished(state.character.activity) && systemLink('#/walka', t('Odbierz raport'))),
      view.towers.map(towerCard),
    );
  }

  // Why the towers wait: an exploration under way, or its report to claim;
  // null when the character may go in.
  function exploring() {
    const activity = state.character.activity;
    if (activity?.kind !== 'hunt') return null;
    return activityFinished(activity)
      ? t('Wyprawa się skończyła. Odbierz raport w Walce, a potem wejdź do Wieży.')
      : t('Postać jest na wyprawie. Wejdziesz do Wież po jej powrocie.');
  }

  // A tower's floor: the first one not won yet, whatever the character's
  // level.
  const floorOf = (tower) => Math.max(1, tower.top);
  // The level of `floor` (towerLevel in the engine).
  const levelOf = (floor) => floor + view.firstFloorLevel - 1;

  // Whether a floor is in a lap of the regions with the elites of every
  // eliteEvery floor: one lap in eliteLapEvery, from the first (the
  // author: 484 A; towerEliteFloor in the engine).
  const eliteLap = (floor) => Math.floor((floor - 1) / view.cycle.length) % (view.eliteLapEvery ?? 1) === 0;

  // The intro's words on those elites, with the floors of their first laps.
  function eliteText() {
    const every = view.eliteLapEvery ?? 1;
    if (every <= 1) return t('Co {every}. piętro czeka elita.', { every: view.eliteEvery });
    const lap = view.cycle.length;
    const floors = [0, 1, 2].map((index) => `${index * every * lap + 1}–${index * every * lap + lap}`).join(', ');
    return every === 2
      ? t('Co {every}. piętro czeka elita, ale tylko w co drugim okrążeniu regionów: na piętrach {floors} i tak dalej.', { every: view.eliteEvery, floors })
      : t('Co {every}. piętro czeka elita, ale tylko w co {laps}. okrążeniu regionów: na piętrach {floors} i tak dalej.', { every: view.eliteEvery, laps: every, floors });
  }

  // What a win on `floor` pays, in words: its gold, the materials' pieces
  // with the odds of their rarities at its level, and the chance of an item
  // (towerGold, towerMaterials in the engine; the author: "o wiele więcej
  // - rzadkie łupy i materiały szczególnie legendarne i mityczne").
  function lootText(floor) {
    const { gold, pieces, rarities, itemChance } = view.loot;
    const step = rarities.filter((one) => one.fromLevel <= levelOf(floor)).at(-1) ?? rarities[0];
    const total = Object.values(step.rarities).reduce((sum, weight) => sum + weight, 0);
    const odds = Object.entries(step.rarities)
      .map(([id, weight]) => `${state.content.rarities.find((rarity) => rarity.id === id)?.forms.pl ?? id} ${Math.round((weight / total) * 100)}%`)
      .join(', ');
    return t('Za wygraną zgarniesz: {gold} złota, {pieces} materiały stworów piętra ({odds}), a z szansą {chance}% przedmiot.', {
      gold: formatNumber(gold[floor - 1] ?? gold.at(-1)),
      pieces,
      odds,
      chance: Math.round(itemChance * 100),
    });
  }

  function towerCard(tower) {
    const floor = floorOf(tower);
    // The narrator's Wieże chapter points at the cards and at what waits on
    // the Wieża Solo's floor (narrator.js).
    const place = view.cycle[(floor - 1) % view.cycle.length];
    const champion = floor % view.championEvery === 0;
    const elite = floor % view.eliteEvery === 0 && eliteLap(floor);
    const chest = floor % view.chestEvery === 0 && !tower.chests.includes(floor);
    // A champion leaves its trophy only at the first win of its floor (483 A).
    const trophy = !(tower.champions ?? []).includes(floor);
    const waits = [
      champion && place.champion ? (trophy ? t('czempion i jego trofeum') : t('czempion')) : (champion || elite) && place.elite ? t('elita') : null,
      chest && t('skrzynia Wieży'),
    ].filter(Boolean);
    const details = h(
      'div',
      { class: 'tower-floor', 'data-guide': `tower-${tower.id}-floor` },
      h('span', { class: 'area-circle tower-circle' }, areaArt(place.id)),
      h(
        'div',
        { class: 'tower-floor-text' },
        h('p', { class: 'tower-floor-title', text: t('Piętro {floor} · poz. {level}', { floor, level: levelOf(floor) }) }),
        h('p', { text: `${place.name} (${place.regionName})` }),
        waits.length > 0 && h('p', { class: 'tower-waits', text: t('Czeka: {gifts}.', { gifts: waits.join(', ') }) }),
        view.loot && h('p', { text: lootText(floor) }),
      ),
    );
    const enter = h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: view.left === 0 || Boolean(tower.missing) || Boolean(exploring()),
      text: t('Wejdź na piętro {floor}', { floor }),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const { report } = await call('POST', '/api/towers/enter', { tower: tower.id, floor });
          reportCache.set(String(report.id), report);
          state.freshReport = String(report.id);
          navigate(`#/raport/${report.id}`);
        }),
    });

    const art = tower.place && placeArt(tower.place);
    const head = h('div', { class: `tower-head${art ? ' tower-head--art' : ''}` }, h('h2', { class: 'card-title', text: tower.name }));
    if (art) head.style.setProperty('--place-art', `url("${art}")`);
    const climbers =
      tower.missing ??
      (tower.partners.length > 0 || tower.companions.length > 0
        ? t('Z Tobą: {climbers}.', {
            climbers: [...tower.partners.map((partner) => t('{name} (poz. {level})', { name: partner.name, level: partner.level })), ...tower.companions].join(', '),
          })
        : null);
    return h(
      'section',
      { class: 'card tower-card', 'data-guide': `tower-${tower.id}`, 'aria-label': tower.name },
      head,
      h('p', { class: 'muted', text: t('Najwyżej zdobyte: {best}.', { best: tower.best > 0 ? t('piętro {floor}', { floor: formatNumber(tower.best) }) : t('jeszcze żadne') }) }),
      climbers && h('p', { class: tower.missing ? 'tower-missing' : 'muted', text: climbers }),
      details,
      enter,
    );
  }

  if (!isUnlocked('towers')) {
    const unlock = unlockInfo('towers');
    show(t('Wieże odblokujesz na poziomie postaci {level}. Twój poziom: {own}.', { level: unlock.level, own: state.character.level }));
    return { unmount() {} };
  }

  fill(container, ...heading(), h('p', { class: 'muted', text: t('Wczytywanie…') }));
  call('GET', '/api/towers')
    .then(({ towers }) => {
      view = towers;
      show();
    })
    .catch((error) => show(error.message ?? t('Nie udało się wczytać Wież.')));

  return {
    // The character changed (an exploration began or its report was
    // claimed): the cards again, as they are now.
    update() {
      if (view) show();
    },
    unmount() {
      gone = true;
    },
  };
}
