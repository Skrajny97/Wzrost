// Where the fight's playback puts a summon's card (src/client/summon-place.js,
// arena.js summonPlace): ahead of its summoner, the first free field first,
// then the field with the fewest cards, and the summoner's own field, before
// it, once that has fewer cards than every field ahead (the author, 1270,
// 26.11.2026: the Ojciec Puszczy's five stood three in one column and the
// board did not fit a phone).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summonField } from '../src/client/summon-place.js';

// The cards in the fields front, middle and back after a summoner in field
// `at` (0 front, 1 middle, 2 back), with `fields` cards there before,
// calls `count` summons one after another.
function board(at, fields, count) {
  const after = [...fields];
  for (let k = 0; k < count; k++) {
    const ahead = after.slice(0, at).reverse();
    const index = summonField(ahead, after[at]);
    assert.ok(index >= 0 && index <= ahead.length);
    if (index < ahead.length) after[at - 1 - index] += 1;
    else after[at] += 1;
  }
  return after;
}

test("the Ojciec Puszczy's five summons stand two, two and two", () => {
  // Two Odwieczne dęby, then the Odwieczne stado's bison, bear and elk.
  assert.deepEqual(board(2, [0, 0, 1], 5), [2, 2, 2]);
});

test('in a party of three they stand three, three and two', () => {
  assert.deepEqual(board(2, [1, 1, 1], 5), [3, 3, 2]);
});

test("the Pradruid's four still stand two by two ahead of it", () => {
  assert.deepEqual(board(2, [0, 0, 1], 4), [2, 2, 1]);
});

test('a summon takes the nearest free field ahead first', () => {
  assert.equal(summonField([0, 0], 1), 0);
  assert.equal(summonField([1, 0], 1), 1);
  // (Of equals the nearest field ahead, before the summoner's own.)
  assert.equal(summonField([1, 1], 1), 0);
  assert.equal(summonField([2, 1], 1), 1);
  assert.equal(summonField([2, 2], 1), 2);
});

test("a summoner at the front keeps its summons in its own field, before it", () => {
  assert.equal(summonField([], 1), 0);
  assert.deepEqual(board(0, [1, 0, 0], 2), [3, 0, 0]);
});

test('with no field to offer there is none', () => {
  assert.equal(summonField([], null), -1);
});
