// The Bractwa's perks (the author's answers 589–593, 4.11.2026): each
// standing with a Bractwo gives more of its perks, the first one (Obcy) just
// what the game gave before, and the perks of the Kompania Kupców and the
// Bractwo Kowali at work on the Targowisko, the Kowadło and the Warsztat.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  brotherhoodPerk,
  craftItems,
  craftLuck,
  itemMinutes,
  listBlock,
  orderMinutes,
  questPeriod,
  scrollMinutes,
  sellerShare,
  upgradeView,
  wandererGoods,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { standings, brotherhoods, market } = content.settlement;
// The perks, without the data's own note.
const perks = Object.fromEntries(Object.entries(content.settlement.brotherhoodPerks).filter(([id]) => id !== '$comment'));
const points = (id) => standings.find((standing) => standing.id === id).points;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

describe('the Bractwa perks in the engine', () => {
  test('at the first standing every perk is as the game was without the Bractwa', () => {
    const plain = Object.fromEntries(Object.keys(perks).map((id) => [id, brotherhoodPerk(id, {}, content)]));
    assert.deepEqual(plain, {
      anvilDiscount: 0,
      workshopFaster: 0,
      workshopLuck: 0,
      marketFee: market.fee,
      wandererItems: market.wanderer.items,
      auctionHours: market.hours,
    });
  });

  test('every standing gives at least as much as the one before, the last more than the first, and only the perk’s own Bractwo counts', () => {
    for (const [id, perk] of Object.entries(perks)) {
      const values = standings.map((standing) => brotherhoodPerk(id, { [perk.brotherhood]: standing.points }, content));
      // A lower fee is the better one.
      const better = id === 'marketFee' ? (before, after) => after <= before : (before, after) => after >= before;
      values.slice(1).forEach((value, index) => assert.ok(better(values[index], value), `${id}: ${values.join(', ')}`));
      assert.notEqual(values.at(-1), values[0], id);
      // A point short of a standing is the one below.
      assert.equal(brotherhoodPerk(id, { [perk.brotherhood]: points('acquaintance') - 1 }, content), values[0], id);
      const others = Object.fromEntries(brotherhoods.filter((one) => one.id !== perk.brotherhood).map((one) => [one.id, points('friend')]));
      assert.equal(brotherhoodPerk(id, others, content), values[0], id);
    }
  });

  test('the Kompania Kupców: the fee down to 0.2%, auctions up to 48 hours, five items at the wandering trader', () => {
    const friend = { merchants: points('friend') };
    assert.deepEqual(
      ['marketFee', 'auctionHours', 'wandererItems'].map((id) => brotherhoodPerk(id, friend, content)),
      [0.002, 48, 5],
    );
    assert.equal(sellerShare(1000, content), 990);
    assert.equal(sellerShare(1000, content, 0.002), 998);
    // Still a whole gold piece, rounded up.
    assert.equal(sellerShare(101, content, 0.002), 100);
    const offer = { kind: 'herb', count: 1, startPrice: 10, buyNow: null };
    assert.equal(listBlock({ ...offer, hours: 48 }, 3, 0, 5, content, 48), null);
    assert.equal(listBlock({ ...offer, hours: 49 }, 3, 0, 5, content, 48).code, 'invalid_hours');
    assert.equal(listBlock({ ...offer, hours: 25 }, 3, 0, 5, content).code, 'invalid_hours');
    // More of the trader's goods: the first ones are the same as without.
    const now = Date.UTC(2026, 9, 30, 10, 0);
    const day = questPeriod('daily', now, content);
    const character = { level: 30, classId: 'warrior', classLevel: 30, seed: 7 };
    const three = wandererGoods(character, now, content, day).goods;
    const five = wandererGoods(character, now, content, day, 5).goods;
    assert.deepEqual([three.length, five.length], [3, 5]);
    assert.deepEqual(five.slice(0, 3), three);
  });

  test('the Bractwo Kowali: the Kowadło takes less gold, the ore and the materials as they are', () => {
    const item = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    const plain = upgradeView(item, 10, content);
    const cheaper = upgradeView(item, 10, content, null, 0.2);
    assert.deepEqual(plain.next.cost, { gold: 8, 'iron-ore': 2 });
    assert.deepEqual(cheaper.next.cost, { gold: 6, 'iron-ore': 2 });
    assert.deepEqual({ ...cheaper.next, cost: null }, { ...plain.next, cost: null });
    // Never below a gold piece.
    assert.equal(upgradeView(item, 10, content, null, 0.99).next.cost.gold, 1);
  });

  test('the Bractwo Kowali: the Warsztat works shorter and makes an item a rarity up more often', () => {
    close(itemMinutes('common', 1, content, 0.2), itemMinutes('common', 1, content) * 0.8);
    close(itemMinutes('rare', 40, content, 0.1), itemMinutes('rare', 40, content) * 0.9);
    assert.equal(orderMinutes(3, 'common', 1, content), 90);
    assert.equal(orderMinutes(3, 'common', 1, content, 0.2), 72);
    close(scrollMinutes(25, content, 0.2), scrollMinutes(25, content) * 0.8);
    const plain = craftLuck(20, content);
    const lucky = craftLuck(20, content, 0.04);
    close(lucky.oneUp, plain.oneUp + 0.04);
    assert.equal(lucky.twoUp, plain.twoUp);
    // Without the perk the order makes what it made before; with all the luck
    // there is, every item comes out at least a rarity up.
    const order = { baseId: 'sword', rarityId: 'common', count: 12, level: 15, professionLevel: 1, seed: 'perks' };
    assert.deepEqual(craftItems({ ...order, luck: 0 }, content), craftItems(order, content));
    const made = craftItems({ ...order, luck: 1 }, content).filter((result) => result.made);
    assert.equal(made.length, 12);
    assert.ok(made.every((result) => result.item.rarity !== 'common'));
  });
});

describe('the Bractwa perks through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const cookies = {};

  async function player(name, level = 25) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ?, gold = 100000 WHERE name = ?').bind(level, level, name).run();
    cookies[name] = cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const standing = async (name, brotherhood, id) =>
    (await db()).prepare('UPDATE characters SET settlement = ? WHERE name = ?').bind(JSON.stringify({ reputation: { [brotherhood]: points(id) } }), name).run();
  const character = async (name) => (await call('GET', '/api/character', { cookie: cookies[name] })).data.character;

  describe('the Targowisko', () => {
    const view = async (name) => (await call('GET', '/api/market', { cookie: cookies[name] })).data.market;
    const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
    const herb = content.herbs[0].id;

    beforeEach(async () => {
      await player('Kramarka');
      await player('Kupiec');
      await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 10 }), 'Kramarka').run();
    });

    test('a lower fee stays with the offer as it was put up, and the auction may go on up to 48 hours', async () => {
      const plain = await view('Kramarka');
      assert.deepEqual([plain.fee, plain.hours, plain.usualHours], [0.01, 24, 24]);
      const before = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 10, buyNow: 1000, hours: 3 });
      assert.equal(before.status, 200, JSON.stringify(before.data));
      assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 10, hours: 30 })).data.error.code, 'invalid_hours');
      await standing('Kramarka', 'merchants', 'friend');
      const friend = await view('Kramarka');
      assert.deepEqual([friend.fee, friend.hours, friend.usualHours], [0.002, 48, 24]);
      const after = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 10, buyNow: 1000, hours: 48 });
      assert.equal(after.status, 200, JSON.stringify(after.data));
      assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 10, hours: 49 })).data.error.code, 'invalid_hours');
      const offers = (await (await db()).prepare('SELECT id, fee, created_at, ends_at FROM market_offers ORDER BY id').all()).results;
      assert.deepEqual(
        offers.map((offer) => [offer.fee, (offer.ends_at - offer.created_at) / 3600000]),
        [
          [0.01, 3],
          [0.002, 48],
        ],
      );
      for (const offer of offers) assert.equal((await act('Kupiec', 'buy', { offerId: offer.id })).status, 200);
      const parcels = (await view('Kramarka')).parcels.filter((parcel) => parcel.reason === 'sold');
      assert.deepEqual(
        parcels.map((parcel) => parcel.goods.count),
        [sellerShare(1000, content), sellerShare(1000, content, 0.002)],
      );
      assert.deepEqual(parcels.map((parcel) => parcel.goods.count), [990, 998]);
    });

    test('an offer put up before the fee column keeps the usual fee', async () => {
      const listed = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 10, buyNow: 500 });
      assert.equal(listed.status, 200, JSON.stringify(listed.data));
      await (await db()).prepare('UPDATE market_offers SET fee = NULL').run();
      const { id } = await (await db()).prepare('SELECT id FROM market_offers').first();
      assert.equal((await act('Kupiec', 'buy', { offerId: id })).status, 200);
      const [parcel] = (await view('Kramarka')).parcels;
      assert.equal(parcel.goods.count, sellerShare(500, content));
    });
  });

  describe('the Kowadło and the Warsztat', () => {
    beforeEach(async () => {
      await player('Kowalka', 15);
    });

    test('the Kowadło shows and takes less gold with the Bractwo Kowali', async () => {
      const database = await db();
      const { id } = await row('Kowalka');
      const item = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
      const itemId = (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item)).run()).meta.last_row_id;
      await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'anvil', 2, 0, 1)").bind(id).run();
      await database.prepare('UPDATE characters SET gold = 100, resources = ? WHERE id = ?').bind(JSON.stringify({ wood: 0, stone: 0, 'iron-ore': 10 }), id).run();
      assert.deepEqual((await character('Kowalka')).bag[0].anvil.next.cost, { gold: 8, 'iron-ore': 2 });
      await standing('Kowalka', 'smiths', 'friend');
      assert.deepEqual((await character('Kowalka')).bag[0].anvil.next.cost, { gold: 6, 'iron-ore': 2 });
      const tried = await call('POST', `/api/items/${itemId}/upgrade`, { cookie: cookies.Kowalka });
      assert.equal(tried.status, 200, JSON.stringify(tried.data));
      assert.deepEqual(tried.data.upgrade.cost, { gold: 6, 'iron-ore': 2 });
      assert.equal(tried.data.character.gold, 94);
    });

    test('the Warsztat shows the shorter work and the luck, and the order keeps them', async () => {
      const database = await db();
      await database.prepare(`UPDATE characters SET parts = '{"scraps":30}', resources = '{"wood":50,"stone":200,"iron-ore":40}' WHERE name = 'Kowalka'`).run();
      const plain = (await character('Kowalka')).professions.workshop;
      assert.equal(plain.rarities[0].itemMinutes, 30);
      await standing('Kowalka', 'smiths', 'friend');
      const friend = (await character('Kowalka')).professions.workshop;
      close(friend.rarities[0].itemMinutes, 24);
      close(friend.luck.oneUp, plain.luck.oneUp + 0.04);
      assert.equal(friend.luck.twoUp, plain.luck.twoUp);
      const order = await call('POST', '/api/professions/craft', { cookie: cookies.Kowalka, body: { baseId: 'sword', rarity: 'common', count: 2 } });
      assert.equal(order.status, 201, JSON.stringify(order.data));
      const activity = await database.prepare('SELECT minutes, options FROM activities').first();
      assert.equal(activity.minutes, 48);
      assert.equal(JSON.parse(activity.options).luck, 0.04);
    });
  });
});
