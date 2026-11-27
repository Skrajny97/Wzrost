// „Najlepsza możliwa” in the deck builder of the Salon Gier's "Karty"
// (src/client/cards.js; the author, 27.11.2026: „bierze najwyższe możliwe
// statystyki + rozkład kart 4/4/4 jeśli chodzi o typy”), on just enough of
// a page (helpers/narrator-page.js): the button under the builder's words
// chooses at once the deck the server found (`best`, bestDeck in the
// engine), the player may still change a card by hand, and „Zapisz talię”
// saves it as any deck; a line says when a type, or the whole collection,
// has too few cards. DECISIONS.md, „Najlepsza możliwa talia”.

import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
let cards;
// What the page asked the server.
let sent = [];

const TYPES = [
  { id: 'strength', name: 'Siła', target: 'dexterity', icon: 'axe' },
  { id: 'dexterity', name: 'Zręczność', target: 'intellect', icon: 'bow' },
  { id: 'intellect', name: 'Magia', target: 'strength', icon: 'staff' },
];
// A card of the collection as the tab brings it (cardView on the server).
const card = (id, type, attack, life, level = 1) => ({
  id,
  name: id,
  type,
  typeName: TYPES.find((one) => one.id === type).name,
  typeIcon: TYPES.find((one) => one.id === type).icon,
  rarity: 'common',
  rarityName: 'pospolita',
  color: '#9a9a9a',
  kind: 'ordinary',
  level,
  attack,
  life,
  area: null,
  copies: level,
  inDeck: false,
});
// Five cards of Siła, five of Zręczność and four of Magia.
const COLLECTION = [
  card('wolf', 'strength', 14, 17),
  card('badger', 'strength', 13, 19),
  card('raccoon-dog', 'strength', 9, 26),
  card('capercaillie', 'strength', 11, 25),
  card('boar', 'strength', 12, 27, 2),
  card('squirrel', 'dexterity', 16, 15),
  card('grass-snake', 'dexterity', 14, 18),
  card('fox', 'dexterity', 11, 22),
  card('viper', 'dexterity', 12, 20),
  card('weasel', 'dexterity', 12, 21),
  card('phantasm', 'intellect', 14, 19),
  card('fume-spirit', 'intellect', 11, 25),
  card('reedling', 'intellect', 11, 27),
  card('mistling', 'intellect', 14, 21),
];
// The deck in play: the starter's twelve.
const STARTER = ['wolf', 'badger', 'raccoon-dog', 'capercaillie', 'squirrel', 'grass-snake', 'fox', 'viper', 'phantasm', 'fume-spirit', 'reedling', 'mistling'];
// The strongest deck, as the server finds it: four of each type.
const BEST = ['boar', 'capercaillie', 'raccoon-dog', 'badger', 'weasel', 'fox', 'grass-snake', 'viper', 'reedling', 'fume-spirit', 'mistling', 'phantasm'];

// The Salon's tab as GET /api/cards brings it, with `best` as given.
function tabWith(best) {
  return {
    name: 'Talia Systemu',
    texts: { intro: 'Szczęsny tasuje talię.', starterOffer: '', starterTaken: '', rules: [], win: [], loss: [], draw: [], pack: {}, redraw: {} },
    types: TYPES,
    lines: [],
    typeBonus: 0.5,
    deckSize: 12,
    hand: 4,
    roundCap: 20,
    maxLevel: 5,
    starter: true,
    collection: COLLECTION.map((one) => ({ ...one, inDeck: STARTER.includes(one.id) })),
    deck: STARTER,
    decks: {
      max: 5,
      nameLength: 16,
      active: 1,
      slots: [1, 2, 3, 4, 5].map((slot) =>
        slot === 1
          ? { slot, name: null, cards: STARTER, effects: [], whole: true, strength: 600, types: TYPES.map(({ id, name }) => ({ id, name, count: 4 })) }
          : { slot, name: null, cards: null, whole: false, effects: [] },
      ),
    },
    best,
    effects: { slots: 2, owned: [], deck: [], texts: { tab: 'Karty efektów', empty: 'Nie masz jeszcze kart efektów.', inDeckNone: 'Bez kart efektów w tej talii.', rule: '', builder: '' } },
    hero: { classId: 'warrior', stage: 0, appearance: 'female', skin: 'light', evolution: null, title: 'Wojownik', skill: null },
    tiers: [],
    residents: [],
    staked: { today: 0, limit: 10 },
    pack: null,
    match: null,
    last: null,
    endsAt: null,
  };
}

let view;
// The tabs mounted by a test, taken off after it.
let mounted = [];

before(async () => {
  await page.ready;
  // The builder brings its tab up under the top bar (showTab).
  globalThis.window.scrollBy = () => {};
  page.state.content = { ...page.state.content, rarities: [{ id: 'common' }] };
  globalThis.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    sent.push({ method: options.method ?? 'GET', path: String(path), body });
    if (String(path).startsWith('/api/cards/duel')) return new Response(JSON.stringify({ duel: null }), { status: 200 });
    if (String(path) === '/api/cards/deck') {
      // The server lays the deck in its slot and plays it.
      const slots = view.decks.slots.map((one) => (one.slot === body.slot ? { ...one, cards: body.cards, whole: true, strength: 700 } : one));
      view = { ...view, deck: body.cards, decks: { ...view.decks, active: body.slot, slots } };
      return new Response(JSON.stringify({ saved: true, slot: body.slot, cards: view }), { status: 200 });
    }
    return new Response(JSON.stringify({ cards: view }), { status: 200 });
  };
  page.state.character = { id: 1, name: 'Ala', gold: 1000, features: ['community'], tutorial: null };
  cards = await import('../src/client/cards.js');
});

beforeEach(() => {
  sent = [];
  page.toastBox.textContent = '';
});

afterEach(() => {
  for (const { holder, tab } of mounted) {
    tab.unmount();
    holder.remove();
  }
  mounted = [];
});

const buttons = (holder, text) => holder.find((node) => node.tagName === 'BUTTON' && node.textContent === text);
const tap = async (holder, text) => {
  const [button] = buttons(holder, text);
  assert.ok(button, text);
  button.click();
  await settled();
};
// The collection's cards ticked in the builder, by their creature.
const ticked = (holder) =>
  holder
    .find((node) => node.classList.contains('tcard-grid--collection'))
    .flatMap((grid) => grid.children)
    .filter((face) => face.classList.contains('tcard--chosen'))
    .map((face) => COLLECTION.find((one) => face.getAttribute('aria-label').startsWith(`${one.id},`)).id);
const count = (holder) => holder.find((node) => node.classList.contains('cards-count'))[0];
const off = (button) => 'disabled' in button.attributes;

async function builderWith(best) {
  view = tabWith(best);
  const holder = document.createElement('div');
  document.body.append(holder);
  const tab = cards.mountCards(holder);
  mounted.push({ holder, tab });
  await settled();
  await tap(holder, 'Ułóż talię 1');
  return holder;
}

test('„Najlepsza możliwa” chooses the strongest deck at once; a card changed by hand; „Zapisz talię” saves it as any deck', async () => {
  const holder = await builderWith({ cards: BEST, short: [], missing: 0 });
  // The builder opens on the deck in play, the button under its words.
  assert.deepEqual(ticked(holder).sort(), [...STARTER].sort());
  const [best] = buttons(holder, 'Najlepsza możliwa');
  assert.equal(best.className, 'button button--system');
  assert.ok(best.parentNode.classList.contains('cards-builder-best'));
  await tap(holder, 'Najlepsza możliwa');
  assert.deepEqual(ticked(holder).sort(), [...BEST].sort());
  assert.equal(count(holder).textContent, 'Wybrane: 12 z 12');
  assert.ok(count(holder).classList.contains('cards-count--ready'));
  // Four of each type, and no word: the collection had enough of each.
  assert.equal(page.toastBox.textContent, '');
  assert.ok(buttons(holder, 'Zapisz talię').every((button) => !off(button)));
  // Nothing went to the server yet.
  assert.deepEqual(sent.filter((one) => one.method === 'POST'), []);
  // By hand: Wilk in place of Borsuk.
  holder.find((node) => node.getAttribute('aria-label') === 'badger, poziom 1: w talii')[0].click();
  holder.find((node) => node.getAttribute('aria-label') === 'wolf, poziom 1: poza talią')[0].click();
  await settled();
  const chosen = [...BEST.filter((id) => id !== 'badger'), 'wolf'];
  assert.deepEqual(ticked(holder).sort(), [...chosen].sort());
  await tap(holder, 'Zapisz talię');
  const saved = sent.filter((one) => one.path === '/api/cards/deck');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].method, 'POST');
  assert.deepEqual([[...saved[0].body.cards].sort(), saved[0].body.slot, saved[0].body.effects], [[...chosen].sort(), 1, []]);
  assert.equal(page.toastBox.textContent, 'Talia 1 zapisana.');
  // The builder closes on the tab with the deck saved.
  assert.equal(buttons(holder, 'Najlepsza możliwa').length, 0);
  assert.deepEqual([...view.deck].sort(), [...chosen].sort());
});

test('the best deck straight away, saved without a change', async () => {
  const holder = await builderWith({ cards: BEST, short: [], missing: 0 });
  await tap(holder, 'Najlepsza możliwa');
  await tap(holder, 'Zapisz talię');
  const saved = sent.filter((one) => one.path === '/api/cards/deck');
  assert.deepEqual(saved.map((one) => one.body), [{ cards: BEST, slot: 1, effects: [] }]);
});

test('a type with too few cards, and a collection too small for a deck: a line says so', async () => {
  // Magia short: Siła and Zręczność took its places.
  const short = ['boar', 'capercaillie', 'raccoon-dog', 'badger', 'wolf', 'weasel', 'fox', 'grass-snake', 'viper', 'squirrel', 'reedling', 'fume-spirit'];
  let holder = await builderWith({ cards: short, short: ['intellect'], missing: 0 });
  await tap(holder, 'Najlepsza możliwa');
  assert.deepEqual(ticked(holder).sort(), [...short].sort());
  assert.equal(page.toastBox.textContent, 'Za mało kart typu Magia: brakujące miejsca zajęły najlepsze karty innych typów.');
  // Two types short.
  holder = await builderWith({ cards: short, short: ['dexterity', 'intellect'], missing: 0 });
  await tap(holder, 'Najlepsza możliwa');
  assert.equal(page.toastBox.textContent, 'Za mało kart typów Zręczność i Magia: brakujące miejsca zajęły najlepsze karty innego typu.');
  // Fewer cards than a deck: all of them, and „Zapisz talię” waits.
  const few = ['boar', 'wolf', 'fox', 'reedling', 'phantasm'];
  holder = await builderWith({ cards: few, short: ['strength', 'dexterity', 'intellect'], missing: 7 });
  await tap(holder, 'Najlepsza możliwa');
  assert.deepEqual(ticked(holder).sort(), [...few].sort());
  assert.equal(page.toastBox.textContent, 'Za mało kart na pełną talię: wybrane są wszystkie, jakie masz.');
  assert.equal(count(holder).textContent, 'Wybrane: 5 z 12');
  assert.ok(buttons(holder, 'Zapisz talię').every((button) => off(button)));
});
