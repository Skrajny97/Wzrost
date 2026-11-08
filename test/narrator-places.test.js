// The narrator's lines the author approved on 6.11.2026 (data/tutorial.json)
// on the page (src/client/narrator.js), on just enough of a page for its
// cards and lit places (test/helpers/narrator-page.js): the Sklep Systemu
// at the end of the introduction, and the lines of places, each told once on
// the first look at its place: the Gildia's page and tabs, the Drużyna, the
// Kamień węgielny, the Trudna wyprawa, the Skrzynia Konta and the report of a
// faint. The Zbieracz Systemu has no line (0.2.26: the player finds him
// alone). A character that was there before the
// lines were written hears them too, as it heard the places' lines of
// 0.1.70; with "Pomijaj objaśnienia narratora" on they go without a word.

import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, test } from 'node:test';
import { button, cards, intro, narratorPage, settled, tutorial } from './helpers/narrator-page.js';

const page = narratorPage();
const { sent, toastBox } = page;
let narrator;
let state;
let reportCache;
before(async () => {
  await page.ready;
  ({ narrator, state } = page);
  ({ reportCache } = await import('../src/client/state.js'));
});

const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once === true;
const PLACES = ['guild-tabs', 'guild-seat', 'guild-beast', 'guild-trials', 'guild-requests', 'guild-exchange', 'party-intro', 'fortress-stone', 'hard-hunt', 'account-chest', 'faint-first'];
// Every line kept once read but the places' of 6.11.2026: a character that
// went through all the game had to tell before them, and heard of the Sklep
// Systemu since; and one that has not heard of it yet.
const pastAll = tutorial.lines.filter((line) => kept(line) && !PLACES.includes(line.id)).map((line) => line.id);
const beforeShop = pastAll.filter((id) => id !== 'shop-system');
const words = (id) => tutorial.lines.find((line) => line.id === id).text[0];
const mark = (id) => `[data-guide="${id}"]`;
// The Próby's board: its title and the words under it.
const BOARD_HEAD = `${mark('guild-trials-board')} .fold-part-summary, ${mark('guild-trials-board')} .fold-part > p:first-of-type`;

// The elements on the page for a place's selector, gone after each test.
const drawn = [];
function place(selector, attributes = {}) {
  const element = globalThis.document.createElement('section');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  globalThis.document.body.append(element);
  page.places.set(selector, [...(page.places.get(selector) ?? []), element]);
  drawn.push(element);
  return element;
}
// A tab or a fold's button, which the narrator opens with a tap (`open`:
// the attribute that says it is open).
function opener(selector, open) {
  const element = place(selector, { [open]: 'false' });
  element.taps = 0;
  element.addEventListener('click', () => {
    element.taps += 1;
    element.setAttribute(open, 'true');
  });
  return element;
}

const lights = () => globalThis.document.body.find((node) => node.classList.contains('guide'));
const told = () => lights()[0]?.textContent ?? '';
async function next() {
  button('guide-next').click();
  await settled();
}

function clean() {
  state.character = null;
  narrator.narrate();
  page.places.clear();
  for (const element of drawn.splice(0)) element.remove();
  reportCache.clear();
}
beforeEach(() => {
  clean();
  sent.length = 0;
  toastBox.textContent = '';
  state.user = { skipTutorials: false };
});
// The light goes with the character, so no look for a place outlives a test.
afterEach(clean);

// A character at home, at `level`, with the parts of the game it has.
function character({ read = pastAll, level = 20, features = ['community'], ...more } = {}) {
  return {
    name: 'Mira',
    classId: 'warrior',
    appearance: 'female',
    level,
    classLevel: level,
    xp: 0,
    activity: null,
    tutorial: [...read],
    features,
    skills: { pools: [] },
    quickHunts: { left: 5, count: 5 },
    professions: null,
    settlementOpen: level >= 20,
    hardHunt: level >= 10 ? { damage: 1.5, hp: 1.5, xp: 0.5, gold: 0.5 } : null,
    camp: {
      construction: null,
      buildings: [{ id: 'campfire', level: 1 }],
      cornerstone: { fortress: { stands: false } },
      collector: { owned: false },
    },
    ...more,
  };
}

test('the introduction ends with the Sklep Systemu, pointed at in the top bar, before its last card', async () => {
  const shop = place('.topbar .system-shop');
  const read = intro.filter((id) => id !== 'shop-system' && id !== 'ending');
  state.character = character({ read, level: 2, features: [] });
  narrator.narrate('#/encyklopedia');
  assert.equal(lights().length, 1);
  assert.match(told(), new RegExp(words('shop-system')));
  // Still the introduction: its "Pomiń wprowadzenie" in the corner.
  assert.equal(button('guide-skip').textContent, tutorial.skipLabel);
  assert.ok(shop.isConnected);
  await next();
  assert.equal(lights().length, 0);
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /Tyle na początek/);
  assert.ok(state.character.tutorial.includes('shop-system'));
});

test('a character past the introduction hears of the Sklep Systemu once, but never over a report', async () => {
  place('.topbar .system-shop');
  state.character = character({ level: 5, read: beforeShop });
  narrator.narrate('#/raport/12');
  assert.equal(lights().length, 0);
  narrator.narrate('#/walka');
  assert.equal(lights().length, 1);
  // Told once: read as soon as it lights up, as the Encyklopedia's was.
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'shop-system' }]);
  await next();
  narrator.narrate('#/postac');
  assert.equal(lights().length, 0);
});

test("the Gildia's tabs come on a member's first look at its page, then each tab's own line, once", async () => {
  place(mark('guild-tabs'));
  place(BOARD_HEAD);
  // The Siedziba marks its first building only: a ring round all four drew
  // the camera far back on a phone (a player on the chat, 6.11.2026).
  place(mark('guild-seat-building'));
  // Outside a guild nothing is told.
  state.character = character();
  narrator.narrate('#/gildia/trials');
  assert.equal(lights().length, 0);
  state.character = character({ guildTag: 'KRUK' });
  narrator.narrate('#/gildia/trials');
  assert.match(told(), new RegExp(words('guild-tabs')));
  await next();
  assert.match(told(), new RegExp(words('guild-trials')));
  await next();
  assert.equal(lights().length, 0);
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'guild-tabs' }, { card: 'guild-trials' }]);
  // Another tab: its own line only; the tabs' line is not told again.
  narrator.narrate('#/gildia/seat');
  assert.match(told(), new RegExp(words('guild-seat')));
  assert.equal(lights().length, 1);
  await next();
  narrator.narrate('#/gildia/trials');
  narrator.narrate('#/gildia');
  assert.equal(lights().length, 0);
});

test('"Pomiń objaśnienie" on a line of the Gildia passes all its lines, with its message', async () => {
  place(mark('guild-tabs'));
  state.character = character({ guildTag: 'KRUK' });
  narrator.narrate('#/gildia');
  assert.equal(button('guide-skip').textContent, tutorial.chapters.guild.skipLabel);
  button('guide-skip').click();
  await settled();
  assert.equal(lights().length, 0);
  assert.deepEqual(sent.map((one) => one.body), [{ skip: true, chapter: 'guild' }]);
  assert.equal(toastBox.textContent, tutorial.chapters.guild.skippedText);
  for (const id of ['guild-tabs', 'guild-seat', 'guild-beast', 'guild-trials', 'guild-requests', 'guild-exchange', 'guild-expedition']) {
    assert.ok(state.character.tutorial.includes(id), id);
  }
});

test("the Drużyna's tab is opened and pointed at on the first look at the Społeczność from level 10", async () => {
  const tab = opener(mark('community-tab-party'), 'aria-selected');
  // Below its level nothing is told.
  state.character = character({ level: 9 });
  narrator.narrate('#/spolecznosc');
  assert.equal(lights().length, 0);
  assert.equal(tab.taps, 0);
  // While Szybkie Polowanie's line waits for the narrator to take the player
  // to an inner region, it comes first.
  state.character = character({ level: 10, features: ['community', 'party'], read: pastAll.filter((id) => id !== 'community-ending') });
  narrator.narrate('#/spolecznosc');
  assert.equal(lights().length, 0);
  state.character = null;
  narrator.narrate();
  state.character = character({ level: 10, features: ['community', 'party'] });
  narrator.narrate('#/spolecznosc/ranking');
  assert.equal(tab.taps, 1);
  assert.equal(tab.getAttribute('aria-selected'), 'true');
  assert.match(told(), new RegExp(words('party-intro')));
  // A part of its own: "Dalej" only.
  assert.equal(button('guide-skip'), undefined);
  await next();
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'party-intro' }]);
  narrator.narrate('#/spolecznosc');
  assert.equal(lights().length, 0);
});

test('the Kamień węgielny comes on the camp board after the Osada is told, while the camp is no Warownia, and nothing of the Zbieracz Systemu after it', async () => {
  place(mark('plot-cornerstone'));
  // Before the Osada's tour: its chapter first, and no place's line meanwhile.
  state.character = character({ level: 20, read: pastAll.filter((id) => !id.startsWith('settlement-')) });
  narrator.narrate('#/oboz');
  assert.equal(lights().length, 0);
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Osadę/);
  state.character = null;
  narrator.narrate();
  state.character = character({ level: 20 });
  narrator.narrate('#/oboz');
  assert.match(told(), new RegExp(words('fortress-stone')));
  assert.equal(button('guide-skip'), undefined);
  await next();
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'fortress-stone' }]);
  narrator.narrate('#/oboz');
  assert.equal(lights().length, 0);
});

test('a Warownia standing has no line on the board', () => {
  place(mark('plot-cornerstone'));
  const standing = character({ level: 20 });
  standing.camp = { ...standing.camp, cornerstone: { fortress: { stands: true } } };
  state.character = standing;
  narrator.narrate('#/oboz');
  assert.equal(lights().length, 0);
  assert.equal(cards().length, 0);
});

test('the Trudna wyprawa: from level 10, the narrator opens "Opcje wyprawy" and points at it', async () => {
  const toggle = opener('.hunt-options-toggle', 'aria-expanded');
  place(mark('hard-hunt'));
  state.character = character({ level: 9 });
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(lights().length, 0);
  // Away, the inner region shows the exploration, not its options.
  state.character = { ...character({ level: 10 }), activity: { kind: 'hunt', endsAt: Date.now() + 3600000 } };
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(lights().length, 0);
  assert.equal(toggle.taps, 0);
  state.character = character({ level: 10 });
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(toggle.taps, 1);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.match(told(), new RegExp(words('hard-hunt')));
  await next();
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'hard-hunt' }]);
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(lights().length, 0);
  // Told anew ("Testuj samouczki") with the fold open: he leaves it open,
  // as a tap would fold it.
  state.character = character({ level: 10 });
  narrator.forgetPart('hard-hunt');
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(lights().length, 1);
  assert.equal(toggle.taps, 1);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('the Skrzynia Konta is told on its first look', async () => {
  place(mark('account-chest'));
  state.character = character({ level: 3 });
  narrator.narrate('#/oboz/skrzynia-konta');
  assert.match(told(), new RegExp(words('account-chest')));
  await next();
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'account-chest' }]);
  narrator.narrate('#/oboz/skrzynia-konta');
  assert.equal(lights().length, 0);
});

// The report is seen first: its line comes a moment after it opens (2.5 s),
// on a slow machine a little later still: up to 5 s more.
async function seen() {
  await new Promise((resolve) => setTimeout(resolve, 2600));
  for (let waited = 0; lights().length === 0 && waited < 5000; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test("a faint's report is told once, at its summary, a moment after it opens; a report without a faint is not", async () => {
  place(mark('report-summary'));
  reportCache.set('7', { id: 7, result: 'success', summary: {} });
  // A faint before 651 C kept its finds: the line would not be true of it.
  reportCache.set('8', { id: 8, result: 'fainted', summary: {} });
  reportCache.set('9', { id: 9, result: 'fainted', summary: { forfeit: 'Po omdleniu nic z tej wyprawy nie zostaje.' } });
  state.character = character({ level: 12 });
  for (const id of ['7', '8']) {
    narrator.narrate(`#/raport/${id}`);
    assert.equal(lights().length, 0, id);
  }
  narrator.narrate('#/raport/9');
  assert.equal(lights().length, 0);
  await seen();
  assert.match(told(), new RegExp(words('faint-first')));
  await next();
  assert.deepEqual(sent.map((one) => one.body), [{ card: 'faint-first' }]);
  narrator.narrate('#/raport/9');
  assert.equal(lights().length, 0);
});

test("a faint's report not fetched yet waits for it", async () => {
  place(mark('report-summary'));
  state.character = character({ level: 12 });
  narrator.narrate('#/raport/9');
  assert.equal(lights().length, 0);
  // The report's screen tells the narrator once it comes (screens/report.js).
  reportCache.set('9', { id: 9, result: 'fainted', summary: { forfeit: 'Po omdleniu nic z tej wyprawy nie zostaje.' } });
  narrator.narrate('#/raport/9');
  await seen();
  assert.equal(lights().length, 1);
});

test('"Testuj samouczki" starts a single place\'s line anew on the same page', async () => {
  place(mark('account-chest'));
  state.character = character();
  narrator.narrate('#/oboz/skrzynia-konta');
  await next();
  assert.equal(lights().length, 0);
  // The row's answer: the line unread on the server again.
  state.character = character();
  narrator.forgetPart('account-chest');
  narrator.narrate('#/oboz/skrzynia-konta');
  assert.equal(lights().length, 1);
});

// "Pomijaj objaśnienia narratora": each line of a place goes at once with its
// part, without the message, which would say where it waits while the
// player stands there (664); the Gildia's too, a part told at its places
// alone, met here for the first time.
test('with the switch on, each line of a place goes without a word', async () => {
  const cases = [
    ['#/gildia/beast', { guildTag: 'KRUK' }, 'guild'],
    ['#/spolecznosc', { level: 10, features: ['community', 'party'] }, 'party'],
    ['#/oboz', {}, 'cornerstone'],
    ['#/walka/windfalls/windfalls-edge', { level: 10 }, 'hard-hunt'],
    ['#/oboz/skrzynia-konta', {}, 'account-chest'],
    ['#/raport/9', { level: 12 }, 'faint'],
  ];
  state.user = { skipTutorials: true };
  for (const [hash, more, chapter] of cases) {
    clean();
    sent.length = 0;
    reportCache.set('9', { id: 9, result: 'fainted', summary: { forfeit: 'Po omdleniu nic z tej wyprawy nie zostaje.' } });
    state.character = character(more);
    narrator.narrate(hash);
    assert.equal(lights().length, 0, chapter);
    assert.deepEqual(sent.map((one) => one.body), [{ skip: true, chapter }], chapter);
    await settled();
    assert.equal(toastBox.textContent, '', chapter);
  }
  // The Zbieracz on the board, the stone's line read: nothing more to tell.
  clean();
  sent.length = 0;
  state.character = character({ read: [...pastAll, 'fortress-stone'] });
  narrator.narrate('#/oboz');
  assert.deepEqual(sent.map((one) => one.body), []);
  // The Sklep Systemu, a late line of the introduction, as the quests'.
  clean();
  sent.length = 0;
  state.character = character({ read: beforeShop });
  narrator.narrate('#/walka');
  assert.deepEqual(sent.map((one) => one.body), [{ skip: true }]);
  await settled();
  assert.equal(toastBox.textContent, '');
});

// The Społeczność's and the Gildia's rows of tabs stay under the top bar as
// the page scrolls; while the narrator has the screen they scroll with it,
// or the camera would frame a place below them behind them (the Siedziba's
// first building, the top of the Próby's board).
test('while the narrator has the screen, the rows of tabs scroll with the page', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.narrator-held \.community-picker \{\s*position: static;\s*\}/);
  const root = globalThis.document.documentElement;
  place(mark('guild-tabs'));
  state.character = character({ guildTag: 'KRUK' });
  narrator.narrate('#/gildia');
  assert.equal(lights().length, 1);
  assert.ok(root.classList.contains('narrator-held'));
  // The screen back to the player: the rows stay under the top bar again.
  clean();
  assert.ok(!root.classList.contains('narrator-held'));
});
