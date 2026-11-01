// The Kuźnia (question 326 A; the author: "Kowal i to i rzadkość, niech to
// Bractwo ma zastosowanie jakieś"): Żelisław sells Zwoje ochronne, a few a
// day, and raises an item's rarity by one step, once per item, as far as the
// relation with him lets him; the Bractwo Kowali's reputation lowers his
// gold prices.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, forgeDiscount, forgeTopRarity, generateItem, nextRarity, raiseOffer, raiseRarity, scrollPrice } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.forge;
const { standings } = content.settlement;
const sword = generateItem({ baseId: 'sword', level: 20, rarityId: 'rare' }, createRng('kowal'), content);
const rank = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

describe('the Kuźnia in the engine', () => {
  test('the next rarity is one step up, none above the top', () => {
    assert.equal(nextRarity({ rarity: 'common' }, content).id, 'rare');
    assert.equal(nextRarity({ rarity: 'mythic' }, content).id, 'divine');
    assert.equal(nextRarity({ rarity: 'divine' }, content), null);
  });

  test('a better relation lets the smith go higher, a better reputation costs less', () => {
    const tops = standings.map((standing) => rank(forgeTopRarity(standing.points, content)));
    tops.forEach((top, index) => index > 0 && assert.ok(top > tops[index - 1], standings[index].id));
    assert.equal(forgeTopRarity(standings.at(-1).points, content), 'divine');
    assert.equal(forgeDiscount(0, content), 0);
    const prices = standings.map((standing) => scrollPrice(standing.points, content));
    assert.equal(prices[0], tuning.scroll.gold);
    prices.forEach((price, index) => index > 0 && assert.ok(price < prices[index - 1], standings[index].id));
  });

  test('raising takes gold by the level and the new rarity and pieces of a material of the item\'s rarity, once per item', () => {
    const offer = raiseOffer(sword, 0, 0, content);
    // The material of the item's own rarity (339 A), as the Kowadło takes.
    assert.deepEqual(offer, { next: 'unique', gold: tuning.raise.goldPerLevel * 20 * content.raritiesById.unique.sell, materials: tuning.raise.materials, material: 'rare' });
    const cheaper = raiseOffer(sword, 0, standings[1].points, content);
    assert.equal(cheaper.gold, Math.round(offer.gold * (1 - tuning.discount[1])));
    assert.deepEqual(raiseOffer({ ...sword, raised: true }, 0, 0, content), { reason: 'raised' });
    assert.deepEqual(raiseOffer({ ...sword, rarity: 'divine' }, standings.at(-1).points, 0, content), { reason: 'top' });
    // A stranger gets his work up to unikalny, not above.
    assert.deepEqual(raiseOffer({ ...sword, rarity: 'unique' }, 0, 0, content), { reason: 'relation', next: 'epic', top: 'unique' });
    assert.equal(raiseOffer({ ...sword, rarity: 'unique' }, standings[1].points, 0, content).next, 'epic');
  });

  test('a raised item keeps or grows every affix and gets one more of the kind it has fewer of', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'rare' }, createRng(`miecz-${seed}`), content);
      const raised = raiseRarity(item, createRng(seed), content);
      assert.equal(raised.rarity, 'unique');
      assert.equal(raised.raised, true);
      assert.equal(raised.affixes.length, item.affixes.length + 1);
      item.affixes.forEach((affix, index) => {
        assert.equal(raised.affixes[index].id, affix.id);
        assert.ok(raised.affixes[index].value >= affix.value, affix.id);
      });
      assert.equal(new Set(raised.affixes.map((affix) => affix.id)).size, raised.affixes.length);
      const prefixes = item.affixes.filter((affix) => affix.kind === 'prefix').length;
      const suffixes = item.affixes.length - prefixes;
      const added = raised.affixes.at(-1);
      if (prefixes !== suffixes) assert.equal(added.kind, prefixes < suffixes ? 'prefix' : 'suffix');
      // The same roll gives the same item.
      assert.deepEqual(raiseRarity(item, createRng(seed), content), raised);
    }
  });
});

describe('the Kuźnia through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  const material = `${content.materials[0].id}:rare`;

  beforeEach(async () => {
    ({ cookie } = await signUp('kuznia'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kowalka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000').run();
  });

  test('the smith sells a few Zwoje ochronne a day, and the trade raises the relation and the reputation', async () => {
    const buy = (count) => call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count } });
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    assert.equal(view.residents.find((one) => one.id === tuning.resident).service, 'forge');
    assert.deepEqual(view.forge.scroll, { price: tuning.scroll.gold, daily: tuning.scroll.daily, left: tuning.scroll.daily, have: 0 });
    assert.equal((await buy(0)).data.error.code, 'invalid_count');
    const two = await buy(2);
    assert.equal(two.status, 200);
    assert.equal(two.data.character.gold, 100000 - 2 * tuning.scroll.gold);
    assert.equal(two.data.character.scrolls, 2);
    assert.equal(two.data.settlement.forge.scroll.left, tuning.scroll.daily - 2);
    assert.equal((await buy(tuning.scroll.daily)).data.error.code, 'sold_out');
    // The day's count stays while another place of the Osada saves its JSON.
    await call('GET', '/api/settlement', { cookie });
    const row = await (await db()).prepare('SELECT scrolls, settlement FROM characters').first();
    const stored = JSON.parse(row.settlement);
    assert.equal(stored.forge.scrolls, 2);
    assert.equal(stored.relations[tuning.resident], two.data.bought.points);
    assert.equal(stored.reputation[tuning.brotherhood], two.data.bought.points);
    assert.ok(two.data.bought.points > 0);
    await (await db()).prepare('UPDATE characters SET gold = 10').run();
    assert.equal((await buy(1)).data.error.code, 'no_gold');
  });

  test('the Bractwo Kowali reputation lowers the price of a scroll', async () => {
    const settlement = JSON.stringify({ reputation: { [tuning.brotherhood]: standings[1].points } });
    await (await db()).prepare('UPDATE characters SET settlement = ?').bind(settlement).run();
    const bought = await call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count: 1 } });
    assert.equal(bought.status, 200);
    assert.equal(bought.data.bought.gold, Math.round(tuning.scroll.gold * (1 - tuning.discount[1])));
  });

  test('the smith raises a rare sword to unikalny for gold and five pieces of a rare material, once', async () => {
    const database = await db();
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(sword)).run();
    const id = meta.last_row_id;
    const raise = (body) => call('POST', '/api/settlement/forge/raise', { cookie, body: { itemId: id, ...body } });
    const offer = raiseOffer(sword, 0, 0, content);
    assert.equal((await raise({})).data.error.code, 'invalid_material');
    assert.equal((await raise({ material: `${content.materials[0].id}:unique` })).data.error.code, 'invalid_material');
    assert.equal((await raise({ material })).data.error.code, 'no_material');
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [material]: offer.materials })).run();
    const shown = (await call('GET', '/api/settlement', { cookie })).data.settlement.forge.items.find((item) => item.id === id);
    assert.equal(shown.gold, offer.gold);
    assert.deepEqual(
      shown.stacks.map((stack) => stack.key),
      [material],
    );
    const raised = await raise({ material });
    assert.equal(raised.status, 200);
    assert.equal(raised.data.raised.afterName, content.raritiesById.unique.name);
    // The rarities by id too, for their colours on the page.
    assert.deepEqual([raised.data.raised.before, raised.data.raised.after], ['rare', 'unique']);
    assert.equal(raised.data.character.gold, 100000 - offer.gold);
    const row = await database.prepare('SELECT materials, settlement FROM characters').first();
    assert.equal(JSON.parse(row.materials)[material], undefined);
    assert.ok(JSON.parse(row.settlement).relations[tuning.resident] > 0);
    const item = JSON.parse((await database.prepare('SELECT data FROM items WHERE id = ?').bind(id).first()).data);
    assert.equal(item.rarity, 'unique');
    assert.equal(item.raised, true);
    assert.equal(item.affixes.length, sword.affixes.length + 1);
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [`${content.materials[0].id}:epic`]: 50 })).run();
    assert.equal((await raise({ material: `${content.materials[0].id}:epic` })).data.error.code, 'raised');
  });

  test('a stranger gets his work only up to unikalny', async () => {
    const database = await db();
    const unique = { ...sword, rarity: 'unique' };
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(unique)).run();
    const uniqueMaterial = `${content.materials[0].id}:unique`;
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [uniqueMaterial]: 20 })).run();
    const raise = () => call('POST', '/api/settlement/forge/raise', { cookie, body: { itemId: meta.last_row_id, material: uniqueMaterial } });
    assert.equal((await raise()).data.error.code, 'relation');
    await database.prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify({ relations: { [tuning.resident]: standings[1].points } })).run();
    const raised = await raise();
    assert.equal(raised.status, 200);
    assert.equal(raised.data.raised.afterName, content.raritiesById.epic.name);
  });
});
