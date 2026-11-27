// "Wystaw na Targowisku" on the bag's cards (a player's proposal passed on by
// the author, 27.11.2026: „brak możliwości wystawienia przedmiotu
// bezpośrednio z menu plecaka”), on just enough of a page
// (helpers/narrator-page.js): an item's card in the bag has the button by
// "Sprzedaj", and it opens the Targowisko's own price sheet with the item
// chosen and what the Targowisko's list of goods says over it; "Wystaw"
// there puts it up through the Targowisko's API, the sheet closes and the
// bag shows what the server answers. The cards of stacks (the material's
// here, the others through the same bagListing) start at the pieces chosen
// on them. No button before the Osada opens, on a worn item's card nor on a
// report's copy; with every offer the character may have open, the button
// is disabled with why. DECISIONS.md, „Wystaw z plecaka”.

import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
let state;
let itemSheet;
let materialSheet;
let bagListing;
let dialog;
// What the page asked the server, and how the server answers a listing.
let sent = [];
let listedAnswer;

// The Targowisko's numbers in the character's view (bagMarket on the server).
const MARKET = { fee: 0.01, hours: 24, usualHours: 24, minHours: 1, maxPrice: 100000000, limit: 5, open: 0 };
const AMULET = { id: 41, base: 'amulet', name: 'Lisi Amulet', slot: 'amulet', slotName: 'Amulet', level: 30, rarity: 'rare', rarityName: 'rzadki', color: '#3aa655', price: 60, properties: ['Wola +2'], lines: [] };
const MATERIAL = { key: 'tick-shell:common', materialId: 'tick-shell', name: 'Pancerz kleszcza', label: 'pancerz kleszcza', rarity: 'common', rarityName: 'pospolity', color: '#999', count: 12, part: 'Ścinki', price: 10 };

function character({ market = MARKET, bag = [AMULET], equipment = {} } = {}) {
  return {
    id: 7,
    name: 'Kramarka',
    level: 30,
    classLevel: 30,
    classId: 'warrior',
    features: [],
    tutorial: null,
    activity: null,
    settlementOpen: market !== null,
    market,
    bag,
    equipment: { amulet: null, ...equipment },
    stats: [],
    crafting: { pace: 0, queue: [], limit: 5, materials: [MATERIAL], parts: [] },
    camp: { buildings: [] },
    professions: null,
    herbStack: 20,
  };
}

before(async () => {
  await page.ready;
  ({ state } = page);
  state.content = { ...state.content, rarities: [], materials: [{ id: 'tick-shell', name: 'Pancerz kleszcza', description: 'Twarda skorupka.' }], slots: [] };
  // The game's one sheet (index.html's #sheet), found as the page finds it.
  dialog = globalThis.document.createElement('dialog');
  page.places.set('#sheet', [dialog]);
  globalThis.HTMLElement ??= globalThis.Node;
  globalThis.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    sent.push({ method: options.method ?? 'GET', path: String(path), body });
    const answer = String(path) === '/api/market/list' ? listedAnswer(body) : String(path).includes('/preview') ? { changes: {}, verdict: 'same' } : {};
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  ({ itemSheet } = await import('../src/client/screens/character.js'));
  ({ materialSheet } = await import('../src/client/craft-table.js'));
  ({ bagListing } = await import('../src/client/screens/market.js'));
});

beforeEach(() => {
  sent = [];
  dialog.open = false;
  dialog.replaceChildren();
  page.toastBox.textContent = '';
  // The server takes the goods and counts the offer.
  listedAnswer = (body) => ({
    market: {},
    character: {
      ...state.character,
      bag: state.character.bag.filter((item) => item.id !== body.itemId),
      market: { ...state.character.market, open: state.character.market.open + 1 },
      serverTime: Date.now(),
    },
  });
});

const inSheet = (match) => dialog.find(match);
const buttonNamed = (text) => inSheet((node) => node.tagName === 'BUTTON' && node.textContent === text)[0];
const listButton = () => buttonNamed('Wystaw na Targowisku');
const texts = (className) => inSheet((node) => node.classList.contains(className)).map((node) => node.textContent);
// A number typed into the sheet's field of `id` (these nodes keep what is
// typed apart from the value they were made with, as a page's fields do).
const type = (id, value) => {
  inSheet((node) => node.getAttribute('id') === id)[0].value = String(value);
};
// A message with the numbers' spaces as they are shown.
const spaced = (text) => text.replace(/\s/g, ' ');

describe("the bag's „Wystaw na Targowisku” on the page", () => {
  test("an item's card has the button by „Sprzedaj”, and it opens the Targowisko's price sheet with the item chosen; „Wystaw” puts it up and the bag shows the server's answer", async () => {
    state.character = character();
    itemSheet(AMULET, { equipped: false });
    await settled();
    const button = listButton();
    assert.ok(button, 'Wystaw na Targowisku');
    assert.equal(button.getAttribute('disabled'), null);
    // Between "Sprzedaj za … złota" and the row of "Wyrzuć" and "Załóż".
    const body = dialog.children[0].children;
    const at = (node) => body.findIndex((one) => one === node || one.contains(node));
    assert.equal(at(button), at(buttonNamed('Sprzedaj za 60 złota')) + 1);
    assert.equal(at(button) + 1, at(buttonNamed('Wyrzuć')));
    button.click();
    // The price sheet: the item's name, what the scrapper pays, what the
    // Targowisko's list says, and no count for an item.
    assert.deepEqual(texts('sheet-title'), ['Lisi Amulet']);
    assert.deepEqual(texts('market-scrap'), ['U złomiarza: 60 zł']);
    assert.ok(texts('sheet-text').includes('Ofertę wystawisz na 1–24 godziny. Przy sprzedaży Targowisko bierze 1% ceny.'));
    assert.equal(inSheet((node) => node.getAttribute('id') === 'market-count').length, 0);
    type('market-start', 500);
    type('market-buy-now', '');
    buttonNamed('Wystaw').click();
    await settled();
    const listed = sent.filter((one) => one.path === '/api/market/list');
    assert.deepEqual(listed, [{ method: 'POST', path: '/api/market/list', body: { kind: 'item', itemId: 41, startPrice: 500, buyNow: null, hours: 24 } }]);
    assert.equal(dialog.open, false);
    assert.equal(page.toastBox.textContent, 'Wystawione na Targowisku.');
    assert.deepEqual(state.character.bag, []);
    assert.equal(state.character.market.open, 1);
  });

  test('a price left out or wrong is said, and nothing goes to the server', async () => {
    state.character = character();
    itemSheet(AMULET, { equipped: false });
    await settled();
    listButton().click();
    type('market-start', '');
    buttonNamed('Wystaw').click();
    await settled();
    assert.equal(spaced(page.toastBox.textContent), 'Cena wywoławcza (zł): wpisz od 1 do 100 000 000.');
    assert.equal(dialog.open, true);
    assert.deepEqual(sent.filter((one) => one.path === '/api/market/list'), []);
  });

  test('with every offer the character may have open, the button is disabled and says why', async () => {
    state.character = character({ market: { ...MARKET, open: 5 } });
    itemSheet(AMULET, { equipped: false });
    await settled();
    assert.equal(listButton().getAttribute('disabled'), '');
    assert.ok(texts('muted').includes('Masz już 5 ofert na Targowisku. Wystawisz więcej, gdy któraś się skończy.'));
    // One more place with the Kompania Kupców: open again.
    state.character = character({ market: { ...MARKET, open: 5, limit: 6 } });
    itemSheet(AMULET, { equipped: false });
    await settled();
    assert.equal(listButton().getAttribute('disabled'), null);
    assert.ok(!texts('muted').some((text) => text.startsWith('Masz już')));
  });

  test('no button before the Osada opens, on a worn item\'s card, nor on an item no longer in the bag', async () => {
    state.character = character({ market: null });
    itemSheet(AMULET, { equipped: false });
    await settled();
    assert.equal(listButton(), undefined);
    assert.ok(buttonNamed('Sprzedaj za 60 złota'));
    // Worn: "Zdejmij" alone, as without "Sprzedaj" and "Wyrzuć".
    state.character = character({ bag: [], equipment: { amulet: AMULET } });
    itemSheet(AMULET, { equipped: true });
    await settled();
    assert.equal(listButton(), undefined);
    assert.ok(buttonNamed('Zdejmij'));
    // A report's copy has no id; an item gone from the bag is not there.
    state.character = character({ bag: [] });
    itemSheet({ ...AMULET, id: undefined }, { equipped: false });
    await settled();
    assert.equal(listButton(), undefined);
    itemSheet(AMULET, { equipped: false });
    await settled();
    assert.equal(listButton(), undefined);
  });

  test("a material's card starts the sheet at the pieces chosen on it, and puts up as many as the count says", async () => {
    state.character = character();
    materialSheet(MATERIAL);
    await settled();
    // Three pieces chosen with "+".
    const more = inSheet((node) => node.getAttribute('aria-label') === 'Więcej')[0];
    more.click();
    more.click();
    listButton().click();
    assert.deepEqual(texts('sheet-title'), ['Pancerz kleszcza']);
    assert.deepEqual(texts('market-scrap'), ['U złomiarza: 10 zł za sztukę']);
    const count = inSheet((node) => node.getAttribute('id') === 'market-count')[0];
    assert.equal(count.getAttribute('value'), '3');
    assert.equal(count.getAttribute('max'), '12');
    count.value = '3';
    type('market-start', 40);
    type('market-buy-now', 90);
    buttonNamed('Wystaw').click();
    await settled();
    assert.deepEqual(sent.filter((one) => one.path === '/api/market/list').map((one) => one.body), [{ kind: 'material', key: 'tick-shell:common', count: 3, startPrice: 40, buyNow: 90, hours: 24 }]);
    assert.equal(dialog.open, false);
  });

  test('the other stacks of the bag go up by their kind and key; a part, with no count on its card, starts at all of it', async () => {
    state.character = character();
    for (const [goods, pieces, expected] of [
      [{ kind: 'herb', key: 'comfrey', name: 'Żywokost', count: 40, scrap: 2 }, 5, 5],
      [{ kind: 'potion', key: 'lesser-healing', name: 'Mniejsza mikstura leczenia', count: 7, scrap: 9 }, 1, 1],
      [{ kind: 'mineral', key: 'ruby', name: 'Rubin', count: 3, scrap: 16 }, 9, 3],
      [{ kind: 'pantry', key: 'roach', name: 'Płoć', count: 12, scrap: 4 }, 2, 2],
      [{ kind: 'part', key: 'scraps', name: 'Ścinki', count: 25 }, undefined, 25],
    ]) {
      const [, button] = bagListing(goods, pieces === undefined ? undefined : () => pieces);
      button.click();
      const count = inSheet((node) => node.getAttribute('id') === 'market-count')[0];
      assert.equal(count.getAttribute('value'), String(expected), goods.kind);
      // The innkeeper buys the Spiżarnia's goods, the scrapper the others;
      // nobody the parts.
      assert.deepEqual(texts('market-scrap'), goods.kind === 'part' ? [] : [goods.kind === 'pantry' ? 'U karczmarza: 4 zł za sztukę' : `U złomiarza: ${goods.scrap} zł za sztukę`], goods.kind);
      count.value = String(expected);
      type('market-start', 10);
      type('market-buy-now', '');
      sent = [];
      buttonNamed('Wystaw').click();
      await settled();
      assert.deepEqual(sent.find((one) => one.path === '/api/market/list')?.body, { kind: goods.kind, key: goods.key, count: expected, startPrice: 10, buyNow: null, hours: 24 }, goods.kind);
    }
  });
});
