// Poziom 1 of the Labirynt is a level most players clear (DECISIONS.md,
// „Labirynt: Poziom 1 znów do przejścia”, 26.11.2026; the author: „I co
// zrobiłeś z Labiryntem, że teraz ludzie padają jak muchy na pierwszym
// poziomie już”). With the strong rooms of 0.5.22 on it, a player who just
// clicks (tools/labyrinth-sim.mjs, --player random) cleared it on about
// half the days at every level, 95% of the days lost there lost in a strong
// room; without them on 94–100% of the days, as in 0.5.20 (about 300 days
// a cell). This keeps it so for the characters of tools/difficulty-sim.mjs
// of levels 30–110, alone and with two companions, each day only up to
// Poziom 1 cleared.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { measureLabyrinth } from '../tools/labyrinth-sim.mjs';
import { content } from './helpers/content.js';

const LEVELS = [30, 50, 80, 110];
const DAYS = 6;
// The floors, well under the measured 94–100% and far over the 45–59% of
// 0.5.22.
const FLOOR = 0.85;
const LEVEL_FLOOR = 0.75;

test('a player who just clicks clears Poziom 1 on most days, levels 30–110, alone and with two companions', () => {
  const classes = content.classes.map((cls) => cls.id);
  let total = 0;
  const shares = [];
  for (const level of LEVELS) {
    let sum = 0;
    for (const companions of [0, 2]) {
      for (const classId of classes) sum += measureLabyrinth({ classId, level, days: DAYS, picks: 'random', companions, stop: 1 }, content)[0];
    }
    const share = sum / (classes.length * 2);
    shares.push(`${level}: ${(share * 100).toFixed(0)}%`);
    assert.ok(share >= LEVEL_FLOOR, `level ${level}: ${shares.join(', ')}`);
    total += share / LEVELS.length;
  }
  assert.ok(total >= FLOOR, `${(total * 100).toFixed(0)}% (${shares.join(', ')})`);
});
