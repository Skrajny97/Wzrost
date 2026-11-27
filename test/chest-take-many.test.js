// "Wyjmij wszystko" and "Wyjmij zaznaczone" in the Skrzynia Konta (a
// player's idea the author passed on, 27.11.2026; src/server/chest.js,
// takeManyFromChest): everything of a tab, or the things marked, in one
// request. Each comes out as a single take-out takes it, a good whole; in
// the chest's order, while the bag has the places for it, and the answer
// says how many came out of how many. DECISIONS.md, „Skrzynia konta: wyjmij
// wszystko i zaznaczone (27.11.2026)”.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const LEVEL = content.balance.account.chestLevel;
const STACK = content.professionRules.stack;
const WOOD = content.resources[0].id;
const POTION = content.potions[0].id;
const HERB = content.herbs[0].id;
const OTHER_HERB = content.herbs[1].id;
const MINERAL = content.minerals[0].id;
const PELT = 'wolf-pelt:rare';
const CARD = 'likho';
const CHANGED = 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.';

describe('many things out of the Skrzynia Konta at once', () => {
  const { server, call, db, signUp } = useServer({ CARDS: 'on', ENGLISH: 'on' });
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  async function create(name, level = LEVEL) {
    const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await run('UPDATE characters SET level = ? WHERE name = ?', level, name);
    return (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }
  const userId = async () => (await first("SELECT id FROM users WHERE login = 'wyjmij'")).id;
  // An item in the chest, put in by `by` (0: a character no longer there).
  async function chestItem(by, level, rarity = 'common') {
    const data = JSON.stringify({ base: 'amulet', slot: 'amulet', level, rarity, affixes: [], implicit: { stat: 'will', value: 2 } });
    return (await run('INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at) VALUES (?, ?, 0, ?, 0, 0)', await userId(), by, data)).meta.last_row_id;
  }
  const chestGood = async (by, kind, good, count, traded = 0) =>
    run('INSERT INTO chest_goods (user_id, character_id, kind, good, count, traded) VALUES (?, ?, ?, ?, ?, ?)', await userId(), by, kind, good, count, traded);
  const holdings = async (name) => {
    const row = await first('SELECT resources, potions, herbs, materials, minerals, foreign_stacks, version FROM characters WHERE name = ?', name);
    return { ...Object.fromEntries(['resources', 'potions', 'herbs', 'materials', 'minerals', 'foreign_stacks'].map((column) => [column, JSON.parse(row[column])])), version: row.version };
  };
  const bagItems = async (id) => (await (await db()).prepare('SELECT data FROM items WHERE character_id = ? AND slot IS NULL ORDER BY id').bind(id).all()).results.map((one) => JSON.parse(one.data));
  const chest = async () => (await call('GET', '/api/chest', { cookie })).data.chest;
  const takeMany = (body) => call('POST', '/api/chest/take-many', { cookie, body });
  // Requests that start together, as two taps at once (chest-goods.test.js):
  // their bodies held back and let go at the same moment.
  async function together(bodies) {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const answers = bodies.map((body) => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const stream = new ReadableStream(
        {
          async pull(controller) {
            await gate;
            controller.enqueue(bytes);
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      return server
        .getWorker()
        .fetch('/api/chest/take-many', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: stream, duplex: 'half' })
        .then(async (response) => ({ status: response.status, data: await response.json() }));
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    return Promise.all(answers);
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('wyjmij'));
  });

  test('„Wyjmij wszystko”: every item of the chest, then every good whole, cards too; its own come back as they were, the others\' as from others', async () => {
    const mira = await create('Mira');
    const own = await chestItem(mira, 30, 'rare');
    const gone = await chestItem(0, 25);
    await chestGood(mira, 'resource', WOOD, 120);
    await chestGood(mira, 'herb', HERB, 30);
    await chestGood(0, 'herb', HERB, 12);
    await chestGood(0, 'potion', POTION, 5);
    await chestGood(mira, 'material', PELT, 4, 1);
    await chestGood(0, 'mineral', MINERAL, 3);
    await chestGood(0, 'card', CARD, 2);
    const before = await holdings('Mira');

    const items = await takeMany({ all: 'items' });
    assert.equal(items.status, 200, JSON.stringify(items.data));
    assert.deepEqual(items.data.taken, { count: 2, of: 2 });
    assert.deepEqual(items.data.chest.items, []);
    // The goods stay for their own tab.
    assert.equal(items.data.chest.goods.length, 6);
    // In the chest's order; the item of the character gone comes marked.
    const bag = await bagItems(mira);
    assert.deepEqual(bag.map((item) => [item.level, item.chest ?? 0]), [[30, 0], [25, 1]]);
    assert.equal(items.data.character.bag.length, 2);
    assert.equal(await first('SELECT id FROM chest_items WHERE id IN (?, ?)', own, gone), null);

    const goods = await takeMany({ all: 'goods' });
    assert.equal(goods.status, 200, JSON.stringify(goods.data));
    assert.deepEqual(goods.data.taken, { count: 6, of: 6 });
    assert.deepEqual(goods.data.chest.goods, []);
    assert.equal((await first('SELECT COUNT(*) AS rows FROM chest_goods')).rows, 0);
    const after = await holdings('Mira');
    assert.deepEqual(
      [after.resources[WOOD], after.herbs[HERB], after.potions[POTION], after.materials[PELT], after.minerals[MINERAL]],
      [(before.resources[WOOD] ?? 0) + 120, 42, 5, 4, 3],
    );
    // The pieces of the character gone, and its own piece of the pelt got
    // from others, as got from others (the Encyklopedia leaves them out).
    assert.deepEqual(after.foreign_stacks, { [`herb:${HERB}`]: 12, [`potion:${POTION}`]: 5, [`material:${PELT}`]: 1, [`mineral:${MINERAL}`]: 3 });
    // Two batches: the version moved twice.
    assert.equal(after.version, before.version + 2);
    // The card into the collection, its copies from others.
    assert.deepEqual({ ...(await first('SELECT copies, traded FROM cards WHERE character_id = ? AND monster_id = ?', mira, CARD)) }, { copies: 2, traded: 2 });

    // Nothing left: the page missed a change.
    const empty = await takeMany({ all: 'items' });
    assert.deepEqual([empty.status, empty.data.error.code, empty.data.error.message], [409, 'character_changed', CHANGED]);
  });

  test('two taps at once take each thing once: none doubled, none lost', async () => {
    const mira = await create('Mira');
    await chestItem(mira, 10);
    await chestItem(mira, 11);
    await chestGood(mira, 'herb', HERB, 9);
    await chestGood(0, 'material', PELT, 6);
    const items = await together([{ all: 'items' }, { all: 'items' }]);
    assert.deepEqual(items.map((one) => one.status).sort(), [200, 409], JSON.stringify(items.map((one) => one.data.error?.code ?? one.status)));
    assert.equal((await bagItems(mira)).length, 2);
    const goods = await together([{ all: 'goods' }, { goods: [`material:${PELT}`] }]);
    assert.equal(goods.filter((one) => one.status === 200).length, 1, JSON.stringify(goods.map((one) => one.data.error?.code ?? one.status)));
    const held = await holdings('Mira');
    const left = async (good) => (await first('SELECT COALESCE(SUM(count), 0) AS count FROM chest_goods WHERE good = ?', good)).count;
    assert.equal((held.herbs[HERB] ?? 0) + (await left(HERB)), 9);
    assert.equal((held.materials[PELT] ?? 0) + (await left(PELT)), 6);
    assert.equal(held.foreign_stacks[`material:${PELT}`] ?? 0, held.materials[PELT] ?? 0);
    assert.equal((await first('SELECT COUNT(*) AS rows FROM chest_items')).rows, 0);
  });

  test('„Wyjmij zaznaczone”: only the things marked; one marked gone meanwhile, or the padlock, takes nothing', async () => {
    const mira = await create('Mira');
    const [one, two, three] = [await chestItem(mira, 10), await chestItem(mira, 11), await chestItem(mira, 12)];
    await chestGood(mira, 'herb', HERB, 8);
    await chestGood(mira, 'herb', OTHER_HERB, 9);
    await chestGood(mira, 'material', PELT, 2);

    const picked = await takeMany({ items: [three, one] });
    assert.equal(picked.status, 200, JSON.stringify(picked.data));
    assert.deepEqual(picked.data.taken, { count: 2, of: 2 });
    assert.deepEqual(picked.data.chest.items.map((item) => item.id), [two]);
    // Put in as the chest holds them, whatever the order marked.
    assert.deepEqual((await bagItems(mira)).map((item) => item.level), [10, 12]);

    const goods = await takeMany({ goods: [`material:${PELT}`, `herb:${OTHER_HERB}`] });
    assert.equal(goods.status, 200, JSON.stringify(goods.data));
    assert.deepEqual(goods.data.taken, { count: 2, of: 2 });
    assert.deepEqual(goods.data.chest.goods.map(({ kind, id, count }) => [kind, id, count]), [['herb', HERB, 8]]);
    const held = await holdings('Mira');
    assert.deepEqual([held.herbs[HERB], held.herbs[OTHER_HERB], held.materials[PELT]], [undefined, 9, 2]);

    // Marked on a page that missed a take: nothing comes out, also of the rest.
    const stale = await takeMany({ items: [two, one], goods: [`herb:${HERB}`] });
    assert.deepEqual([stale.status, stale.data.error.code, stale.data.error.message], [409, 'character_changed', CHANGED]);
    assert.equal((await chest()).items.length, 1);
    assert.equal((await chest()).goods.length, 1);

    // A list the chest cannot take.
    for (const body of [{}, { all: 'gold' }, { items: [] }, { items: ['1'] }, { items: [two, two] }, { goods: ['herb:nothing'] }, { goods: [`gold:gold`] }, { goods: HERB }]) {
      const refused = await takeMany(body);
      assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [400, 'invalid_take', 'Wybierz, co wyjąć ze Skrzyni Konta.'], JSON.stringify(body));
    }

    // Below the chest's level, nothing.
    await run('UPDATE characters SET level = ? WHERE id = ?', LEVEL - 1, mira);
    const locked = await takeMany({ all: 'items' });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'chest_locked']);
    assert.equal((await first('SELECT COUNT(*) AS rows FROM chest_items')).rows, 1);
  });

  test('a full bag: what fits comes out in the chest\'s order, the rest stays and the answer says how much; nothing fits, nothing comes out', async () => {
    const mira = await create('Mira');
    const items = [await chestItem(mira, 10), await chestItem(mira, 11), await chestItem(mira, 12), await chestItem(mira, 13)];
    const { bagCapacity } = (await call('GET', '/api/character', { cookie })).data.character;
    // Two places left: the herbs of the others fill the rest, their last
    // stack with room for 3 more pieces.
    await run('UPDATE characters SET herbs = ? WHERE id = ?', JSON.stringify({ [OTHER_HERB]: STACK * (bagCapacity - 2) - 3 }), mira);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.bagUsed, bagCapacity - 2);

    const part = await takeMany({ all: 'items' });
    assert.equal(part.status, 200, JSON.stringify(part.data));
    assert.deepEqual(part.data.taken, { count: 2, of: 4 });
    assert.deepEqual(part.data.chest.items.map((item) => item.id), items.slice(2));
    assert.deepEqual((await bagItems(mira)).map((item) => item.level), [10, 11]);
    assert.equal(part.data.character.bagUsed, bagCapacity);

    // The bag full: a herb or a potion that needs a new stack stays, whole;
    // the pieces that fill up the last stack there come out, and so do the
    // materials and the camp's resources, which take no places.
    const wood = (await holdings('Mira')).resources[WOOD] ?? 0;
    await chestGood(mira, 'herb', HERB, 5);
    await chestGood(mira, 'herb', OTHER_HERB, 3);
    await chestGood(mira, 'potion', POTION, 1);
    await chestGood(mira, 'material', PELT, 2);
    await chestGood(mira, 'resource', WOOD, 10);
    const goods = await takeMany({ all: 'goods' });
    assert.equal(goods.status, 200, JSON.stringify(goods.data));
    assert.deepEqual(goods.data.taken, { count: 3, of: 5 });
    assert.deepEqual(goods.data.chest.goods.map(({ kind, id, count }) => [kind, id, count]), [
      ['potion', POTION, 1],
      ['herb', HERB, 5],
    ]);
    const held = await holdings('Mira');
    assert.deepEqual([held.herbs[OTHER_HERB], held.herbs[HERB], held.materials[PELT], held.resources[WOOD]], [STACK * (bagCapacity - 2), undefined, 2, wood + 10]);

    // Nothing of what is left fits: nothing comes out, and the game says why.
    const full = await takeMany({ items: items.slice(2), goods: [`herb:${HERB}`] });
    assert.deepEqual([full.status, full.data.error.code, full.data.error.message], [409, 'bag_full', 'Za mało miejsca w plecaku. Zrób w nim miejsce, żeby coś wyjąć.']);
    const english = await server.fetch('/api/chest/take-many', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Lang': 'en', 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: 'items' }),
    });
    assert.equal((await english.json()).error.message, 'Not enough room in the bag. Make room in it to take something out.');
    assert.equal((await chest()).items.length, 2);
  });
});
