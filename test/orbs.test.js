// Kulki Systemu on the exploration board (DECISIONS.md, „Kulki Systemu na
// planszy wyprawy (makieta, 19.11.2026)”): the moments of an exploration's
// orbs from its seed, what an orb gives by the character's level (never
// Punkty Systemu, half the gold from the 250th class level, 0.4.60), the
// day's count and when a tap is taken.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { lateRewards, orbBlock, orbMaterials, orbMoments, orbReward, orbsCaught, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rules = content.orbs;
const MINUTE = 60000;
const SECOND = 1000;
const DAY = 24 * 3600000;
const seeds = (count) => Array.from({ length: count }, (_, index) => `orb-seed-${index}`);

describe('the moments of the orbs', () => {
  test('the same seed gives the same moments, another seed others', () => {
    const one = orbMoments('a1b2c3', 60, 60 * MINUTE, content);
    assert.deepEqual(orbMoments('a1b2c3', 60, 60 * MINUTE, content), one);
    assert.notDeepEqual(orbMoments('d4e5f6', 60, 60 * MINUTE, content), one);
  });

  test('about one for every 10 minutes, at least one from 10 minutes on, none drawn for a short one now and then', () => {
    assert.equal(rules.minutesPerOrb, 10);
    for (const [minutes, least, most, average] of [
      [10, 1, 1, 1],
      [15, 1, 2, 1.5],
      [60, 6, 6, 6],
      [240, 24, 24, 24],
    ]) {
      const counts = seeds(400).map((seed) => orbMoments(seed, minutes, minutes * MINUTE, content).length);
      assert.ok(Math.min(...counts) >= least && Math.max(...counts) <= most, `${minutes} min: ${Math.min(...counts)}–${Math.max(...counts)}`);
      const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      assert.ok(Math.abs(mean - average) < 0.1, `${minutes} min: ${mean} on average`);
    }
    const short = seeds(400).map((seed) => orbMoments(seed, 5, 5 * MINUTE, content).length);
    assert.ok(short.includes(0) && short.includes(1) && Math.max(...short) === 1);
    assert.ok(Math.abs(short.filter(Boolean).length / short.length - 0.5) < 0.1);
  });

  test('spread over the wait: in order, from the start gap on, no two flights at once, each window closed before the end', () => {
    for (const seed of seeds(200)) {
      for (const [minutes, wait] of [
        [60, 60 * MINUTE],
        // A mount's shorter wait (stable.js): the same orbs, inside it.
        [60, 54 * MINUTE],
        [240, 240 * MINUTE],
        [1, MINUTE],
      ]) {
        const moments = orbMoments(seed, minutes, wait, content);
        moments.forEach((at, index) => {
          assert.ok(at >= rules.startGapSeconds * SECOND, `${seed}: ${at} before the start gap`);
          assert.ok(at + rules.claimSeconds * SECOND <= wait, `${seed}: the window of ${at} past the end ${wait}`);
          if (index > 0) assert.ok(at >= moments[index - 1] + rules.flightSeconds * SECOND, `${seed}: ${moments[index - 1]} and ${at} fly at once`);
        });
      }
    }
  });

  test('random within each part: the first orb of an hour comes anywhere in its first ten minutes', () => {
    const firsts = seeds(400).map((seed) => orbMoments(seed, 60, 60 * MINUTE, content)[0]);
    assert.ok(Math.min(...firsts) < 3 * MINUTE && Math.max(...firsts) > 7 * MINUTE, `${Math.min(...firsts)}–${Math.max(...firsts)}`);
  });

  test('no room in the wait, no orbs', () => {
    assert.deepEqual(orbMoments('a1b2c3', 10, 30 * SECOND, content), []);
  });
});

describe('what an orb gives', () => {
  const place = (level) => content.areas.filter((area) => area.minLevel <= level).at(-1);
  // The class level as high as the character's, unless named (a typical
  // character's class is higher).
  const draw = (level, count = 2000, classLevel = level) => seeds(count).map((seed, index) => orbReward({ seed, index: index % 5, level, classLevel, area: place(level) }, content));
  const share = (rewards, kind) => rewards.filter((reward) => reward.kind === kind).length / rewards.length;

  test('the same orb gives the same; its number draws anew', () => {
    const orb = { seed: 'a1b2c3', index: 2, level: 40, area: place(40) };
    assert.deepEqual(orbReward(orb, content), orbReward({ ...orb }, content));
    const others = [0, 1, 3, 4, 5, 6, 7].map((index) => orbReward({ ...orb, index }, content));
    assert.ok(others.some((reward) => JSON.stringify(reward) !== JSON.stringify(orbReward(orb, content))));
  });

  test('mostly gold of a small find at the level, sometimes 1–3 Punkty Czasu or one material of the place, never Punkty Systemu', () => {
    for (const level of [1, 10, 50, 100, 200]) {
      const rewards = draw(level);
      assert.ok(Math.abs(share(rewards, 'gold') - rules.kinds.gold) < 0.04, `level ${level}: gold ${share(rewards, 'gold')}`);
      assert.ok(Math.abs(share(rewards, 'time') - rules.kinds.time) < 0.03, `level ${level}: time ${share(rewards, 'time')}`);
      assert.ok(Math.abs(share(rewards, 'material') - rules.kinds.material) < 0.03, `level ${level}: material ${share(rewards, 'material')}`);
      const find = content.balance.rewards.findGoldPerLevel * level;
      for (const reward of rewards) {
        assert.ok(!('systemPoints' in reward) && !JSON.stringify(reward).toLowerCase().includes('system'));
        if (reward.kind === 'gold') assert.ok(reward.gold >= Math.round(find * rules.goldShare[0]) && reward.gold <= Math.round(find * rules.goldShare[1]), `level ${level}: ${reward.gold}`);
        if (reward.kind === 'time') assert.ok(reward.timePoints >= 1 && reward.timePoints <= 3);
        if (reward.kind === 'material') {
          assert.ok(orbMaterials(place(level), content).some((material) => material.id === reward.material));
          assert.equal(reward.stack, `${reward.material}:${content.materialsById[reward.material].rarity}`);
          assert.equal(reward.amount, 1);
        }
      }
    }
  });

  test("the place's material: of its ordinary creatures, of the lowest rarity among them", () => {
    for (const area of content.areas) {
      const materials = orbMaterials(area, content);
      assert.ok(materials.length > 0, area.id);
      const rarities = new Set(materials.map((material) => material.rarity));
      assert.equal(rarities.size, 1, area.id);
      for (const material of materials) {
        const monster = content.monstersById[material.monster];
        assert.ok(!monster.elite && !monster.champion, `${area.id}: ${material.id}`);
      }
    }
    // The first place's are all common.
    assert.deepEqual(new Set(orbMaterials(content.areasById['windfalls-edge'], content).map((material) => material.rarity)), new Set(['common']));
  });

  test('from the 250th class level (0.4.60, not the character\'s) half the gold, the material half as often (its rest to gold), Punkty Czasu as before', () => {
    assert.equal(lateRewards(249, content), 1);
    assert.equal(lateRewards(250, content), 0.5);
    // A character of the 217th level, its class at 249 and at 250.
    const before = draw(217, 3000, 249);
    const after = draw(217, 3000, 250);
    const golds = (rewards) => rewards.filter((reward) => reward.kind === 'gold').map((reward) => reward.gold);
    const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
    const ratio = mean(golds(after)) / mean(golds(before));
    assert.ok(Math.abs(ratio - 0.5) < 0.03, `gold ${ratio} of before`);
    assert.ok(Math.max(...golds(after)) <= Math.round(content.balance.rewards.findGoldPerLevel * 217 * rules.goldShare[1] * 0.5));
    // The character's own level alone halves nothing: its class decides.
    const lowClass = draw(260, 3000, 240);
    assert.ok(Math.abs(share(lowClass, 'material') - rules.kinds.material) < 0.03, `material ${share(lowClass, 'material')}`);
    assert.ok(Math.min(...golds(lowClass)) >= Math.round(content.balance.rewards.findGoldPerLevel * 260 * rules.goldShare[0]));
    assert.ok(Math.abs(share(after, 'material') - rules.kinds.material / 2) < 0.02, `material ${share(after, 'material')}`);
    assert.ok(Math.abs(share(after, 'gold') - (rules.kinds.gold + rules.kinds.material / 2)) < 0.03, `gold ${share(after, 'gold')}`);
    assert.ok(Math.abs(share(after, 'time') - share(before, 'time')) < 0.03);
    assert.deepEqual(new Set(after.filter((reward) => reward.kind === 'time').map((reward) => reward.timePoints)), new Set([1, 2, 3]));
  });

  test('without a place, no material', () => {
    const rewards = seeds(300).map((seed) => orbReward({ seed, index: 0, level: 30, area: null }, content));
    assert.equal(share(rewards, 'material'), 0);
    assert.ok(share(rewards, 'gold') > rules.kinds.gold);
  });
});

describe('the day and the window of a tap', () => {
  const noon = questPeriod('daily', Date.now() + 10 * DAY, content).startsAt + 12 * 3600000;
  const today = questPeriod('daily', noon, content).key;
  const yesterday = questPeriod('daily', noon - DAY, content).key;
  const tomorrow = questPeriod('daily', noon + DAY, content).key;

  test("the day's count: today's as kept, an earlier day's none, a later day's all", () => {
    assert.equal(orbsCaught(null, noon, content), 0);
    assert.equal(orbsCaught({ day: today, count: 3 }, noon, content), 3);
    assert.equal(orbsCaught({ day: yesterday, count: 8 }, noon, content), 0);
    assert.equal(orbsCaught({ day: tomorrow, count: 1 }, noon, content), rules.perDay);
    // From midnight Polish time the count starts anew.
    const midnight = questPeriod('daily', noon, content).endsAt;
    assert.equal(orbsCaught({ day: today, count: 8 }, midnight - 1, content), 8);
    assert.equal(orbsCaught({ day: today, count: 8 }, midnight, content), 0);
  });

  test('taken from earlySeconds before its moment to claimSeconds after it, once, while the day has orbs left', () => {
    const at = noon;
    const block = (now, { taken = false, caught = 0 } = {}) => orbBlock({ at, now, taken, caught }, content);
    assert.equal(block(at), null);
    assert.equal(block(at - rules.earlySeconds * SECOND), null);
    assert.equal(block(at - rules.earlySeconds * SECOND - 1), 'early');
    assert.equal(block(at - 60 * SECOND), 'early');
    assert.equal(block(at + rules.claimSeconds * SECOND), null);
    assert.equal(block(at + rules.claimSeconds * SECOND + 1), 'gone');
    assert.equal(block(at + 5 * SECOND, { taken: true }), 'claimed');
    assert.equal(block(at + 5 * SECOND, { caught: rules.perDay - 1 }), null);
    assert.equal(block(at + 5 * SECOND, { caught: rules.perDay }), 'limit');
    assert.equal(rules.perDay, 8);
  });
});
