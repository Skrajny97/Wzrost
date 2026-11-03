// The Targowisko (the Osada, part III, questions 237–242): the rules in the
// engine (limits, bids, prices above every NPC's buying price) and the
// players' auctions and the residents' offers through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bidBlock,
  buyCeiling,
  createRng,
  itemBuyCeiling,
  listBlock,
  merchantPrice,
  merchantStock,
  minimumBid,
  offerLimit,
  questPeriod,
  randomItem,
  sellerShare,
  sellPrice,
  wandererDay,
  wandererGoods,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 30, 10, 0);
const tuning = content.settlement.market;
const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
// The wandering trader's price of an item: `priceFactor` times the scrapper's.
const wandererPrice = (item) => Math.round(sellPrice(item, content) * tuning.wanderer.priceFactor);

describe('the Targowisko in the engine', () => {
  test('five offers at once, and one more for each standing with the Kompania Kupców past the first (240 A)', () => {
    assert.equal(offerLimit({}, content), 5);
    assert.equal(offerLimit({ merchants: points('acquaintance') }, content), 6);
    assert.equal(offerLimit({ merchants: points('friend') }, content), 5 + content.settlement.standings.length - 1);
    // The reputation of the other brotherhoods gives no places.
    assert.equal(offerLimit({ herbalists: points('friend') }, content), 5);
  });

  test('the next bid is the starting price, then 5% more, at least a gold more; the seller gets all but 1% (238 A; the author: "Niech Targowisko bierze 1% ceny sprzedaży")', () => {
    assert.equal(minimumBid({ startPrice: 40, bid: null }, content), 40);
    assert.equal(minimumBid({ startPrice: 40, bid: 100 }, content), 105);
    assert.equal(minimumBid({ startPrice: 1, bid: 10 }, content), 11);
    assert.equal(minimumBid({ startPrice: 1, bid: 1 }, content), 2);
    assert.equal(sellerShare(1000, content), 990);
    // The fee is a whole gold piece, rounded up.
    assert.equal(sellerShare(101, content), 99);
    assert.equal(sellerShare(100, content), 99);
  });

  test('an offer needs goods the character holds, whole prices, "Kup teraz" not below the start, and a free place', () => {
    const offer = { kind: 'herb', count: 3, startPrice: 10, buyNow: null };
    assert.equal(listBlock(offer, 3, 0, 5, content), null);
    assert.equal(listBlock({ ...offer, kind: 'gold' }, 3, 0, 5, content).code, 'invalid_kind');
    assert.equal(listBlock({ ...offer, count: 4 }, 3, 0, 5, content).code, 'not_enough');
    assert.equal(listBlock({ ...offer, count: 0 }, 3, 0, 5, content).code, 'not_enough');
    assert.equal(listBlock({ ...offer, kind: 'item', count: 2 }, 3, 0, 5, content).code, 'not_enough');
    assert.equal(listBlock({ ...offer, startPrice: 0 }, 3, 0, 5, content).code, 'invalid_price');
    assert.equal(listBlock({ ...offer, startPrice: 2.5 }, 3, 0, 5, content).code, 'invalid_price');
    assert.equal(listBlock({ ...offer, buyNow: 9 }, 3, 0, 5, content).code, 'invalid_price');
    assert.equal(listBlock({ ...offer, buyNow: 10 }, 3, 0, 5, content), null);
    assert.equal(listBlock(offer, 3, 5, 5, content).code, 'too_many');
    // The auction's length, chosen by the hour from 1 to 24 (the author:
    // "Czas licytacji powinien moc byc do wyboru od 1h do 24h po godzinie").
    assert.deepEqual([tuning.minHours, tuning.hours], [1, 24]);
    for (const hours of [1, 7, 24]) assert.equal(listBlock({ ...offer, hours }, 3, 0, 5, content), null);
    for (const hours of [0, 25, 2.5, '3']) assert.equal(listBlock({ ...offer, hours }, 3, 0, 5, content).code, 'invalid_hours');
  });

  test('a bid needs an open offer of another account, enough gold and the least raise; "Kup teraz" its price (241)', () => {
    const offer = { state: 'open', endsAt: NOW + 1000, sellerId: 1, sellerUserId: 10, startPrice: 50, buyNow: 200, bid: null, bidderId: null };
    const bidder = { characterId: 2, userId: 20, gold: 500, now: NOW };
    assert.equal(bidBlock(offer, { ...bidder, amount: 50 }, content), null);
    assert.equal(bidBlock(offer, { ...bidder, amount: 49 }, content).code, 'low_bid');
    assert.equal(bidBlock(offer, { ...bidder, amount: 200 }, content).code, 'use_buy_now');
    assert.equal(bidBlock(offer, { ...bidder, amount: 50, gold: 49 }, content).code, 'not_enough_gold');
    assert.equal(bidBlock({ ...offer, endsAt: NOW }, { ...bidder, amount: 50 }, content).code, 'ended');
    assert.equal(bidBlock({ ...offer, state: 'sold' }, { ...bidder, amount: 50 }, content).code, 'ended');
    assert.equal(bidBlock(offer, { ...bidder, characterId: 1, amount: 50 }, content).code, 'own_offer');
    assert.equal(bidBlock(offer, { ...bidder, userId: 10, amount: 50 }, content).code, 'same_account');
    assert.equal(bidBlock({ ...offer, bid: 60, bidderId: 2 }, { ...bidder, amount: 70 }, content).code, 'leading');
    assert.equal(bidBlock(offer, { ...bidder, buyNow: true }, content), null);
    assert.equal(bidBlock(offer, { ...bidder, buyNow: true, gold: 199 }, content).code, 'not_enough_gold');
    assert.equal(bidBlock({ ...offer, buyNow: null }, { ...bidder, buyNow: true }, content).code, 'no_buy_now');
    assert.equal(bidBlock(offer, { ...bidder, userId: 10, buyNow: true }, content).code, 'same_account');
  });

  test('the merchant sells herbs, rarer materials and parts, the same for everyone all day, new the next (242 A)', () => {
    const stock = merchantStock(NOW, content);
    assert.deepEqual(merchantStock(NOW + 3600000, content), stock);
    assert.notDeepEqual(merchantStock(NOW + DAY, content).goods, stock.goods);
    const { goods } = tuning.merchant;
    assert.deepEqual(
      stock.goods.map((good) => good.kind),
      [...Array(goods.herb).fill('herb'), ...Array(goods.material).fill('material'), ...Array(goods.part).fill('part')],
    );
    for (const good of stock.goods.filter((one) => one.kind === 'material')) {
      assert.ok(tuning.merchant.materialRarities.includes(good.key.split(':')[1]));
    }
    assert.equal(stock.endsAt, questPeriod('daily', NOW, content).endsAt);
    assert.ok(stock.goods.every((good) => good.stock === tuning.merchant.stock));
  });

  test('no resident sells below what any NPC pays for the same goods (the design: buying price below selling price)', () => {
    for (let day = 0; day < 60; day += 1) {
      for (const good of merchantStock(NOW + day * DAY, content).goods) {
        assert.ok(good.price > buyCeiling(good, content), `${good.kind} ${good.key} on day ${day}: ${good.price} ≤ ${buyCeiling(good, content)}`);
      }
    }
    // Nor with the relation's discount (287 A): his prices fall with each
    // standing, and stay above every buy price.
    const { standings } = content.settlement;
    for (let day = 0; day < 20; day += 1) {
      for (const good of merchantStock(NOW + day * DAY, content).goods) {
        const prices = standings.map((standing) => merchantPrice(good, standing.points, content));
        assert.equal(prices[0], good.price);
        prices.forEach((price, index) => {
          if (index > 0) assert.ok(price <= prices[index - 1]);
          assert.ok(price > buyCeiling(good, content), `${good.kind} ${good.key} at ${standings[index].id}: ${price}`);
        });
        if (good.kind !== 'part') assert.equal(prices.at(-1), Math.ceil(good.price * (1 - content.settlement.relationDiscount.at(-1))));
      }
    }
    // The ceiling is at least the scrapper's price with the top Skup złomu,
    // which the herbalist and the orders pay more than.
    const herb = content.herbs[0];
    assert.ok(buyCeiling({ kind: 'herb', key: herb.id }, content) >= herb.price * (1 + Math.max(...content.settlement.herbalist.premium)));
    // The wandering trader's items for every class and many levels.
    for (const classId of Object.keys(content.classesById)) {
      for (const level of [1, 12, 40, 80]) {
        const rng = createRng(`ceiling:${classId}:${level}`);
        for (let index = 0; index < 5; index += 1) {
          const item = randomItem(level, rng, content, { classId, rarityId: 'epic' });
          assert.ok(wandererPrice(item) > itemBuyCeiling(item, content), `${classId} ${level}: ${wandererPrice(item)}`);
        }
      }
    }
  });

  test('the wandering trader comes one day a week, the same for everyone, with rare or epic items for the character (242 A)', () => {
    const day = wandererDay(NOW, content);
    const week = questPeriod('weekly', NOW, content);
    assert.ok(day.startsAt >= week.startsAt && day.endsAt <= week.endsAt);
    assert.deepEqual(wandererDay(week.startsAt + 1000, content), day);
    const character = { level: 30, classId: 'archer', classLevel: 30, seed: 7 };
    const there = wandererGoods(character, day.startsAt + 1000, content);
    assert.equal(there.goods.length, tuning.wanderer.items);
    for (const good of there.goods) {
      assert.ok(Object.keys(tuning.wanderer.rarities).includes(good.item.rarity));
      assert.equal(good.item.level, 30);
      assert.equal(good.price, wandererPrice(good.item));
    }
    // The same all day for the character, other for another.
    assert.deepEqual(wandererGoods(character, day.endsAt - 1000, content).goods, there.goods);
    assert.notDeepEqual(wandererGoods({ ...character, seed: 8 }, day.startsAt + 1000, content).goods, there.goods);
    // Not on the other days of the week, unless the test version calls him.
    const other = day.startsAt === week.startsAt ? day.endsAt + 1000 : week.startsAt + 1000;
    assert.equal(wandererGoods(character, other, content).goods, null);
    assert.equal(wandererGoods(character, other, content, questPeriod('daily', other, content)).goods.length, tuning.wanderer.items);
  });
});

describe('the Targowisko through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const cookies = {};

  // An account with a character of level 25 in the Osada, 100 000 gold.
  async function player(name) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000 WHERE name = ?').bind(name).run();
    cookies[name] = cookie;
    return cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const gold = async (name) => (await row(name)).gold;
  async function inBag(name, item) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind((await row(name)).id, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const amulet = (level) => ({ base: 'amulet', slot: 'amulet', level, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 } });
  const market = async (name) => (await call('GET', '/api/market', { cookie: cookies[name] })).data.market;
  const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
  // The offers' time runs out now; the next request settles them.
  const endAll = async () => (await db()).prepare("UPDATE market_offers SET ends_at = ? WHERE state = 'open'").bind(Date.now() - 1).run();

  beforeEach(async () => {
    await player('Kramarka');
    await player('Kupiec');
    await player('Druga');
  });

  test('the seller chooses how many hours the auction lasts, from 1 to 24', async () => {
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 10 }), 'Kramarka').run();
    for (const hours of [0, 25, 1.5]) {
      const refused = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20, hours });
      assert.equal(refused.data.error.code, 'invalid_hours');
    }
    assert.deepEqual(JSON.parse((await row('Kramarka')).herbs), { [herb]: 10 });
    const short = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20, hours: 3 });
    assert.equal(short.status, 200, JSON.stringify(short.data));
    const stored = await (await db()).prepare('SELECT created_at, ends_at FROM market_offers').first();
    assert.equal(stored.ends_at - stored.created_at, 3 * 3600000);
  });

  test('putting up goods takes them off the character for 24 hours, up to the offers the Kompania Kupców allows', async () => {
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 10 }), 'Kramarka').run();
    const itemId = await inBag('Kramarka', amulet(30));
    const listed = await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 100, buyNow: 300 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.data.character.bag.length, 0);
    const [offer] = listed.data.market.mine;
    assert.deepEqual([offer.own, offer.startPrice, offer.buyNow, offer.goods.kind, offer.goods.item.level], [true, 100, 300, 'item', 30]);
    const stored = await (await db()).prepare('SELECT created_at, ends_at FROM market_offers').first();
    assert.equal(stored.ends_at - stored.created_at, tuning.hours * 3600000);
    assert.deepEqual([listed.data.market.minHours, listed.data.market.hours], [1, 24]);
    // A part of a stack; the rest stays.
    const herbs = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 4, startPrice: 20, buyNow: null });
    assert.equal(herbs.status, 200, JSON.stringify(herbs.data));
    assert.deepEqual(JSON.parse((await row('Kramarka')).herbs), { [herb]: 6 });
    assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 7, startPrice: 20 })).data.error.code, 'not_enough');
    assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20, buyNow: 5 })).data.error.code, 'invalid_price');
    // Others see it with its seller's name, not as their own.
    const seen = (await market('Kupiec')).offers;
    assert.deepEqual(seen.map((one) => [one.seller, one.own]), [
      ['Kramarka', false],
      ['Kramarka', false],
    ]);
    // Five at once, six with the Kompania Kupców's second standing.
    for (let index = 0; index < 3; index += 1) assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 })).status, 200);
    assert.equal((await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 })).data.error.code, 'too_many');
    await (await db()).prepare('UPDATE characters SET settlement = ? WHERE name = ?').bind(JSON.stringify({ reputation: { merchants: points('acquaintance') } }), 'Kramarka').run();
    const sixth = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 });
    assert.equal(sixth.status, 200);
    assert.deepEqual([sixth.data.market.mine.length, sixth.data.market.limit], [6, 6]);
  });

  test('while choosing what to put up, each goods show what the scrapper pays this character, with the Skup złomu', async () => {
    const herb = content.herbs[0];
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb.id]: 3 }), 'Kramarka').run();
    await inBag('Kramarka', amulet(30));
    const plain = (await market('Kramarka')).sellable;
    // A Skup złomu at level 5: the scrapper pays 50% more.
    await (await db())
      .prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'scrap-bench', 5, 0, 0 FROM characters WHERE name = 'Kramarka'")
      .run();
    const { sellable } = await market('Kramarka');
    const bag = (await call('GET', '/api/character', { cookie: cookies.Kramarka })).data.character;
    assert.equal(sellable.items[0].price, bag.bag[0].price);
    assert.equal(sellable.items[0].price, Math.round(plain.items[0].price * 1.5));
    const herbGoods = sellable.stacks.find((goods) => goods.kind === 'herb');
    assert.equal(herbGoods.scrap, herb.price * 1.5);
    assert.equal(herbGoods.scrap, bag.herbs.find((one) => one.id === herb.id).price);
  });

  test('a bid holds the gold, the outbid get theirs back at once, and the winner and the seller collect after the end', async () => {
    const itemId = await inBag('Kramarka', amulet(30));
    await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 1000, buyNow: null });
    const offer = (await market('Kupiec')).offers[0];
    assert.equal((await act('Kupiec', 'bid', { offerId: offer.id, amount: 999 })).data.error.code, 'low_bid');
    const first = await act('Kupiec', 'bid', { offerId: offer.id, amount: 1000 });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.character.gold, 100000 - 1000);
    assert.equal(first.data.market.offers[0].leading, true);
    assert.equal((await act('Kupiec', 'bid', { offerId: offer.id, amount: 2000 })).data.error.code, 'leading');
    // The seller can neither bid nor take it back once someone bids.
    assert.equal((await act('Kramarka', 'bid', { offerId: offer.id, amount: 1100 })).data.error.code, 'own_offer');
    assert.equal((await act('Kramarka', 'cancel', { offerId: offer.id })).data.error.code, 'has_bids');
    // Outbid: the first bidder's gold comes back at once.
    assert.equal((await act('Druga', 'bid', { offerId: offer.id, amount: 1049 })).data.error.code, 'low_bid');
    const second = await act('Druga', 'bid', { offerId: offer.id, amount: 1050 });
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.equal(await gold('Kupiec'), 100000);
    assert.equal(await gold('Druga'), 100000 - 1050);
    assert.equal(second.data.market.offers[0].minBid, 1103);
    // The time runs out: the goods wait for the winner, the gold for the seller.
    await endAll();
    const won = await market('Druga');
    assert.deepEqual(
      won.parcels.map((parcel) => [parcel.reason, parcel.goods.kind]),
      [['won', 'item']],
    );
    assert.equal(won.offers.length, 0);
    const sold = await market('Kramarka');
    assert.deepEqual(
      sold.parcels.map((parcel) => [parcel.reason, parcel.goods.kind, parcel.goods.count]),
      [['sold', 'gold', sellerShare(1050, content)]],
    );
    assert.equal((await call('GET', '/api/character', { cookie: cookies.Kramarka })).data.character.settlementWaiting, true);
    // Collected: the item from the Targowisko is worn from its own level, as
    // one from the Wymiana (241); the trade's reputation comes with it.
    const collected = await act('Druga', 'collect', {});
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    const [item] = collected.data.character.bag;
    assert.deepEqual([item.level, item.traded], [30, true]);
    assert.equal(collected.data.market.parcels.length, 0);
    const rep = (name) => row(name).then((one) => JSON.parse(one.settlement).reputation.merchants);
    assert.equal(await rep('Druga'), Math.floor(1050 / (tuning.reputation.goldPerPointPerLevel * 25)));
    const paid = await act('Kramarka', 'collect', {});
    assert.equal(paid.data.character.gold, 100000 + sellerShare(1050, content));
    assert.equal(paid.data.collected.gold, sellerShare(1050, content));
    assert.equal(await rep('Kramarka'), Math.floor(1050 / (tuning.reputation.goldPerPointPerLevel * 25)));
    assert.equal((await act('Kramarka', 'collect', {})).data.error.code, 'nothing');
  });

  // The author's 571 ("koniecznie"): the gems and ores of Górnictwo on the
  // Targowisko too.
  test('gems and ores go up as stacks, take no place in the bag and come from a trade, as the Encyklopedia sees them', async () => {
    await (await db()).prepare(`UPDATE characters SET minerals = '{"emerald":4,"gold-ore":9}' WHERE name = 'Kramarka'`).run();
    const view = await market('Kramarka');
    const emerald = view.sellable.stacks.find((goods) => goods.kind === 'mineral' && goods.key === 'emerald');
    assert.deepEqual([emerald.name, emerald.count, emerald.rarity, emerald.scrap, emerald.mineLevel], ['Szmaragd', 4, 'epic', 16, 25]);
    assert.equal(view.sellable.stacks.find((goods) => goods.key === 'gold-ore').rarity, 'epic');
    assert.equal((await act('Kramarka', 'list', { kind: 'mineral', key: 'emerald', count: 5, startPrice: 100, buyNow: null })).data.error.code, 'not_enough');
    assert.equal((await act('Kramarka', 'list', { kind: 'mineral', key: 'nothing', count: 1, startPrice: 100, buyNow: null })).data.error.code, 'not_enough');
    const listed = await act('Kramarka', 'list', { kind: 'mineral', key: 'emerald', count: 3, startPrice: 100, buyNow: 150 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.deepEqual(JSON.parse((await row('Kramarka')).minerals), { emerald: 1, 'gold-ore': 9 });
    const offer = (await market('Kupiec')).offers[0];
    assert.deepEqual([offer.goods.kind, offer.goods.name, offer.goods.count], ['mineral', 'Szmaragd', 3]);
    assert.equal((await act('Kupiec', 'buy', { offerId: offer.id })).status, 200);
    const collected = await act('Kupiec', 'collect', {});
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    const buyer = await row('Kupiec');
    assert.deepEqual(JSON.parse(buyer.minerals), { emerald: 3 });
    assert.equal(JSON.parse(buyer.foreign_stacks)['mineral:emerald'], 3);
    assert.equal(JSON.parse(buyer.discovered ?? '{}')['mineral:emerald'], undefined);
  });

  test('"Kup teraz" sells at once and gives the leading bidder back their gold; an offer without bids goes back', async () => {
    const herb = content.herbs[1].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 5 }), 'Kramarka').run();
    const material = content.materials.find((one) => one.rarity === 'rare');
    const key = `${material.id}:${material.rarity}`;
    await (await db()).prepare('UPDATE characters SET materials = ? WHERE name = ?').bind(JSON.stringify({ [key]: 4 }), 'Kramarka').run();
    await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 5, startPrice: 100, buyNow: 400 });
    await act('Kramarka', 'list', { kind: 'material', key, count: 4, startPrice: 50, buyNow: null });
    const [herbs, materials] = (await market('Kupiec')).offers;
    assert.equal(herbs.goods.kind, 'herb');
    await act('Druga', 'bid', { offerId: herbs.id, amount: 100 });
    assert.equal((await act('Kupiec', 'buy', { offerId: materials.id })).data.error.code, 'no_buy_now');
    const bought = await act('Kupiec', 'buy', { offerId: herbs.id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.gold, 100000 - 400);
    assert.equal(await gold('Druga'), 100000);
    assert.equal((await act('Druga', 'bid', { offerId: herbs.id, amount: 200 })).data.error.code, 'ended');
    // The herbs go to the buyer's bag on collecting, as goods of a trade.
    await act('Kupiec', 'collect', {});
    const buyer = await row('Kupiec');
    assert.equal(JSON.parse(buyer.herbs)[herb], 5);
    assert.equal(JSON.parse(buyer.foreign_stacks)[`herb:${herb}`], 5);
    // The materials found no buyer: back to the seller at the end; the seller
    // takes back an offer nobody bid on, too.
    await endAll();
    const back = await market('Kramarka');
    assert.deepEqual(
      back.parcels.map((parcel) => [parcel.reason, parcel.goods.kind]).sort(),
      [
        ['returned', 'material'],
        ['sold', 'gold'],
      ],
    );
    await act('Kramarka', 'collect', {});
    assert.equal(JSON.parse((await row('Kramarka')).materials)[key], 4);
    // Goods back give no reputation; the sale's gold does.
    assert.equal(JSON.parse((await row('Kramarka')).settlement).reputation.merchants ?? 0, Math.floor(400 / (tuning.reputation.goldPerPointPerLevel * 25)));
    const itemId = await inBag('Kramarka', amulet(20));
    const listed = await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 10 });
    const cancelled = await act('Kramarka', 'cancel', { offerId: listed.data.market.mine[0].id });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.deepEqual(
      cancelled.data.market.parcels.map((parcel) => parcel.reason),
      ['returned'],
    );
  });

  test('the characters of one account do not buy from one another (241)', async () => {
    const itemId = await inBag('Druga', amulet(20));
    await act('Druga', 'list', { kind: 'item', itemId, startPrice: 10, buyNow: 50 });
    // A second character of the same account comes into play.
    await call('POST', '/api/character', { cookie: cookies.Druga, body: { name: 'Trzecia', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 1000 WHERE name = ?').bind('Trzecia').run();
    const [offer] = (await market('Druga')).offers;
    assert.equal(offer.seller, 'Druga');
    assert.equal((await act('Druga', 'bid', { offerId: offer.id, amount: 10 })).data.error.code, 'same_account');
    assert.equal((await act('Druga', 'buy', { offerId: offer.id })).data.error.code, 'same_account');
  });

  test('what does not fit in the bag waits; gold and materials come at once', async () => {
    const itemId = await inBag('Kramarka', amulet(20));
    await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 10, buyNow: 20 });
    const [offer] = (await market('Kupiec')).offers;
    await act('Kupiec', 'buy', { offerId: offer.id });
    // The buyer's bag full to the last place.
    const { bagCapacity, bagUsed } = (await call('GET', '/api/character', { cookie: cookies.Kupiec })).data.character;
    for (let index = bagUsed; index < bagCapacity; index += 1) await inBag('Kupiec', amulet(5));
    const full = await act('Kupiec', 'collect', {});
    assert.equal(full.data.error.code, 'bag_full');
    // The seller's gold does not need a place.
    const paid = await act('Kramarka', 'collect', {});
    assert.deepEqual([paid.status, paid.data.collected.left], [200, 0]);
  });

  test('the merchant sells up to his stock a day; the goods go straight to the character', async () => {
    const view = await market('Kupiec');
    const good = view.merchant.goods.find((one) => one.kind === 'material');
    assert.equal(good.left, tuning.merchant.stock);
    const bought = await act('Kupiec', 'resident', { from: 'merchant', id: good.id, count: 3 });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.gold, 100000 - good.price * 3);
    assert.equal(JSON.parse((await row('Kupiec')).materials)[good.key], 3);
    assert.equal(bought.data.market.merchant.goods.find((one) => one.id === good.id).left, tuning.merchant.stock - 3);
    assert.equal((await act('Kupiec', 'resident', { from: 'merchant', id: good.id, count: tuning.merchant.stock - 2 })).data.error.code, 'sold_out');
    // Another character has the whole stock.
    assert.equal((await market('Druga')).merchant.goods.find((one) => one.id === good.id).left, tuning.merchant.stock);
    const part = view.merchant.goods.find((one) => one.kind === 'part');
    await act('Kupiec', 'resident', { from: 'merchant', id: part.id, count: 1 });
    assert.equal(JSON.parse((await row('Kupiec')).parts)[part.key], 1);
    // Buying at his stall brings the relation with Gościwit, as many points
    // as the Kompania Kupców' reputation: a point for each 5 gold times the
    // character's level (278 A), the day's purchases added up.
    await act('Kupiec', 'resident', { from: 'merchant', id: good.id, count: tuning.merchant.stock - 3 });
    const perPoint = tuning.reputation.goldPerPointPerLevel * 25;
    const expected = Math.min(tuning.reputation.daily, Math.floor((good.price * 3 + part.price + good.price * (tuning.merchant.stock - 3)) / perPoint));
    const stored = JSON.parse((await row('Kupiec')).settlement);
    assert.equal(stored.reputation.merchants, expected);
    assert.equal(stored.relations.merchant, expected);
    // He stands at the Targowisko as its resident, at his standing.
    const { settlement } = (await call('GET', '/api/settlement', { cookie: cookies.Kupiec })).data;
    assert.equal(settlement.places.find((place) => place.id === 'market').resident, 'merchant');
    const merchant = settlement.residents.find((resident) => resident.id === 'merchant');
    assert.deepEqual([merchant.name, merchant.title, merchant.greeting], ['Gościwit', 'kupiec', content.settlement.residents.find((one) => one.id === 'merchant').greetings[0]]);
  });

  test('a better relation with Gościwit lowers his prices, and he charges what he shows (287 A)', async () => {
    const friend = content.settlement.standings.at(-1).points;
    await (await db()).prepare("UPDATE characters SET settlement = json_set(settlement, '$.relations.merchant', ?) WHERE name = 'Kupiec'").bind(friend).run();
    const view = await market('Kupiec');
    assert.equal(view.merchant.discount, content.settlement.relationDiscount.at(-1));
    const stock = merchantStock(Date.now(), content);
    // The day's dearest good, but a part (whose price has a floor): the
    // discount, rounded up, shows on any day's (on a cheap herb, 10% of
    // 8 gold rounds away, as on 3 November 2026).
    const base = stock.goods.filter((one) => one.kind !== 'part').reduce((dearest, one) => (one.price > dearest.price ? one : dearest));
    const good = view.merchant.goods.find((one) => one.id === base.id);
    assert.equal(good.price, merchantPrice(base, friend, content));
    assert.ok(good.price < base.price);
    assert.equal((await market('Druga')).merchant.goods.find((one) => one.id === good.id).price, base.price);
    const bought = await act('Kupiec', 'resident', { from: 'merchant', id: good.id, count: 2 });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.gold, 100000 - good.price * 2);
  });

  test('on the test version the wandering trader comes today and a trial trader puts up offers that pay no one', async () => {
    const tried = await call('POST', '/api/test/settlement', { cookie: cookies.Kupiec, body: { action: 'market' } });
    assert.equal(tried.status, 200, JSON.stringify(tried.data));
    const view = await market('Kupiec');
    assert.equal(view.wanderer.goods.length, tuning.wanderer.items);
    assert.deepEqual(
      view.offers.map((offer) => [offer.seller, offer.goods.kind]),
      [
        [tuning.testSeller, 'item'],
        [tuning.testSeller, 'herb'],
        [tuning.testSeller, 'material'],
      ],
    );
    // Only the character that called him sees the wandering trader today.
    if (wandererDay(Date.now(), content).key !== questPeriod('daily', Date.now(), content).key) assert.equal((await market('Druga')).wanderer.goods, null);
    const [good] = view.wanderer.goods;
    const bought = await act('Kupiec', 'resident', { from: 'wanderer', id: good.id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.gold, 100000 - good.price);
    assert.equal(bought.data.character.bag[0].traded, true);
    assert.equal((await act('Kupiec', 'resident', { from: 'wanderer', id: good.id })).data.error.code, 'sold_out');
    // A trial offer bought: the goods wait, and no gold goes anywhere.
    const item = view.offers[0];
    assert.equal((await act('Kupiec', 'buy', { offerId: item.id })).status, 200);
    assert.equal((await (await db()).prepare("SELECT COUNT(*) AS n FROM market_parcels WHERE kind = 'gold'").first()).n, 0);
    // "Zakończ licytacje": the character's own offers and the trial ones end now.
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 2 }), 'Kupiec').run();
    await act('Kupiec', 'list', { kind: 'herb', key: herb, count: 2, startPrice: 5 });
    const ended = await call('POST', '/api/test/settlement', { cookie: cookies.Kupiec, body: { action: 'marketEnd' } });
    assert.equal(ended.status, 200, JSON.stringify(ended.data));
    const after = await market('Kupiec');
    assert.deepEqual([after.offers.length, after.mine.length], [0, 0]);
    assert.deepEqual(after.parcels.map((parcel) => parcel.reason).sort(), ['bought', 'returned']);
  });

  test('a removed account takes its offers and bids along, and the bidders on its offers get their gold back', async () => {
    const itemId = await inBag('Kramarka', amulet(30));
    await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 1000 });
    const otherId = await inBag('Kupiec', amulet(25));
    await act('Kupiec', 'list', { kind: 'item', itemId: otherId, startPrice: 500 });
    const [mine] = (await market('Kupiec')).offers;
    await act('Kupiec', 'bid', { offerId: mine.id, amount: 1000 });
    const [theirs] = (await market('Kramarka')).offers;
    await act('Kramarka', 'bid', { offerId: theirs.id, amount: 500 });
    assert.equal(await gold('Kupiec'), 100000 - 1000);
    const removed = await call('DELETE', '/api/me', { cookie: cookies.Kramarka, body: { login: 'kramarka' } });
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    // The bid on the removed seller's offer comes back; the removed bidder's
    // bid is void and the offer goes on without it.
    assert.equal(await gold('Kupiec'), 100000);
    const view = await market('Druga');
    assert.deepEqual(
      view.offers.map((offer) => [offer.seller, offer.bid, offer.minBid]),
      [['Kupiec', null, 500]],
    );
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS n FROM market_offers WHERE seller_id IS NOT NULL AND seller_id NOT IN (SELECT id FROM characters)').first()).n, 0);
  });

  test('the Targowisko is closed where the Osada is, and below its level', async () => {
    await (await db()).prepare('UPDATE characters SET level = 5 WHERE name = ?').bind('Kupiec').run();
    assert.equal((await call('GET', '/api/market', { cookie: cookies.Kupiec })).status, 403);
  });
});

describe('the Targowisko where the Osada is off', () => {
  const { call, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });

  test('it is not there', async () => {
    const { cookie } = await signUp('bezosady');
    await call('POST', '/api/character', { cookie, body: { name: 'Bezosady', classId: 'warrior', appearance: 'female' } });
    assert.equal((await call('GET', '/api/market', { cookie })).status, 404);
  });
});
