// "Wyjmij wszystko" and "Wyjmij zaznaczone" on the Skrzynia Konta's screen
// (src/client/screens/chest.js; a player's idea the author passed on,
// 27.11.2026), on just enough of a page (helpers/narrator-page.js): over a
// tab's list the two buttons; "Wyjmij wszystko" sends the tab whole, and
// "Wyjmij zaznaczone" turns the list into the bag's marking (the tiles of
// "Rozbierz kilka" with their tick, the bar of "Zaznacz do sprzedaży" with
// "Anuluj"), and sends the things marked. The message says how many came
// out, and of how many when the bag had no room for the rest. DECISIONS.md,
// „Skrzynia konta: wyjmij wszystko i zaznaczone (27.11.2026)”.

import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
let mountChest;
// What the page asked the server, and how the server answers a take-out.
let sent = [];
let answer;

const ITEMS = [
  { id: 11, base: 'amulet', name: 'Amulet', slot: 'amulet', slotName: 'Amulet', level: 30, rarity: 'rare', rarityName: 'rzadki', color: '#3aa655', properties: [], own: true, from: 'Ala', usable: true, wornFrom: null },
  { id: 12, base: 'helmet', name: 'Hełm', slot: 'head', slotName: 'Hełm', level: 28, rarity: 'common', rarityName: 'pospolity', color: '#999', properties: [], own: false, from: null, usable: true, wornFrom: null },
  { id: 13, base: 'ring', name: 'Pierścień', slot: 'ring', slotName: 'Pierścień', level: 25, rarity: 'epic', rarityName: 'epicki', color: '#a335ee', properties: [], own: true, from: 'Ala', usable: true, wornFrom: null },
];
const GOODS = [
  { kind: 'resource', id: 'wood', name: 'Drewno', count: 1200, own: 1200 },
  { kind: 'herb', id: 'comfrey', name: 'Żywokost', count: 64, own: 0 },
  { kind: 'material', id: 'wolf-pelt:rare', name: 'Rzadka skóra wilka', count: 7, own: 7, materialId: 'wolf-pelt' },
];
const chestWith = (items = ITEMS, goods = GOODS) => ({ slots: 30, items, goods });

before(async () => {
  await page.ready;
  page.state.content = { ...page.state.content, resources: [], materials: [], rarities: [], slots: [] };
  globalThis.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    sent.push({ method: options.method ?? 'GET', path: String(path), body });
    const character = { ...page.state.character, serverTime: Date.now() };
    if (String(path) === '/api/chest/take-many') return new Response(JSON.stringify({ ...answer(body), character }), { status: 200 });
    if (String(path) === '/api/chest') return new Response(JSON.stringify({ chest: chestWith() }), { status: 200 });
    return new Response(JSON.stringify({ character }), { status: 200 });
  };
  page.state.character = {
    id: 1,
    name: 'Ala',
    level: 30,
    classLevel: 30,
    gold: 100,
    features: [],
    tutorial: null,
    bag: [],
    resources: {},
    potions: [],
    herbs: [],
    minerals: [],
    pantry: [],
    scrollGoods: [],
    crafting: { pace: 0, queue: [], limit: 5, materials: [], parts: [] },
  };
  ({ mountChest } = await import('../src/client/screens/chest.js'));
});

let holder;
beforeEach(async () => {
  sent = [];
  page.toastBox.textContent = '';
  holder = document.createElement('div');
  document.body.append(holder);
  mountChest(holder, () => {});
  await settled();
});

afterEach(() => holder.remove());

const withClass = (name) => holder.find((node) => node.classList.contains(name));
const buttonNamed = (text) => holder.find((node) => node.tagName === 'BUTTON' && node.textContent === text)[0];
const tap = async (node) => {
  assert.ok(node);
  node.click();
  await settled();
};
const takes = () => sent.filter((one) => one.path === '/api/chest/take-many').map((one) => one.body);
const tiles = () => withClass('salvage-pick');
const pressed = () => tiles().map((tile) => tile.getAttribute('aria-pressed'));
const bar = () => ({ sum: withClass('sale-bar-sum')[0]?.textContent, go: holder.find((node) => node.getAttribute('data-chest-take') === 'marked')[0] });
// A tab of the chest by the start of its name (the tab open last stays open).
const tab = (name) => holder.find((node) => node.getAttribute('role') === 'tab' && node.textContent.startsWith(name))[0];

test('„Wyjmij wszystko” over each tab sends it whole, and the message says how many came out, or of how many', async () => {
  // Over the list of items, the two buttons, and the bag under it.
  assert.ok(buttonNamed('Wyjmij wszystko'));
  assert.ok(buttonNamed('Wyjmij zaznaczone'));
  assert.equal(withClass('chest-section').length, 2);
  answer = () => ({ chest: chestWith([], GOODS), taken: { count: 3, of: 3 } });
  await tap(buttonNamed('Wyjmij wszystko'));
  assert.deepEqual(takes(), [{ all: 'items' }]);
  assert.equal(page.toastBox.textContent, 'Wyjęto 3 przedmioty.');
  // An empty list has no buttons.
  assert.equal(buttonNamed('Wyjmij wszystko'), undefined);

  // The goods, with a bag that had room for some of them.
  await tap(tab('Towary'));
  answer = () => ({ chest: chestWith([], GOODS.slice(1, 2)), taken: { count: 2, of: 3 } });
  await tap(buttonNamed('Wyjmij wszystko'));
  assert.deepEqual(takes(), [{ all: 'items' }, { all: 'goods' }]);
  assert.equal(page.toastBox.textContent, 'Wyjęto 2 z 3. Reszta została w Skrzyni, bo w plecaku zabrakło miejsca.');
});

test('„Wyjmij zaznaczone” marks the things in the bag\'s tiles, the bar counts them, and only the marked go; „Anuluj” leaves it', async () => {
  await tap(tab('Przedmioty'));
  await tap(buttonNamed('Wyjmij zaznaczone'));
  // The list to mark, with the words of the bag's marking, and no bag under it.
  assert.deepEqual(pressed(), ['false', 'false', 'false']);
  assert.equal(withClass('bag-note')[0].textContent, 'Wybierz przedmioty do wyjęcia. Ponowny wybór odznacza przedmiot.');
  assert.equal(buttonNamed('Wyjmij wszystko'), undefined);
  assert.equal(buttonNamed('Włóż'), undefined);
  assert.equal(withClass('chest-section').length, 1);
  assert.equal(bar().sum, 'Nic jeszcze nie zaznaczono.');
  assert.equal(bar().go.textContent, 'Wyjmij zaznaczone');
  assert.equal(bar().go.disabled, true);

  // A tap on a tile, or on the words beside it, marks; a second tap unmarks.
  await tap(tiles()[0]);
  await tap(withClass('chest-pick-words')[2]);
  assert.deepEqual(pressed(), ['true', 'false', 'true']);
  assert.equal(bar().sum, 'Zaznaczone: 2');
  assert.equal(bar().go.textContent, 'Wyjmij zaznaczone (2)');
  assert.equal(bar().go.disabled, false);
  await tap(tiles()[0]);
  assert.deepEqual(pressed(), ['false', 'false', 'true']);
  assert.equal(bar().go.textContent, 'Wyjmij zaznaczone (1)');

  answer = () => ({ chest: chestWith(ITEMS.slice(0, 2), GOODS), taken: { count: 1, of: 1 } });
  await tap(bar().go);
  assert.deepEqual(takes(), [{ items: [13] }]);
  assert.equal(page.toastBox.textContent, 'Wyjęto 1 przedmiot.');
  // Out of the marking: the list as before, with its buttons.
  assert.equal(tiles().length, 0);
  assert.equal(bar().go, undefined);
  assert.ok(buttonNamed('Wyjmij wszystko'));

  // „Anuluj” leaves the marking without a word to the server.
  await tap(buttonNamed('Wyjmij zaznaczone'));
  await tap(tiles()[1]);
  await tap(buttonNamed('Anuluj'));
  assert.equal(tiles().length, 0);
  assert.equal(takes().length, 1);

  // The goods: each marked by "kind:id", and they come out whole.
  await tap(tab('Towary'));
  await tap(buttonNamed('Wyjmij zaznaczone'));
  assert.equal(withClass('bag-note')[0].textContent, 'Wybierz towary do wyjęcia. Wyjdą w całości, ze wszystkimi sztukami. Ponowny wybór odznacza towar.');
  await tap(tiles()[2]);
  await tap(tiles()[1]);
  answer = () => ({ chest: chestWith(ITEMS.slice(0, 2), GOODS.slice(0, 1)), taken: { count: 2, of: 2 } });
  await tap(bar().go);
  assert.deepEqual(takes().at(-1), { goods: ['herb:comfrey', 'material:wolf-pelt:rare'] });
  assert.equal(page.toastBox.textContent, 'Wyjęto 2 towary.');
});
