// The Targowisko's Rejestr and its filters for the character (the author,
// 10.11.2026: "Zbudować rejestr na targowisku sprzedanych i odebranych
// przedmiotów (oraz wygranych w licytacjach)" and "Wywalić aktualne filtry
// Targowiska i zrobić bardziej przydatne - Licytowane przeze mnie, Do
// założenia przeze mnie (czy tam moją klasę). Aktualne czyli podzial na
// rodzaj przedmiotu może pozostać jako podkategorie."): the lines written
// with each trade, for both sides, the newest first and only the last ones
// kept; "Licytuję" with the outbid too; "Dla mnie" as "Załóż" asks.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { merchantStock, sellerShare } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.market;

// "Dla mnie" and "Licytuję" are the server's search now, over all the
// offers (test/market-search.test.js).
describe('the Rejestr and the filters through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const cookies = {};

  async function player(name, classId = 'warrior') {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId, appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000 WHERE name = ?').bind(name).run();
    cookies[name] = cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  async function inBag(name, item) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind((await row(name)).id, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const item = (base, slot, level = 20) => ({ base, slot, level, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 } });
  const market = async (name, query = '') => (await call('GET', `/api/market${query}`, { cookie: cookies[name] })).data.market;
  const register = async (name) => (await call('GET', '/api/market/log', { cookie: cookies[name] })).data;
  const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
  const endAll = async () => (await db()).prepare("UPDATE market_offers SET ends_at = ? WHERE state = 'open'").bind(Date.now() - 1).run();
  const lines = (log) => log.map((line) => [line.event, line.goods.kind, line.price, line.with]);

  beforeEach(async () => {
    await player('Kramarka');
    await player('Kupiec');
    await player('Druga', 'mage');
  });

  test('an auction sold: the seller writes down to whom and for how much, the winner from whom; the outbid nothing', async () => {
    const empty = await register('Kramarka');
    assert.deepEqual([empty.log, empty.since, empty.limit], [[], tuning.log.since, tuning.log.entries]);
    const itemId = await inBag('Kramarka', item('amulet', 'amulet'));
    await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 100, buyNow: null });
    const offer = (await market('Kupiec')).offers[0];
    assert.equal((await act('Kupiec', 'bid', { offerId: offer.id, amount: 100 })).status, 200);
    assert.equal((await act('Druga', 'bid', { offerId: offer.id, amount: 105 })).status, 200);
    // "Licytuję": the outbid sees its last bid, the one who leads too.
    const outbid = (await market('Kupiec')).offers.find((one) => one.id === offer.id);
    assert.deepEqual([outbid.myBid, outbid.leading], [100, false]);
    assert.deepEqual(
      (await market('Kupiec', '?show=bidding')).offers.map((one) => one.id),
      [offer.id],
    );
    const leading = (await market('Druga')).offers.find((one) => one.id === offer.id);
    assert.deepEqual([leading.myBid, leading.leading], [105, true]);
    // Kupiec bids again: one line of its bids, the last amount.
    assert.equal((await act('Kupiec', 'bid', { offerId: offer.id, amount: 111 })).status, 200);
    assert.equal((await market('Kupiec')).offers[0].myBid, 111);
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS n FROM market_bids').first()).n, 2);
    await endAll();
    await market('Kramarka');
    const sold = (await register('Kramarka')).log;
    assert.deepEqual(lines(sold), [['sold', 'item', 111, 'Kupiec']]);
    assert.equal(sold[0].gold, sellerShare(111, content));
    assert.equal(sold[0].goods.item.slot, 'amulet');
    assert.deepEqual(lines((await register('Kupiec')).log), [['won', 'item', 111, 'Kramarka']]);
    assert.deepEqual((await register('Druga')).log, []);
    // The bids go with the offer settled.
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS n FROM market_bids').first()).n, 0);
  });

  test('"Kup teraz", an offer taken back and one without a buyer, the newest first; the goods of a stack too', async () => {
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 9 }), 'Kramarka').run();
    await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 3, startPrice: 20, buyNow: 40 });
    const bought = await act('Kupiec', 'buy', { offerId: (await market('Kupiec')).offers[0].id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const withdrawn = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 2, startPrice: 20 });
    assert.equal((await act('Kramarka', 'cancel', { offerId: withdrawn.data.market.mine[0].id })).status, 200);
    await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 });
    await endAll();
    const own = (await register('Kramarka')).log;
    assert.deepEqual(lines(own), [
      ['expired', 'herb', 0, null],
      ['withdrawn', 'herb', 0, null],
      ['sold', 'herb', 40, 'Kupiec'],
    ]);
    assert.deepEqual(
      own.map((line) => line.goods.count),
      [1, 2, 3],
    );
    assert.deepEqual(lines((await register('Kupiec')).log), [['bought', 'herb', 40, 'Kramarka']]);
  });

  test("the merchant's goods bought are written down too, from Gościwit", async () => {
    const good = merchantStock(Date.now(), content).goods[0];
    const bought = await act('Kupiec', 'resident', { from: 'merchant', id: good.id, count: 2 });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const [line] = (await register('Kupiec')).log;
    assert.deepEqual([line.event, line.goods.kind, line.goods.count, line.price, line.with], ['bought', good.kind, 2, bought.data.bought.price, content.residentsById.merchant.name]);
  });

  test('only the last lines stay', async () => {
    const { id } = await row('Kramarka');
    const database = await db();
    for (let i = 0; i < tuning.log.entries + 5; i += 1) {
      await database.prepare("INSERT INTO market_log (character_id, event, kind, good, count, created_at) VALUES (?, 'expired', 'herb', ?, 1, ?)").bind(id, content.herbs[0].id, i).run();
    }
    const herb = content.herbs[0].id;
    await database.prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 2 }), 'Kramarka').run();
    const listed = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 });
    await act('Kramarka', 'cancel', { offerId: listed.data.market.mine[0].id });
    const { n } = await database.prepare('SELECT COUNT(*) AS n FROM market_log WHERE character_id = ?').bind(id).first();
    assert.equal(n, tuning.log.entries);
    const log = (await register('Kramarka')).log;
    assert.equal(log.length, tuning.log.entries);
    assert.equal(log[0].event, 'withdrawn');
  });

  test('"Dla mnie": the items of the offers the character could wear now, its class and the Tier as "Załóż" asks', async () => {
    // Kalkan from class level 25, the Tarcza herbowa from 50: a warrior at 25
    // wears the first; a staff is a mage's.
    const offered = {};
    for (const [base, slot] of [
      ['kalkan', 'offhand'],
      ['heraldic-shield', 'offhand'],
      ['staff', 'weapon'],
    ]) {
      const itemId = await inBag('Druga', item(base, slot));
      const listed = await act('Druga', 'list', { kind: 'item', itemId, startPrice: 10 });
      assert.equal(listed.status, 200, JSON.stringify(listed.data));
      offered[base] = listed.data.market.mine.at(-1).id;
    }
    const offers = (await market('Kupiec')).offers;
    const blocks = Object.fromEntries(Object.entries(offered).map(([base, id]) => [base, offers.find((one) => one.id === id).equipBlock]));
    assert.deepEqual(blocks, { kalkan: null, 'heraldic-shield': 'class_level', staff: 'wrong_class' });
    assert.deepEqual(
      (await market('Kupiec', '?show=for-me')).offers.map((one) => one.id),
      [offered.kalkan],
    );
  });

  test('a character removed takes its Rejestr and bids with it', async () => {
    const itemId = await inBag('Kramarka', item('amulet', 'amulet'));
    await act('Kramarka', 'list', { kind: 'item', itemId, startPrice: 100 });
    const offer = (await market('Kupiec')).offers[0];
    await act('Kupiec', 'bid', { offerId: offer.id, amount: 100 });
    await act('Druga', 'bid', { offerId: offer.id, amount: 105 });
    const { id } = await row('Kupiec');
    await (await db()).prepare("INSERT INTO market_log (character_id, event, kind, count, created_at) VALUES (?, 'bought', 'herb', 1, 0)").bind(id).run();
    const removed = await call('DELETE', '/api/character', { cookie: cookies.Kupiec });
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    const left = await (await db()).prepare('SELECT (SELECT COUNT(*) FROM market_log WHERE character_id = ?) AS log, (SELECT COUNT(*) FROM market_bids WHERE character_id = ?) AS bids').bind(id, id).first();
    assert.deepEqual(left, { log: 0, bids: 0 });
  });
});
