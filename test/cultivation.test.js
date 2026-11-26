// Kultywacja (DECISIONS.md, „Kultywacja (1230 A)”): while the class is
// ahead, the character meditates for character XP, 4 times what an
// exploration as long gives in the newest place its class opens (xpPerHour
// at that place's top level, as tools/level-gap-sim.mjs counts it), never
// past the class's level; every meditation also grows the Kultywacja's own
// level (0–100, from 4 hours for the first to 20 for the hundredth, the
// author's 1248 B), each a share more character XP from explorations.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  areaUnlocked,
  cultivationBonus,
  cultivationGain,
  cultivationHours,
  cultivationKept,
  cultivationMinutes,
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
import { project, VARIANTS } from '../tools/level-gap-sim.mjs';

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
  test('1248 B: 4 hours for the first level, evenly more to 20 hours for the hundredth, in 5 minutes', () => {
    assert.equal(cultivationXpToNext(0, content), 240);
    assert.equal(cultivationXpToNext(1, content), 250);
    assert.equal(cultivationXpToNext(9, content), 325);
    assert.equal(cultivationXpToNext(49, content), 715);
    assert.equal(cultivationXpToNext(99, content), 1200);
    for (let level = 1; level < 100; level += 1) {
      assert.ok(cultivationXpToNext(level, content) >= cultivationXpToNext(level - 1, content), `level ${level}`);
      assert.equal(cultivationXpToNext(level, content) % 5, 0, `level ${level}`);
    }
    // The totals the author chose by (1248 B) and DECISIONS.md gives, in
    // minutes: level 10 after 47 h 25 min, 25 after 148 h 40 min, 50 after
    // 398 h and 100 after 1200 h.
    assert.equal(cultivationHours(1, content), 4);
    assert.deepEqual(
      [5, 10, 25, 50, 75, 100].map((level) => Math.round(cultivationHours(level, content) * 60)),
      [1300, 2845, 8920, 23880, 44920, 72000],
    );
  });

  test('a point of its XP a minute; level 100 is the top, nothing past it', () => {
    assert.deepEqual(cultivationProgress(fresh, 240, content), { level: 1, xp: 0, gained: 240 });
    assert.deepEqual(cultivationProgress(fresh, 60, content), { level: 0, xp: 60, gained: 60 });
    assert.deepEqual(cultivationProgress({ level: 1, xp: 240 }, 30, content), { level: 2, xp: 20, gained: 30 });
    assert.equal(cultivationXpToNext(100, content), 0);
    // Ten minutes short of the top: those ten count, the rest is lost.
    assert.deepEqual(cultivationProgress({ level: 99, xp: 1200 - 10 }, 240, content), { level: 100, xp: 0, gained: 10 });
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

describe('Kultywacja: its lengths', () => {
  test("10 minutes to 8 hours every 10, as a profession's work, the same at every level (the author, 24.11.2026)", () => {
    const lengths = cultivationMinutes(content);
    assert.equal(lengths.length, 48);
    assert.deepEqual([lengths[0], lengths[1], lengths.at(-1)], [10, 20, 480]);
    assert.ok(lengths.every((minutes, index) => minutes === 10 * (index + 1)));
    // Not an exploration's: its 1 and 5 minutes are not here, its 8 hours are
    // (an exploration has at most 4).
    assert.ok(!lengths.includes(1) && !lengths.includes(5));
    assert.ok(lengths.includes(480) && !huntDurations(500, content).includes(480));
  });

  test('8 hours give twice the XP of 4, up to the class level; the Kultywacja 480 points', () => {
    const rate = cultivationRate(124, content);
    assert.equal(cultivationXp(rate, 480), Math.round(rate * 8));
    assert.equal(cultivationXp(rate, 480, 1000), 1000);
    const plan = cultivationPlan({ level: 104, xp: 0, classLevel: 124 }, fresh, cultivationMinutes(content), content);
    const longest = plan.lengths.at(-1);
    assert.equal(longest.minutes, 480);
    assert.equal(longest.xp, Math.min(plan.cap, cultivationXp(rate, 480)));
    assert.equal(longest.cultivationXp, 480);
    assert.equal(longest.cultivationLevel, cultivationProgress(fresh, 480, content).level);
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

  test("an Awatar's plan (26.11.2026): its share of the character XP up to the same cap, the Kultywacja's XP whole", () => {
    const share = content.avatar.share;
    assert.equal(share, 0.25);
    const character = { level: 104, xp: 1234, classLevel: 124 };
    const progress = { level: 2, xp: 600 };
    const durations = cultivationMinutes(content);
    const own = cultivationPlan(character, progress, durations, content);
    const plan = cultivationPlan(character, progress, durations, content, share);
    const rate = cultivationRate(124, content);
    assert.deepEqual([own.share, plan.share], [1, share]);
    assert.equal(plan.cap, own.cap);
    assert.equal(plan.open, own.open);
    assert.equal(plan.possible, own.possible);
    assert.deepEqual([plan.factor, plan.area], [own.factor, own.area]);
    assert.equal(plan.rate, Math.round(rate * share));
    assert.equal(plan.minutes, Math.ceil((plan.cap / (rate * share)) * 60));
    plan.lengths.forEach((length, index) => {
      // A quarter of what the character's own meditation keeps, rounded as
      // an Awatar's share of a work is.
      const kept = Math.round(cultivationXp(rate, length.minutes) * share);
      assert.equal(cultivationKept(rate, length.minutes, share), kept);
      assert.equal(length.xp, Math.min(plan.cap, kept));
      assert.equal(length.level, gainXp(104, 1234, length.xp, toNext, maxLevel).level);
      assert.ok(length.xp <= own.lengths[index].xp);
      assert.equal(length.cultivationXp, own.lengths[index].cultivationXp);
      assert.equal(length.cultivationLevel, own.lengths[index].cultivationLevel);
    });
    // The character's own keeps it whole, as before.
    for (const minutes of [10, 60, 480]) assert.equal(cultivationKept(rate, minutes), cultivationXp(rate, minutes));
    // Long enough, the share reaches the cap too, never past it.
    const near = cultivationPlan({ level: 123, xp: 0, classLevel: 124 }, fresh, [480], content, share);
    assert.equal(near.lengths[0].xp, Math.min(near.cap, Math.round(cultivationXp(rate, 480) * share)));
    assert.ok(near.lengths[0].level <= 124);
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

describe('Kultywacja in tools/level-gap-sim.mjs', () => {
  const from = { level: 100, classLevel: 119 };

  test("the sim's meditation grows the Kultywacja's levels as the game counts them", () => {
    const [week] = project({ variant: VARIANTS.cult4cap, cultivate: 'slot', from, weeks: [1] }, content);
    assert.ok(week.cultivated > 0);
    assert.equal(week.cultivationLevel, cultivationProgress(fresh, Math.round(week.cultivated * 60), content).level);
    // Without a Kultywacja, no levels.
    assert.equal(project({ variant: VARIANTS.now, from, weeks: [1] }, content)[0].cultivationLevel, 0);
  });

  test("a day's slot of 8 hours, the longest Kultywacja, meditates twice the hours of 4 while the class is ahead", () => {
    const week = (slotHours) => project({ variant: VARIANTS.cult4cap, cultivate: 'slot', slotHours, from, weeks: [1] }, content)[0];
    assert.equal(Math.max(...cultivationMinutes(content)), 8 * 60);
    assert.equal(week(4).cultivated, 7 * 4);
    assert.equal(week(8).cultivated, 7 * 8);
    assert.ok(week(8).cultivationLevel > week(4).cultivationLevel);
  });
});
