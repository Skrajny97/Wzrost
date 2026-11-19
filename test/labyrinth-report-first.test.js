// The Labirynt's fights with their report first (src/client/labyrinth.js,
// src/client/screens/report.js; DECISIONS.md, „Labirynt: raport walki od
// razu”, 19.11.2026), on just enough of a page (helpers/narrator-page.js),
// with the animations off as there: a player's report (0.4.56): „przy
// walce z bossem poziomu 1 i 2 nie wyświetla się raport z walki tylko po
// wygranej od razu przeskakuje do kolejnego poziomu i wyboru artefaktu”.
// The guardian's result came in a sheet that the browser's late close of
// the room's sheet before it emptied (ui.js), and the report opened only
// from that sheet. Now every fight's report opens first, and the result,
// the blessing's choice and the next level come on the board after it,
// unless "Raport walki od razu" is off. The names are synthetic.

import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const DAY = '2026-11-19';
const REPORT_ID = 41;

let state;
let labyrinth;
let ui;
let dialog;
let answers;
// The boards and reports mounted by a test, unmounted after it even when it
// fails: the board's clock would keep the test's process alive.
const mounted = [];

const levels = (cleared) =>
  ['Poziom 1', 'Poziom 2', 'Poziom 3', 'Piekielny'].map((name, index) => ({ number: index + 1, id: name, name, hell: index === 3, cleared: index < cleared, open: index <= cleared }));
const foe = (name, level) => ({ monsterId: 'wolf', name, level });
// Six rows of one fight each, the guardian over them.
const map = [...Array.from({ length: 6 }, () => [{ type: 'fight', links: [0], foes: [foe('Wilk', 30)], danger: null, shards: null }]), [{ type: 'guardian', links: [], foes: [foe('Odyniec', 31)], danger: 'even', shards: null }]];
const rooms = [
  { id: 'fight', name: 'Walka', text: 'Zwykła walka.' },
  { id: 'guardian', name: 'Strażnik', text: 'Strażnik poziomu.' },
];
const blessing = (id, name) => ({ id, name, text: `${name}: działa do końca dnia.` });
const view = (fields) => ({
  day: DAY,
  level: 1,
  charLevel: 30,
  levels: levels(0),
  over: null,
  started: true,
  map,
  row: 5,
  room: 0,
  path: [0, 0, 0, 0, 0, 0],
  reachable: [0],
  fighters: [{ key: 'me', name: 'Próbna', classId: 'warrior', appearance: 'female', companion: false, hp: 900, maxHp: 1000 }],
  blessings: [],
  pending: null,
  gains: { xp: 0, gold: 0, shards: 0, artifacts: 0 },
  waiting: 0,
  reset: null,
  rooms,
  ...fields,
});
// Before the guardian of the first level, and the second level after it,
// with the guardian's blessings to choose.
const beforeGuardian = () => view();
const secondLevel = () =>
  view({
    level: 2,
    levels: levels(1),
    row: -1,
    room: null,
    path: [],
    pending: { kind: 'blessing', from: 'guardian', choices: [blessing('might', 'Moc Systemu'), blessing('mist', 'Mgła'), blessing('care', 'Opieka')] },
    gains: { xp: 0, gold: 0, shards: 0, artifacts: 1 },
    waiting: 1,
  });
const guardianWon = () => ({
  room: {
    type: 'guardian',
    won: true,
    gains: { xp: 0, gold: 0, shards: 0 },
    artifact: { name: 'Mały Artefakt ziemi', element: 'earth', color: '#9c7a4a', rarityColor: '#5aa0e0', rarityName: 'rzadki' },
    lines: ['Strażnik zostawia Artefakt: Mały Artefakt ziemi. Czeka w Skrytce Rdzenia.', 'Poziom 1 zdobyty.'],
    reportId: REPORT_ID,
    over: null,
  },
  report: { id: REPORT_ID, createdAt: Date.now(), labyrinth: { levelName: 'Poziom 1', typeName: 'Strażnik', won: true, companions: [] } },
  labyrinth: secondLevel(),
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
const sheetText = () => (dialog.open ? dialog.textContent : null);

before(async () => {
  await page.ready;
  ({ state } = page);
  state.content = { ...state.content, resources: [] };
  // What the fake page lacks for the board and its sheets: a node's first
  // child (the fighters' HP bars) and the element type the sheet asks the
  // focus about.
  Object.defineProperty(globalThis.Node.prototype, 'firstChild', {
    configurable: true,
    get() {
      return this.childNodes[0] ?? null;
    },
  });
  globalThis.HTMLElement ??= globalThis.Node;
  // The game's one sheet (index.html's #sheet), found as the page finds it.
  dialog = globalThis.document.createElement('dialog');
  page.places.set('#sheet', [dialog]);
  page.places.set('#sheet[open]', {
    get 0() {
      return dialog.open ? dialog : undefined;
    },
  });
  // The server: today's Labirynt, and the guardian's room fought.
  globalThis.fetch = async (path, options) => {
    page.sent.push({ method: options.method, path });
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
  labyrinth.setLabyrinthReport(true);
});

afterEach(() => {
  for (const screen of mounted.splice(0)) screen.unmount();
});

// The board mounted, its Labirynt come from the server.
async function board(navigated) {
  const screen = globalThis.document.createElement('main');
  const one = labyrinth.mountLabyrinthBoard(screen, { navigate: (hash) => navigated.push(hash) });
  mounted.push(one);
  await settled();
  return { screen, mounted: one };
}

// The lit platform of a room of `type` tapped, and "Wejdź" in its sheet.
async function enterRoom(screen, type = 'guardian') {
  const tile = screen.find((node) => node.tagName === 'BUTTON' && node.classList.contains(`lab-tile--${type}`) && node.classList.contains('lab-tile--open'))[0];
  assert.ok(tile, `a ${type} open to enter`);
  tile.click();
  const [enter] = buttons(dialog, 'Wejdź');
  assert.ok(enter, `the room's sheet: ${sheetText()}`);
  enter.click();
  await settled();
  await settled();
}
const enterGuardian = (screen) => enterRoom(screen, 'guardian');

const barLevel = (screen) => screen.find((node) => node.classList.contains('lab-bar-level'))[0]?.textContent ?? '';

describe('the sheet', () => {
  test("a sheet opened again at once keeps its words when the browser's close of the one before comes late", () => {
    const words = (text) => {
      const line = globalThis.document.createElement('p');
      line.textContent = text;
      return line;
    };
    ui.openSheet(words('Pierwszy'));
    ui.closeSheet();
    ui.openSheet(words('Drugi'));
    // The browser fires the close of the first a moment after it.
    dialog.dispatchEvent({ type: 'close' });
    assert.equal(dialog.open, true);
    assert.ok(dialog.textContent.includes('Drugi'), dialog.textContent);
    // A sheet that stays closed is emptied, as before.
    ui.closeSheet();
    dialog.dispatchEvent({ type: 'close' });
    assert.equal(dialog.textContent, '');
  });
});

describe("the Labirynt's fights with their report first", () => {
  test('the guardian beaten: its report opens first; the result, the blessings and the next level come on the board after it', async () => {
    let current = beforeGuardian;
    answers = { 'GET /api/labyrinth': () => ({ labyrinth: current() }), 'POST /api/labyrinth/room': () => ((current = secondLevel), guardianWon()) };
    const navigated = [];
    const first = await board(navigated);
    assert.equal(barLevel(first.screen).startsWith('Poziom 1'), true);
    await enterGuardian(first.screen);
    assert.equal(page.toastBox.textContent, '', 'no refusal');
    // The report, on its own screen, as just fought; nothing over the board.
    assert.deepEqual(navigated, [`#/raport/${REPORT_ID}`]);
    assert.equal(state.freshReport, String(REPORT_ID));
    assert.equal(sheetText(), null, 'no result or blessing before the report');
    // The board stays on the level the guardian was beaten on.
    assert.ok(barLevel(first.screen).startsWith('Poziom 1'), barLevel(first.screen));
    first.mounted.unmount();

    // The report closed or skipped: back on the board, the next level, and
    // the result with the blessings to choose.
    const back = await board(navigated);
    assert.ok(barLevel(back.screen).startsWith('Poziom 2'), barLevel(back.screen));
    const shown = sheetText() ?? '';
    for (const words of ['Komnata zdobyta', 'Poziom 1 zdobyty.', 'Mały Artefakt ziemi', 'Obejrzyj walkę', 'Moc Systemu', 'Mgła', 'Opieka']) assert.ok(shown.includes(words), `${words}: ${shown}`);
    // "Obejrzyj walkę" opens the report again.
    buttons(dialog, 'Obejrzyj walkę')[0].click();
    assert.equal(navigated.at(-1), `#/raport/${REPORT_ID}`);
    back.mounted.unmount();

    // The result comes once: the board again shows only the choice waiting.
    const again = await board(navigated);
    assert.ok(!(sheetText() ?? '').includes('Komnata zdobyta'), sheetText());
    assert.ok((sheetText() ?? '').includes('Moc Systemu'), sheetText());
  });

  test('an ordinary fight: its report first, then its XP and gold on the board with "Obejrzyj walkę" and "Dalej"', async () => {
    let current = () => view({ row: -1, room: null, path: [] });
    const inFirstRoom = () => view({ row: 0, room: 0, path: [0] });
    answers = {
      'GET /api/labyrinth': () => ({ labyrinth: current() }),
      'POST /api/labyrinth/room': () => {
        current = inFirstRoom;
        return {
          room: { type: 'fight', won: true, gains: { xp: 120, gold: 30, shards: 0 }, artifact: null, lines: [], reportId: 42, over: null },
          report: { id: 42, createdAt: Date.now(), labyrinth: { levelName: 'Poziom 1', typeName: 'Walka', won: true, companions: [] } },
          labyrinth: inFirstRoom(),
        };
      },
    };
    const navigated = [];
    const first = await board(navigated);
    await enterRoom(first.screen, 'fight');
    assert.equal(page.toastBox.textContent, '', 'no refusal');
    assert.deepEqual(navigated, ['#/raport/42']);
    assert.equal(sheetText(), null);
    first.mounted.unmount();
    await board(navigated);
    const shown = sheetText() ?? '';
    for (const words of ['Komnata zdobyta', '+120 XP, +30 złota.', 'Obejrzyj walkę', 'Dalej']) assert.ok(shown.includes(words), `${words}: ${shown}`);
  });

  test('the result waits only for the character and the day it came in', async () => {
    let current = beforeGuardian;
    answers = { 'GET /api/labyrinth': () => ({ labyrinth: current() }), 'POST /api/labyrinth/room': () => ((current = secondLevel), guardianWon()) };
    const navigated = [];
    const first = await board(navigated);
    await enterGuardian(first.screen);
    first.mounted.unmount();
    // Another character of the account opens its board.
    state.character = { ...character(), id: 8, name: 'Druga' };
    await board(navigated);
    assert.ok(!(sheetText() ?? '').includes('Komnata zdobyta'), sheetText());
  });

  test('with "Raport walki od razu" off the result comes at once on the board, as before, the report under "Obejrzyj walkę"', async () => {
    labyrinth.setLabyrinthReport(false);
    let current = beforeGuardian;
    answers = { 'GET /api/labyrinth': () => ({ labyrinth: current() }), 'POST /api/labyrinth/room': () => ((current = secondLevel), guardianWon()) };
    const navigated = [];
    const first = await board(navigated);
    await enterGuardian(first.screen);
    assert.deepEqual(navigated, []);
    const shown = sheetText() ?? '';
    for (const words of ['Komnata zdobyta', 'Obejrzyj walkę', 'Moc Systemu']) assert.ok(shown.includes(words), `${words}: ${shown}`);
    assert.ok(barLevel(first.screen).startsWith('Poziom 2'), barLevel(first.screen));
    buttons(dialog, 'Obejrzyj walkę')[0].click();
    assert.deepEqual(navigated, [`#/raport/${REPORT_ID}`]);
  });
});

describe("the report of a Labirynt's fight just fought", () => {
  const report = () => ({
    labyrinth: { levelName: 'Poziom 1', typeName: 'Strażnik', companions: [] },
    endsAt: Date.now(),
    minutes: 0,
    result: 'success',
    resultText: 'Komnata zdobyta.',
    summary: { xp: 0, classXp: 0, gold: 0, resources: {}, materials: [], fights: 1, hpStart: 900, hpEnd: 700, maxHp: 1000, timePoints: 0, bestFind: null },
    system: [],
    fights: [],
    items: [],
    entries: [],
  });

  test('"Pomiń raport" leads to the board, and the box beside it turns the report first off on this device', async () => {
    const { mountReport } = await import('../src/client/screens/report.js');
    const { reportCache } = await import('../src/client/state.js');
    reportCache.set('labirynt-fresh', report());
    state.freshReport = 'labirynt-fresh';
    const screen = globalThis.document.createElement('main');
    const first = mountReport(screen, { params: { id: 'labirynt-fresh' }, navigate() {} });
    mounted.push(first);
    const skip = screen.find((node) => node.tagName === 'A' && node.textContent === 'Pomiń raport');
    assert.equal(skip.length, 1);
    assert.equal(skip[0].getAttribute('href'), '#/labirynt');
    const [box] = screen.find((node) => node.tagName === 'INPUT' && node.getAttribute('id') === 'labyrinth-report');
    assert.ok(box, 'the box "Raport walki od razu"');
    assert.notEqual(box.getAttribute('checked'), null, 'ticked while on');
    assert.ok(screen.textContent.includes('Raport walki od razu'));
    box.checked = false;
    box.dispatchEvent({ type: 'change' });
    assert.equal(labyrinth.labyrinthReportOn(), false);
    first.unmount();
    // Off, the next report opened from "Obejrzyj walkę" has the box unticked,
    // to turn it on again.
    mounted.push(mountReport(screen, { params: { id: 'labirynt-fresh' }, navigate() {} }));
    const [unticked] = screen.find((node) => node.tagName === 'INPUT' && node.getAttribute('id') === 'labyrinth-report');
    assert.equal(unticked.getAttribute('checked'), null);
  });

  test('opened from the Dziennik, the report has neither', async () => {
    const { mountReport } = await import('../src/client/screens/report.js');
    const { reportCache } = await import('../src/client/state.js');
    reportCache.set('labirynt-old', report());
    state.freshReport = null;
    const screen = globalThis.document.createElement('main');
    mounted.push(mountReport(screen, { params: { id: 'labirynt-old' }, navigate() {} }));
    assert.equal(screen.find((node) => node.tagName === 'A' && node.textContent === 'Pomiń raport').length, 0);
    assert.equal(screen.find((node) => node.tagName === 'INPUT' && node.getAttribute('id') === 'labyrinth-report').length, 0);
    // "Wróć do Labiryntu" stays at its foot, as before.
    assert.equal(screen.find((node) => node.tagName === 'A' && node.textContent === 'Wróć do Labiryntu').length, 1);
  });
});
