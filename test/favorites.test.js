// Favourite items (the author, 10.11.2026: "Do tego opcja dodawania do
// ulubionych, by przypadkiem nie rozebrać czegoś na później."): the star in
// the item card, the server's refusals (the Stół rozbiórki, the scrapper by
// hand and by the handful, throwing away), the bag's overflow after an
// exploration, the owner's mark gone once the item leaves the character,
// and the rules "Załóż" uses for the slot's list and the Targowisko
// (equipBlock).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { bagOverflow, createRng, equipBlock, generateItem } from '../src/engine/index.js';
import { withoutFavorites } from '../src/server/favorites.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const helmet = (rarity, level, id) => ({ ...(id === undefined ? {} : { id }), base: 'helmet', slot: 'head', level, rarity, affixes: [], armor: level });

describe('favourites and the wearing rules in the engine', () => {
  test('the bag overflows past the favourites: the weakest of the others go, and with none left the bag stays fuller', () => {
    // A staff a warrior cannot use would go first, then the lowest rarity
    // and level.
    const staff = { id: 1, base: 'staff', slot: 'weapon', level: 1, rarity: 'common', affixes: [], damageMin: 1, damageMax: 2 };
    const bag = [staff, helmet('rare', 5, 2), helmet('common', 1, 3)];
    const find = helmet('common', 2);
    assert.deepEqual(bagOverflow([...bag, find], 3, 'warrior', content), [0]);
    assert.deepEqual(bagOverflow([...bag, find], 3, 'warrior', content, new Set([1])), [2]);
    assert.deepEqual(bagOverflow([...bag, find], 2, 'warrior', content, new Set([1])), [2, 3]);
    assert.deepEqual(bagOverflow([...bag, find], 2, 'warrior', content, new Set([1, 3])), [3, 1]);
    // Only favourites and nothing else to sell: nothing goes.
    assert.deepEqual(bagOverflow(bag, 1, 'warrior', content, new Set([1, 2, 3])), []);
    // A find has no id yet: never a favourite.
    assert.deepEqual(bagOverflow([find], 0, 'warrior', content, new Set([undefined])), [0]);
  });

  test('"Załóż" refuses a locked slot, another class and a Tier above the class level, as equipBlock says', () => {
    assert.equal(equipBlock({ base: 'helmet', slot: 'head' }, 'warrior', 1, content), null);
    assert.equal(equipBlock({ base: 'staff', slot: 'weapon' }, 'warrior', 50, content), 'wrong_class');
    // The Tarcza herbowa is worn from class level 50, whatever its own level.
    assert.equal(equipBlock({ base: 'heraldic-shield', slot: 'offhand' }, 'warrior', 49, content), 'class_level');
    assert.equal(equipBlock({ base: 'heraldic-shield', slot: 'offhand' }, 'warrior', 50, content), null);
    assert.equal(equipBlock({ base: 'helmet', slot: 'core' }, 'warrior', 50, content), 'slot_locked');
  });
});

describe('favourite items through the API', () => {
  const { call, db, signUp } = useServer({ CRAFTING: 'on' });
  let cookie;

  const row = async () => (await db()).prepare("SELECT * FROM characters WHERE name = 'Gwiazda'").first();
  async function inBag(item) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind((await row()).id, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const star = (id, favorite = true) => call('POST', `/api/items/${id}/favorite`, { cookie, body: { favorite } });
  const bag = async () => (await call('GET', '/api/character', { cookie })).data.character.bag;
  const stored = async () => JSON.parse((await row()).favorites);

  beforeEach(async () => {
    ({ cookie } = await signUp('gwiazda'));
    await call('POST', '/api/character', { cookie, body: { name: 'Gwiazda', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 20, class_level = 20, gold = 1000 WHERE name = 'Gwiazda'").run();
  });

  test('the star marks an item of the bag or worn, and comes off; the ids of items gone drop out as the list is written', async () => {
    const kept = await inBag(helmet('rare', 5));
    const other = await inBag(helmet('common', 3));
    const marked = await star(kept);
    assert.equal(marked.status, 200, JSON.stringify(marked.data));
    assert.equal(marked.data.character.bag.find((item) => item.id === kept).favorite, true);
    assert.equal(marked.data.character.bag.find((item) => item.id === other).favorite, undefined);
    assert.deepEqual(await stored(), [kept]);
    // Worn, it keeps its star.
    await call('POST', `/api/items/${kept}/equip`, { cookie });
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.equipment.head.favorite, true);
    await call('POST', `/api/items/${kept}/unequip`, { cookie });
    // An item gone is ignored, and goes from the list at the next star.
    await (await db()).prepare('DELETE FROM items WHERE id = ?').bind(kept).run();
    assert.equal((await star(other)).status, 200);
    assert.deepEqual(await stored(), [other]);
    assert.equal((await star(other, false)).status, 200);
    assert.deepEqual(await stored(), []);
    // Someone else's item, or a wrong body, changes nothing.
    assert.equal((await star(999999)).data.error.code, 'item_not_found');
    assert.equal((await call('POST', `/api/items/${other}/favorite`, { cookie, body: { favorite: 'yes' } })).data.error.code, 'invalid_favorite');
  });

  test('a favourite is not sold to the scrapper nor thrown away, by hand or by the handful, until its star comes off', async () => {
    const kept = await inBag(helmet('common', 3));
    const sold = await inBag(helmet('common', 3));
    await star(kept);
    const refused = await call('POST', `/api/items/${kept}/sell`, { cookie });
    assert.equal(refused.status, 409);
    assert.deepEqual([refused.data.error.code, refused.data.error.message], ['favorite', 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go sprzedać.']);
    const thrown = await call('POST', `/api/items/${kept}/discard`, { cookie });
    assert.deepEqual([thrown.status, thrown.data.error.code, thrown.data.error.message], [409, 'favorite', 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go wyrzucić.']);
    // By the handful: the favourite stays, the other goes.
    const handful = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'mythic' } });
    assert.equal(handful.status, 200, JSON.stringify(handful.data));
    assert.equal(handful.data.sold.count, 1);
    assert.deepEqual(
      handful.data.character.bag.map((item) => item.id),
      [kept],
    );
    assert.notEqual(sold, kept);
    // Its star off, it sells.
    await star(kept, false);
    const after = await call('POST', `/api/items/${kept}/sell`, { cookie });
    assert.equal(after.status, 200, JSON.stringify(after.data));
    assert.deepEqual(after.data.character.bag, []);
  });

  test('a star put on between the read and the sale stops the sale (the batch holds while none is marked)', async () => {
    const kept = await inBag(helmet('common', 3));
    // As if the star came at the same moment: the sale reads no star, the
    // batch finds one.
    const gold = (await row()).gold;
    const { assertion } = await import('../src/server/atomic.js');
    const { unmarked } = await import('../src/server/favorites.js');
    const database = await db();
    await database.prepare('UPDATE characters SET favorites = ? WHERE id = ?').bind(JSON.stringify([kept]), (await row()).id).run();
    await assert.rejects(database.batch([unmarked(database, (await row()).id, [kept]), database.prepare('DELETE FROM items WHERE id = ?').bind(kept)]));
    assert.ok(await database.prepare('SELECT id FROM items WHERE id = ?').bind(kept).first());
    assert.equal((await row()).gold, gold);
    // Without the star the same batch goes through.
    await database.prepare("UPDATE characters SET favorites = '[]' WHERE id = ?").bind((await row()).id).run();
    await database.batch([unmarked(database, (await row()).id, [kept]), assertion(database, '1', [])]);
  });

  test('the Stół rozbiórki takes no favourite apart, alone or with "Rozbierz kilka"', async () => {
    await (await db()).prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 10, 0, 1 FROM characters WHERE name = 'Gwiazda'").run();
    const kept = await inBag(helmet('common', 3));
    const other = await inBag(helmet('common', 3));
    await star(kept);
    const one = await call('POST', `/api/items/${kept}/salvage`, { cookie });
    assert.deepEqual([one.status, one.data.error.code, one.data.error.message], [409, 'favorite', 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go rozebrać.']);
    const many = await call('POST', '/api/items/salvage', { cookie, body: { ids: [other, kept] } });
    assert.deepEqual([many.status, many.data.error.code], [409, 'favorite']);
    assert.equal((await bag()).length, 2);
    // The other alone goes to the table.
    const taken = await call('POST', '/api/items/salvage', { cookie, body: { ids: [other] } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(
      taken.data.character.bag.map((item) => item.id),
      [kept],
    );
  });

  test('a full bag after an exploration keeps the favourites: the scrapper takes the weakest of the others', async () => {
    const database = await db();
    const { id } = await row();
    const rng = createRng('favourites');
    // Five staffs a warrior cannot use, the first to go, all favourites, and
    // 26 helmets: 31 items for a bag of 30.
    const staffs = [];
    for (let i = 0; i < 5; i++) {
      const made = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(id, JSON.stringify(generateItem({ baseId: 'staff', level: 3, rarityId: 'common' }, rng, content)), i).run();
      staffs.push(made.meta.last_row_id);
    }
    for (let i = 0; i < 26; i++) {
      await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(id, JSON.stringify(generateItem({ baseId: 'helmet', level: 3, rarityId: 'common' }, rng, content)), 10 + i).run();
    }
    await database.prepare('UPDATE characters SET favorites = ? WHERE id = ?').bind(JSON.stringify(staffs), id).run();
    await database.prepare('UPDATE characters SET level = 1, class_level = 1 WHERE id = ?').bind(id).run();
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 15 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    await database.prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed'").bind(Date.now() - 1).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const after = claimed.data.character.bag;
    assert.equal(after.length, 30);
    assert.ok(claimed.data.report.system.some((line) => line.startsWith('Plecak był pełny (30 miejsc).')));
    for (const staff of staffs) assert.ok(after.some((item) => item.id === staff && item.favorite), `the staff ${staff} stays`);
  });

  test('an item that leaves the character is no favourite: in the Skrzynia Konta, or moved in a Wymiana (withoutFavorites)', async () => {
    const kept = await inBag(helmet('rare', 5));
    const other = await inBag(helmet('rare', 6));
    await star(kept);
    await star(other);
    const put = await call('POST', '/api/chest/put', { cookie, body: { itemId: kept } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.deepEqual(await stored(), [other]);
    // The statement a Wymiana's giver gets: the items given come off.
    const database = await db();
    await database
      .prepare(`UPDATE characters SET favorites = ${withoutFavorites} WHERE id = ?`)
      .bind(JSON.stringify([other]), (await row()).id)
      .run();
    assert.deepEqual(await stored(), []);
  });
});

describe('a favourite put up at the Targowisko', () => {
  const { call, db, signUp } = useServer({ CRAFTING: 'on', SETTLEMENT: 'on' });

  test('is no favourite any more, also if it comes back', async () => {
    const { cookie } = await signUp('kupczyni');
    await call('POST', '/api/character', { cookie, body: { name: 'Kupczyni', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 25, class_level = 25 WHERE name = 'Kupczyni'").run();
    const { id } = await (await db()).prepare("SELECT id FROM characters WHERE name = 'Kupczyni'").first();
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(helmet('rare', 20))).run();
    const itemId = made.meta.last_row_id;
    assert.equal((await call('POST', `/api/items/${itemId}/favorite`, { cookie, body: { favorite: true } })).status, 200);
    const listed = await call('POST', '/api/market/list', { cookie, body: { kind: 'item', itemId, startPrice: 100, buyNow: null } });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    // Its star shows on the list of goods to put up before.
    assert.equal(JSON.parse((await (await db()).prepare('SELECT favorites FROM characters WHERE id = ?').bind(id).first()).favorites).length, 0);
    const cancelled = await call('POST', '/api/market/cancel', { cookie, body: { offerId: listed.data.market.mine[0].id } });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    const back = await call('POST', '/api/market/collect', { cookie, body: {} });
    assert.equal(back.status, 200, JSON.stringify(back.data));
    assert.equal(back.data.character.bag.length, 1);
    assert.equal(back.data.character.bag[0].favorite, undefined);
  });
});
