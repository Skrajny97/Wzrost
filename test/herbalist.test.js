// The Chata zielarki (the Osada, part III, questions 120 A and 121 A): Jagna
// buys herbs and potions for more than the scrapper, more with a better
// relation, and the trade raises the relation with her and the herbalists'
// reputation up to a limit a day. She also sells herbs (the author: "Niech
// ma na początku 3 podstawowe zioła, a w miarę zwiekszania znajomości coraz
// więcej", "Kup oczywiście zawsze drożej").

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { buyCeiling, herbalistPremium, herbalistStock, tradePoints } from '../src/engine/index.js';
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

  const { standings } = content.settlement;
  const byLevel = [...content.herbs].sort((a, b) => a.level - b.level);

  test('she sells the three simplest herbs at first, and more with each standing, all of them to a friend', () => {
    const stocks = standings.map((standing) => herbalistStock(standing.points, content));
    assert.deepEqual(
      stocks[0].herbs.map((herb) => herb.id),
      byLevel.slice(0, 3).map((herb) => herb.id),
    );
    assert.deepEqual(stocks[0].next, { standing: standings[1].name, herbs: byLevel.slice(3, stocks[1].herbs.length).map((herb) => herb.id) });
    for (let i = 1; i < stocks.length; i++) assert.ok(stocks[i].herbs.length > stocks[i - 1].herbs.length, standings[i].id);
    assert.equal(stocks.at(-1).herbs.length, content.herbs.length);
    assert.equal(stocks.at(-1).next, null);
  });

  test('her price is always above the most anyone in the game pays for the herb', () => {
    for (const { id, price } of herbalistStock(standings.at(-1).points, content).herbs) {
      assert.ok(price > buyCeiling({ kind: 'herb', key: id }, content), id);
      // Jagna herself at her best, with the Skup złomu at its top.
      assert.ok(price > content.herbsById[id].price * 2 * (1 + Math.max(...tuning.premium)), id);
    }
  });

  test('a potion brewed from her herbs brings no more than the herbs cost', () => {
    const prices = Object.fromEntries(herbalistStock(standings.at(-1).points, content).herbs.map((herb) => [herb.id, herb.price]));
    for (const potion of content.potions) {
      const cost = Object.entries(potion.herbs).reduce((sum, [id, count]) => sum + prices[id] * count, 0);
      assert.ok(cost >= buyCeiling({ kind: 'potion', key: potion.id }, content) - 1e-9, potion.id);
    }
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

  test('she sells herbs into the bag for gold, and the trade raises the relation as selling does', async () => {
    await (await db()).prepare('UPDATE characters SET gold = 1000, herbs = ?').bind('{}').run();
    const { shop } = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist;
    assert.deepEqual(
      shop.goods.map((good) => good.key),
      [...content.herbs].sort((a, b) => a.level - b.level).slice(0, 3).map((herb) => herb.id),
    );
    const good = shop.goods.find((one) => one.key === herb.id);
    assert.equal(good.fits % content.professionRules.stack, 0);
    assert.equal(shop.next.standing, content.settlement.standings[1].name);
    const bought = await call('POST', '/api/settlement/herbalist/buy', { cookie, body: { id: herb.id, count: 25 } });
    assert.equal(bought.status, 200);
    assert.deepEqual(bought.data.bought, { name: herb.name, count: 25, gold: good.price * 25, points: bought.data.bought.points });
    assert.equal(bought.data.character.gold, 1000 - good.price * 25);
    const row = await (await db()).prepare('SELECT herbs, foreign_stacks, settlement FROM characters').first();
    assert.equal(JSON.parse(row.herbs)[herb.id], 25);
    // Bought, not found: the Encyklopedia leaves it out.
    assert.equal(JSON.parse(row.foreign_stacks)[`herb:${herb.id}`], 25);
    const stored = JSON.parse(row.settlement);
    assert.equal(stored.relations[tuning.resident] ?? 0, bought.data.bought.points);
    assert.equal(stored.reputation[tuning.brotherhood] ?? 0, bought.data.bought.points);
    // Two stacks now: the second takes the rest of its room.
    const after = bought.data.settlement.herbalist.shop.goods.find((one) => one.key === herb.id);
    assert.equal(after.fits, good.fits - 25);
  });

  test('she sells only what she has at the relation, for gold the character has, while the bag has places', async () => {
    await (await db()).prepare('UPDATE characters SET gold = 50, herbs = ?').bind('{}').run();
    const buy = (body) => call('POST', '/api/settlement/herbalist/buy', { cookie, body });
    const top = [...content.herbs].sort((a, b) => b.level - a.level)[0];
    assert.equal((await buy({ id: top.id, count: 1 })).data.error.code, 'no_goods');
    assert.equal((await buy({ id: herb.id, count: 0 })).data.error.code, 'invalid_count');
    assert.equal((await buy({ id: herb.id, count: 1000 })).data.error.code, 'not_enough_gold');
    const { shop } = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist;
    const fits = shop.goods.find((one) => one.key === herb.id).fits;
    await (await db()).prepare('UPDATE characters SET gold = 100000000').run();
    assert.equal((await buy({ id: herb.id, count: fits + 1 })).data.error.code, 'bag_full');
    assert.equal((await buy({ id: herb.id, count: fits })).status, 200);
    assert.equal((await buy({ id: herb.id, count: 1 })).data.error.code, 'bag_full');
    // A friend of hers gets every herb, the rarest too.
    const friend = content.settlement.standings.at(-1).points;
    await (await db()).prepare('UPDATE characters SET herbs = ?, settlement = ?').bind('{}', JSON.stringify({ relations: { [tuning.resident]: friend } })).run();
    const all = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist.shop;
    assert.equal(all.goods.length, content.herbs.length);
    assert.equal(all.next, null);
    assert.equal((await buy({ id: top.id, count: 1 })).status, 200);
  });
});
