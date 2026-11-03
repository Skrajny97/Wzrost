// The Wieże in the Walka (src/server/towers.js), from character level 50:
// the entries left today and each tower with its floors. The floor is
// picked with the slider or − and +; the card shows its inner region, its
// level and what waits there (an elite of every fifth floor in every other
// lap of the regions, a champion with its trophy while its floor is not
// won yet, the tower's chest not taken yet), who climbs beside the
// character in the Wieża Drużyn, and
// "Wejdź", whose report opens at once. While the character is on an
// exploration, or its report waits, the towers wait for it (towers.js). The
// floor picked is remembered on this device. Over each card its tower,
// huge and grim (data/towers.json, place; the author: "ogromne budzące
// grozę Wieże").

import { areaArt } from '../area-art.js';
import { placeArt } from '../art.js';
import { fill, h } from '../dom.js';
import { formatNumber } from '../format.js';
import { activityFinished, call, isUnlocked, reportCache, state, unlockInfo } from '../state.js';
import { howItWorks, lockLabel, systemLink, systemPanel, withButton } from '../ui.js';

const PICKS_KEY = 'insight.towerFloors';

function loadPicks() {
  try {
    const stored = JSON.parse(localStorage.getItem(PICKS_KEY) ?? '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function savePicks(picks) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch {
    // Without storage the next visit starts above the highest floor won.
  }
}

// "Eksploracja" and "Wieże" over the Walka, as in screens/combat.js.
export function combatModes(active, navigate) {
  const towers = isUnlocked('towers');
  const info = unlockInfo('towers');
  const option = (label, hash, pressed, locked) =>
    h(
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
      locked ? [label, ' ', lockLabel(`poz. ${info.level}`)] : label,
    );
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Rodzaj walki' },
    option('Eksploracja', '#/walka', active === 'explore', false),
    option('Wieże', '#/wieze', active === 'towers', !towers),
  );
}

export function mountTowers(container, { navigate }) {
  let view = null;
  let gone = false;
  const picks = loadPicks();

  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Walka' })), combatModes('towers', navigate)];

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
        h('p', { class: 'towers-entries', text: `Wejścia na dziś: ${view.left} z ${view.perDay}. Nowe od północy.` }),
        howItWorks(
          'Wejście to jedna walka na wybranym piętrze, z wynikiem od razu.',
          `Postać walczy z pełnym HP, bez mikstur i bez ich bonusów. W czasie pracy w profesji wejść można, a w czasie wyprawy Wieże czekają na powrót postaci. Piętro ma stwory jednego regionu, po kolei przez wszystkie krainy, na swoim poziomie. ${eliteText()} Na zwykłych piętrach czasem czeka elita. Co ${view.championEvery}. piętro czeka czempion, a co ${view.chestEvery}. piętro za pierwszym zwycięstwem daje skrzynię Wieży. Czempion zostawia trofeum tylko za pierwszym zwycięstwem na swoim piętrze.`,
        ),
      ),
      exploring() && systemPanel(exploring(), activityFinished(state.character.activity) && systemLink('#/walka', 'Odbierz raport')),
      view.towers.map(towerCard),
    );
  }

  // Why the towers wait: an exploration under way, or its report to claim;
  // null when the character may go in.
  function exploring() {
    const activity = state.character.activity;
    if (activity?.kind !== 'hunt') return null;
    return activityFinished(activity)
      ? 'Wyprawa się skończyła. Odbierz raport w Walce, a potem wejdź do Wieży.'
      : 'Postać jest na wyprawie. Wieże poczekają na jej powrót, bo raport z wyprawy liczy się z postacią taką, jaka jest na jej końcu.';
  }

  // The floor a tower's card starts at: the one picked before, else the
  // next above the highest won, within the floors open.
  const floorOf = (tower) => Math.min(tower.top, Math.max(1, Number.isInteger(picks[tower.id]) ? picks[tower.id] : tower.best + 1));

  // Whether a floor is in a lap of the regions with the elites of every
  // eliteEvery floor: one lap in eliteLapEvery, from the first (the
  // author: 484 A; towerEliteFloor in the engine).
  const eliteLap = (floor) => Math.floor((floor - 1) / view.cycle.length) % (view.eliteLapEvery ?? 1) === 0;

  // The intro's words on those elites, with the floors of their first laps.
  function eliteText() {
    const every = view.eliteLapEvery ?? 1;
    if (every <= 1) return `Co ${view.eliteEvery}. piętro czeka elita.`;
    const lap = view.cycle.length;
    const floors = [0, 1, 2].map((index) => `${index * every * lap + 1}–${index * every * lap + lap}`).join(', ');
    return `Co ${view.eliteEvery}. piętro czeka elita, ale tylko w co ${every === 2 ? 'drugim' : `${every}.`} okrążeniu regionów: na piętrach ${floors} i tak dalej.`;
  }

  function towerCard(tower) {
    let floor = floorOf(tower);
    const details = h('div', { class: 'tower-floor' });
    const slider = h('input', {
      type: 'range',
      min: '1',
      max: String(tower.top),
      value: String(floor),
      class: 'tower-slider',
      'aria-label': `${tower.name}: piętro`,
      onInput: () => pick(Number(slider.value)),
    });
    const step = (by, label, text) => h('button', { type: 'button', class: 'button button--world button--small', 'aria-label': label, text, onClick: () => pick(floor + by) });
    const enter = h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: view.left === 0 || Boolean(tower.missing) || Boolean(exploring()),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const { report } = await call('POST', '/api/towers/enter', { tower: tower.id, floor });
          reportCache.set(String(report.id), report);
          state.freshReport = String(report.id);
          navigate(`#/raport/${report.id}`);
        }),
    });

    function pick(next) {
      floor = Math.min(tower.top, Math.max(1, next));
      slider.value = String(floor);
      picks[tower.id] = floor;
      savePicks(picks);
      const place = view.cycle[(floor - 1) % view.cycle.length];
      const champion = floor % view.championEvery === 0;
      const elite = floor % view.eliteEvery === 0 && eliteLap(floor);
      const chest = floor % view.chestEvery === 0 && !tower.chests.includes(floor);
      // A champion leaves its trophy only at the first win of its floor (483 A).
      const trophy = !(tower.champions ?? []).includes(floor);
      const waits = [
        champion && place.champion ? (trophy ? 'czempion i jego trofeum' : 'czempion') : (champion || elite) && place.elite ? 'elita' : null,
        chest && 'skrzynia Wieży',
      ].filter(Boolean);
      fill(
        details,
        h('span', { class: 'area-circle tower-circle' }, areaArt(place.id)),
        h(
          'div',
          { class: 'tower-floor-text' },
          h('p', { class: 'tower-floor-title', text: `Piętro ${floor} · poz. ${floor}` }),
          h('p', { text: `${place.name} (${place.regionName})` }),
          waits.length > 0 && h('p', { class: 'tower-waits', text: `Czeka: ${waits.join(', ')}.` }),
        ),
      );
      enter.textContent = `Wejdź na piętro ${floor}`;
    }
    pick(floor);

    const art = tower.place && placeArt(tower.place);
    const head = h('div', { class: `tower-head${art ? ' tower-head--art' : ''}` }, h('h2', { class: 'card-title', text: tower.name }));
    if (art) head.style.setProperty('--place-art', `url("${art}")`);
    const climbers =
      tower.missing ??
      (tower.partners.length > 0 || tower.companions.length > 0
        ? `Z Tobą: ${[...tower.partners.map((partner) => `${partner.name} (poz. ${partner.level})`), ...tower.companions].join(', ')}. Najwyższe piętro to poziom najniższej postaci gracza.`
        : null);
    return h(
      'section',
      { class: 'card tower-card', 'aria-label': tower.name },
      head,
      h('p', { class: 'muted', text: `Otwarte piętra: 1–${formatNumber(tower.top)}. Najwyżej zdobyte: ${tower.best > 0 ? `piętro ${formatNumber(tower.best)}` : 'jeszcze żadne'}.` }),
      climbers && h('p', { class: tower.missing ? 'tower-missing' : 'muted', text: climbers }),
      details,
      h('div', { class: 'tower-picker' }, step(-10, 'Dziesięć pięter niżej', '−10'), step(-1, 'Piętro niżej', '−'), slider, step(1, 'Piętro wyżej', '+'), step(10, 'Dziesięć pięter wyżej', '+10')),
      enter,
    );
  }

  if (!isUnlocked('towers')) {
    const unlock = unlockInfo('towers');
    show(`Wieże odblokujesz na poziomie postaci ${unlock.level}. Twój poziom: ${state.character.level}.`);
    return { unmount() {} };
  }

  fill(container, ...heading(), h('p', { class: 'muted', text: 'Wczytywanie…' }));
  call('GET', '/api/towers')
    .then(({ towers }) => {
      view = towers;
      show();
    })
    .catch((error) => show(error.message ?? 'Nie udało się wczytać Wież.'));

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
