// The goods of the Skrzynia Konta and its padlock (src/server/chest.js,
// account-chest.js in the engine; mock-ups 843, the author, 12.11.2026:
// „Skrzynia Konta powinna pozwalać przekładać też mikstury, rośliny,
// wszystko, nawet zasoby, ale miec kłódkę i być zablokowana do 20 poziomu
// postaci”): potions, herbs, materials, minerals and the camp's resources,
// any number of them, kept by the character that put them in. The pieces
// of another character come as got from others, which the Encyklopedia
// leaves out, as a Wymiana's; a character's own come back as they were.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { chestTakes, tradedLeaving } from '../src/engine/index.js';
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

describe('which pieces leave the chest (the engine)', () => {
  test("a stack's own pieces go first, so what came from others leaves last", () => {
    // 5 held, 2 of them got from others.
    assert.equal(tradedLeaving(2, 5, 3), 0);
    assert.equal(tradedLeaving(2, 5, 4), 1);
    assert.equal(tradedLeaving(2, 5, 5), 2);
    // A record of more than is held counts what is held.
    assert.equal(tradedLeaving(9, 5, 5), 5);
  });

  test("the character's own pieces first, then the others' in their order; the others' all come as from others", () => {
    const rows = [
      { id: 1, characterId: 7, count: 4, traded: 0 },
      { id: 2, characterId: 0, count: 3, traded: 3 },
      { id: 3, characterId: 9, count: 5, traded: 2 },
    ];
    const plan = chestTakes(rows, 9, 10);
    assert.deepEqual(
      plan?.takes.map(({ row, count, traded, gone }) => ({ id: row.id, count, traded, gone })),
      [
        { id: 3, count: 5, traded: 2, gone: true },
        { id: 1, count: 4, traded: 0, gone: true },
        // Its pieces all got from others by the character gone.
        { id: 2, count: 1, traded: 1, gone: false },
      ],
    );
    // Its own 2 got from others, and the 5 of the others.
    assert.equal(plan?.foreign, 7);
    assert.equal(chestTakes(rows, 9, 13), null);
    assert.equal(chestTakes(rows, 9, 0), null);
    assert.equal(chestTakes(rows, 9, 1.5), null);
  });
});

describe('the goods of the Skrzynia Konta', () => {
  const { server, call, db, signUp } = useServer({ ENGLISH: 'on' });
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  // A character of the account, at the chest's level unless `level` says
  // otherwise; its id.
  async function create(name, level = LEVEL) {
    const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await run('UPDATE characters SET level = ? WHERE name = ?', level, name);
    return (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }
  // What a character holds, its record of pieces from others and its
  // Encyklopedia, as its row keeps them.
  const holdings = async (name) => {
    const row = await first('SELECT resources, potions, herbs, materials, minerals, foreign_stacks, discovered, version FROM characters WHERE name = ?', name);
    const columns = ['resources', 'potions', 'herbs', 'materials', 'minerals', 'foreign_stacks', 'discovered'];
    return { ...Object.fromEntries(columns.map((column) => [column, JSON.parse(row[column] ?? '{}')])), version: row.version };
  };
  const chest = async () => (await call('GET', '/api/chest', { cookie })).data.chest;
  const put = (kind, id, count) => call('POST', '/api/chest/goods/put', { cookie, body: { kind, id, count } });
  const take = (kind, id, count) => call('POST', '/api/chest/goods/take', { cookie, body: { kind, id, count } });
  const goodsOf = (answer) => answer.data.chest.goods.map(({ kind, id, count, own }) => ({ kind, id, count, own }));
  // A request in English, the page's own language (X-Lang).
  async function inEnglish(method, path, body) {
    const headers = { Cookie: cookie, 'X-Lang': 'en', ...(body !== undefined && { 'Content-Type': 'application/json' }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('towary'));
  });

  test('every kind goes in and comes back, also while away; the character takes its own back as they were', async () => {
    await create('Mira');
    await run(
      'UPDATE characters SET resources = ?, potions = ?, herbs = ?, materials = ?, minerals = ?, gold = 500 WHERE name = ?',
      JSON.stringify({ [WOOD]: 120 }),
      JSON.stringify({ [POTION]: 5 }),
      JSON.stringify({ [HERB]: 30 }),
      JSON.stringify({ [PELT]: 4 }),
      JSON.stringify({ [MINERAL]: 3 }),
      'Mira',
    );
    // The bag at hand while away, as for the items (DECISIONS.md, "Plecak poza obozem").
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    const before = await holdings('Mira');
    let answer;
    for (const [kind, id, count] of [
      ['mineral', MINERAL, 2],
      ['material', PELT, 3],
      ['herb', HERB, 25],
      ['potion', POTION, 5],
      ['resource', WOOD, 100],
    ]) {
      answer = await put(kind, id, count);
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
    }
    // Kind by kind, as the screen lists the character's own goods.
    assert.deepEqual(goodsOf(answer), [
      { kind: 'resource', id: WOOD, count: 100, own: 100 },
      { kind: 'potion', id: POTION, count: 5, own: 5 },
      { kind: 'herb', id: HERB, count: 25, own: 25 },
      { kind: 'material', id: PELT, count: 3, own: 3 },
      { kind: 'mineral', id: MINERAL, count: 2, own: 2 },
    ]);
    const goods = Object.fromEntries(answer.data.chest.goods.map((good) => [good.kind, good]));
    assert.equal(goods.resource.name, content.resourcesById[WOOD].name);
    assert.equal(goods.herb.name, content.herbsById[HERB].name);
    assert.equal(goods.potion.name, content.potionsById[POTION].name);
    assert.equal(goods.mineral.name, content.mineralsById[MINERAL].name);
    assert.deepEqual([goods.material.name, goods.material.materialId], ['Rzadka skóra wilka', 'wolf-pelt']);
    assert.equal(goods.herb.materialId, undefined);
    // The character's answer as after every action, and its five changes of the version.
    const character = answer.data.character;
    assert.deepEqual([character.resources[WOOD], character.potions.length, character.herbs[0].count, character.minerals[0].count], [20, 0, 5, 1]);
    assert.equal(character.crafting.materials.find((material) => material.key === PELT).count, 1);
    const after = await holdings('Mira');
    assert.equal(after.version, before.version + 5);
    assert.equal(after.potions[POTION], undefined, 'a stack put in whole leaves no empty one');

    // In English, as the page asks for it.
    const english = await inEnglish('GET', '/api/chest');
    const named = Object.fromEntries(english.data.chest.goods.map((good) => [good.kind, good.name]));
    assert.equal(named.herb, 'Comfrey');
    assert.equal(named.resource, 'Wood');
    assert.notEqual(named.material, 'Rzadka skóra wilka');

    for (const [kind, id, count] of [
      ['resource', WOOD, 100],
      ['potion', POTION, 5],
      ['herb', HERB, 25],
      ['material', PELT, 3],
      ['mineral', MINERAL, 2],
    ]) {
      answer = await take(kind, id, count);
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
    }
    assert.deepEqual(answer.data.chest.goods, []);
    const back = await holdings('Mira');
    assert.deepEqual(
      [back.resources[WOOD], back.potions[POTION], back.herbs[HERB], back.materials[PELT], back.minerals[MINERAL]],
      [120, 5, 30, 4, 3],
    );
    // Its own pieces, none from others.
    assert.deepEqual(back.foreign_stacks, {});
    assert.equal((await first('SELECT COUNT(*) AS rows FROM chest_goods')).rows, 0);
    // Gold stays with the character.
    assert.equal((await put('resource', 'gold', 10)).data.error.code, 'invalid_goods');
    assert.equal((await put('gold', 'gold', 10)).data.error.code, 'invalid_kind');
    await call('POST', '/api/hunts/cancel', { cookie });
  });

  test("another character's pieces come as got from others, left out of its Encyklopedia; its own it had got from others too", async () => {
    const mira = await create('Mira');
    await run('UPDATE characters SET herbs = ? WHERE name = ?', JSON.stringify({ [HERB]: 10 }), 'Mira');
    assert.equal((await put('herb', HERB, 10)).status, 200);
    assert.equal((await holdings('Mira')).discovered[`herb:${HERB}`], 1, 'the herbs were its own find');

    await create('Druga');
    const seen = await chest();
    assert.deepEqual(seen.goods.map(({ id, count, own }) => ({ id, count, own })), [{ id: HERB, count: 10, own: 0 }]);
    let answer = await take('herb', HERB, 4);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual(goodsOf(answer), [{ kind: 'herb', id: HERB, count: 6, own: 0 }]);
    assert.equal((await holdings('Druga')).foreign_stacks[`herb:${HERB}`], 4);

    // Put back, they stay got from others: half of the chest's pieces are
    // Druga's own now, and come back to it marked as before.
    answer = await put('herb', HERB, 2);
    assert.deepEqual(goodsOf(answer), [{ kind: 'herb', id: HERB, count: 8, own: 2 }]);
    answer = await take('herb', HERB, 3);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual(goodsOf(answer), [{ kind: 'herb', id: HERB, count: 5, own: 0 }]);
    await call('GET', '/api/character', { cookie });
    const druga = await holdings('Druga');
    assert.deepEqual([druga.herbs[HERB], druga.foreign_stacks[`herb:${HERB}`]], [5, 5]);
    assert.equal(druga.discovered[`herb:${HERB}`], undefined, 'the herbs from Mira are no find of its own');
    // Mira's own pieces still hers: 5 of them.
    assert.equal((await first('SELECT count FROM chest_goods WHERE character_id = ?', mira)).count, 5);

    // A character's own pieces it had got from others (a Wymiana) come
    // back as such, after its record forgot them while they were away.
    await run('UPDATE characters SET herbs = ?, foreign_stacks = ? WHERE name = ?', JSON.stringify({ [OTHER_HERB]: 5 }), JSON.stringify({ [`herb:${OTHER_HERB}`]: 2 }), 'Druga');
    assert.equal((await put('herb', OTHER_HERB, 3)).status, 200);
    assert.equal((await first('SELECT traded FROM chest_goods WHERE good = ?', OTHER_HERB)).traded, 0, 'its own pieces go first');
    assert.equal((await put('herb', OTHER_HERB, 2)).status, 200);
    assert.equal((await first('SELECT traded FROM chest_goods WHERE good = ?', OTHER_HERB)).traded, 2);
    await call('GET', '/api/character', { cookie });
    assert.equal((await holdings('Druga')).foreign_stacks[`herb:${OTHER_HERB}`], undefined, 'none held, none from others');
    assert.equal((await take('herb', OTHER_HERB, 5)).status, 200);
    await call('GET', '/api/character', { cookie });
    const back = await holdings('Druga');
    assert.deepEqual([back.herbs[OTHER_HERB], back.foreign_stacks[`herb:${OTHER_HERB}`]], [5, 2]);
  });

  test('below the chest level the chest is shut, for items and goods alike', async () => {
    await create('Mira', LEVEL - 1);
    await run('UPDATE characters SET herbs = ? WHERE name = ?', JSON.stringify({ [HERB]: 3 }), 'Mira');
    const { id } = await first("SELECT id FROM characters WHERE name = 'Mira'");
    const itemId = (await run("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, '{\"base\":\"amulet\",\"slot\":\"amulet\",\"level\":5,\"rarity\":\"common\",\"affixes\":[]}', 0)", id)).meta.last_row_id;
    assert.deepEqual((await call('GET', '/api/character', { cookie })).data.character.chestLock, { level: LEVEL });
    assert.deepEqual(await chest(), { locked: { level: LEVEL } });
    const message = `Skrzynia Konta otworzy się na ${LEVEL}. poziomie postaci.`;
    for (const [path, body] of [
      ['/api/chest/put', { itemId }],
      ['/api/chest/take', { id: 1 }],
      ['/api/chest/goods/put', { kind: 'herb', id: HERB, count: 1 }],
      ['/api/chest/goods/take', { kind: 'herb', id: HERB, count: 1 }],
    ]) {
      const refused = await call('POST', path, { cookie, body });
      assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [403, 'chest_locked', message], path);
    }
    const english = await inEnglish('POST', '/api/chest/goods/put', { kind: 'herb', id: HERB, count: 1 });
    assert.equal(english.data.error.message, `The Account Chest opens at character level ${LEVEL}.`);
    assert.equal((await holdings('Mira')).herbs[HERB], 3);

    await run('UPDATE characters SET level = ? WHERE id = ?', LEVEL, id);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.chestLock, undefined);
    const open = await chest();
    assert.deepEqual([open.slots, open.items, open.goods], [content.balance.account.chestSlots, [], []]);
    assert.equal((await put('herb', HERB, 1)).status, 200);
    assert.equal((await call('POST', '/api/chest/put', { cookie, body: { itemId } })).status, 200);
  });

  test('herbs and potions need the bag places for their stacks; the rest takes none', async () => {
    await create('Mira');
    await run(
      'UPDATE characters SET potions = ?, materials = ?, resources = ? WHERE name = ?',
      JSON.stringify({ [POTION]: STACK + 5 }),
      JSON.stringify({ [PELT]: 2 }),
      JSON.stringify({ [WOOD]: 10 }),
      'Mira',
    );
    for (const [kind, id, count] of [
      ['potion', POTION, 6],
      ['material', PELT, 2],
      ['resource', WOOD, 10],
    ]) {
      assert.equal((await put(kind, id, count)).status, 200);
    }
    // The bag full: its potions, STACK - 1 of them, one place, with room
    // for one more, and herbs in every other place.
    const { bagCapacity } = (await call('GET', '/api/character', { cookie })).data.character;
    await run('UPDATE characters SET herbs = ? WHERE name = ?', JSON.stringify({ [HERB]: STACK * (bagCapacity - 1) }), 'Mira');
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.bagUsed, bagCapacity);
    let refused = await take('potion', POTION, 2);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'bag_full', 'W plecaku zmieści się jeszcze 1 szt.']);
    assert.equal((await take('potion', POTION, 1)).status, 200);
    refused = await take('potion', POTION, 1);
    assert.deepEqual([refused.data.error.code, refused.data.error.message], ['bag_full', 'Plecak jest pełny. Zrób w nim miejsce, żeby wyjąć ten towar.']);
    assert.equal((await take('herb', HERB, 1)).data.error?.code ?? 'none', 'not_in_chest');
    // Materials and resources take no places.
    assert.equal((await take('material', PELT, 2)).status, 200);
    assert.equal((await take('resource', WOOD, 10)).status, 200);
    const mira = await holdings('Mira');
    assert.deepEqual([mira.potions[POTION], mira.materials[PELT], mira.resources[WOOD]], [STACK, 2, 10]);
  });

  test('a body the chest does not take, and more than there is', async () => {
    await create('Mira');
    await run('UPDATE characters SET herbs = ? WHERE name = ?', JSON.stringify({ [HERB]: 3 }), 'Mira');
    for (const [body, code] of [
      [{ kind: 'part', id: content.parts[0].id, count: 1 }, 'invalid_kind'],
      [{ kind: 'item', id: HERB, count: 1 }, 'invalid_kind'],
      [{ id: HERB, count: 1 }, 'invalid_kind'],
      [{ kind: 'herb', id: 'no-such-herb', count: 1 }, 'invalid_goods'],
      [{ kind: 'herb', id: 'constructor', count: 1 }, 'invalid_goods'],
      [{ kind: 'herb', id: 7, count: 1 }, 'invalid_goods'],
      [{ kind: 'material', id: 'wolf-pelt', count: 1 }, 'invalid_goods'],
      [{ kind: 'material', id: 'wolf-pelt:shiny', count: 1 }, 'invalid_goods'],
      [{ kind: 'resource', id: 'gold', count: 1 }, 'invalid_goods'],
      [{ kind: 'herb', id: HERB, count: 0 }, 'invalid_count'],
      [{ kind: 'herb', id: HERB, count: -2 }, 'invalid_count'],
      [{ kind: 'herb', id: HERB, count: 1.5 }, 'invalid_count'],
      [{ kind: 'herb', id: HERB, count: '2' }, 'invalid_count'],
      [{ kind: 'herb', id: HERB }, 'invalid_count'],
      [{ kind: 'herb', id: HERB, count: 1e21 }, 'invalid_count'],
    ]) {
      for (const path of ['/api/chest/goods/put', '/api/chest/goods/take']) {
        const refused = await call('POST', path, { cookie, body });
        assert.deepEqual([refused.status, refused.data.error.code], [400, code], `${path} ${JSON.stringify(body)}`);
      }
    }
    let refused = await put('herb', HERB, 4);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'not_enough', 'Nie masz tylu.']);
    refused = await put('herb', OTHER_HERB, 1);
    assert.deepEqual([refused.status, refused.data.error.message], [409, 'Nie masz tego towaru.']);
    refused = await take('herb', HERB, 1);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'not_in_chest', 'Tego towaru nie ma już w Skrzyni Konta.']);
    assert.equal((await put('herb', HERB, 3)).status, 200);
    refused = await take('herb', HERB, 4);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'not_in_chest', 'W Skrzyni Konta jest tylko 3 szt.']);
    assert.equal((await inEnglish('POST', '/api/chest/goods/take', { kind: 'herb', id: HERB, count: 4 })).data.error.message, 'There are only 3 in the Account Chest.');
    assert.equal((await holdings('Mira')).herbs[HERB], undefined);
  });

  // Requests that start together, as a script sends them
  // (review-settle-ids.test.js): each sent with its body held back, and the
  // bodies let go at once, so the handlers run side by side.
  async function together(requests) {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const answers = requests.map(({ path, body }) => {
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
        .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: stream, duplex: 'half' })
        .then(async (response) => ({ status: response.status, data: await response.json() }));
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    return Promise.all(answers);
  }

  test('two taps at once move the pieces once: none doubled, none lost', async () => {
    await create('Mira');
    await run('UPDATE characters SET herbs = ?, resources = ? WHERE name = ?', JSON.stringify({ [HERB]: 10 }), JSON.stringify({ [WOOD]: 40 }), 'Mira');
    const total = async () => {
      const mira = await holdings('Mira');
      const there = async (good) => (await first('SELECT COALESCE(SUM(count), 0) AS count FROM chest_goods WHERE good = ?', good)).count;
      return { herbs: (mira.herbs[HERB] ?? 0) + (await there(HERB)), wood: (mira.resources[WOOD] ?? 0) + (await there(WOOD)) };
    };
    for (let round = 0; round < 3; round += 1) {
      // "Włóż" of all the pieces tapped twice: they go in once.
      for (const body of [
        { kind: 'herb', id: HERB, count: 10 },
        { kind: 'resource', id: WOOD, count: 40 },
      ]) {
        const puts = await together([
          { path: '/api/chest/goods/put', body },
          { path: '/api/chest/goods/put', body },
        ]);
        assert.equal(puts.filter((one) => one.status === 200).length, 1, JSON.stringify(puts.map((one) => one.data.error?.code ?? one.status)));
        assert.deepEqual(await total(), { herbs: 10, wood: 40 });
      }
      // "Wyjmij" of each good tapped twice, all at once.
      const inChest = await chest();
      assert.deepEqual(inChest.goods.map(({ id, count }) => [id, count]), [[WOOD, 40], [HERB, 10]]);
      const takes = await together(
        inChest.goods.flatMap((good) => [
          { path: '/api/chest/goods/take', body: { kind: good.kind, id: good.id, count: good.count } },
          { path: '/api/chest/goods/take', body: { kind: good.kind, id: good.id, count: good.count } },
        ]),
      );
      assert.deepEqual(await total(), { herbs: 10, wood: 40 }, JSON.stringify(takes.map((one) => one.data.error?.code ?? one.status)));
      assert.ok(takes.some((one) => one.status === 200));
      for (const [index, good] of inChest.goods.entries()) {
        assert.ok(takes.slice(2 * index, 2 * index + 2).filter((one) => one.status === 200).length <= 1, `${good.id} taken twice`);
      }
      // What a refused tap left in the chest comes out now.
      for (const good of (await chest()).goods) assert.equal((await take(good.kind, good.id, good.count)).status, 200);
      assert.deepEqual(await holdings('Mira').then((mira) => [mira.herbs[HERB], mira.resources[WOOD]]), [10, 40]);
    }
  });

  test("a removed character's goods stay in the chest as no one's, also for a new character given its id", async () => {
    const firstId = await create('Mira');
    await run('UPDATE characters SET herbs = ?, resources = ? WHERE id = ?', JSON.stringify({ [HERB]: 7 }), JSON.stringify({ [WOOD]: 50 }), firstId);
    assert.equal((await put('herb', HERB, 7)).status, 200);
    assert.equal((await put('resource', WOOD, 50)).status, 200);
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    const second = await create('Druga');
    assert.equal(second, firstId, 'the database gives the id again');
    assert.deepEqual(
      (await chest()).goods.map(({ id, count, own }) => ({ id, count, own })),
      [
        { id: WOOD, count: 50, own: 0 },
        { id: HERB, count: 7, own: 0 },
      ],
    );
    // The new character puts in pieces of the same good and goes too: they
    // join the first one's, no one's either.
    await run('UPDATE characters SET herbs = ? WHERE id = ?', JSON.stringify({ [HERB]: 3 }), second);
    assert.equal((await put('herb', HERB, 3)).status, 200);
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    const rows = (await (await db()).prepare('SELECT character_id, kind, good, count, traded FROM chest_goods ORDER BY kind').all()).results;
    assert.deepEqual(rows, [
      { character_id: 0, kind: 'herb', good: HERB, count: 10, traded: 0 },
      { character_id: 0, kind: 'resource', good: WOOD, count: 50, traded: 0 },
    ]);
    await create('Trzecia');
    const answer = await take('herb', HERB, 10);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    await call('GET', '/api/character', { cookie });
    const third = await holdings('Trzecia');
    assert.deepEqual([third.herbs[HERB], third.foreign_stacks[`herb:${HERB}`], third.discovered[`herb:${HERB}`]], [10, 10, undefined]);

    // The goods go with the account, also those of its characters still there.
    assert.equal((await put('herb', HERB, 4)).status, 200);
    assert.equal((await call('DELETE', '/api/me', { cookie, body: { login: 'towary' } })).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS rows FROM chest_goods')).rows, 0);
  });
});
