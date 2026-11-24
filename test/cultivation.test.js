// Kultywacja (DECISIONS.md, „Kultywacja (1230 A)”): while the class is
// ahead, the character meditates for character XP, 4 times what an
// exploration as long gives in the newest place its class opens (xpPerHour
// at that place's top level, as tools/level-gap-sim.mjs counts it), never
// past the class's level; every meditation also grows the Kultywacja's own
// level (0–100, the first in 4 hours, the next ones longer, as a
// profession's), each a share more character XP from explorations.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  areaUnlocked,
  cultivationBonus,
  cultivationGain,
  cultivationHours,
  cultivationPlan,
  cultivationProgress,
  cultivationRate,
  cultivationXp,
  cultivationXpToNext,
  gainXp,
  huntDurations,
  huntReport,
  newestArea,
  xpPerHour,
  xpToLevel,
  xpToNext,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';

const FACTOR = content.balance.cultivation.xpFactor;
const toNext = (level) => xpToNext(level, content);
const maxLevel = content.balance.progression.maxLevel;
const fresh = { level: 0, xp: 0 };

describe('Kultywacja: the character XP', () => {
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

describe("Kultywacja: its own levels and their bonus", () => {
  test('the first level takes 4 hours of meditation, each next one longer, as a profession', () => {
    assert.equal(cultivationXpToNext(0, content), 240);
    assert.equal(cultivationXpToNext(1, content), 480);
    assert.equal(cultivationXpToNext(9, content), 2400);
    assert.equal(cultivationHours(1, content), 4);
    // The totals DECISIONS.md gives.
    assert.deepEqual(
      [10, 25, 50, 100].map((level) => cultivationHours(level, content)),
      [220, 1300, 5100, 20200],
    );
  });

  test('a point of its XP a minute; level 100 is the top, nothing past it', () => {
    assert.deepEqual(cultivationProgress(fresh, 240, content), { level: 1, xp: 0, gained: 240 });
    assert.deepEqual(cultivationProgress(fresh, 60, content), { level: 0, xp: 60, gained: 60 });
    assert.deepEqual(cultivationProgress({ level: 1, xp: 470 }, 30, content), { level: 2, xp: 20, gained: 30 });
    assert.equal(cultivationXpToNext(100, content), 0);
    // Ten minutes short of the top: those ten count, the rest is lost.
    assert.deepEqual(cultivationProgress({ level: 99, xp: 100 * 240 - 10 }, 240, content), { level: 100, xp: 0, gained: 10 });
    assert.deepEqual(cultivationProgress({ level: 100, xp: 0 }, 240, content), { level: 100, xp: 0, gained: 0 });
  });

  test('each level gives +1% character XP from explorations, +100% at level 100', () => {
    assert.equal(cultivationBonus(0, content), 0);
    assert.equal(cultivationBonus(1, content), 0.01);
    assert.equal(cultivationBonus(37, content), 0.37);
    assert.equal(cultivationBonus(100, content), 1);
  });

  test("an exploration's character XP gets the share more, the class's XP not; the report tells it", () => {
    const character = { classId: 'warrior', level: 104, xp: 0, classLevel: 124, classXp: 0, points: {}, appearance: 'female' };
    const hunt = { xp: 12345, result: 'success', minutes: 60, gold: 0, resources: {}, materials: {}, items: [], fights: [], timePoints: 0, potionsUsed: {} };
    const plain = applyHunt(character, hunt, content);
    const share = { level: 10, share: cultivationBonus(10, content) };
    const boosted = applyHunt(character, hunt, content, { cultivation: share });
    assert.equal(plain.characterXp, 12345);
    assert.equal(boosted.characterXp, Math.round(12345 * 1.1));
    assert.deepEqual(boosted.cultivation, { level: 10, share: 0.1, xp: Math.round(12345 * 1.1) - 12345 });
    assert.equal(boosted.xp, gainXp(104, 0, Math.round(12345 * 1.1), toNext, maxLevel).xp);
    // The class: the exploration's XP as it is.
    assert.equal(boosted.classLevel, plain.classLevel);
    assert.equal(boosted.classXp, plain.classXp);
    const report = huntReport({ hunt, applied: boosted, character, areaId: content.areas[0].id, startedAt: 0, endsAt: 3600000 }, content);
    assert.equal(report.summary.xp, Math.round(12345 * 1.1));
    assert.equal(report.summary.classXp, 12345);
    assert.ok(report.system.includes(`Kultywacja (poziom 10): +10% XP postaci z wyprawy, +${Math.round(12345 * 1.1) - 12345} XP.`));
    // Without the Kultywacja's levels nothing changes.
    const report0 = huntReport({ hunt, applied: plain, character, areaId: content.areas[0].id, startedAt: 0, endsAt: 3600000 }, content);
    assert.equal(report0.summary.xp, 12345);
    assert.ok(!report0.system.some((line) => line.startsWith('Kultywacja')));
  });
});

describe('Kultywacja: the plan for the card', () => {
  test("with the class ahead: each length's character XP up to the cap and its level, and the Kultywacja's XP and level", () => {
    const character = { level: 104, xp: 1234, classLevel: 124 };
    const durations = huntDurations(104, content);
    const progress = { level: 2, xp: 600 };
    const plan = cultivationPlan(character, progress, durations, content);
    const rate = cultivationRate(124, content);
    const cap = xpToLevel(104, 1234, 124, content);
    assert.equal(plan.open, true);
    assert.equal(plan.possible, true);
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
      assert.equal(length.cultivationXp, length.minutes);
      assert.equal(length.cultivationLevel, cultivationProgress(progress, length.minutes, content).level);
    }
  });

  test('a length long enough is capped at the class level, never past it', () => {
    // Three levels behind: an hour more than catches up.
    const character = { level: 20, xp: 0, classLevel: 23 };
    const plan = cultivationPlan(character, fresh, [1, 10, 30, 60, 240], content);
    const longest = plan.lengths.at(-1);
    assert.equal(longest.xp, plan.cap);
    assert.equal(longest.level, 23);
    assert.ok(plan.minutes > 10 && plan.minutes <= 60, `${plan.minutes} minutes`);
    assert.ok(plan.lengths[0].xp < plan.cap);
  });

  test('at equal levels (or the character above) no character XP, but the Kultywacja still grows', () => {
    for (const character of [
      { level: 120, xp: 0, classLevel: 120 },
      { level: 120, xp: 999, classLevel: 120 },
      { level: 52, xp: 0, classLevel: 50 },
    ]) {
      const plan = cultivationPlan(character, fresh, [30, 240], content);
      assert.equal(plan.open, false);
      assert.equal(plan.possible, true);
      assert.equal(plan.cap, 0);
      assert.equal(plan.minutes, 0);
      assert.deepEqual(
        plan.lengths.map((length) => [length.xp, length.level, length.cultivationXp, length.cultivationLevel]),
        [
          [0, character.level, 30, 0],
          [0, character.level, 240, 1],
        ],
      );
    }
  });

  test('at equal levels with the Kultywacja at its top, a meditation would give nothing', () => {
    const plan = cultivationPlan({ level: 120, xp: 0, classLevel: 120 }, { level: 100, xp: 0 }, [30], content);
    assert.equal(plan.possible, false);
    assert.deepEqual(plan.lengths, [{ minutes: 30, xp: 0, level: 120, cultivationXp: 0, cultivationLevel: 100 }]);
    // With the class ahead it still gives the character XP.
    assert.equal(cultivationPlan({ level: 110, xp: 0, classLevel: 120 }, { level: 100, xp: 0 }, [30], content).possible, true);
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

  test('gives no character XP once the character has caught up meanwhile', () => {
    const { gained, capped, after } = cultivationGain({ ...character, level: 124 }, 5000, content);
    assert.equal(gained, 0);
    assert.equal(capped, true);
    assert.equal(after.level, 124);
    assert.equal(after.levelled, false);
    assert.deepEqual(after.messages, []);
  });
});
