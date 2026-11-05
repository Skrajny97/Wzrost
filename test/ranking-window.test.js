// The rows the Ranking shows (src/client/ranking-window.js): the first ten
// places and the character's own with two above and below, a gap ("…")
// only where places are left out, never for one place alone (players on
// the chat, 5.11.2026), and every row under "Pokaż całą listę".

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AROUND, TOP, rankingWindow } from '../src/client/ranking-window.js';

const rows = Array.from({ length: 100 }, (_, index) => ({ place: index + 1 }));
const places = (picked) => picked.map((row) => (row === null ? '…' : row.place));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

test('the first ten, and the character\'s place with two above and two below it', () => {
  assert.deepEqual([TOP, AROUND], [10, 2]);
  // Among the first ten, or none of its own: the first ten.
  assert.deepEqual(places(rankingWindow(rows, 4)), range(1, 10));
  assert.deepEqual(places(rankingWindow(rows, -1)), range(1, 10));
  // Just below them: the list goes on without a gap.
  assert.deepEqual(places(rankingWindow(rows, 10)), range(1, 13));
  assert.deepEqual(places(rankingWindow(rows, 12)), range(1, 15));
  // One place alone left out shows instead of "…".
  assert.deepEqual(places(rankingWindow(rows, 13)), range(1, 16));
  // Further down, "…" stands for the places left out.
  assert.deepEqual(places(rankingWindow(rows, 14)), [...range(1, 10), '…', ...range(13, 17)]);
  assert.deepEqual(places(rankingWindow(rows, 15)), [...range(1, 10), '…', ...range(14, 18)]);
  assert.deepEqual(places(rankingWindow(rows, 99)), [...range(1, 10), '…', ...range(98, 100)]);
});

test('a short list, or the whole one asked for, shows every row', () => {
  const short = rows.slice(0, 15);
  assert.deepEqual(places(rankingWindow(short, 14)), range(1, 15));
  assert.deepEqual(places(rankingWindow(rows, 50, true)), range(1, 100));
});
