// Kulki Profesji over the scene of a work (DECISIONS.md, „Kulki Profesji
// (24.11.2026)”): their moments from the work's seed and length, as the
// Kulki Systemu's; what an orb gives by the work and the character's level
// (camp resources worth a Kulka Systemu's gold, a few of the work's own
// product, minutes of the profession's XP or Punkty Czasu, never Punkty
// Systemu); their own day's limit.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WORK_ORB_STORES, knownMinerals, orbBlock, orbMoments, orbsCaught, questPeriod, workOrbProducts, workOrbReward, workOrbTimes } from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rules = content.orbs.professions;
const MINUTE = 60000;
const SECOND = 1000;
const DAY = 24 * 3600000;
const seeds = (count) => Array.from({ length: count }, (_, index) => `work-orb-${index}`);
// The works of the professions, each with a profession's own options.
const WORKS = {
  herbs: { options: { herbs: ['comfrey', 'nettle'] }, profession: 'herbalism' },
  potions: { options: { recipe: content.potions[0].id, count: 3 }, profession: 'alchemy' },
  items: { options: { base: 'sword', rarity: 'common', count: 1 }, profession: 'crafting' },
  minerals: { options: {}, profession: 'mining' },
  jewels: { options: { base: 'ring', rarity: 'common', count: 1 }, profession: 'jewelcrafting' },
  fish: { options: { fish: ['roach', 'perch'] }, profession: 'fishing' },
  crops: { options: { plots: ['turnip', null, 'turnip', 'peas'] }, profession: 'farming' },
  dishes: { options: { recipe: content.dishes[0].id, count: 2 }, profession: 'cooking' },
};

describe('the moments of a work\'s orbs', () => {
  test("as the Kulki Systemu's of an exploration as long, from the work's seed, in server time", () => {
    const work = { seed: 'a1b2c3', minutes: 90, startedAt: 1_000_000, endsAt: 1_000_000 + 90 * MINUTE };
    const times = workOrbTimes(work, content);
    assert.deepEqual(
      times,
      orbMoments('a1b2c3', 90, 90 * MINUTE, content).map((offset) => work.startedAt + offset),
    );
    assert.equal(times.length, 9);
    assert.deepEqual(workOrbTimes({ ...work }, content), times);
    assert.notDeepEqual(workOrbTimes({ ...work, seed: 'd4e5f6' }, content), times);
    // A work moved by "Przewiń" or the Pomoc Gildii: its orbs move with it.
    assert.deepEqual(
      workOrbTimes({ ...work, startedAt: work.startedAt - 5 * MINUTE, endsAt: work.endsAt - 5 * MINUTE }, content),
      times.map((at) => at - 5 * MINUTE),
    );
    // Each can be caught before the work ends.
    for (const seed of seeds(100)) {
      for (const at of workOrbTimes({ ...work, seed }, content)) assert.ok(at + content.orbs.claimSeconds * SECOND <= work.endsAt);
    }
  });
});

describe('what a work\'s orb may give of its product', () => {
  test('the herbs gathered, the fish caught and the crops sown, as often as each comes', () => {
    assert.deepEqual(workOrbProducts({ kind: 'herbs', options: WORKS.herbs.options, level: 5 }, content), [
      { id: 'comfrey', weight: content.herbsById.comfrey.perHour },
      { id: 'nettle', weight: content.herbsById.nettle.perHour },
    ]);
    assert.deepEqual(
      workOrbProducts({ kind: 'fish', options: WORKS.fish.options, level: 3 }, content).map((product) => product.id),
      ['roach', 'perch'],
    );
    // Each crop once, whatever the plots it grows on; none of an empty plot.
    assert.deepEqual(workOrbProducts({ kind: 'crops', options: WORKS.crops.options, level: 3 }, content), [
      { id: 'turnip', weight: content.cropsById.turnip.perHour },
      { id: 'peas', weight: content.cropsById.peas.perHour },
    ]);
    // What the data no longer has is left out.
    assert.deepEqual(workOrbProducts({ kind: 'herbs', options: { herbs: ['gone-herb', 7] }, level: 5 }, content), []);
  });

  test("the minerals Górnictwo has revealed at its level, the brewing's potion, the cooking's dish, nothing of items", () => {
    for (const level of [1, 25, 80]) {
      assert.deepEqual(
        workOrbProducts({ kind: 'minerals', options: {}, level }, content).map((product) => product.id),
        knownMinerals(level, content).map((mineral) => mineral.id),
      );
    }
    assert.ok(!workOrbProducts({ kind: 'minerals', options: {}, level: 1 }, content).some((product) => product.id === 'diamond'));
    assert.deepEqual(workOrbProducts({ kind: 'potions', options: WORKS.potions.options, level: 1 }, content), [{ id: WORKS.potions.options.recipe, weight: 1 }]);
    assert.deepEqual(workOrbProducts({ kind: 'dishes', options: WORKS.dishes.options, level: 1 }, content), [{ id: WORKS.dishes.options.recipe, weight: 1 }]);
    assert.deepEqual(workOrbProducts({ kind: 'items', options: WORKS.items.options, level: 50 }, content), []);
    assert.deepEqual(workOrbProducts({ kind: 'jewels', options: WORKS.jewels.options, level: 50 }, content), []);
  });
});

describe('what a work\'s orb gives', () => {
  const draw = (kind, level, { count = 2000, classLevel = level } = {}) => {
    const products = workOrbProducts({ kind, options: WORKS[kind].options, level: 30 }, content);
    return seeds(count).map((seed, index) => workOrbReward({ seed, index: index % 5, kind, level, classLevel, products }, content));
  };
  const share = (rewards, kind) => rewards.filter((reward) => reward.kind === kind).length / rewards.length;

  test('the same orb gives the same; its number draws anew', () => {
    const orb = { seed: 'a1b2c3', index: 2, kind: 'herbs', level: 40, products: workOrbProducts({ kind: 'herbs', options: WORKS.herbs.options, level: 5 }, content) };
    assert.deepEqual(workOrbReward(orb, content), workOrbReward({ ...orb }, content));
    const others = [0, 1, 3, 4, 5, 6, 7].map((index) => workOrbReward({ ...orb, index }, content));
    assert.ok(others.some((reward) => JSON.stringify(reward) !== JSON.stringify(workOrbReward(orb, content))));
  });

  test('by the weights of the data, never Punkty Systemu; a work without a product gives resources in its place', () => {
    assert.equal(rules.perDay, 8);
    for (const [kind, { profession }] of Object.entries(WORKS)) {
      const rewards = draw(kind, 40);
      const range = rules.products[profession];
      const product = range ? rules.kinds.product : 0;
      assert.ok(Math.abs(share(rewards, 'resources') - (rules.kinds.resources + rules.kinds.product - product)) < 0.04, `${kind}: resources ${share(rewards, 'resources')}`);
      assert.ok(Math.abs(share(rewards, 'product') - product) < 0.04, `${kind}: product ${share(rewards, 'product')}`);
      assert.ok(Math.abs(share(rewards, 'xp') - rules.kinds.xp) < 0.03, `${kind}: xp ${share(rewards, 'xp')}`);
      assert.ok(Math.abs(share(rewards, 'time') - rules.kinds.time) < 0.03, `${kind}: time ${share(rewards, 'time')}`);
      for (const reward of rewards) {
        assert.ok(!JSON.stringify(reward).toLowerCase().includes('system'));
        if (reward.kind === 'xp') assert.deepEqual(reward, { kind: 'xp', profession, minutes: rules.xpMinutes });
        if (reward.kind === 'time') assert.ok(reward.timePoints >= content.orbs.timePoints[0] && reward.timePoints <= content.orbs.timePoints[1]);
        if (reward.kind === 'product') {
          assert.equal(reward.store, WORK_ORB_STORES[kind]);
          assert.ok(reward.amount >= range[0] && reward.amount <= range[1], `${kind}: ${reward.amount}`);
        }
      }
    }
    // Rzemieślnictwo and Jubilerstwo have no product to give.
    assert.equal(rules.products.crafting, undefined);
    assert.equal(rules.products.jewelcrafting, undefined);
  });

  test('a product as often as it comes in the work: the commoner herb more often, from one to three', () => {
    const products = draw('herbs', 40).filter((reward) => reward.kind === 'product');
    const comfrey = products.filter((reward) => reward.product === 'comfrey').length / products.length;
    const { comfrey: one, nettle: other } = content.herbsById;
    assert.ok(Math.abs(comfrey - one.perHour / (one.perHour + other.perHour)) < 0.05, `comfrey ${comfrey}`);
    assert.deepEqual(new Set(products.map((reward) => reward.amount)), new Set([1, 2, 3]));
    // A potion or a dish one at a time.
    assert.deepEqual(new Set(draw('potions', 40).filter((reward) => reward.kind === 'product').map((reward) => reward.amount)), new Set([1]));
  });

  test("camp resources worth a Kulka Systemu's gold: half to a whole find's, of one of the three", () => {
    for (const level of [1, 10, 50, 100, 200]) {
      const resources = draw('items', level).filter((reward) => reward.kind === 'resources');
      const find = content.balance.rewards.findResourcePerLevel * level;
      // A find gives as many resources as gold.
      assert.equal(content.balance.rewards.findResourcePerLevel, content.balance.rewards.findGoldPerLevel);
      for (const reward of resources) {
        assert.ok(reward.amount >= Math.max(1, Math.round(find * rules.resourceShare[0])) && reward.amount <= Math.round(find * rules.resourceShare[1]), `level ${level}: ${reward.amount}`);
      }
      assert.deepEqual(new Set(resources.map((reward) => reward.resource)), new Set(['wood', 'stone', 'iron-ore']));
    }
  });

  test('from the 250th class level half the resources, as the gold of a Kulka Systemu; the rest as before', () => {
    const before = draw('minerals', 217, { classLevel: 249 });
    const after = draw('minerals', 217, { classLevel: 250 });
    const mean = (rewards) => {
      const amounts = rewards.filter((reward) => reward.kind === 'resources').map((reward) => reward.amount);
      return amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    };
    assert.ok(Math.abs(mean(after) / mean(before) - 0.5) < 0.03, `${mean(after)} of ${mean(before)}`);
    assert.deepEqual(after.map((reward) => reward.kind), before.map((reward) => reward.kind));
  });
});

describe("the day's own limit", () => {
  const noon = questPeriod('daily', Date.now() + 10 * DAY, content).startsAt + 12 * 3600000;
  const today = questPeriod('daily', noon, content).key;
  const tomorrow = questPeriod('daily', noon + DAY, content).key;

  test("perDay of their own, counted as the Kulki Systemu's day", () => {
    assert.equal(orbsCaught({ day: tomorrow, count: 1 }, noon, content, rules.perDay), rules.perDay);
    assert.equal(orbsCaught({ day: today, count: 3 }, noon, content, rules.perDay), 3);
    const block = (caught, perDay) => orbBlock({ at: noon, now: noon, taken: false, caught, perDay }, content);
    assert.equal(block(rules.perDay - 1, rules.perDay), null);
    assert.equal(block(rules.perDay, rules.perDay), 'limit');
    // Their limit, not the Kulki Systemu's.
    assert.equal(block(content.orbs.perDay, content.orbs.perDay + 2), null);
  });
});
