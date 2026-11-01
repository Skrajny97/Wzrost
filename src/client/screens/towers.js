// The Wieże in the Walka (src/server/towers.js), from character level 50:
// the entries left today and each tower with its floors. The floor is
// picked with the slider or − and +; the card shows its inner region, its
// level and what waits there (an elite, a champion, the tower's chest not
// taken yet), who climbs beside the character in the Wieża Drużyn, and
// "Wejdź", whose report opens at once. The floor picked is remembered on
// this device.

import { areaArt } from '../area-art.js';
import { fill, h } from '../dom.js';
import { formatNumber } from '../format.js';
import { call, isUnlocked, reportCache, state, unlockInfo } from '../state.js';
import { lockLabel, systemPanel, withButton } from '../ui.js';

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
        h('p', {
          class: 'muted',
          text: `Wejście to jedna walka na wybranym piętrze, z wynikiem od razu. Postać walczy z pełnym HP i bez mikstur, a Wieże nie przerywają wyprawy ani pracy. Piętro ma stwory jednego regionu, po kolei przez wszystkie krainy, na swoim poziomie. Co ${view.eliteEvery}. piętro czeka elita, co ${view.championEvery}. czempion, a co ${view.chestEvery}. piętro za pierwszym zwycięstwem daje skrzynię Wieży.`,
        }),
      ),
      view.towers.map(towerCard),
    );
  }

  // The floor a tower's card starts at: the one picked before, else the
  // next above the highest won, within the floors open.
  const floorOf = (tower) => Math.min(tower.top, Math.max(1, Number.isInteger(picks[tower.id]) ? picks[tower.id] : tower.best + 1));

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
      disabled: view.left === 0 || Boolean(tower.missing),
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
      const elite = floor % view.eliteEvery === 0;
      const chest = floor % view.chestEvery === 0 && !tower.chests.includes(floor);
      const waits = [champion && place.champion ? 'czempion' : (champion || elite) && place.elite ? 'elita' : null, chest && 'skrzynia Wieży'].filter(Boolean);
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

    const climbers =
      tower.missing ??
      (tower.partners.length > 0 || tower.companions.length > 0
        ? `Z Tobą: ${[...tower.partners.map((partner) => `${partner.name} (poz. ${partner.level})`), ...tower.companions].join(', ')}. Najwyższe piętro to poziom najniższej postaci gracza.`
        : null);
    return h(
      'section',
      { class: 'card tower-card', 'aria-label': tower.name },
      h('h2', { class: 'card-title', text: tower.name }),
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
    unmount() {
      gone = true;
    },
  };
}
