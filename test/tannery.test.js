// The Garbarnia (the Osada; the author's 325 A: "Niech sprzedaje i
// skupuje skóry (drożej) na podobieństwo Jagny / To troche ułatwi
// dodatkowo sprawę tym, którym braknie pare materiałów do Zleceń w
// Osadzie"): Wszebor the tanner buys hides for more than the scrapper, more
// with a better relation, and sells them, more of them and cheaper with a
// better relation; the trade raises the relation with him and the hunters'
// reputation up to a limit a day.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { buyCeiling, isHide, materialPrice, parseStack, saleGold, stackKey, tanneryPremium, tanneryStock } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.tannery;
const { standings } = content.settlement;
const rank = (key) => content.rarities.findIndex((rarity) => rarity.id === parseStack(key).rarityId);
// The scrapper with the Skup złomu at its top.
const topSkup = 1 + content.buildings.filter((building) => building.effect.kind === 'sellPrice').reduce((sum, building) => sum + building.effect.perLevel * building.maxLevel, 0);

describe('the Garbarnia in the engine', () => {
  test('the hides are skins and furs of ordinary creatures, at any rarity', () => {
    for (const id of tuning.hides) {
      const material = content.materialsById[id];
      assert.match(material.name, /^(Skóra|Futro|Futerko|Sierść|Wylinka) /, id);
      const monster = content.monstersById[material.monster];
      assert.ok(monster && !monster.elite && !monster.champion, id);
      for (const rarity of content.rarities) assert.ok(isHide(stackKey(id, rarity.id), content), `${id}:${rarity.id}`);
    }
    // Every material named as a skin or a fur is his, the snake's slough too.
    for (const material of content.materials.filter((one) => /^(Skóra|Futro|Futerko|Sierść|Wylinka) /.test(one.name))) {
      assert.ok(tuning.hides.includes(material.id), material.id);
    }
    // Scales, feathers, fangs, a trophy and orders' "any material" are not.
    for (const key of ['viper-scales:common', 'crow-feather:rare', 'boar-tusk:rare', 'spider-moults:rare', 'wisp-flame:legendary', 'any:common', 'wolf-pelt:none', 'wolf-pelt', null]) {
      assert.equal(isHide(key, content), false, String(key));
    }
  });

  test('he pays more over the scrapper with each standing of the relation', () => {
    const premiums = standings.map((standing) => tanneryPremium(standing.points, content));
    assert.ok(premiums[0] > 0);
    for (let i = 1; i < premiums.length; i++) assert.ok(premiums[i] >= premiums[i - 1]);
    assert.ok(premiums.at(-1) > premiums[0]);
  });

  test('he sells the three commonest hides at first, and more with each standing, all of them to a friend', () => {
    const stocks = standings.map((standing) => tanneryStock(standing.points, content));
    assert.equal(stocks[0].hides.length, 3);
    assert.ok(stocks[0].hides.every(({ key }) => parseStack(key).rarityId === 'common'));
    assert.deepEqual(stocks[0].next, { standing: standings[1].name, hides: stocks[1].hides.slice(3).map((hide) => hide.key) });
    for (let i = 1; i < stocks.length; i++) {
      assert.ok(stocks[i].hides.length > stocks[i - 1].hides.length, standings[i].id);
      // A better relation keeps what he sold before and adds to it.
      assert.deepEqual(
        stocks[i].hides.slice(0, stocks[i - 1].hides.length).map((hide) => hide.key),
        stocks[i - 1].hides.map((hide) => hide.key),
      );
    }
    const all = stocks.at(-1).hides.map((hide) => hide.key);
    assert.deepEqual(all.map((key) => parseStack(key).materialId).sort(), [...tuning.hides].sort());
    assert.equal(stocks.at(-1).next, null);
    // The commonest first, each at its species' own rarity.
    all.forEach((key, index) => index > 0 && assert.ok(rank(key) >= rank(all[index - 1]), key));
    for (const key of all) assert.equal(parseStack(key).rarityId, content.materialsById[parseStack(key).materialId].rarity, key);
  });

  test('his price is always above the most anyone in the game pays for the hide, and falls with the relation (287 A)', () => {
    for (const { key } of tanneryStock(standings.at(-1).points, content).hides) {
      assert.ok(buyCeiling({ kind: 'material', key }, content) >= materialPrice(parseStack(key).rarityId, content) * topSkup * (1 + Math.max(...tuning.premium)), key);
      const prices = standings.map((standing) => tanneryStock(standing.points, content).hides.find((hide) => hide.key === key)?.price).filter(Boolean);
      for (const price of prices) assert.ok(price > buyCeiling({ kind: 'material', key }, content), key);
      prices.forEach((one, index) => index > 0 && assert.ok(one <= prices[index - 1], key));
      // A hide he has from a lower standing on costs less with a better one.
      if (prices.length > 2) assert.ok(prices[0] > prices.at(-1), key);
      // Bought and sold back to him at his best, with the Skup złomu at its
      // top, a hide only loses gold.
      assert.ok(prices.at(-1) > materialPrice(parseStack(key).rarityId, content) * topSkup * (1 + Math.max(...tuning.premium)), key);
    }
  });
});

describe('the Garbarnia through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  const hide = stackKey('wolf-pelt', 'common');
  const rareHide = stackKey('wolf-pelt', 'rare');

  beforeEach(async () => {
    ({ cookie } = await signUp('garbarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Garbarz', classId: 'archer', appearance: 'male' } });
    await (await db())
      .prepare('UPDATE characters SET level = 25, class_level = 25, gold = 0, materials = ?')
      .bind(JSON.stringify({ [hide]: 400, [rareHide]: 3, 'viper-scales:common': 5 }))
      .run();
  });

  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
  const materials = async () => JSON.parse((await (await db()).prepare('SELECT materials FROM characters').first()).materials);

  test('the Garbarnia stands on the board with Wszebor, who greets a stranger', async () => {
    const settlement = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    const place = settlement.places.find((one) => one.id === 'tannery');
    assert.deepEqual([place.name, place.resident], ['Garbarnia', tuning.resident]);
    const tanner = settlement.residents.find((one) => one.id === tuning.resident);
    assert.deepEqual([tanner.name, tanner.title, tanner.service, tanner.greeting], ['Wszebor', 'garbarz', 'tannery', content.residentsById[tuning.resident].greetings[0]]);
  });

  test('hides sell to Wszebor for more than to the scrapper and raise the relation and the reputation', async () => {
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.tannery;
    // Only the hides, the commonest first; the viper's scales are not his.
    assert.deepEqual(
      view.goods.map((good) => [good.key, good.count]),
      [
        [hide, 400],
        [rareHide, 3],
      ],
    );
    const good = view.goods[0];
    assert.equal(good.name, 'Skóra wilka');
    assert.equal(view.goods[1].name, 'Rzadka skóra wilka');
    assert.ok(good.price > good.scrap);
    assert.equal(good.price, materialPrice('common', content) * (1 + tuning.premium[0]));
    const sold = await call('POST', '/api/settlement/tannery', { cookie, body: { key: hide, count: 100 } });
    assert.equal(sold.status, 200);
    assert.deepEqual(sold.data.sold, { name: 'Skóra wilka', count: 100, gold: saleGold(good.price, 100), points: sold.data.sold.points });
    assert.equal(sold.data.character.gold, sold.data.sold.gold);
    assert.equal((await materials())[hide], 300);
    const after = await stored();
    assert.equal(after.relations[tuning.resident] ?? 0, sold.data.sold.points);
    assert.equal(after.reputation[tuning.brotherhood] ?? 0, sold.data.sold.points);
    // A rarer piece for more; the last of a stack leaves no empty stack.
    const rare = await call('POST', '/api/settlement/tannery', { cookie, body: { key: rareHide, count: 3 } });
    assert.equal(rare.status, 200);
    assert.equal(rare.data.sold.gold, saleGold(materialPrice('rare', content) * (1 + tuning.premium[0]), 3));
    assert.equal(rareHide in (await materials()), false);
    // No more than the character has, and only hides.
    assert.equal((await call('POST', '/api/settlement/tannery', { cookie, body: { key: hide, count: 301 } })).data.error.code, 'not_enough');
    assert.equal((await call('POST', '/api/settlement/tannery', { cookie, body: { key: hide, count: 0 } })).data.error.code, 'not_enough');
    assert.equal((await call('POST', '/api/settlement/tannery', { cookie, body: { key: 'viper-scales:common', count: 1 } })).data.error.code, 'invalid_goods');
    assert.equal((await materials())['viper-scales:common'], 5);
  });

  test("the day's reputation from his trade stops at the limit, apart from Jagna's; the gold does not", async () => {
    await (await db()).prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [hide]: 100000 })).run();
    let points = 0;
    for (let i = 0; i < 3; i++) {
      const sold = await call('POST', '/api/settlement/tannery', { cookie, body: { key: hide, count: 30000 } });
      assert.equal(sold.status, 200);
      assert.ok(sold.data.sold.gold > 0);
      points += sold.data.sold.points;
    }
    assert.equal(points, tuning.reputation.daily);
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    assert.deepEqual(view.tannery.trade, { today: tuning.reputation.daily, daily: tuning.reputation.daily });
    assert.equal(view.herbalist.trade.today, 0);
    // Another service's save keeps the day's count.
    assert.equal((await call('POST', '/api/settlement/tavern', { cookie })).status, 200);
    assert.equal((await stored()).tanneryTrade.points, tuning.reputation.daily);
  });

  test('he sells hides for gold straight to the materials, and the trade raises the relation as selling does', async () => {
    await (await db()).prepare('UPDATE characters SET gold = 1000, materials = ?').bind('{}').run();
    const { shop } = (await call('GET', '/api/settlement', { cookie })).data.settlement.tannery;
    assert.deepEqual(
      shop.goods.map((good) => good.key),
      tanneryStock(0, content).hides.map((one) => one.key),
    );
    assert.equal(shop.next.standing, standings[1].name);
    assert.equal(shop.discount, 0);
    const good = shop.goods.find((one) => one.key === hide);
    assert.deepEqual([good.name, good.kind, good.rarity, good.material.materialId], ['Skóra wilka', 'material', 'common', 'wolf-pelt']);
    assert.ok(good.price > good.scrap);
    const bought = await call('POST', '/api/settlement/tannery/buy', { cookie, body: { key: hide, count: 20 } });
    assert.equal(bought.status, 200);
    assert.deepEqual(bought.data.bought, { name: 'Skóra wilka', count: 20, gold: good.price * 20, points: bought.data.bought.points });
    assert.ok(bought.data.bought.points > 0);
    assert.equal(bought.data.character.gold, 1000 - good.price * 20);
    const row = await (await db()).prepare('SELECT materials, foreign_stacks FROM characters').first();
    assert.equal(JSON.parse(row.materials)[hide], 20);
    // Bought, not found: the Encyklopedia leaves it out.
    assert.equal(JSON.parse(row.foreign_stacks)[`material:${hide}`], 20);
    const after = await stored();
    assert.equal(after.relations[tuning.resident] ?? 0, bought.data.bought.points);
    assert.equal(after.reputation[tuning.brotherhood] ?? 0, bought.data.bought.points);
    assert.equal(after.tanneryTrade.points, bought.data.bought.points);
    // What he sold he buys back for far less.
    const back = bought.data.settlement.tannery.goods.find((one) => one.key === hide);
    assert.ok(back.price * 20 < good.price * 20);
  });

  test('he sells only what he has at the relation, for gold the character has; a friend gets every hide, cheaper', async () => {
    await (await db()).prepare('UPDATE characters SET gold = 50').run();
    const buy = (body) => call('POST', '/api/settlement/tannery/buy', { cookie, body });
    const top = tanneryStock(standings.at(-1).points, content).hides.at(-1);
    assert.equal((await buy({ key: top.key, count: 1 })).data.error.code, 'no_goods');
    assert.equal((await buy({ key: 'viper-scales:common', count: 1 })).data.error.code, 'no_goods');
    assert.equal((await buy({ key: hide, count: 0 })).data.error.code, 'invalid_count');
    assert.equal((await buy({ key: hide, count: 1000 })).data.error.code, 'not_enough_gold');
    const friend = standings.at(-1).points;
    await (await db()).prepare('UPDATE characters SET gold = 100000, settlement = ?').bind(JSON.stringify({ relations: { [tuning.resident]: friend } })).run();
    const { shop } = (await call('GET', '/api/settlement', { cookie })).data.settlement.tannery;
    assert.equal(shop.goods.length, tuning.hides.length);
    assert.equal(shop.next, null);
    assert.equal(shop.discount, content.settlement.relationDiscount.at(-1));
    const bought = await buy({ key: top.key, count: 2 });
    assert.equal(bought.status, 200);
    assert.equal(bought.data.bought.gold, top.price * 2);
    assert.equal((await materials())[top.key], 2);
  });
});
