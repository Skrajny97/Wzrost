// The camp: a board with a plot for each building, like a village in a
// browser strategy game, and a screen for each building. Buildings are
// upgraded alongside the character's activity, paid with gold and the
// materials, one at a time, with a few more waiting in the queue; an upgrade
// counts once its time has passed.
// Production buildings fill a store the player collects, from a bubble on the
// board or on the building's screen, or the Zbieracz Systemu, once bought by
// the Skrzynia Konta, collects as it fills; at the Ognisko the fire spirit
// trades gold for resources a few times a day, at the Skup złomu the scrap
// dealer sells crafting parts, and with the Osada the Duch budowniczego at
// the Kamień węgielny buys resources for gold. Opened with the camp button in
// the top bar, on a computer with the camp's tab in the menu (508 A). Its
// texts are written in Polish and shown in the page's language (t(),
// i18n.js); the buildings' own words come from the server in it.

import { campIcon, goldArt, materialSprite, resourceArt } from '../art.js';
import { spiritPart, spiritSaleSheet } from '../builder-spirit.js';
import { BOARD_WIDTH, FORTRESS_HALVES, PLOT_HEIGHT, PLOT_WIDTH, boardArt, boardHeight, buildingTier, campPlots, cornerstoneArt, fortressHalf, plotArt, stretchY } from '../camp-art.js';
import { craftTableSection, materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { leaveView, openView } from '../history.js';
import { t } from '../i18n.js';
import { playSound } from '../sound.js';
import { call, costShortfall, serverNow, state, storeAmount, storeFullAt, testModeOn, walletEntries } from '../state.js';
import { skipControl } from '../time.js';
import { closeSheet, confirmAction, guided, meter, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { desktopLayout, onLayoutChange } from '../layout-mode.js';
import { scrapperSheet } from '../scrapper.js';
import { blessingSection, fortressPart, gearSetsSection, greenhouseSection, trainingSection } from '../fortress.js';
import { itemSheet, itemSummary, salvagePicker } from './character.js';
import { mountChest } from './chest.js';
import { mountQuarters } from '../companions.js';
import { dayPart } from '../scenes.js';

const CAMP = '#/oboz';
const HISTORY_KEY = 'oboz'; // a building's screen lies one view below the board
// The Skrzynia Konta stands on the board by the road out, across it from the
// Stół rozbiórki, with a screen of its own like a building's
// (screens/chest.js). On the taller board it moves down with the plots below
// the Osada's band. It stands on the open grass at the end of its path in
// every look of the ground: further right, the forest of the first look
// reaches the glade (the author: "Tu gdzie Skrzynia Konta jest to brzydko
// wygląda jeszcze").
const CHEST = 'skrzynia-konta';
const CHEST_SPOT = { x: 238, y: 406 };
// In the Warownia (camp-art.js) the Kapliczka stands there, so the chest
// stands by the road between it and the Strażnica, in the board's units.
const FORTRESS_CHEST_SPOT = { x: 206, y: 662 };
// The Zbieracz Systemu, until he is bought, stands right beside the chest,
// as big as it, on its left, between it and the road, on every board: on
// the Warownia's the names of the Szklarnia and of the chest leave no room
// on its right. In the board's units.
const COLLECTOR_GAP = 36;
// The Kamień węgielny Warowni on the board with the Osada, in its band across
// the road from the Kwatery (the author's "435 A").
const CORNERSTONE_SPOT = { x: 266, y: 418 };
// The pieces last picked on the fire spirit's slider, while its building's
// screen stays open: a newly opened screen starts at one piece (the author:
// "suwak był ustawiony na najniższą wartość").
let fireChoice = null;
// The resource last given at the Stół rozbiórki's exchange and the pieces
// last picked there, the same way.
const exchangeChoice = { from: null, amount: null };

export function mountCamp(container, { params, backHash = '#/walka' }) {
  const id = params.building;
  if (id === CHEST) return mountChest(container, () => leaveView(CAMP, 1, HISTORY_KEY));
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
// The taller board, with room for the Osada's buildings (the Kwatery), once
// the character has the Osada, and the Warownia's ("fortress", camp-art.js)
// once the camp has turned into one.
const tall = () => (state.character.camp.cornerstone?.fortress?.stands ? 'fortress' : Boolean(state.character.settlementOpen));

// The Kamień węgielny Warowni's window: what it is and how many buildings
// stand at their highest level, and the camp's level, out of all; below,
// the Duch budowniczego, who buys the camp's resources (builder-spirit.js).
// It shows the character as it is now, so a sale's window comes back to it
// with the new numbers.
function cornerstoneSheet() {
  const stone = state.character.camp.cornerstone;
  openSheet(
    h('h2', { class: 'sheet-title', text: stone.name }),
    h('p', { class: 'muted cornerstone-text', text: stone.text }),
    h(
      'div',
      { class: 'cornerstone-rows' },
      stone.rows.map((row) => meter({ label: row.label, value: row.done, max: row.of, kind: 'cornerstone' }).element),
    ),
    // Where the Warownia is in the game, its own part says what comes next.
    stone.ready && !stone.fortress && h('p', { class: 'system-hint', text: stone.ready }),
    // The camp's transformation into a Warownia (fortress.js).
    stone.fortress && fortressPart(stone.fortress, cornerstoneSheet),
    stone.spirit && spiritPart(stone.spirit, (good) => spiritSaleSheet(stone.spirit, good, cornerstoneSheet)),
  );
}

// The Zbieracz Systemu's offer (the author: „po kliknięciu w niego
// wyświetlać się będzie opcja zakupu za sporą ilość złota”): his name, what
// he does, his price and "Kup", or the gold missing, as a build's button
// says it. Once bought he leaves the board, and the game collects the full
// stores by itself (the server's settleCollector).
function collectorSheet() {
  const collector = state.character.camp.collector;
  const lacking = costShortfall({ gold: collector.price });
  openSheet(
    h('div', { class: 'collector-head' }, h('span', { class: 'collector-art' }, campIcon(collector.art)), h('h2', { class: 'sheet-title', text: collector.name })),
    h('p', { class: 'sheet-text', text: collector.texts.offer }),
    h('p', { class: 'sheet-text avatar-price' }, goldArt(20), t(' {gold} złota, jednorazowo i na zawsze', { gold: formatNumber(collector.price) })),
    h('button', {
      type: 'button',
      class: 'button button--system',
      text: lacking.length > 0 ? t('Brakuje: {missing}', { missing: lacking.join(', ') }) : t('Kup'),
      disabled: lacking.length > 0,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const { character } = await call('POST', '/api/camp/collector');
          closeSheet();
          playSound('chest');
          toast(character.camp.collector.texts.bought);
        }),
    }),
  );
}

// The upgrade in progress, if its time has not passed yet.
function runningBuild(now = serverNow()) {
  const running = state.character.camp.construction;
  return running && running.endsAt > now ? running : null;
}

const resourceName = (id) => walletEntries().find((entry) => entry.id === id)?.name ?? id;

// "o 21:10" today, "26 paź, 01:10" on another day.
function moment(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date(serverNow()).toDateString() ? t('o {time}', { time: timeFormat.format(date) }) : dateTimeFormat.format(date);
}

// "Tartak, poziom 2".
const levelOf = (name, level) => t('{name}, poziom {level}', { name, level });

// The cost that comes back, " (drewno 120, kamień 40)", or nothing.
const costBack = (cost) => (cost ? ` (${Object.entries(cost).map(([id, amount]) => `${resourceName(id).toLowerCase()} ${formatNumber(amount)}`).join(', ')})` : '');

// The higher levels of the same building that leave the queue with a build.
const laterOnes = (later) =>
  later.length > 0 &&
  t('Z kolejki wypadnie też {levels}, bo go potrzebuje, i jego koszt również wróci.', {
    levels: later.map((other) => t('poziom {level}', { level: other.level })).join(t(' i ')),
  });

// The builds the camp has now: the one under way and the waiting ones.
const underWay = () => (runningBuild() ? 1 : 0) + state.character.camp.queue.length;

// "Anuluj" by a waiting build: after a question, it leaves the queue with
// the higher levels of the same building after it, and its cost comes back.
async function cancelBuild(entry) {
  const later = state.character.camp.queue.filter((other) => other.buildingId === entry.buildingId && other.level > entry.level);
  const sure = await confirmAction({
    title: t('Anulować budowę?'),
    text: [t('{name}, poziom {level}: koszt wróci w całości{cost}.', { name: entry.name, level: entry.level, cost: costBack(entry.cost) }), laterOnes(later)]
      .filter(Boolean)
      .join(' '),
    confirmLabel: t('Anuluj budowę'),
    cancelLabel: t('Zostaw'),
  });
  if (!sure) return;
  await call('POST', '/api/camp/cancel', { buildingId: entry.buildingId, level: entry.level });
  toast(t('Anulowano: {name}, poziom {level}. Koszt wrócił.', { name: entry.name, level: entry.level }));
}

// "Przerwij budowę" by the build under way (the author: „Nie można anulować
// aktualnie budowanego miejsca ze zwrotem kosztow zasobow a chcemy tego”):
// after a question, the building goes back to the level it had, its cost and
// that of its higher levels waiting in the queue come back.
async function stopBuild(running) {
  const later = state.character.camp.queue.filter((other) => other.buildingId === running.buildingId && other.level > running.level);
  const sure = await confirmAction({
    title: t('Przerwać budowę?'),
    text: [
      t('{name}, poziom {level}: koszt wróci w całości{cost}, {after}.', {
        name: running.name,
        level: running.level,
        cost: costBack(running.cost),
        after: running.level > 1 ? t('a {name} zostanie na poziomie {level}', { name: running.name, level: running.level - 1 }) : t('a plac zostanie pusty'),
      }),
      laterOnes(later),
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: t('Przerwij budowę'),
    cancelLabel: t('Buduj dalej'),
  });
  if (!sure) return;
  await call('POST', '/api/camp/cancel', { buildingId: running.buildingId, level: running.level });
  toast(t('Przerwano budowę: {name}, poziom {level}. Koszt wrócił.', { name: running.name, level: running.level }));
}

const cancelButton = (entry) =>
  h('button', {
    type: 'button',
    class: 'build-queue-cancel',
    text: t('Anuluj'),
    'aria-label': t('Anuluj: {name}, poziom {level}', { name: entry.name, level: entry.level }),
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
    h('h2', { class: 'card-title', id: 'build-queue-title', text: t('Kolejka budowy: {count} z {size}', { count: underWay(), size: queueSize }) }),
    h(
      'ol',
      { class: 'build-queue-list' },
      queue.map((entry) =>
        h(
          'li',
          { class: 'build-queue-item' },
          h('span', { class: 'build-queue-what' }, h('span', { text: levelOf(entry.name, entry.level) }), h('span', { class: 'build-queue-time', text: t('start {when}', { when: moment(entry.startsAt) }) })),
          cancelButton(entry),
        ),
      ),
    ),
  );
}

async function collectStore(building) {
  const { collected } = await call('POST', '/api/camp/collect', { buildingId: building.id });
  playSound('collect');
  toast(t('Zebrano: {resource} +{amount}.', { resource: resourceName(collected.resource).toLowerCase(), amount: formatNumber(collected.amount) }));
}

// Asked first (the author: "Wymiana złota na zasoby w ognisku potrzebuje
// dodatkowego okna potwierdzenia").
async function tradeAtFire(resource, amount, gold) {
  const sure = await confirmAction({
    title: t('Wymiana u ducha ognia'),
    text: t('Duch ognia weźmie {gold} złota i odda: {resource} +{amount}.', { gold: formatNumber(gold), resource: resourceName(resource).toLowerCase(), amount: formatNumber(amount) }),
    confirmLabel: t('Wymień'),
  });
  if (!sure) return;
  const { traded } = await call('POST', '/api/camp/trade', { resource, amount });
  playSound('collect');
  toast(
    t('Duch ognia przyjął {gold} złota i oddał: {resource} +{amount}.', {
      gold: formatNumber(traded.gold),
      resource: resourceName(traded.resource).toLowerCase(),
      amount: formatNumber(traded.amount),
    }),
  );
}

async function exchangeResources(from, to, amount, given) {
  const sure = await confirmAction({
    title: t('Wymiana zasobów'),
    text: t('Oddasz {given} × {from} i dostaniesz {amount} × {to}.', { given: formatNumber(given), from: resourceName(from), amount: formatNumber(amount), to: resourceName(to) }),
    confirmLabel: t('Wymień'),
  });
  if (!sure) return;
  const { exchanged } = await call('POST', '/api/camp/exchange', { from, to, amount });
  playSound('collect');
  toast(
    t('Wymieniono {given} × {from} na {amount} × {to}.', {
      given: formatNumber(exchanged.given),
      from: resourceName(exchanged.from),
      amount: formatNumber(exchanged.amount),
      to: resourceName(exchanged.to),
    }),
  );
}

async function buyParts(partId, count) {
  const { bought } = await call('POST', '/api/camp/buy', { partId, count });
  playSound('chest');
  const name = state.character.crafting.parts.find((part) => part.id === bought.partId)?.name ?? bought.partId;
  toast(t('Kupiono: {name} +{count} za {gold} złota.', { name, count: formatNumber(bought.count), gold: formatNumber(bought.gold) }));
}

// "Na poziomie 3 dojdą Okucia, a ceny spadną o 6%."
function shopNextText(next) {
  const cut = t('ceny spadną o {percent}%', { percent: Math.round(next.discount * 100) });
  if (next.added.length === 0) return t('Na poziomie {level} {cut}.', { level: next.level, cut });
  const parts = next.added.map((part) => part.name).join(t(' i '));
  // The verb agrees with the parts in Polish; English has one sentence.
  return next.added.length > 1 || next.added[0].gender === 'pl'
    ? t('Na poziomie {level} dojdą {parts}, a {cut}.', { level: next.level, parts, cut })
    : t('Na poziomie {level} dojdzie {parts}, a {cut}.', { level: next.level, parts, cut });
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
      text: building ? t('Tryb testowy: budowa skończy się od razu.') : t('Tryb testowy: magazyny zapełnią się od razu.'),
    }),
    h('button', {
      type: 'button',
      class: 'button button--test',
      text: t('Pomiń czas'),
      onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-build')),
    }),
  );
}

// The upgrade in progress: what, how long, a bar and "Przewiń" for Punkty
// Czasu. `ticks` gets its update.
function constructionPanel(running, ticks) {
  const countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
  const progress = h('div', { class: 'bar-fill bar-fill--system' });
  const skipper = skipControl('build', (now) => running.endsAt - now, levelOf(running.name, running.level));
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
        t('Budowa: {name}, poziom {level}.', { name: running.name, level: running.level }),
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        h('p', { class: 'system-hint', text: t('Gotowe {when}.', { when: moment(running.endsAt) }) }),
      ),
      'build-countdown',
    ),
    skipper.element,
    h('button', {
      type: 'button',
      class: 'button button--world button--small build-stop',
      text: t('Przerwij budowę'),
      'aria-label': t('Przerwij budowę: {name}, poziom {level}', { name: running.name, level: running.level }),
      onClick: (event) => withButton(event.currentTarget, () => stopBuild(running)),
    }),
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
        t('Obóz'),
        t('Polana na skraju puszczy'),
        h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), t('Powrót')),
        h('span', { class: 'camp-level-badge', text: t('Poziom {level}', { level: campOf().level }) }),
      ),
      testTools(running),
      guided(materials(), 'camp-stock'),
      campBoard(character, running),
      nothingBuilt &&
        h('p', { class: 'system-hint camp-hint', text: t('Wybierz pusty plac, żeby zobaczyć koszt budowy. Zasoby znajdziesz na eksploracjach.') }),
      running && constructionPanel(running, ticks),
      queuePanel(),
    );
    fitBoard();
    tick(serverNow());
  }

  // The glade in the light of the hour in Poland, its palisade growing with
  // the camp's level, taller once the character has the Osada, with walls
  // once it is a Warownia. On a computer the Warownia's board stands in two
  // parts side by side (camp-art.js: FORTRESS_HALVES; the author: „Pamiętaj
  // by dostosować jakoś ekran tego na PCty”), its buildings as big as the
  // camp's were, with no scrolling.
  const split = () => desktopLayout() && tall() === 'fortress';
  function campBoard(character, running) {
    if (!split()) {
      return h(
        'div',
        {
          class: `camp-board camp-board--${dayPart()}${tall() ? ' camp-board--tall' : ''}${tall() === 'fortress' ? ' camp-board--fortress' : ''}`,
          role: 'group',
          'aria-label': tall() === 'fortress' ? t('Plansza Warowni') : t('Plansza obozu'),
        },
        boardArt(campOf().level, tall()),
        character.camp.buildings.map((building) => plot(building, running)),
        chestLink(),
        collectorLink(),
        tall() && cornerstone(),
        campLevelButton(running),
      );
    }
    return h(
      'div',
      { class: 'camp-board-split', role: 'group', 'aria-label': t('Plansza Warowni') },
      FORTRESS_HALVES.map((range, index) =>
        h(
          'div',
          { class: `camp-board camp-board--${dayPart()} camp-board--part`, style: { aspectRatio: `${BOARD_WIDTH} / ${range[1] - range[0]}` } },
          boardArt(campOf().level, tall(), range),
          character.camp.buildings.filter((building) => fortressHalf(spotOf(building.id).y) === index).map((building) => plot(building, running, range)),
          index === fortressHalf(FORTRESS_CHEST_SPOT.y) && [chestLink(range), collectorLink(range)],
          index === fortressHalf(CORNERSTONE_SPOT.y) && cornerstone(range),
          index === 0 && campLevelButton(running),
        ),
      ),
    );
  }

  // On a computer the board fits the screen's height, shrunk evenly (506 A;
  // the player: "muszę scrollować widok obozu po 20 lvl, jak się
  // wydłużył"): as wide as its shape allows in the room from its top down
  // to the screen's bottom, past the page's own margin there. styles.css
  // keeps it between the narrowest phone's board and its usual width. The
  // Warownia's two parts the same way, by the taller of them.
  function fitBoard() {
    const board = container.querySelector('.camp-board-split') ?? container.querySelector('.camp-board');
    if (!board || !desktopLayout()) return;
    const page = container.closest('.screen--game');
    const below = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0;
    const room = window.innerHeight - (board.getBoundingClientRect().top + window.scrollY) - below;
    if (board.classList.contains('camp-board-split')) {
      const tallest = Math.max(...FORTRESS_HALVES.map(([from, to]) => to - from));
      board.style.setProperty('--split-fit', `${Math.floor((2 * room * BOARD_WIDTH) / tallest + 16)}px`);
      return;
    }
    board.style.setProperty('--board-fit', `${Math.floor((room * BOARD_WIDTH) / boardHeight(tall()))}px`);
  }
  window.addEventListener('resize', fitBoard);
  // Between a phone's and a computer's layout the Warownia's board changes
  // its shape, so the board is drawn anew.
  const stopLayout = onLayoutChange(() => (Boolean(container.querySelector('.camp-board-split')) === split() ? fitBoard() : render()));
  // The page's letters, loaded after the first look, may move the board.
  document.fonts?.ready.then(fitBoard);

  // The materials for building: gold and Punkty Systemu are in the top bar.
  // With the Zbieracz Systemu he flies to and fro over them, and their
  // frames pulse with the System's blue (753 A; styles.css).
  function materials() {
    const [, ...entries] = walletEntries();
    const collector = state.character.camp.collector?.owned ? state.character.camp.collector : null;
    return h(
      'ul',
      { class: `camp-materials${collector ? ' camp-materials--collector' : ''}`, 'aria-label': t('Zasoby') },
      entries.map((entry) =>
        h(
          'li',
          { class: 'camp-material' },
          resourceArt(entry.id, 24),
          h('span', { text: entry.name }),
          h('strong', { text: formatNumber(entry.amount) }),
        ),
      ),
      collector && h('li', { class: 'camp-collector-flyer', 'aria-hidden': 'true' }, h('span', { class: 'camp-collector-flyer-art' }, campIcon(collector.art))),
    );
  }

  // "Rozwiń poziom obozu" in the board's very top left corner leads to the
  // camp's own screen (the author: "daj przycisk w lewy górny róg planszy
  // obozu"). It is small, on two lines, and while the camp grows its time
  // left follows "obozu", so nothing of it hangs over the plots or the
  // Tartak's bubble.
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
      t('Rozwiń poziom'),
      h('br'),
      t('obozu'),
      running?.buildingId === campOf().id && timer(running),
    );
  }

  // The Skrzynia Konta: the chest's picture with its name, like a plot.
  function chestLink(range = null) {
    const hash = `${CAMP}/${CHEST}`;
    const [from, to] = range ?? [0, boardHeight(tall())];
    return h(
      'a',
      {
        class: 'camp-chest',
        href: hash,
        'aria-label': t('Skrzynia Konta'),
        // Beside the Magazyn on either board, at the top of the taller one's band.
        style: {
          left: `${((tall() === 'fortress' ? FORTRESS_CHEST_SPOT : CHEST_SPOT).x / BOARD_WIDTH) * 100}%`,
          top: `${(((tall() === 'fortress' ? FORTRESS_CHEST_SPOT.y : stretchY(CHEST_SPOT.y, tall())) - from) / (to - from)) * 100}%`,
        },
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      h('span', { class: 'camp-chest-art' }, materialSprite('chest')),
      h('span', { class: 'camp-plot-label' }, h('span', { text: t('Skrzynia Konta') })),
    );
  }

  // The Zbieracz Systemu right beside the Skrzynia Konta, as big as the
  // chest and with no name under it (the author: „bez opisu”), until he is
  // bought: a tap shows his offer.
  function collectorLink(range = null) {
    const collector = state.character.camp.collector;
    if (!collector || collector.owned) return null;
    const [from, to] = range ?? [0, boardHeight(tall())];
    const chest = tall() === 'fortress' ? FORTRESS_CHEST_SPOT : { x: CHEST_SPOT.x, y: stretchY(CHEST_SPOT.y, tall()) };
    return h(
      'button',
      {
        type: 'button',
        class: 'camp-collector',
        // The narrator points at him on the first look (narrator.js).
        'data-guide': 'camp-collector',
        'aria-label': collector.name,
        style: {
          left: `${((chest.x - COLLECTOR_GAP) / BOARD_WIDTH) * 100}%`,
          top: `${((chest.y - from) / (to - from)) * 100}%`,
        },
        onClick: () => collectorSheet(),
      },
      h('span', { class: 'camp-collector-art' }, campIcon(collector.art)),
    );
  }

  // The Kamień węgielny Warowni, like a plot: a tap shows how far the camp
  // is from the Warownia.
  function cornerstone(range = null) {
    const stone = state.character.camp.cornerstone;
    const [from, to] = range ?? [0, boardHeight(tall())];
    return h(
      'div',
      {
        class: 'camp-plot-wrap',
        style: {
          left: `${((CORNERSTONE_SPOT.x - PLOT_WIDTH / 2) / BOARD_WIDTH) * 100}%`,
          top: `${((CORNERSTONE_SPOT.y - from - PLOT_HEIGHT / 2) / (to - from)) * 100}%`,
          width: `${(PLOT_WIDTH / BOARD_WIDTH) * 100}%`,
        },
      },
      h(
        'button',
        { type: 'button', class: 'camp-plot camp-cornerstone', 'data-guide': 'plot-cornerstone', 'aria-label': stone.name, onClick: () => cornerstoneSheet() },
        cornerstoneArt(),
        h('span', { class: 'camp-plot-label' }, h('span', { text: stone.label })),
      ),
    );
  }

  // A plot's place on the board in its units.
  const spotOf = (id) => campPlots(tall())[id] ?? { x: BOARD_WIDTH / 2, y: boardHeight(tall()) / 2 };

  // A plot on the board, or in the part of it `range` holds.
  function plot(building, running, range = null) {
    const [from, to] = range ?? [0, boardHeight(tall())];
    const spot = spotOf(building.id);
    const underway = running?.buildingId === building.id;
    const waiting = !underway && building.queued.length > 0;
    const empty = building.level === 0;
    const hash = `${CAMP}/${building.id}`;
    const said = [empty ? t('Pusty plac: {name}', { name: building.name }) : levelOf(building.name, building.level), underway && t('trwa budowa'), waiting && t('w kolejce')];
    const link = h(
      'a',
      {
        class: `camp-plot${empty ? ' camp-plot--empty' : ''}`,
        href: hash,
        'data-guide': `plot-${building.id}`,
        'aria-label': said.filter(Boolean).join(', '),
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      plotArt(building.id, { level: building.level, building: underway, tier: building.look }),
      building.id === 'campfire' && !empty && campfireLight(buildingTier(building.level)),
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
          top: `${((spot.y - from - PLOT_HEIGHT / 2) / (to - from)) * 100}%`,
          width: `${(PLOT_WIDTH / BOARD_WIDTH) * 100}%`,
        },
      },
      link,
      underway && timer(running),
      waiting && h('span', { class: 'camp-plot-timer camp-plot-timer--queued', 'aria-hidden': 'true' }, icon('hourglass', { size: 12 }), t('w kolejce')),
      building.production && !building.production.paused && !state.character.camp.collector?.owned && bubble(building, spot.bubble),
    );
  }

  // The campfire's flickering glow and its smoke over its picture, at the
  // fire of each of its looks (styles.css); still with the animations off.
  function campfireLight(tier) {
    return h(
      'span',
      { class: `camp-fire camp-fire--${tier}`, 'aria-hidden': 'true' },
      h('span', { class: 'camp-fire-glow' }),
      h('span', { class: 'camp-smoke' }),
      h('span', { class: 'camp-smoke camp-smoke--late' }),
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
  // `place` 'side' puts it at the plot's side instead of its corner. None
  // with the Zbieracz Systemu, who collects as it goes (753 A).
  function bubble(building, place) {
    const store = building.production;
    const amount = h('span', {});
    const button = h(
      'button',
      {
        type: 'button',
        class: `camp-bubble${place === 'side' ? ' camp-bubble--side' : ''}`,
        onClick: (event) => withButton(event.currentTarget, () => collectStore(building)),
      },
      resourceArt(store.resource, 14),
      amount,
    );
    ticks.push((now) => {
      const held = storeAmount(store, now);
      const full = held >= store.capacity;
      button.hidden = held < 1;
      amount.textContent = `+${formatNumber(held)}`;
      button.classList.toggle('camp-bubble--full', full);
      const what = { resource: resourceName(store.resource).toLowerCase(), amount: held };
      button.setAttribute('aria-label', full ? t('Zbierz: {resource} +{amount}, magazyn pełny', what) : t('Zbierz: {resource} +{amount}', what));
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
  return {
    update: render,
    tick,
    unmount() {
      window.removeEventListener('resize', fitBoard);
      stopLayout();
    },
  };
}

// A building's screen. Building comes first, at the top, so nobody scrolls
// down for it (the author's wish): the build under way, the levels waiting
// and the next level with the cost and "Zbuduj" or "Ulepsz". Below them the
// Stół rozbiórki's own work, its materials, queue and parts (the author:
// its basic function higher up), then the picture, what the building gives
// now and its store, trade or exchange.
function mountBuilding(container, id) {
  let ticks = [];
  let shownBuild = null;
  fireChoice = null;
  exchangeChoice.amount = null;
  // The Kwatery's companions (companions.js), mounted once and kept while
  // the screen redraws itself, so a redraw does not load them again.
  let quarters = null;
  const quartersPanel = () => {
    if (!quarters) {
      const holder = h('div', { class: 'quarters-companions', 'data-guide': 'quarters-companions' });
      quarters = { holder, ...mountQuarters(holder) };
    } else quarters.refresh();
    return quarters.holder;
  };

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
        building.level === 0 ? t('Pusty plac') : t('Poziom {level} z {max}', { level: building.level, max: building.maxLevel }),
        h(
          'button',
          { type: 'button', class: 'button button--system back-button', onClick: () => leaveView(CAMP, 1, HISTORY_KEY) },
          icon('back', { size: 20 }),
          t('Powrót'),
        ),
      ),
      testTools(running),
      underway && constructionPanel(running, ticks),
      waitingNote(id),
      nextLevel(building),
      // At the camp's top with more to come in the Warownia (618).
      building.beyond && h('p', { class: 'muted small', text: building.beyond }),
      building.crafts && craftTableSection(ticks, salvagePicker),
      building.upgrades && upgradeList(building),
      // The Warownia's buildings (fortress.js).
      building.training && trainingSection(building.training, ticks),
      building.blessing && blessingSection(building.blessing),
      building.greenhouse && greenhouseSection(building.greenhouse, ticks),
      building.gearSets && gearSetsSection(building.gearSets),
      // The companions live in the Kwatery once they stand (the author: "Po
      // zwerbowaniu postac powinna [...] pojawić się w Kwaterach").
      id === 'quarters' && building.level > 0 && quartersPanel(),
      h(
        'article',
        { class: 'card building-view', 'aria-label': building.name },
        !own && h('div', { class: 'building-art' }, plotArt(id, { level: building.level, building: underway, tier: building.look })),
        h('p', { class: 'region-description', text: building.description }),
        building.effect && h('p', { class: 'building-effect' }, h('strong', { text: t('Teraz: ') }), building.effect),
        building.production && storeView(building),
        building.trade && tradeView(building.trade),
        building.shop && saleView(),
        building.shop && shopView(building.shop),
        building.exchange && exchangeView(building.exchange),
      ),
    );
    tick(serverNow());
  }

  // The Kowadło's work: the character's items, worn first, each opening its
  // card with the upgrade, as from the backpack (character.js). The author:
  // items are upgraded "nie tylko na Kowadle, ale i z pozycji samego
  // przedmiotu".
  function upgradeList(building) {
    const character = state.character;
    const items = [
      ...Object.values(character.equipment)
        .filter(Boolean)
        .map((item) => ({ item, equipped: true })),
      ...character.bag.map((item) => ({ item, equipped: false })),
    ];
    return h(
      'section',
      { class: 'card anvil-items', 'aria-labelledby': 'anvil-items' },
      h('h2', { class: 'card-title', id: 'anvil-items', text: t('Ulepszanie przedmiotów') }),
      h('p', {
        class: 'muted',
        text:
          building.level > 0
            ? t('Wybierz przedmiot, żeby go ulepszyć. Kowadło ulepsza do +{level}.', { level: building.level })
            : t('Zbuduj Kowadło, żeby ulepszać przedmioty. Ulepszysz je tu albo z karty przedmiotu w plecaku.'),
      }),
      items.length === 0
        ? h('p', { class: 'muted', text: t('Nie masz jeszcze przedmiotów.') })
        : h(
            'ul',
            { class: 'item-list' },
            items.map(({ item, equipped }) =>
              h(
                'li',
                {},
                h(
                  'button',
                  // Tapped here to be upgraded: the card opens with the Kowadło unfolded.
                  { type: 'button', class: 'item-row', onClick: () => itemSheet(item, { equipped, anvil: true }) },
                  itemSummary(item),
                  equipped && h('span', { class: 'chip', text: t('założony') }),
                ),
              ),
            ),
          ),
    );
  }

  // The store of a production building: how full it is, when it fills up,
  // and "Zbierz"; with the Zbieracz Systemu, that he collects it as it goes
  // (753 A), with no "Zbierz": what is made waits only for the server's next
  // answer, at most about a minute (app.js: watchStores).
  function storeView(building) {
    const store = building.production;
    const collector = state.character.camp.collector?.owned ? state.character.camp.collector : null;
    const amount = h('strong', {});
    const fillBar = h('div', { class: 'bar-fill bar-fill--gold' });
    const hint = h('p', { class: 'store-hint' });
    let collecting = false; // the tick must not enable the button mid-request
    const button = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Zbierz'),
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
        ? t('Rozbudowa: produkcja ruszy po jej końcu.')
        : held >= store.capacity
          ? t('Magazyn pełny: produkcja stoi do zebrania.')
          : t('Pełny za {time}.', { time: formatCountdown(storeFullAt(store) - now) });
      hint.hidden = Boolean(collector) && !store.paused;
      button.disabled = collecting || held < 1;
    });
    return h(
      'div',
      { class: 'store' },
      h(
        'p',
        { class: 'store-head' },
        resourceArt(store.resource, 18),
        h('span', { text: t('Magazyn: {resource}', { resource: resourceName(store.resource) }) }),
        amount,
      ),
      h('div', { class: 'bar' }, fillBar),
      hint,
      collector && h('p', { class: 'store-hint', text: collector.texts.hint }),
      !collector && button,
    );
  }

  // The fire spirit: gold for a resource at a tap, up to the pieces left
  // today, and the price and the pieces a day of the next level. The slider,
  // with a button for one piece more or less, picks how many (the author:
  // "Limit wymian u ducha ognia ustal na jednostki, nie na liczby wymian").
  function tradeView(trade) {
    const pieces = (count) => countOf(count, 'sztuka', 'sztuki', 'sztuk');
    const head = [
      h('h2', { class: 'fire-trade-title', text: trade.title }),
      h('p', { class: 'fire-trade-text', text: trade.text }),
      h('p', { class: 'store-head' }, h('span', { text: t('Cena') }), h('strong', { text: t('{gold} złota za sztukę', { gold: formatNumber(trade.unitGold) }) })),
    ];
    const next =
      trade.next &&
      h('p', {
        class: 'store-hint',
        text: t('Na poziomie {level}: {gold} złota za sztukę, do {pieces} dziennie.', { level: trade.next.level, gold: formatNumber(trade.next.unitGold), pieces: pieces(trade.next.perDay) }),
      });
    if (trade.left < 1) {
      return h(
        'section',
        { class: 'fire-trade', 'aria-label': trade.title },
        ...head,
        h('p', { class: 'store-hint', text: t('Na dziś duch ognia nie przyjmie już złota. Wróć po północy.') }),
        next,
      );
    }
    // One piece, or the last choice while the screen is open.
    let amount = Math.max(1, Math.min(trade.left, fireChoice ?? 1));
    const value = h('output', { class: 'fire-trade-amount', 'aria-live': 'off' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider fire-trade-slider',
      min: 1,
      max: trade.left,
      step: 1,
      value: amount,
      'aria-label': t('Ile sztuk wymienić'),
      disabled: trade.left < 2,
      onInput: () => choose(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', {
        type: 'button',
        class: 'button button--world duration-step',
        'aria-label': label,
        text: sign < 0 ? '−' : '+',
        onClick: () => choose(amount + sign),
      });
    const less = stepButton(-1, t('O sztukę mniej'));
    const more = stepButton(1, t('O sztukę więcej'));
    const hint = h('p', { class: 'store-hint' });
    const buttons = trade.resources.map((id) => {
      const label = h('span', {});
      const button = h(
        'button',
        {
          type: 'button',
          class: 'button button--world fire-trade-button',
          onClick: (event) => withButton(event.currentTarget, () => tradeAtFire(id, amount, amount * trade.unitGold)),
        },
        resourceArt(id, 18),
        label,
      );
      return { id, button, label };
    });
    function choose(next) {
      set(next);
      fireChoice = amount;
    }
    function set(next) {
      amount = Math.max(1, Math.min(trade.left, next));
      const gold = amount * trade.unitGold;
      const short = state.character.gold < gold;
      slider.value = String(amount);
      const price = t('{pieces} za {gold} złota', { pieces: pieces(amount), gold: formatNumber(gold) });
      slider.setAttribute('aria-valuetext', price);
      slider.style.setProperty('--fill', `${((amount - 1) / Math.max(1, trade.left - 1)) * 100}%`);
      value.textContent = price;
      less.disabled = amount <= 1;
      more.disabled = amount >= trade.left;
      for (const { id, button, label } of buttons) {
        label.textContent = `${resourceName(id)} +${formatNumber(amount)}`;
        button.disabled = short;
        button.setAttribute('aria-label', t('Wymień {gold} złota na: {resource} +{amount}', { gold: formatNumber(gold), resource: resourceName(id).toLowerCase(), amount: formatNumber(amount) }));
      }
      const left = t('Na dziś zostało: {left} z {pieces}.', { left: formatNumber(trade.left), pieces: pieces(trade.perDay) });
      hint.textContent = short ? t('{left} Brakuje złota na tę wymianę.', { left }) : left;
    }
    set(amount);
    return h(
      'section',
      { class: 'fire-trade', 'aria-label': trade.title },
      ...head,
      h('p', { class: 'fire-trade-pick' }, value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('div', { class: 'fire-trade-buttons' }, buttons.map(({ button }) => button)),
      hint,
      next,
    );
  }

  // The Stół rozbiórki's exchange: the resource that goes, then how many
  // pieces of another come for it, by the slider with a button for one more
  // or less, and a button for each of the other resources; the rate now and
  // at the next level (the author: "wymiany zasobów typu kamień na drewno w
  // stosunku 1 za 10 i aż do 1 do 1 przy poziomie 10-tym").
  function exchangeView(exchange) {
    const section = h('section', { class: 'fire-trade resource-exchange', 'aria-label': exchange.title });
    const have = (id) => state.character.resources[id] ?? 0;
    const pieces = (count) => countOf(count, 'sztuka', 'sztuki', 'sztuk');
    function draw() {
      // The last resource given, or the one there is most of.
      const from = exchange.resources.includes(exchangeChoice.from)
        ? exchangeChoice.from
        : exchange.resources.reduce((best, id) => (have(id) > have(best) ? id : best));
      const most = Math.floor(have(from) / exchange.rate);
      const picker = h(
        'div',
        { class: 'segmented segmented--three', role: 'group', 'aria-label': t('Oddajesz') },
        exchange.resources.map((id) =>
          h(
            'button',
            {
              type: 'button',
              class: 'segmented-option exchange-option',
              'aria-pressed': String(id === from),
              onClick: () => {
                exchangeChoice.from = id;
                draw();
              },
            },
            h('span', { class: 'exchange-option-name' }, resourceArt(id, 16), resourceName(id)),
            h('small', { text: t('masz {count}', { count: formatNumber(have(id)) }) }),
          ),
        ),
      );
      const head = [
        h('h2', { class: 'fire-trade-title', text: exchange.title }),
        h('p', { class: 'fire-trade-text', text: exchange.text }),
        h('p', { class: 'store-head' }, h('span', { text: t('Stawka') }), h('strong', { text: t('{pieces} za 1', { pieces: pieces(exchange.rate) }) })),
        h('p', { class: 'exchange-label', text: t('Oddajesz') }),
        picker,
      ];
      const next = exchange.next && h('p', { class: 'store-hint', text: t('Na poziomie {level}: {pieces} za 1.', { level: exchange.next.level, pieces: pieces(exchange.next.rate) }) });
      if (most < 1) {
        fill(
          section,
          ...head,
          h('p', { class: 'store-hint', text: t('Za mało: {resource}. Jedna sztuka innego zasobu to {pieces}.', { resource: resourceName(from).toLowerCase(), pieces: pieces(exchange.rate) }) }),
          next,
        );
        return;
      }
      let amount = Math.max(1, Math.min(most, exchangeChoice.amount ?? 1));
      const value = h('output', { class: 'fire-trade-amount', 'aria-live': 'off' });
      const slider = h('input', {
        type: 'range',
        class: 'duration-slider fire-trade-slider',
        min: 1,
        max: most,
        step: 1,
        value: amount,
        'aria-label': t('Ile sztuk wziąć'),
        disabled: most < 2,
        onInput: () => choose(Number(slider.value)),
      });
      const stepButton = (sign, label) =>
        h('button', {
          type: 'button',
          class: 'button button--world duration-step',
          'aria-label': label,
          text: sign < 0 ? '−' : '+',
          onClick: () => choose(amount + sign),
        });
      const less = stepButton(-1, t('O sztukę mniej'));
      const more = stepButton(1, t('O sztukę więcej'));
      const buttons = exchange.resources
        .filter((id) => id !== from)
        .map((id) => {
          const label = h('span', {});
          const button = h(
            'button',
            {
              type: 'button',
              class: 'button button--world fire-trade-button',
              onClick: (event) => withButton(event.currentTarget, () => exchangeResources(from, id, amount, amount * exchange.rate)),
            },
            resourceArt(id, 18),
            label,
          );
          return { id, button, label };
        });
      function choose(nextAmount) {
        amount = Math.max(1, Math.min(most, nextAmount));
        exchangeChoice.amount = amount;
        const given = amount * exchange.rate;
        slider.value = String(amount);
        const price = t('{pieces} za {given} × {resource}', { pieces: pieces(amount), given: formatNumber(given), resource: resourceName(from) });
        slider.setAttribute('aria-valuetext', price);
        slider.style.setProperty('--fill', `${((amount - 1) / Math.max(1, most - 1)) * 100}%`);
        value.textContent = price;
        less.disabled = amount <= 1;
        more.disabled = amount >= most;
        for (const { id, button, label } of buttons) {
          label.textContent = `${resourceName(id)} +${formatNumber(amount)}`;
          button.setAttribute(
            'aria-label',
            t('Wymień {given} × {from} na {amount} × {to}', { given: formatNumber(given), from: resourceName(from), amount: formatNumber(amount), to: resourceName(id) }),
          );
        }
      }
      choose(amount);
      fill(
        section,
        ...head,
        h('p', { class: 'fire-trade-pick' }, value),
        h('div', { class: 'duration-row' }, less, slider, more),
        h('div', { class: 'fire-trade-buttons' }, buttons.map(({ button }) => button)),
        next,
      );
    }
    draw();
    return section;
  }

  // The scrap dealer buys the bag's items too: all up to a rarity at once
  // here, or one, an upgraded one too, from its card in the bag (the
  // author's words).
  function saleView() {
    return h(
      'section',
      { class: 'fire-trade scrap-sale', 'aria-label': t('Skup przedmiotów') },
      h('h2', { class: 'fire-trade-title', text: t('Skup przedmiotów') }),
      h('p', { class: 'fire-trade-text', text: t('Złomiarz kupi zbędne przedmioty z plecaka. Sprzedasz u niego przedmioty także bezpośrednio z pozycji plecaka.') }),
      h('button', { type: 'button', class: 'button button--world', onClick: scrapperSheet, text: t('Sprzedaj zbędne przedmioty') }),
    );
  }

  // The scrap dealer's counter: every part he has, with its price, how many
  // the character has and he still sells today, "Kup 1" and "Kup 10", and
  // what the next level adds.
  function shopView(shop) {
    const { gold } = state.character;
    return h(
      'section',
      { class: 'fire-trade scrap-shop', 'aria-label': shop.title },
      h('h2', { class: 'fire-trade-title', text: shop.title }),
      h('p', { class: 'fire-trade-text', text: shop.text }),
      h(
        'ul',
        { class: 'craft-list' },
        shop.parts.map(({ id, price, daily, left }) => {
          const part = state.character.crafting.parts.find((own) => own.id === id);
          return h(
            'li',
            { class: 'craft-row shop-row' },
            h('span', { class: 'craft-art' }, materialIcon(id, 32)),
            h(
              'span',
              { class: 'craft-text' },
              h('span', { class: 'item-name', vars: { '--rarity': part.color }, text: part.name }),
              h(
                'span',
                { class: 'item-meta shop-meta' },
                h('strong', { class: 'shop-price', text: t('{gold} złota', { gold: formatNumber(price) }) }),
                h('span', { text: t('masz {count}', { count: formatNumber(part.count) }) }),
              ),
              h('span', { class: 'item-meta', text: t('Dziś zostało: {left} z {all}', { left: formatNumber(left), all: formatNumber(daily) }) }),
            ),
            h(
              'span',
              { class: 'shop-buttons' },
              shop.counts.map((count) =>
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small shop-button',
                  disabled: gold < price * count || count > left,
                  'aria-label': t('Kup {name}: {count} za {gold} złota', { name: part.name, count: formatNumber(count), gold: formatNumber(price * count) }),
                  text: t('Kup {count}', { count }),
                  onClick: (event) => withButton(event.currentTarget, () => buyParts(id, count)),
                }),
              ),
            ),
          );
        }),
      ),
      shop.next && h('p', { class: 'store-hint', text: shopNextText(shop.next) }),
    );
  }

  // This building's levels waiting in the queue, with the times they start
  // and "Anuluj".
  function waitingNote(id) {
    const waiting = state.character.camp.queue.filter((entry) => entry.buildingId === id);
    if (waiting.length === 0) return null;
    return systemPanel(
      ...waiting.map((entry) =>
        h(
          'div',
          { class: 'build-queue-item' },
          h('p', { class: 'system-text', text: t('W kolejce: poziom {level}, start {when}.', { level: entry.level, when: moment(entry.startsAt) }) }),
          cancelButton(entry),
        ),
      ),
    );
  }

  // The level after those under way and waiting. With a build under way it
  // joins the queue, as long as there is room in it.
  function nextLevel(building) {
    const next = building.next;
    const own = building.id === campOf().id;
    if (!next) return h('p', { class: 'muted', text: building.evolution ?? (building.queued.length > 0 ? t('Najwyższy poziom jest już w kolejce.') : t('Najwyższy poziom.')) });
    const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.amount]));
    // What is missing, named (311).
    const lacking = costShortfall(next.cost);
    const missing = lacking.length > 0;
    const busy = underWay();
    const full = busy >= state.character.camp.queueSize;
    const label = full
      ? t('Kolejka budowy pełna')
      : missing
        ? t('Brakuje: {missing}', { missing: lacking.join(', ') })
        : busy > 0
          ? t('Dodaj do kolejki: poziom {level}', { level: next.level })
          : own
            ? t('Rozwiń obóz do poziomu {level}', { level: next.level })
            : building.level === 0
              ? t('Zbuduj')
              : t('Ulepsz do poziomu {level}', { level: next.level });
    return h(
      'section',
      { class: 'card building-next-card', 'aria-labelledby': 'building-next' },
      h('h2', { class: 'card-title', id: 'building-next', text: next.level === 1 ? t('Budowa') : t('Poziom {level}', { level: next.level }) }),
      h('p', { class: 'building-next', text: next.effect }),
      h(
        'ul',
        { class: 'cost-list', 'aria-label': t('Koszt') },
        Object.entries(next.cost).map(([resource, amount]) =>
          h(
            'li',
            { class: `cost${(have[resource] ?? 0) < amount ? ' cost--missing' : ''}` },
            resourceArt(resource, 16),
            h('span', { text: resourceName(resource) }),
            h('strong', { text: `${formatNumber(have[resource] ?? 0)} / ${formatNumber(amount)}` }),
          ),
        ),
      ),
      h(
        'p',
        { class: 'building-time' },
        icon('hourglass', { size: 16 }),
        own ? t('Czas rozwoju: {time}', { time: formatMinutes(next.minutes) }) : t('Czas budowy: {time}', { time: formatMinutes(next.minutes) }),
      ),
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
          text: t('Naraz można mieć {builds}: trwającą i czekające w kolejce. Kolejna zmieści się, gdy któraś się skończy.', {
            builds: countOf(state.character.camp.queueSize, 'budowę', 'budowy', 'budów'),
          }),
        }),
      !full &&
        missing &&
        h('p', {
          class: 'system-hint',
          text: own
            ? t('Złoto zdobędziesz na eksploracjach.')
            : t('Złoto i zasoby zdobędziesz na eksploracjach. Tartak, Kamieniołom i Kopalnia wytwarzają zasoby w obozie.'),
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
  return {
    update: render,
    tick,
    unmount() {
      quarters?.unmount();
    },
  };
}
