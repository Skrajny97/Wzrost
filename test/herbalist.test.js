// The Chata zielarki (the Osada, part III, questions 120 A and 121 A): Jagna
// buys herbs and potions for more than the scrapper, more with a better
// relation, and the trade raises the relation with her and the herbalists'
// reputation up to a limit a day.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { herbalistPremium, tradePoints } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 9, 30, 10, 0);
const tuning = content.settlement.herbalist;

describe('the Chata zielarki in the engine', () => {
  test('Jagna pays more over the scrapper with each standing of the relation', () => {
    const premiums = content.settlement.standings.map((standing) => herbalistPremium(standing.points, content));
    assert.ok(premiums[0] > 0);
    for (let i = 1; i < premiums.length; i++) assert.ok(premiums[i] >= premiums[i - 1]);
  });

  test("the trade's reputation is a point for so much gold a level, at most the day's limit", () => {
    const level = 30;
    const per = tuning.reputation.goldPerPointPerLevel * level;
    assert.equal(tradePoints(per - 1, level, null, NOW, content).points, 0);
    const first = tradePoints(per * 3, level, null, NOW, content);
    assert.equal(first.points, 3);
    const capped = tradePoints(per * 100, level, first.trade, NOW + 60000, content);
    assert.equal(capped.points, tuning.reputation.daily - 3);
    assert.equal(tradePoints(per * 5, level, capped.trade, NOW + 120000, content).points, 0);
    // A new day starts the count again.
    assert.equal(tradePoints(per * 5, level, capped.trade, NOW + 86400000, content).points, 5);
  });
});

describe('the Chata zielarki through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  const herb = content.herbs[0];

  beforeEach(async () => {
    ({ cookie } = await signUp('zielarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zielarka', classId: 'cleric', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 0, herbs = ?').bind(JSON.stringify({ [herb.id]: 400 })).run();
  });

  test('herbs sell to Jagna for more than to the scrapper and raise the relation and the reputation', async () => {
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist;
    const good = view.goods.find((one) => one.id === herb.id);
    assert.equal(good.count, 400);
    assert.ok(good.price > good.scrap);
    const sold = await call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'herb', id: herb.id, count: 100 } });
    assert.equal(sold.status, 200);
    assert.equal(sold.data.sold.gold, Math.max(1, Math.round(good.price * 100)));
    assert.equal(sold.data.character.gold, sold.data.sold.gold);
    const stored = JSON.parse((await (await db()).prepare('SELECT settlement, herbs FROM characters').first()).settlement);
    assert.equal(stored.relations[tuning.resident] ?? 0, sold.data.sold.points);
    assert.equal(stored.reputation[tuning.brotherhood] ?? 0, sold.data.sold.points);
    assert.equal(JSON.parse((await (await db()).prepare('SELECT herbs FROM characters').first()).herbs)[herb.id], 300);
    // No more than the bag holds, and only herbs and potions.
    assert.equal((await call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'herb', id: herb.id, count: 301 } })).data.error.code, 'not_enough');
    assert.equal((await call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'part', id: herb.id, count: 1 } })).data.error.code, 'invalid_goods');
  });

  test("the day's reputation from trade stops at the limit, the gold does not", async () => {
    await (await db()).prepare('UPDATE characters SET herbs = ?').bind(JSON.stringify({ [herb.id]: 100000 })).run();
    let points = 0;
    for (let i = 0; i < 3; i++) {
      const sold = await call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'herb', id: herb.id, count: 30000 } });
      assert.equal(sold.status, 200);
      assert.ok(sold.data.sold.gold > 0);
      points += sold.data.sold.points;
    }
    assert.equal(points, tuning.reputation.daily);
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist;
    assert.deepEqual(view.trade, { today: tuning.reputation.daily, daily: tuning.reputation.daily });
  });
});
