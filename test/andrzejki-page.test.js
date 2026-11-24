// Andrzejki's fortune evening at the Zaklinaczka's in the Osada (the author,
// 24.11.2026: „To powinno pojawić się w zakładce Osada jak się wejdzie do
// Zaklinaczki w jakimś dodatkowym głównym oknie”; src/client/andrzejki.js,
// screens/settlement.js), on just enough of a page
// (helpers/narrator-page.js): while an evening is on, its card stands first
// on her screen, under the heading and over her own card, and once the
// fortune is told the fortune's words show under the omen, again when the
// player comes back (none for a fortune told before they came); no card
// without an evening, nor at another place; her place on the Osada's board
// has a dot while tonight's fortune waits. The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const { andrzejki } = data('winter');
const HOUR = 3600000;

// The Osada as the server sends it, with the Tablica and the Zaklinaczka.
const osada = {
  name: 'Rozstaje',
  description: 'Osada za puszczą.',
  places: [
    { id: 'board', name: 'Tablica zleceń', x: 50, y: 60 },
    { id: 'enchanter', name: 'Pracownia Zaklinaczki', x: 21, y: 23, resident: 'enchantress' },
  ],
  residents: [{ id: 'enchantress', name: 'Wiedana', title: 'zaklinaczka', story: 'Przyszła z północy.', greeting: 'Czego chcesz?', standing: { name: 'Obca' }, service: 'reforge', cards: false }],
  brotherhoods: [],
  board: { slots: [], weekly: null, weeklyDone: false },
  reforge: { items: [], pending: null },
  imbue: null,
};

// Tonight's evening in the character's view (andrzejkiView on the server):
// the wax, untold or told (`told`).
const evening = (told = null) => ({ evening: { key: '2026-11-29', kind: 'wax', endsAt: Date.now() + HOUR, cups: 3, told }, active: [], both: false, hours: 24 });
const told = (line) => ({ id: 'leaf', name: 'Liść', kind: 'herbs', effect: 'o 10% więcej ziół w Zielarstwie', short: '+10% ziół w Zielarstwie', at: Date.now(), cup: null, line });

describe("Andrzejki's fortune evening at the Zaklinaczka's", () => {
  let state;
  let kept;
  before(async () => {
    await page.ready;
    ({ state } = page);
    kept = { fetch: globalThis.fetch, content: state.content, create: globalThis.document.createElement, remove: globalThis.window.removeEventListener };
    // The fortune's words as the page has them (content.js), and the parts of
    // the day the board's light follows (scenes.js).
    state.content = {
      ...state.content,
      animations: data('animations'),
      winter: { andrzejki: { texts: andrzejki.texts, omens: andrzejki.omens.map(({ id, name, kind }) => ({ id, name, kind })) } },
    };
    globalThis.fetch = async () => new Response(JSON.stringify({ settlement: osada }), { status: 200 });
    globalThis.window.removeEventListener = () => {};
    // The board keeps the places' names on it, a style it takes off.
    globalThis.document.createElement = (tag) => {
      const node = kept.create(tag);
      node.style.removeProperty = () => {};
      return node;
    };
  });
  after(() => {
    globalThis.fetch = kept.fetch;
    globalThis.window.removeEventListener = kept.remove;
    globalThis.document.createElement = kept.create;
    state.content = kept.content;
  });

  // The Osada's screen at `place` (the board without one), for a character
  // with the Andrzejki of `view`.
  async function osadaAt(place, view) {
    const { mountSettlement } = await import('../src/client/screens/settlement.js');
    state.character = { id: 1, name: 'Próbna', level: 60, classLevel: 40, gold: 1000, features: [], activity: null, bag: [], equipment: {}, andrzejki: view };
    const screen = globalThis.document.createElement('main');
    const mounted = mountSettlement(screen, { params: place ? { place } : {} });
    await settled();
    return { screen, mounted };
  }
  const withClass = (node, name) => node.find((one) => one.classList.contains(name));

  test("on the evening the card stands first on the Zaklinaczka's screen, over her own card", async () => {
    const { screen, mounted } = await osadaAt('enchanter', evening());
    const [heading, card, resident] = screen.children;
    assert.ok(heading.classList.contains('page-heading'));
    assert.ok(card.classList.contains('andrzejki-card'));
    assert.ok(resident.classList.contains('settlement-resident'));
    assert.match(card.textContent, new RegExp(andrzejki.texts.title));
    assert.equal(withClass(card, 'andrzejki-line').length, 0);
    mounted.unmount();
  });

  test("once told, the fortune's words under the omen, also on coming back; none for a fortune told before them", async () => {
    const line = andrzejki.fortunes[4];
    const { screen, mounted } = await osadaAt('enchanter', evening(told(line)));
    const card = withClass(screen, 'andrzejki-card')[0];
    const lines = card.find((node) => node.tagName === 'P').map((node) => node.className);
    // The omen's shape, its words right under it, then what it gives.
    assert.deepEqual(lines.slice(0, 3), ['andrzejki-result', 'andrzejki-line', 'andrzejki-omen']);
    assert.equal(withClass(card, 'andrzejki-line')[0].textContent, line);
    mounted.unmount();
    const old = await osadaAt('enchanter', evening(told(null)));
    assert.equal(withClass(old.screen, 'andrzejki-result').length, 1);
    assert.equal(withClass(old.screen, 'andrzejki-line').length, 0);
    old.mounted.unmount();
  });

  test('no card without an evening, nor at another place', async () => {
    const quiet = await osadaAt('enchanter', null);
    assert.equal(withClass(quiet.screen, 'andrzejki-card').length, 0);
    assert.ok(quiet.screen.children[1].classList.contains('settlement-resident'));
    quiet.mounted.unmount();
    const board = await osadaAt('board', evening());
    assert.equal(withClass(board.screen, 'andrzejki-card').length, 0);
    board.mounted.unmount();
  });

  test("her place on the board has a dot while tonight's fortune waits, none once told", async () => {
    const dotAt = (screen, id) => withClass(screen, 'settlement-place').find((link) => link.getAttribute('href') === `#/osada/${id}`).find((node) => node.classList.contains('settlement-place-dot')).length;
    const waiting = await osadaAt(null, evening());
    assert.deepEqual([dotAt(waiting.screen, 'enchanter'), dotAt(waiting.screen, 'board')], [1, 0]);
    waiting.mounted.unmount();
    const done = await osadaAt(null, evening(told(andrzejki.fortunes[0])));
    assert.equal(dotAt(done.screen, 'enchanter'), 0);
    done.mounted.unmount();
    const none = await osadaAt(null, null);
    assert.equal(dotAt(none.screen, 'enchanter'), 0);
    none.mounted.unmount();
  });
});
