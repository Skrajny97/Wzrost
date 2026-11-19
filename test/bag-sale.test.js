// "Zaznacz do sprzedaży" in the bag (a player's idea the author wants,
// 19.11.2026: „możliwość zaznaczania ich w plecaku do sprzedaży wybranych a
// nie całych rzadkości”): the scrapper buys the items marked ({ ids }) at the
// prices of their cards, with the Skup złomu's bonus, all or none. Someone
// else's item, a favourite, a worn one or one gone meanwhile stops the sale,
// and two taps at once pay once. The words come from data/buildings.json,
// with the Kowadło's "Sortuj:" (anvilSort) for the page.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { campBonus, sellPrice } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const helmet = (rarity, level, extra = {}) => ({ base: 'helmet', slot: 'head', level, rarity, affixes: [], armor: level, ...extra });
const PICK = content.buildings.find((building) => building.effect.kind === 'sellPrice').pick;

describe('the bag\'s marked items sold to the scrapper, through the API', () => {
  const { call, db, signUp } = useServer({ CRAFTING: 'on', PROFESSIONS: 'on' });
  let cookie;
  let id;

  const row = async () => (await db()).prepare('SELECT * FROM characters WHERE id = ?').bind(id).first();
  async function give(characterId, item, slot = null) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(characterId, slot, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const inBag = (item, slot = null) => give(id, item, slot);
  const bagIds = async () => (await (await db()).prepare('SELECT id FROM items WHERE character_id = ? AND slot IS NULL ORDER BY id').bind(id).all()).results.map((one) => one.id);
  const sell = (ids) => call('POST', '/api/items/sell', { cookie, body: { ids } });
  // The Skup złomu's bonus at its level, as the server counts the prices.
  const bonusAt = (level) => campBonus({ 'scrap-bench': level }, 'sellPrice', content);

  beforeEach(async () => {
    ({ cookie } = await signUp('zlomiarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Złomiarka', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    ({ id } = await database.prepare("SELECT id FROM characters WHERE name = 'Złomiarka'").first());
    await database.prepare('UPDATE characters SET level = 30, class_level = 30, gold = 1000 WHERE id = ?').bind(id).run();
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'scrap-bench', 5, 0, 1)").bind(id).run();
  });

  test('the marked items go for the prices of their cards with the Skup złomu, an upgraded one and one with a gem too; the others stay', async () => {
    const plain = await inBag(helmet('rare', 20));
    const upgraded = await inBag(helmet('epic', 25, { upgrade: 3 }));
    const gemmed = await inBag(helmet('unique', 22, { gem: 'ruby' }));
    const kept = await inBag(helmet('common', 10));
    const before = (await call('GET', '/api/character', { cookie })).data.character.bag;
    const price = (itemId) => before.find((item) => item.id === itemId).price;
    const expected = price(plain) + price(upgraded) + price(gemmed);
    // The page's price is the engine's, with the bonus of the Skup złomu.
    const bonus = bonusAt(5);
    assert.ok(bonus > 0);
    assert.equal(price(plain), sellPrice(helmet('rare', 20), content, bonus));
    const answer = await sell([plain, upgraded, gemmed]);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(answer.data.sold.count, 3);
    assert.equal(answer.data.sold.gold, expected);
    assert.deepEqual(answer.data.sold.gems.map((gem) => gem.id), ['ruby']);
    assert.equal((await row()).gold, 1000 + expected);
    assert.equal(JSON.parse((await row()).minerals).ruby, 1);
    assert.deepEqual(await bagIds(), [kept]);
    assert.deepEqual(answer.data.character.bag.map((item) => item.id), [kept]);
  });

  test("someone else's item stops the sale: nothing is sold, also of the own marked with it", async () => {
    const own = await inBag(helmet('rare', 20));
    const { cookie: other } = await signUp('sasiadka');
    await call('POST', '/api/character', { cookie: other, body: { name: 'Sąsiadka', classId: 'archer', appearance: 'female' } });
    const otherId = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Sąsiadka'").first()).id;
    const theirs = await give(otherId, helmet('epic', 30));
    const answer = await sell([own, theirs]);
    assert.deepEqual([answer.status, answer.data.error.code, answer.data.error.message], [404, 'item_not_found', PICK.errors.gone]);
    assert.equal((await row()).gold, 1000);
    assert.deepEqual(await bagIds(), [own]);
    assert.ok(await (await db()).prepare('SELECT id FROM items WHERE id = ?').bind(theirs).first());
  });

  test('a favourite is refused until its star comes off, and nothing marked with it is sold', async () => {
    const plain = await inBag(helmet('rare', 20));
    const kept = await inBag(helmet('rare', 20));
    await call('POST', `/api/items/${kept}/favorite`, { cookie, body: { favorite: true } });
    const refused = await sell([plain, kept]);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'favorite', 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go sprzedać.']);
    assert.deepEqual(await bagIds(), [plain, kept]);
    assert.equal((await row()).gold, 1000);
    await call('POST', `/api/items/${kept}/favorite`, { cookie, body: { favorite: false } });
    assert.equal((await sell([plain, kept])).status, 200);
    assert.deepEqual(await bagIds(), []);
  });

  test('a worn item is refused: the scrapper buys only from the bag', async () => {
    const plain = await inBag(helmet('rare', 20));
    const worn = await inBag(helmet('epic', 20), 'head');
    const refused = await sell([plain, worn]);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'equipped', PICK.errors.worn]);
    assert.deepEqual(await bagIds(), [plain]);
    assert.ok(await (await db()).prepare("SELECT id FROM items WHERE id = ? AND slot = 'head'").bind(worn).first());
    assert.equal((await row()).gold, 1000);
  });

  test('two taps at once pay once, and a list with an item sold meanwhile sells nothing more', async () => {
    const first = await inBag(helmet('rare', 20));
    const second = await inBag(helmet('unique', 20));
    const third = await inBag(helmet('common', 20));
    const before = (await call('GET', '/api/character', { cookie })).data.character.bag;
    const gold = before.filter((item) => [first, second].includes(item.id)).reduce((sum, item) => sum + item.price, 0);
    const answers = await Promise.all([sell([first, second]), sell([first, second])]);
    const statuses = answers.map((answer) => answer.status).sort();
    assert.equal(statuses.filter((status) => status === 200).length, 1, JSON.stringify(answers.map((answer) => answer.data.error ?? answer.data.sold)));
    const refused = answers.find((answer) => answer.status !== 200);
    // Read after the first one's batch: the items are gone; read before it,
    // the batch finds the character changed meanwhile.
    assert.ok(
      (refused.status === 404 && refused.data.error.code === 'item_not_found') || (refused.status === 409 && refused.data.error.code === 'character_changed'),
      JSON.stringify(refused.data),
    );
    assert.equal((await row()).gold, 1000 + gold);
    // The page that still shows the first two marks the third too: all or none.
    const stale = await sell([second, third]);
    assert.deepEqual([stale.status, stale.data.error.code], [404, 'item_not_found']);
    assert.deepEqual(await bagIds(), [third]);
    assert.equal((await row()).gold, 1000 + gold);
  });

  test('a batch on a character changed meanwhile, or on items no longer in the bag, saves nothing', async () => {
    // The same assertions as the sale's batch, with the row read before a change.
    const { assertion, atomically, sameVersion } = await import('../src/server/atomic.js');
    const plain = await inBag(helmet('rare', 20));
    const database = await db();
    const read = await row();
    await database.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(id).run();
    await assert.rejects(
      atomically(database, [sameVersion(database, read), database.prepare('DELETE FROM items WHERE id = ?').bind(plain)]),
      (error) => error.status === 409 && error.code === 'character_changed',
    );
    const list = JSON.stringify([plain, 999999]);
    await assert.rejects(
      atomically(database, [
        assertion(database, '(SELECT COUNT(*) FROM items WHERE character_id = ? AND slot IS NULL AND id IN (SELECT value FROM json_each(?))) = ?', [id, list, 2]),
        database.prepare('DELETE FROM items WHERE id = ?').bind(plain),
      ]),
    );
    assert.deepEqual(await bagIds(), [plain]);
  });

  test('an empty or wrong list is refused, and the sale by rarity still works beside it', async () => {
    await inBag(helmet('common', 20));
    for (const ids of [[], 'all', [null, 'x']]) {
      const refused = await call('POST', '/api/items/sell', { cookie, body: { ids } });
      assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [400, 'invalid_items', PICK.errors.none]);
    }
    const handful = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'common' } });
    assert.equal(handful.status, 200, JSON.stringify(handful.data));
    assert.equal(handful.data.sold.count, 1);
    assert.deepEqual(await bagIds(), []);
  });

  test("the page gets the words of the sale and of the Kowadło's \"Sortuj:\", without the server's refusals", async () => {
    const { data } = await call('GET', '/api/content');
    assert.equal(data.scrapperPick.button, PICK.button);
    assert.equal(data.scrapperPick.errors, undefined);
    assert.deepEqual(
      data.anvilSort.orders.map((order) => order.id),
      ['worn', 'new', 'rarity', 'level', 'upgrade', 'slot'],
    );
  });
});
