// The order of the account's characters on this device (the author,
// 20.11.2026: „W karcie postaci daj możliwość tez przenoszenia jak na czacie
// zakładek tych kółek od zmiany postaci, żeby sobie ustawić jak komu
// wygodnie”; src/client/character-order.js): kept as the chat's channels
// are, in localStorage. The busts over the Postać tab and the choice of a
// character show the account's characters in it; a new one comes at the
// end, one gone from the account drops out, a broken or stale order gives
// the game's order back, and another account's characters on the same
// device keep their places.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { characterOrder, forgetCharacter, inOrder, keepCharacterOrder, orderedCharacters, readOrder, slidOrder, withoutCharacter } from '../src/client/character-order.js';

const KEY = 'insight.characterOrder';
// The device's storage.
const stored = new Map();
const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: (key) => stored.delete(key) };
globalThis.localStorage = storage;

// An account's characters as GET /api/characters gives them: by id, the
// order they were made in.
const account = (...ids) => ids.map((id) => ({ id, name: `Postać ${id}`, played: false }));
const ids = (characters) => characters.map((one) => one.id);
const kept = () => JSON.parse(stored.get(KEY) ?? 'null');

beforeEach(() => {
  stored.clear();
  globalThis.localStorage = storage;
});

describe('the characters in an order (pure)', () => {
  test('without an order, the game\'s order', () => {
    assert.deepEqual(ids(inOrder(account(3, 5, 9), [])), [3, 5, 9]);
  });

  test('in the order given, every character in it', () => {
    assert.deepEqual(ids(inOrder(account(3, 5, 9), [9, 3, 5])), [9, 3, 5]);
  });

  test('a new character, not in the order yet, comes at the end, and two new ones in the order they were made', () => {
    assert.deepEqual(ids(inOrder(account(3, 5, 9), [5, 3])), [5, 3, 9]);
    assert.deepEqual(ids(inOrder(account(3, 5, 9, 12), [9, 3])), [9, 3, 5, 12]);
  });

  test('a character gone from the account drops out, and the others keep their order', () => {
    assert.deepEqual(ids(inOrder(account(3, 9), [9, 5, 3])), [9, 3]);
  });

  test('a stale order (none of the account\'s characters) gives the game\'s order', () => {
    assert.deepEqual(ids(inOrder(account(3, 5), [40, 41])), [3, 5]);
  });

  test('another account\'s characters in the order change nothing for this one', () => {
    assert.deepEqual(ids(inOrder(account(3, 5, 9), [40, 9, 41, 3])), [9, 3, 5]);
  });

  test('the list given stays as it was', () => {
    const list = account(3, 5, 9);
    inOrder(list, [9, 5, 3]);
    assert.deepEqual(ids(list), [3, 5, 9]);
  });

  test('after a slide: the account\'s characters as they now stand, then another account\'s ids in their order', () => {
    assert.deepEqual(slidOrder([5, 9, 3], [3, 5, 9]), [5, 9, 3]);
    assert.deepEqual(slidOrder([5, 3], [40, 3, 41, 5]), [5, 3, 40, 41]);
    assert.deepEqual(slidOrder([5, 3], []), [5, 3]);
  });

  test('a character deleted leaves the order', () => {
    assert.deepEqual(withoutCharacter([9, 5, 3], 5), [9, 3]);
    assert.deepEqual(withoutCharacter([9, 3], 5), [9, 3]);
  });
});

describe('the order kept, read back', () => {
  test('nothing kept, a broken text or another shape: no order', () => {
    assert.deepEqual(readOrder(null), []);
    assert.deepEqual(readOrder(undefined), []);
    assert.deepEqual(readOrder(''), []);
    assert.deepEqual(readOrder('[3, 5'), []);
    assert.deepEqual(readOrder('"3,5"'), []);
    assert.deepEqual(readOrder('{"0": 3}'), []);
    assert.deepEqual(readOrder('null'), []);
  });

  test('only whole numbers above 0, each once, in their order', () => {
    assert.deepEqual(readOrder('[9, "5", 3, -1, 0, 2.5, null, true, 9, {}, 1e300, 3]'), [9, 3]);
  });
});

describe('the order on this device', () => {
  test('a slide keeps its order, and the account\'s characters come in it after a reload', () => {
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [3, 5, 9]);
    // The busts' ids, as the page has them (data-character).
    keepCharacterOrder(['9', '3', '5']);
    assert.deepEqual(kept(), [9, 3, 5]);
    assert.deepEqual(characterOrder(), [9, 3, 5]);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [9, 3, 5]);
  });

  test('a character made after the slide comes at the end, and one deleted elsewhere drops out', () => {
    keepCharacterOrder([9, 3, 5]);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9, 14))), [9, 3, 5, 14]);
    assert.deepEqual(ids(orderedCharacters(account(5, 9, 14))), [9, 5, 14]);
    // The next slide keeps only what the account has, and the rest as it was.
    keepCharacterOrder([14, 9, 5]);
    assert.deepEqual(kept(), [14, 9, 5, 3]);
  });

  test('a character deleted on this device leaves the order, so one made later with its id comes at the end', () => {
    keepCharacterOrder([9, 3, 5]);
    forgetCharacter(3);
    assert.deepEqual(kept(), [9, 5]);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [9, 5, 3]);
    // The last one deleted: nothing is kept.
    keepCharacterOrder([9]);
    forgetCharacter(9);
    forgetCharacter(5);
    assert.equal(stored.has(KEY), false);
    // A character never in the order: nothing changes.
    keepCharacterOrder([9, 5]);
    forgetCharacter(77);
    assert.deepEqual(kept(), [9, 5]);
  });

  test('two accounts on one device keep their own orders', () => {
    keepCharacterOrder([9, 3, 5]);
    keepCharacterOrder([41, 40]);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [9, 3, 5]);
    assert.deepEqual(ids(orderedCharacters(account(40, 41))), [41, 40]);
    keepCharacterOrder([5, 9, 3]);
    assert.deepEqual(ids(orderedCharacters(account(40, 41))), [41, 40]);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [5, 9, 3]);
  });

  test('a broken order kept (another version, a hand in the storage) gives the game\'s order and is mended by the next slide', () => {
    stored.set(KEY, '{"order": [9, 3]}');
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [3, 5, 9]);
    stored.set(KEY, '[9, "x", 3, 3, -4]');
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [9, 3, 5]);
    keepCharacterOrder(['5', 'x', '', '9', '3']);
    assert.deepEqual(kept(), [5, 9, 3]);
  });

  test('without storage (a private window, site data blocked): the game\'s order, and a slide changes nothing kept', () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(characterOrder(), []);
    assert.deepEqual(ids(orderedCharacters(account(3, 5, 9))), [3, 5, 9]);
    assert.doesNotThrow(() => keepCharacterOrder([9, 3, 5]));
    assert.doesNotThrow(() => forgetCharacter(9));
  });
});
