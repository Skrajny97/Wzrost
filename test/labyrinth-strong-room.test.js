// A strong room of the Labirynt asks before the party goes in
// (src/client/labyrinth.js; DECISIONS.md, „Labirynt: Poziom 1 znów do
// przejścia”, 26.11.2026; the author: „I co zrobiłeś z Labiryntem, że teraz
// ludzie padają jak muchy na pierwszym poziomie już”), on just enough of a
// page (helpers/narrator-page.js): „Wejdź” in the room's sheet asks
// „Wejść do silnej komnaty?” with „Wejdź” and „Wybierz inną” for a strong
// room only, and only „Wejdź” there sends the party in. An ordinary room
// goes in at once, as before. The names are synthetic.

import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const DAY = '2026-11-26';

let state;
let labyrinth;
let ui;
let dialog;
let answers;
const mounted = [];

const levels = () => ['Poziom 1', 'Poziom 2', 'Poziom 3', 'Piekielny'].map((name, index) => ({ number: index + 1, id: name, name, hell: index === 3, cleared: index < 1, open: index <= 1 }));
const foe = (name, level) => ({ monsterId: 'wolf', name, level });
// Poziom 2, the party in the first row's room, two rooms open in the
// second row: an ordinary fight and a strong one.
const fight = (strong, danger) => ({ type: 'fight', links: [0], foes: [foe('Wilk', 60)], danger, shards: null, spent: false, strong });
const map = [
  [{ type: 'fight', links: [0, 1], foes: [foe('Wilk', 60)], danger: null, shards: null, spent: false, strong: false }],
  [fight(false, 'easy'), fight(true, 'deadly')],
  ...Array.from({ length: 4 }, () => [fight(false, 'easy')]),
  [{ type: 'guardian', links: [], foes: [foe('Odyniec', 61)], danger: 'even', shards: null, spent: false, strong: false }],
];
const view = () => ({
  day: DAY,
  level: 2,
  charLevel: 60,
  levels: levels(),
  over: null,
  started: true,
  map,
  row: 0,
  room: 0,
  path: [0],
  reachable: [0, 1],
  fighters: [{ key: 'me', name: 'Próbna', classId: 'warrior', appearance: 'female', companion: false, hp: 900, maxHp: 1000 }],
  blessings: [],
  pending: null,
  gains: { xp: 0, gold: 0, shards: 0, artifacts: 0 },
  waiting: 0,
  reset: null,
  rooms: [
    { id: 'fight', name: 'Walka', text: 'Stwory Labiryntu.' },
    { id: 'guardian', name: 'Strażnik', text: 'Strażnik poziomu.' },
  ],
});

const character = () => ({
  id: 7,
  name: 'Próbna',
  level: 60,
  classLevel: 60,
  classId: 'warrior',
  appearance: 'female',
  gold: 1000,
  features: ['labyrinth'],
  huntDurations: [5],
  bag: [],
  camp: { buildings: [] },
  tutorial: null,
  activity: null,
  serverTime: Date.now(),
});

const buttons = (root, text) => root.find((node) => node.tagName === 'BUTTON' && node.textContent === text);
const sheetText = () => (dialog.open ? dialog.textContent : '');
const entered = () => page.sent.filter((one) => one.method === 'POST' && one.path === '/api/labyrinth/room');

before(async () => {
  await page.ready;
  ({ state } = page);
  state.content = { ...state.content, resources: [] };
  Object.defineProperty(globalThis.Node.prototype, 'firstChild', {
    configurable: true,
    get() {
      return this.childNodes[0] ?? null;
    },
  });
  globalThis.HTMLElement ??= globalThis.Node;
  dialog = globalThis.document.createElement('dialog');
  page.places.set('#sheet', [dialog]);
  page.places.set('#sheet[open]', {
    get 0() {
      return dialog.open ? dialog : undefined;
    },
  });
  globalThis.fetch = async (path, options) => {
    page.sent.push({ method: options.method, path, body: options.body });
    const answer = answers?.[`${options.method} ${path}`]?.();
    if (!answer) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Nie znaleziono.' } }), { status: 404 });
    return new Response(JSON.stringify({ ...answer, character: { ...state.character, serverTime: Date.now() } }), { status: 200 });
  };
  ui = await import('../src/client/ui.js');
  labyrinth = await import('../src/client/labyrinth.js');
  ui.initSheet();
});

beforeEach(() => {
  state.character = character();
  state.freshReport = null;
  ui.closeSheet();
  page.toastBox.textContent = '';
  page.sent.length = 0;
  // The report's own screen is not part of this page.
  labyrinth.setLabyrinthReport(false);
  answers = {
    'GET /api/labyrinth': () => ({ labyrinth: view() }),
    'POST /api/labyrinth/room': () => ({
      room: { type: 'fight', won: true, gains: { xp: 120, gold: 30, shards: 0 }, artifact: null, lines: [], reportId: 42, over: null },
      report: { id: 42, createdAt: Date.now(), labyrinth: { levelName: 'Poziom 2', typeName: 'Walka', won: true, companions: [] } },
      labyrinth: view(),
    }),
  };
});

afterEach(() => {
  for (const screen of mounted.splice(0)) screen.unmount();
});

async function board() {
  const screen = globalThis.document.createElement('main');
  mounted.push(labyrinth.mountLabyrinthBoard(screen, { navigate: () => {} }));
  await settled();
  return screen;
}

// The open fight of the second row, the `index`-th from the left, tapped,
// and „Wejdź” in its sheet.
async function tapEnter(screen, index) {
  const tiles = screen
    .find((node) => node.tagName === 'BUTTON' && node.classList.contains('lab-tile--fight') && node.classList.contains('lab-tile--open'))
    .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
  assert.equal(tiles.length, 2, 'two fights open');
  tiles[index].click();
  const [enter] = buttons(dialog, 'Wejdź');
  assert.ok(enter, `the room's sheet: ${sheetText()}`);
  enter.click();
  await settled();
  await settled();
}

const ASK = 'Wejść do silnej komnaty?';

describe('a strong room asks before the party goes in (26.11.2026)', () => {
  test('an ordinary room: no question, the party goes in at once', async () => {
    const screen = await board();
    await tapEnter(screen, 0);
    assert.ok(!sheetText().includes(ASK), sheetText());
    assert.equal(entered().length, 1);
    assert.equal(JSON.parse(entered()[0].body).room, 0);
  });

  test('a strong room: the question with „Wejdź” and „Wybierz inną”; „Wybierz inną” goes back to the board, „Wejdź” goes in', async () => {
    const screen = await board();
    await tapEnter(screen, 1);
    const asked = sheetText();
    for (const words of [ASK, 'To silna komnata: stwory są tu kilka razy mocniejsze niż zwykle, a porażka kończy dzisiejszy Labirynt.', 'Wejdź', 'Wybierz inną']) assert.ok(asked.includes(words), `${words}: ${asked}`);
    assert.equal(entered().length, 0, 'not in yet');
    buttons(dialog, 'Wybierz inną')[0].click();
    await settled();
    assert.equal(dialog.open, false, 'back on the board');
    assert.equal(entered().length, 0, 'still not in');

    await tapEnter(screen, 1);
    assert.ok(sheetText().includes(ASK), sheetText());
    buttons(dialog, 'Wejdź')[0].click();
    await settled();
    await settled();
    assert.equal(entered().length, 1);
    assert.equal(JSON.parse(entered()[0].body).room, 1);
    assert.equal(page.toastBox.textContent, '', 'no refusal');
  });
});
