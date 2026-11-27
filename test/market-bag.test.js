// The Targowisko in the character's view, for "Wystaw na Targowisku" on the
// bag's cards (a player's proposal passed on by the author, 27.11.2026:
// „brak możliwości wystawienia przedmiotu bezpośrednio z menu plecaka”;
// DECISIONS.md, „Wystaw z plecaka”): null before the Osada opens; from its
// level, the numbers of the Targowisko's price sheet, the same as its own
// answer has, how many offers the character may have open and how many it
// has now, an offer past its end not counted before it is settled. The
// bag's listing is the Targowisko's own request: an item put up so leaves
// the bag, a worn one does not go up, and the limit holds.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.market;
const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
const amulet = (level) => ({ base: 'amulet', slot: 'amulet', level, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 } });

describe("the Targowisko in the character's view, for the bag's „Wystaw na Targowisku”", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  let id;

  const view = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const list = (body) => call('POST', '/api/market/list', { cookie, body });
  async function give(item, slot = null) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('kramarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kramarka', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    ({ id } = await database.prepare("SELECT id FROM characters WHERE name = 'Kramarka'").first());
    await database.prepare("UPDATE characters SET level = 25, class_level = 25, gold = 1000, herbs = '{\"comfrey\":10}' WHERE id = ?").bind(id).run();
  });

  test('none before the Osada opens; from its level, the numbers of the Targowisko\'s price sheet and the offers open', async () => {
    await (await db()).prepare('UPDATE characters SET level = 19 WHERE id = ?').bind(id).run();
    assert.equal((await view()).market, null);
    await (await db()).prepare('UPDATE characters SET level = 25 WHERE id = ?').bind(id).run();
    const { market } = await view();
    assert.deepEqual(market, { fee: tuning.fee, hours: tuning.hours, usualHours: tuning.hours, minHours: tuning.minHours, maxPrice: tuning.maxPrice, limit: tuning.offers, open: 0 });
    // The same numbers as the Targowisko's own answer.
    const own = (await call('GET', '/api/market', { cookie })).data.market;
    for (const key of ['fee', 'hours', 'usualHours', 'minHours', 'maxPrice', 'limit']) assert.equal(market[key], own[key], key);
  });

  test('an item put up from the bag leaves it, and the offer is counted; one past its end holds no place before it is settled', async () => {
    const itemId = await give(amulet(25));
    assert.deepEqual((await view()).bag.map((item) => item.id), [itemId]);
    const listed = await list({ kind: 'item', itemId, startPrice: 100, buyNow: null, hours: 24 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.deepEqual(listed.data.character.bag, []);
    assert.equal(listed.data.character.market.open, 1);
    const [offer] = listed.data.market.mine;
    assert.deepEqual([offer.goods.kind, offer.goods.item.level, offer.startPrice, offer.buyNow], ['item', 25, 100, null]);
    // A stack from its card: as many pieces as chosen.
    const herbs = await list({ kind: 'herb', key: 'comfrey', count: 4, startPrice: 20, buyNow: 50, hours: 6 });
    assert.equal(herbs.status, 200, JSON.stringify(herbs.data));
    assert.deepEqual(herbs.data.character.herbs.map((herb) => [herb.id, herb.count]), [['comfrey', 6]]);
    assert.equal(herbs.data.character.market.open, 2);
    // The amulet's time ran out: the Targowisko has not settled it yet, and
    // the bag already counts its place free.
    const database = await db();
    await database.prepare('UPDATE market_offers SET ends_at = ? WHERE kind = ?').bind(Date.now() - 1, 'item').run();
    assert.equal((await view()).market.open, 1);
    assert.equal((await database.prepare("SELECT state FROM market_offers WHERE kind = 'item'").first()).state, 'open');
  });

  test('five offers at once and one more with the Kompania Kupców\'s next standing, as on the Targowisko; a worn item does not go up', async () => {
    for (let index = 0; index < tuning.offers; index += 1) {
      assert.equal((await list({ kind: 'herb', key: 'comfrey', count: 1, startPrice: 10 })).status, 200);
    }
    assert.deepEqual([(await view()).market.open, (await view()).market.limit], [5, 5]);
    const sixth = await list({ kind: 'herb', key: 'comfrey', count: 1, startPrice: 10 });
    assert.deepEqual([sixth.status, sixth.data.error.code, sixth.data.error.message], [409, 'too_many', 'Masz już 5 ofert na Targowisku. Wystawisz więcej, gdy któraś się skończy.']);
    await (await db()).prepare('UPDATE characters SET settlement = ? WHERE id = ?').bind(JSON.stringify({ reputation: { merchants: points('acquaintance') } }), id).run();
    assert.deepEqual([(await view()).market.open, (await view()).market.limit], [5, 6]);
    // A worn item is no goods of the bag.
    await (await db()).prepare("UPDATE market_offers SET state = 'sold' WHERE seller_id = ?").bind(id).run();
    const worn = await give(amulet(25), 'amulet');
    const refused = await list({ kind: 'item', itemId: worn, startPrice: 100 });
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'not_enough']);
    assert.ok(await (await db()).prepare('SELECT id FROM items WHERE id = ? AND slot = ?').bind(worn, 'amulet').first());
  });
});
