// Kultywacja (DECISIONS.md, „Kultywacja (1230 A)”): while the class is
// ahead, the character meditates for character XP only, 4 times what an
// exploration as long gives in the newest place its class opens
// (xpPerHour at that place's top level, as tools/level-gap-sim.mjs counts
// it), never past the class's level; nothing at equal levels.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  areaUnlocked,
  cultivationGain,
  cultivationPlan,
  cultivationRate,
  cultivationXp,
  gainXp,
  huntDurations,
  newestArea,
  xpPerHour,
  xpToLevel,
  xpToNext,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';

const FACTOR = content.balance.cultivation.xpFactor;
const toNext = (level) => xpToNext(level, content);
const maxLevel = content.balance.progression.maxLevel;

describe('Kultywacja: the XP', () => {
  test('the author chose 4 times an exploration (1230 A, cult4cap)', () => {
    assert.equal(FACTOR, 4);
  });

  test('the newest place a class opens is the open inner region of the highest levels', () => {
    for (const classLevel of [1, 5, 23, 57, 124, 200, 320, 500]) {
      const newest = newestArea(classLevel, content);
      const open = content.areas.filter((area) => areaUnlocked(area, classLevel, content));
      assert.ok(open.includes(newest), `class ${classLevel}`);
      assert.equal(newest.maxLevel, Math.max(...open.map((area) => area.maxLevel)), `class ${classLevel}`);
    }
    // Class level 23 opens the place of levels 21-25, not the next one.
    assert.equal(newestArea(23, content).maxLevel, 25);
  });

  test('an hour is 4 times the XP an hour of exploring gives at the top level of the newest place', () => {
    for (const classLevel of [10, 57, 124, 320]) {
      const top = newestArea(classLevel, content).maxLevel;
      assert.equal(cultivationRate(classLevel, content), 4 * xpPerHour(top, content));
    }
  });

  test('a length gives its share of the hour, rounded, at most the cap', () => {
    const rate = cultivationRate(124, content);
    assert.equal(cultivationXp(rate, 60), Math.round(rate));
    assert.equal(cultivationXp(rate, 30), Math.round(rate / 2));
    assert.equal(cultivationXp(rate, 240, 1000), 1000);
  });

  test('the XP to a level counts from the XP into the current one', () => {
    assert.equal(xpToLevel(10, 0, 11, content), toNext(10));
    assert.equal(xpToLevel(10, 25, 12, content), toNext(10) + toNext(11) - 25);
    assert.equal(xpToLevel(12, 0, 12, content), 0);
    assert.equal(xpToLevel(13, 0, 12, content), 0);
  });
});

describe('Kultywacja: the plan for the card', () => {
  test("with the class ahead: each length's XP up to the cap, and the level it brings", () => {
    const character = { level: 104, xp: 1234, classLevel: 124 };
    const durations = huntDurations(104, content);
    const plan = cultivationPlan(character, durations, content);
    const rate = cultivationRate(124, content);
    const cap = xpToLevel(104, 1234, 124, content);
    assert.equal(plan.open, true);
    assert.equal(plan.factor, 4);
    assert.equal(plan.area.id, newestArea(124, content).id);
    assert.equal(plan.cap, cap);
    assert.equal(plan.minutes, Math.ceil((cap / rate) * 60));
    assert.deepEqual(
      plan.lengths.map((length) => length.minutes),
      durations,
    );
    for (const length of plan.lengths) {
      const xp = Math.min(cap, Math.round((rate * length.minutes) / 60));
      assert.equal(length.xp, xp);
      assert.equal(length.level, gainXp(104, 1234, xp, toNext, maxLevel).level);
      assert.ok(length.level <= 124);
    }
  });

  test('a length long enough is capped at the class level, never past it', () => {
    // Three levels behind: an hour more than catches up.
    const character = { level: 20, xp: 0, classLevel: 23 };
    const plan = cultivationPlan(character, [1, 10, 30, 60, 240], content);
    const longest = plan.lengths.at(-1);
    assert.equal(longest.xp, plan.cap);
    assert.equal(longest.level, 23);
    assert.ok(plan.minutes > 10 && plan.minutes <= 60, `${plan.minutes} minutes`);
    assert.ok(plan.lengths[0].xp < plan.cap);
  });

  test('at equal levels (or the character above) it cannot begin and gives nothing', () => {
    for (const character of [
      { level: 120, xp: 0, classLevel: 120 },
      { level: 120, xp: 999, classLevel: 120 },
      { level: 52, xp: 0, classLevel: 50 },
    ]) {
      const plan = cultivationPlan(character, [30, 240], content);
      assert.equal(plan.open, false);
      assert.equal(plan.cap, 0);
      assert.equal(plan.minutes, 0);
      assert.deepEqual(
        plan.lengths.map((length) => [length.xp, length.level]),
        [
          [0, character.level],
          [0, character.level],
        ],
      );
    }
  });
});

describe('Kultywacja: the claim', () => {
  const character = { classId: 'warrior', level: 104, xp: 0, classLevel: 124, classXp: 0, points: {}, appearance: 'female' };

  test('gives the XP kept at its start while it does not reach the class', () => {
    const xp = cultivationXp(cultivationRate(124, content), 240);
    const { gained, capped, after } = cultivationGain(character, xp, content);
    assert.equal(gained, xp);
    assert.equal(capped, false);
    const expected = gainXp(104, 0, xp, toNext, maxLevel);
    assert.equal(after.level, expected.level);
    assert.equal(after.xp, expected.xp);
    assert.equal(after.timePoints, content.balance.timePoints.perLevel * (expected.level - 104));
  });

  test('stops at the class level as it is at the claim, with the levels, Time Points and System lines', () => {
    const { gained, capped, after } = cultivationGain(character, 10 ** 12, content);
    assert.equal(gained, xpToLevel(104, 0, 124, content));
    assert.equal(capped, true);
    assert.equal(after.level, 124);
    assert.equal(after.xp, 0);
    assert.equal(after.levelled, true);
    assert.equal(after.timePoints, content.balance.timePoints.perLevel * 20);
    assert.ok(after.messages.length > 0);
  });

  test('gives nothing once the character has caught up meanwhile', () => {
    const { gained, capped, after } = cultivationGain({ ...character, level: 124 }, 5000, content);
    assert.equal(gained, 0);
    assert.equal(capped, true);
    assert.equal(after.level, 124);
    assert.equal(after.levelled, false);
    assert.deepEqual(after.messages, []);
  });
});
