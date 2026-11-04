// The rewards for a brotherhood's new standings (the author's 593 A and B,
// 4.11.2026): Punkty Systemu 1 / 2 / 3 / 5 and a gift of the brotherhood's
// goods, once for each standing, taken with "Odbierz" in the "Akceptacja
// Bractw" panel; the standings passed before come together.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { buyCeiling, herbalistStock, standingReward, standingRewardsDue, tanneryStock } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { standings, brotherhoods } = content.settlement;
const points = (id) => standings.find((standing) => standing.id === id).points;
const worth = (reward) =>
  reward.gold +
  Object.entries(reward.herbs).reduce((sum, [id, count]) => sum + count * buyCeiling({ kind: 'herb', key: id }, content), 0) +
  Object.entries(reward.materials).reduce((sum, [key, count]) => sum + count * buyCeiling({ kind: 'material', key }, content), 0) +
  Object.entries(reward.parts).reduce((sum, [id, count]) => sum + count * buyCeiling({ kind: 'part', key: id }, content), 0);

describe('the rewards for a new standing, in the engine', () => {
  test('Punkty Systemu 1 / 2 / 3 / 5, nothing for the first standing, the same in every brotherhood', () => {
    for (const brotherhood of brotherhoods) {
      assert.deepEqual(
        standings.map((_, index) => standingReward(brotherhood.id, index, content).systemPoints),
        [0, 1, 2, 3, 5],
      );
    }
  });

  test('each gift is of its brotherhood’s goods and grows with the standing, about as much worth in each', () => {
    for (let index = 1; index < standings.length; index += 1) {
      const herbs = standingReward('herbalists', index, content);
      const before = new Set(herbalistStock(standings[index - 1].points, content).herbs.map((herb) => herb.id));
      const added = herbalistStock(standings[index].points, content).herbs.filter((herb) => !before.has(herb.id)).map((herb) => herb.id);
      assert.deepEqual(Object.keys(herbs.herbs), added, 'the herbs the standing puts on Jagna’s shelf');
      const hunters = standingReward('hunters', index, content);
      const shelf = tanneryStock(standings[index].points, content).goods.slice(tanneryStock(standings[index - 1].points, content).goods.length);
      assert.deepEqual(Object.keys(hunters.materials), shelf.slice(-3).map((good) => good.key), 'the three rarest it puts on Wszebor’s');
      const smiths = standingReward('smiths', index, content);
      for (const id of Object.keys(smiths.parts)) assert.ok(content.partsById[id], id);
      assert.ok(standingReward('merchants', index, content).gold > 0);
      const values = ['herbalists', 'hunters', 'smiths', 'merchants'].map((id) => worth(standingReward(id, index, content)));
      assert.ok(Math.max(...values) < Math.min(...values) * 1.5, `${index}: ${values}`);
      if (index > 1) assert.ok(Math.min(...values) > worth(standingReward('merchants', index - 1, content)));
    }
    assert.deepEqual(standingReward('smiths', 1, content).parts, { straps: 10 });
    assert.equal(standingReward('merchants', 4, content).gold, 5000);
  });

  test('what waits: the standings past the last one rewarded, summed; nothing at the first standing or once taken', () => {
    const due = standingRewardsDue('smiths', points('regular'), 0, content);
    assert.deepEqual([due.systemPoints, due.parts, due.standings], [3, { straps: 10, fittings: 10 }, [1, 2]]);
    assert.deepEqual(standingRewardsDue('smiths', points('friend'), 2, content).standings, [3, 4]);
    assert.equal(standingRewardsDue('smiths', points('friend'), 4, content), null);
    assert.equal(standingRewardsDue('smiths', points('acquaintance') - 1, 0, content), null);
  });
});

describe('the rewards for a new standing through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('nagrody'));
    await call('POST', '/api/character', { cookie, body: { name: 'Nagrody', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, tutorial = NULL').run();
  });

  const repute = async (reputation, rewarded) =>
    (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify({ reputation, ...(rewarded && { rewarded }) })).run();
  const row = async () => (await db()).prepare('SELECT * FROM characters').first();
  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const claim = (brotherhood) => call('POST', '/api/settlement/brotherhoods/reward', { cookie, body: { brotherhood } });

  test('the panel shows what waits, "Odbierz" gives it once, and a higher standing brings the next', async () => {
    await repute({ smiths: points('regular') });
    const smiths = (await settlement()).brotherhoods.find((one) => one.id === 'smiths');
    assert.deepEqual(smiths.reward.standings, ['Znajomy', 'Stały klient']);
    assert.deepEqual(
      smiths.reward.goods.map((good) => [good.kind, good.count]),
      [
        ['systemPoints', 3],
        ['part', 10],
        ['part', 10],
      ],
    );
    assert.equal((await settlement()).brotherhoods.find((one) => one.id === 'herbalists').reward, null);
    const before = await row();
    const taken = await claim('smiths');
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.reward.brotherhood, 'Bractwo Kowali');
    const after = await row();
    assert.equal(after.system_points, before.system_points + 3);
    assert.deepEqual(JSON.parse(after.parts), { straps: 10, fittings: 10 });
    assert.equal(JSON.parse(after.settlement).rewarded.smiths, 2);
    assert.equal(taken.data.settlement.brotherhoods.find((one) => one.id === 'smiths').reward, null);
    assert.equal((await claim('smiths')).data.error.code, 'no_reward');
    // Przyjaciel: Zaufany and Przyjaciel come, not the two taken.
    await repute({ smiths: points('friend') }, { smiths: 2 });
    const next = await claim('smiths');
    assert.equal(next.status, 200, JSON.stringify(next.data));
    assert.equal((await row()).system_points, before.system_points + 3 + 8);
    assert.deepEqual(JSON.parse((await row()).parts), { straps: 10, fittings: 10, shards: 10, amber: 14 });
  });

  test('the Kompania Kupców gives gold, the Bractwo Łowców materials kept out of the Encyklopedia', async () => {
    await repute({ merchants: points('acquaintance'), hunters: points('acquaintance') });
    const gold = (await row()).gold;
    assert.equal((await claim('merchants')).status, 200);
    assert.equal((await row()).gold, gold + 400);
    const hunters = await claim('hunters');
    assert.equal(hunters.status, 200, JSON.stringify(hunters.data));
    const materials = JSON.parse((await row()).materials);
    assert.deepEqual(materials, standingReward('hunters', 1, content).materials);
    const foreign = JSON.parse((await row()).foreign_stacks);
    for (const key of Object.keys(materials)) assert.equal(foreign[`material:${key}`], 2);
  });

  test('the herbs go into the bag, and wait while the bag is full', async () => {
    await repute({ herbalists: points('acquaintance') });
    const id = (await row()).id;
    // A bag full of items.
    const database = await db();
    for (let index = 0; index < 60; index += 1) {
      await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify({ base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 10 })).run();
    }
    const full = await claim('herbalists');
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.equal(JSON.parse((await row()).settlement).rewarded, undefined);
    await database.prepare('DELETE FROM items').run();
    const taken = await claim('herbalists');
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(JSON.parse((await row()).herbs), { plantain: 15, 'st-johns-wort': 15 });
  });

  test('the Osada tab has its dot while a reward waits', async () => {
    const waiting = async () => (await call('GET', '/api/character', { cookie })).data.character.settlementWaiting;
    assert.equal(await waiting(), false);
    await repute({ merchants: points('acquaintance') });
    assert.equal(await waiting(), true);
    await claim('merchants');
    assert.equal(await waiting(), false);
    assert.equal((await claim('nobody')).data.error.code, 'no_brotherhood');
  });
});
