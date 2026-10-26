// The camp: a board with a plot for each building, like a village in a
// browser strategy game, and a screen for each building. Buildings are
// upgraded alongside the character's activity, paid with gold and the
// materials, one at a time, with a few more waiting in the queue; an upgrade
// counts once its time has passed.
// Production buildings fill a store the player collects, from a bubble on the
// board or on the building's screen. Opened with the camp button in the top bar.

import { BOARD_HEIGHT, BOARD_WIDTH, CAMP_PLOTS, PLOT_HEIGHT, PLOT_WIDTH, boardArt, plotArt } from '../camp-art.js';
import { craftTableSection } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { leaveView, openView } from '../history.js';
import { RESOURCE_ICONS } from '../icons.js';
import { playSound } from '../sound.js';
import { call, serverNow, state, storeAmount, storeFullAt, testModeOn, walletEntries } from '../state.js';
import { skipControl } from '../time.js';
import { confirmAction, guided, systemPanel, toast, withButton } from '../ui.js';

const CAMP = '#/oboz';
const HISTORY_KEY = 'oboz'; // a building's screen lies one view below the board

export function mountCamp(container, { params, backHash = '#/walka' }) {
  const id = params.building;
  // An unknown building in the address leads back to the board. The camp's
  // own level has a screen like a building's.
  if (id && id !== campOf().id && !state.character.camp.buildings.some((building) => building.id === id)) {
    location.replace(CAMP);
    return {};
  }
  return id ? mountBuilding(container, id) : mountBoard(container, backHash);
}

// The camp's own level, which grows like a building but stands on no plot.
const campOf = () => state.character.camp.level;

// The upgrade in progress, if its time has not passed yet.
function runningBuild(now = serverNow()) {
  const running = state.character.camp.construction;
  return running && running.endsAt > now ? running : null;
}

const resourceName = (id) => walletEntries().find((entry) => entry.id === id)?.name ?? id;

// "o 21:10" today, "26 paź, 01:10" on another day.
function moment(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date(serverNow()).toDateString() ? `o ${timeFormat.format(date)}` : dateTimeFormat.format(date);
}

// The builds the camp has now: the one under way and the waiting ones.
const underWay = () => (runningBuild() ? 1 : 0) + state.character.camp.queue.length;

// "Anuluj" by a waiting build: after a question, it leaves the queue with
// the higher levels of the same building after it, and its cost comes back.
async function cancelBuild(entry) {
  const later = state.character.camp.queue.filter((other) => other.buildingId === entry.buildingId && other.level > entry.level);
  const cost = entry.cost && Object.entries(entry.cost).map(([id, amount]) => `${resourceName(id).toLowerCase()} ${formatNumber(amount)}`);
  const sure = await confirmAction({
    title: 'Anulować budowę?',
    text: [
      `${entry.name}, poziom ${entry.level}: koszt wróci w całości${cost ? ` (${cost.join(', ')})` : ''}.`,
      later.length > 0 && `Z kolejki wypadnie też ${later.map((other) => `poziom ${other.level}`).join(' i ')}, bo go potrzebuje, i jego koszt również wróci.`,
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: 'Anuluj budowę',
    cancelLabel: 'Zostaw',
  });
  if (!sure) return;
  await call('POST', '/api/camp/cancel', { buildingId: entry.buildingId, level: entry.level });
  toast(`Anulowano: ${entry.name}, poziom ${entry.level}. Koszt wrócił.`);
}

const cancelButton = (entry) =>
  h('button', {
    type: 'button',
    class: 'build-queue-cancel',
    text: 'Anuluj',
    'aria-label': `Anuluj: ${entry.name}, poziom ${entry.level}`,
    onClick: (event) => withButton(event.currentTarget, () => cancelBuild(entry)),
  });

// The builds waiting after the one under way, each with the time it starts
// and "Anuluj".
function queuePanel() {
  const { queue, queueSize } = state.character.camp;
  if (queue.length === 0) return null;
  return h(
    'section',
    { class: 'card build-queue', 'aria-labelledby': 'build-queue-title' },
    h('h2', { class: 'card-title', id: 'build-queue-title', text: `Kolejka budowy: ${underWay()} z ${queueSize}` }),
    h(
      'ol',
      { class: 'build-queue-list' },
      queue.map((entry) =>
        h(
          'li',
          { class: 'build-queue-item' },
          h('span', { class: 'build-queue-what' }, h('span', { text: `${entry.name}, poziom ${entry.level}` }), h('span', { class: 'build-queue-time', text: `start ${moment(entry.startsAt)}` })),
          cancelButton(entry),
        ),
      ),
    ),
  );
}

async function collectStore(building) {
  const { collected } = await call('POST', '/api/camp/collect', { buildingId: building.id });
  playSound('collect');
  toast(`Zebrano: ${resourceName(collected.resource).toLowerCase()} +${formatNumber(collected.amount)}.`);
}

function heading(title, subtitle, back, badge = null) {
  return h(
    'div',
    { class: 'page-heading page-heading--back' },
    h(
      'div',
      { class: 'page-heading-text' },
      h('div', { class: 'page-title-row' }, h('h1', { class: 'page-title', tabindex: '-1', text: title }), badge),
      h('p', { class: 'page-subtitle', text: subtitle }),
    ),
    back,
  );
}

// Test mode only: the building being upgraded is ready at once, and with
// nothing being built the stores fill at once.
function testTools(building) {
  const producing = state.character.camp.buildings.some((candidate) => candidate.production);
  if (!state.user.testMode || !testModeOn() || (!building && !producing)) return null;
  return h(
    'div',
    { class: 'test-tools' },
    h('p', {
      class: 'test-tools-text',
      text: building ? 'Tryb testowy: budowa skończy się od razu.' : 'Tryb testowy: magazyny zapełnią się od razu.',
    }),
    h('button', {
      type: 'button',
      class: 'button button--test',
      text: 'Pomiń czas',
      onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-build')),
    }),
  );
}

// The upgrade in progress: what, how long, a bar and "Przewiń" for Punkty
// Czasu. `ticks` gets its update.
function constructionPanel(running, ticks) {
  const countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
  const progress = h('div', { class: 'bar-fill bar-fill--system' });
  const skipper = skipControl('build', (now) => running.endsAt - now, `${running.name}, poziom ${running.level}`);
  ticks.push((now) => {
    countdown.textContent = formatCountdown(running.endsAt - now);
    const done = (now - running.startedAt) / (running.endsAt - running.startedAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    skipper.update(now);
  });
  return h(
    'div',
    { class: 'stack' },
    guided(
      systemPanel(
        `Budowa: ${running.name}, poziom ${running.level}.`,
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        h('p', { class: 'system-hint', text: `Gotowe ${moment(running.endsAt)}.` }),
      ),
      'build-countdown',
    ),
    skipper.element,
  );
}

// The board: the glade with a plot for each building. A plot shows the
// building at its level, or an empty plot; scaffolding and a timer while it
// is being built, and a bubble to collect a production building's store.
function mountBoard(container, backHash) {
  let ticks = [];
  let shownBuild = null;

  function render() {
    const character = state.character;
    const running = runningBuild();
    shownBuild = running?.endsAt ?? null;
    ticks = [];
    const nothingBuilt = !running && character.camp.buildings.every((building) => building.level === 0);
    fill(
      container,
      heading(
        'Obóz',
        'Polana na skraju puszczy',
        h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), 'Powrót'),
        h('span', { class: 'camp-level-badge', text: `Poziom ${campOf().level}` }),
      ),
      testTools(running),
      guided(materials(), 'camp-stock'),
      h(
        'div',
        { class: 'camp-board', role: 'group', 'aria-label': 'Plansza obozu' },
        boardArt(),
        character.camp.buildings.map((building) => plot(building, running)),
        campLevelButton(running),
      ),
      nothingBuilt &&
        h('p', { class: 'system-hint camp-hint', text: 'Dotknij pustego placu, żeby zobaczyć koszt budowy. Zasoby znajdziesz na eksploracjach.' }),
      running && constructionPanel(running, ticks),
      queuePanel(),
    );
    tick(serverNow());
  }

  // The materials for building: gold and Punkty Systemu are in the top bar.
  function materials() {
    const [, ...entries] = walletEntries();
    return h(
      'ul',
      { class: 'camp-materials', 'aria-label': 'Zasoby' },
      entries.map((entry) =>
        h(
          'li',
          { class: 'camp-material' },
          icon(RESOURCE_ICONS[entry.id] ?? 'unknown', { size: 16 }),
          h('span', { text: entry.name }),
          h('strong', { text: formatNumber(entry.amount) }),
        ),
      ),
    );
  }

  // "Rozwiń poziom obozu" in the board's top left corner leads to the
  // camp's own screen. It is small, on two lines, and while the camp grows
  // its time left follows "obozu", so nothing of it hangs over the plots.
  function campLevelButton(running) {
    const hash = `${CAMP}/${campOf().id}`;
    return h(
      'a',
      {
        class: 'button button--system camp-level-button',
        href: hash,
        'data-guide': 'camp-level',
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      'Rozwiń poziom',
      h('br'),
      'obozu',
      running?.buildingId === campOf().id && timer(running),
    );
  }

  function plot(building, running) {
    const spot = CAMP_PLOTS[building.id] ?? { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 };
    const underway = running?.buildingId === building.id;
    const waiting = !underway && building.queued.length > 0;
    const empty = building.level === 0;
    const hash = `${CAMP}/${building.id}`;
    const said = [empty ? `Pusty plac: ${building.name}` : `${building.name}, poziom ${building.level}`, underway && 'trwa budowa', waiting && 'w kolejce'];
    const link = h(
      'a',
      {
        class: `camp-plot${empty ? ' camp-plot--empty' : ''}`,
        href: hash,
        'data-guide': `plot-${building.id}`,
        'aria-label': said.filter(Boolean).join(', '),
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      plotArt(building.id, { level: building.level, building: underway }),
      h(
        'span',
        { class: 'camp-plot-label' },
        h('span', { text: building.name }),
        !empty && h('strong', { class: 'camp-plot-level', text: String(building.level) }),
      ),
    );
    return h(
      'div',
      {
        class: 'camp-plot-wrap',
        style: {
          left: `${((spot.x - PLOT_WIDTH / 2) / BOARD_WIDTH) * 100}%`,
          top: `${((spot.y - PLOT_HEIGHT / 2) / BOARD_HEIGHT) * 100}%`,
          width: `${(PLOT_WIDTH / BOARD_WIDTH) * 100}%`,
        },
      },
      link,
      underway && timer(running),
      waiting && h('span', { class: 'camp-plot-timer camp-plot-timer--queued', 'aria-hidden': 'true' }, icon('hourglass', { size: 12 }), 'w kolejce'),
      building.production && !building.production.paused && bubble(building),
    );
  }

  function timer(running) {
    const time = h('span', {});
    ticks.push((now) => {
      time.textContent = formatCountdown(running.endsAt - now);
    });
    return h('span', { class: 'camp-plot-timer', 'aria-hidden': 'true' }, icon('hourglass', { size: 12 }), time);
  }

  // What the store holds, counted up every second; a tap collects it.
  function bubble(building) {
    const store = building.production;
    const amount = h('span', {});
    const button = h(
      'button',
      { type: 'button', class: 'camp-bubble', onClick: (event) => withButton(event.currentTarget, () => collectStore(building)) },
      icon(RESOURCE_ICONS[store.resource] ?? 'unknown', { size: 14 }),
      amount,
    );
    ticks.push((now) => {
      const held = storeAmount(store, now);
      const full = held >= store.capacity;
      button.hidden = held < 1;
      amount.textContent = `+${formatNumber(held)}`;
      button.classList.toggle('camp-bubble--full', full);
      button.setAttribute('aria-label', `Zbierz: ${resourceName(store.resource).toLowerCase()} +${held}${full ? ', magazyn pełny' : ''}`);
    });
    return button;
  }

  function tick(now) {
    // The upgrade ended: the board draws it again (app.js asks for the character).
    if ((runningBuild(now)?.endsAt ?? null) !== shownBuild) {
      render();
      return;
    }
    for (const update of ticks) update(now);
  }

  render();
  return { update: render, tick };
}

// A building's screen. Building comes first, at the top, so nobody scrolls
// down for it (the author's wish): the build under way, the levels waiting
// and the next level with the cost and "Zbuduj" or "Ulepsz". Below them
// its picture, what it gives now and its store (the Stół rzemieślniczy:
// its materials, queue and parts).
function mountBuilding(container, id) {
  let ticks = [];
  let shownBuild = null;

  function render() {
    const own = id === campOf().id;
    const building = own ? campOf() : state.character.camp.buildings.find((candidate) => candidate.id === id);
    const running = runningBuild();
    shownBuild = running?.endsAt ?? null;
    ticks = [];
    const underway = running?.buildingId === id;
    fill(
      container,
      heading(
        building.name,
        building.level === 0 ? 'Pusty plac' : `Poziom ${building.level} z ${building.maxLevel}`,
        h(
          'button',
          { type: 'button', class: 'button button--system back-button', onClick: () => leaveView(CAMP, 1, HISTORY_KEY) },
          icon('back', { size: 20 }),
          'Powrót',
        ),
      ),
      testTools(running),
      underway && constructionPanel(running, ticks),
      waitingNote(id),
      nextLevel(building),
      h(
        'article',
        { class: 'card building-view', 'aria-label': building.name },
        !own && h('div', { class: 'building-art' }, plotArt(id, { level: building.level, building: underway })),
        h('p', { class: 'region-description', text: building.description }),
        building.effect && h('p', { class: 'building-effect' }, h('strong', { text: 'Teraz: ' }), building.effect),
        building.production && storeView(building),
      ),
      building.crafts && craftTableSection(ticks),
    );
    tick(serverNow());
  }

  // The store of a production building: how full it is, when it fills up,
  // and "Zbierz".
  function storeView(building) {
    const store = building.production;
    const amount = h('strong', {});
    const fillBar = h('div', { class: 'bar-fill bar-fill--gold' });
    const hint = h('p', { class: 'store-hint' });
    let collecting = false; // the tick must not enable the button mid-request
    const button = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Zbierz',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          collecting = true;
          try {
            await collectStore(building);
          } finally {
            collecting = false;
          }
        }),
    });
    ticks.push((now) => {
      const held = storeAmount(store, now);
      amount.textContent = `${formatNumber(held)} / ${formatNumber(store.capacity)}`;
      fillBar.style.width = `${(held / store.capacity) * 100}%`;
      hint.textContent = store.paused
        ? 'Rozbudowa: produkcja ruszy po jej końcu.'
        : held >= store.capacity
          ? 'Magazyn pełny: produkcja stoi do zebrania.'
          : `Pełny za ${formatCountdown(storeFullAt(store) - now)}.`;
      button.disabled = collecting || held < 1;
    });
    return h(
      'div',
      { class: 'store' },
      h(
        'p',
        { class: 'store-head' },
        icon(RESOURCE_ICONS[store.resource] ?? 'unknown', { size: 18 }),
        h('span', { text: `Magazyn: ${resourceName(store.resource)}` }),
        amount,
      ),
      h('div', { class: 'bar' }, fillBar),
      hint,
      button,
    );
  }

  // This building's levels waiting in the queue, with the times they start
  // and "Anuluj".
  function waitingNote(id) {
    const waiting = state.character.camp.queue.filter((entry) => entry.buildingId === id);
    if (waiting.length === 0) return null;
    return systemPanel(
      ...waiting.map((entry) =>
        h('div', { class: 'build-queue-item' }, h('p', { class: 'system-text', text: `W kolejce: poziom ${entry.level}, start ${moment(entry.startsAt)}.` }), cancelButton(entry)),
      ),
    );
  }

  // The level after those under way and waiting. With a build under way it
  // joins the queue, as long as there is room in it.
  function nextLevel(building) {
    const next = building.next;
    const own = building.id === campOf().id;
    if (!next) return h('p', { class: 'muted', text: building.evolution ?? (building.queued.length > 0 ? 'Najwyższy poziom jest już w kolejce.' : 'Najwyższy poziom.') });
    const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.amount]));
    const missing = Object.entries(next.cost).some(([resource, amount]) => (have[resource] ?? 0) < amount);
    const busy = underWay();
    const full = busy >= state.character.camp.queueSize;
    const label = full
      ? 'Kolejka budowy pełna'
      : missing
        ? own
          ? 'Brakuje złota'
          : 'Brakuje złota albo zasobów'
        : busy > 0
          ? `Dodaj do kolejki: poziom ${next.level}`
          : own
            ? `Rozwiń obóz do poziomu ${next.level}`
            : building.level === 0
              ? 'Zbuduj'
              : `Ulepsz do poziomu ${next.level}`;
    return h(
      'section',
      { class: 'card building-next-card', 'aria-labelledby': 'building-next' },
      h('h2', { class: 'card-title', id: 'building-next', text: next.level === 1 ? 'Budowa' : `Poziom ${next.level}` }),
      h('p', { class: 'building-next', text: next.effect }),
      h(
        'ul',
        { class: 'cost-list', 'aria-label': 'Koszt' },
        Object.entries(next.cost).map(([resource, amount]) =>
          h(
            'li',
            { class: `cost${(have[resource] ?? 0) < amount ? ' cost--missing' : ''}` },
            icon(RESOURCE_ICONS[resource] ?? 'unknown', { size: 16 }),
            h('span', { text: resourceName(resource) }),
            h('strong', { text: `${formatNumber(have[resource] ?? 0)} / ${formatNumber(amount)}` }),
          ),
        ),
      ),
      h('p', { class: 'building-time' }, icon('hourglass', { size: 16 }), `${own ? 'Czas rozwoju' : 'Czas budowy'}: ${formatMinutes(next.minutes)}`),
      h('button', {
        type: 'button',
        class: 'button button--system',
        'data-guide': 'build',
        disabled: full || missing,
        text: label,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await call('POST', '/api/camp/build', { buildingId: building.id });
            playSound('build');
          }),
      }),
      full &&
        h('p', {
          class: 'system-hint',
          text: `Naraz można mieć ${countOf(state.character.camp.queueSize, 'budowę', 'budowy', 'budów')}: trwającą i czekające w kolejce. Kolejna zmieści się, gdy któraś się skończy.`,
        }),
      !full &&
        missing &&
        h('p', {
          class: 'system-hint',
          text: own
            ? 'Złoto zdobędziesz na eksploracjach.'
            : 'Złoto i zasoby zdobędziesz na eksploracjach. Tartak, Kamieniołom i Kopalnia wytwarzają zasoby w obozie.',
        }),
    );
  }

  function tick(now) {
    // The upgrade ended: the screen draws it again (app.js asks for the character).
    if ((runningBuild(now)?.endsAt ?? null) !== shownBuild) {
      render();
      return;
    }
    for (const update of ticks) update(now);
  }

  render();
  return { update: render, tick };
}
