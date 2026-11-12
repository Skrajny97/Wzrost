// The Przechowalnia of the Warsztat and the Szlifiernia (842, the author,
// 12.11.2026: "Niech w warsztacie będzie przechowalnia niech to nie trafia
// od razu do plecaka i można od razu z pozycji przechowalni rozbierać i
// sprzedawać wyprodukowane albo wlozyc do plecaka jesli jest miejsce"): what
// the orders make waits there, out of the bag and with no limit; marked
// items go to the bag while it has room for all of them, to the scrapper,
// or onto the Stół rozbiórki, and an order taken off the table gives its
// items back there.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, sellPrice } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the Przechowalnia', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('skladniczka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Skladniczka', classId: 'warrior', appearance: 'female' } });
    await run(`UPDATE characters SET level = 15, xp = 0, parts = '{"scraps":30}', resources = '{"wood":50,"stone":200,"iron-ore":40}'`);
  });

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const act = (kind, ids) => call('POST', `/api/professions/storage/${kind}`, { cookie, body: { ids } });
  const helmet = (seed) => generateItem({ baseId: 'helmet', level: 15, rarityId: 'common' }, createRng(seed), content);
  // An item put straight into the Przechowalnia, by its id there.
  const store = async (item) => (await run('INSERT INTO storage_items (character_id, data, created_at) SELECT id, ?, 0 FROM characters', JSON.stringify(item))).meta.last_row_id;
  // The bag filled up to `free` places left.
  async function fillBag(free) {
    const view = await character();
    for (let left = view.bagCapacity - view.bagUsed; left > free; left--) {
      await run('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters', JSON.stringify({ base: 'ring', slot: 'ring', level: 1, rarity: 'common', affixes: [] }));
    }
  }
  const stored = (view) => view.professions.storage.items;

  test('an order of the Warsztat brings its items into the Przechowalnia, however full the bag, with their price and parts', async () => {
    await fillBag(0);
    const started = await call('POST', '/api/professions/craft', { cookie, body: { baseId: 'sword', rarity: 'common', count: 2 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual(stored(started.data.character), []);
    await run('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', 120 * 60000, 120 * 60000);
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.items.length, 2);
    assert.equal(report.stored, 'Gotowe przedmioty czekają w Przechowalni, poza plecakiem.');
    assert.equal(after.bagUsed, after.bagCapacity);
    const swords = stored(after);
    assert.deepEqual(swords.map((item) => item.base), ['sword', 'sword']);
    assert.ok(swords.every((item) => item.price > 0 && item.salvage.part === 'Ścinki' && !('favorite' in item)));
  });

  test('"Do plecaka" moves every marked item while the bag has room for all of them, and none otherwise', async () => {
    const ids = [await store(helmet('a')), await store(helmet('b')), await store(helmet('c'))];
    await fillBag(2);
    const full = await act('take', ids);
    assert.deepEqual([full.status, full.data.error.code], [409, 'bag_full']);
    assert.equal(full.data.error.message, 'Na zaznaczone przedmioty (3) brakuje miejsca w plecaku: wolnych miejsc jest 2.');
    assert.equal(stored(await character()).length, 3);
    const taken = await act('take', ids.slice(0, 2));
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(taken.data.taken, { count: 2 });
    assert.deepEqual(stored(taken.data.character).map((item) => item.id), [ids[2]]);
    assert.equal(taken.data.character.bag.filter((item) => item.base === 'helmet').length, 2);
    // Gone from there already, or nothing marked.
    assert.deepEqual([(await act('take', [ids[0]])).status, (await act('take', [ids[0]])).data.error.code], [404, 'item_not_found']);
    assert.equal((await act('take', [])).data.error.code, 'invalid_items');
    assert.equal((await act('take', 'wszystko')).data.error.code, 'invalid_items');
  });

  test('"Sprzedaj" pays the scrapper\'s price for each marked item, once', async () => {
    const items = [helmet('x'), helmet('y')];
    const ids = [await store(items[0]), await store(items[1])];
    const before = await character();
    const sold = await act('sell', ids);
    assert.equal(sold.status, 200, JSON.stringify(sold.data));
    const price = items.reduce((sum, item) => sum + sellPrice(item, content), 0);
    assert.ok(price > 0);
    assert.deepEqual(sold.data.sold, { count: 2, gold: price });
    assert.equal(sold.data.character.gold, before.gold + price);
    assert.deepEqual(stored(sold.data.character), []);
    assert.equal((await act('sell', ids)).status, 404);
    assert.equal((await character()).gold, before.gold + price);
  });

  test('"Rozbierz" puts them on the Stół rozbiórki; taken off its queue, they come back here, whatever the bag', async () => {
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters");
    const ids = [await store(helmet('p')), await store(helmet('q'))];
    const salvaged = await act('salvage', ids);
    assert.equal(salvaged.status, 200, JSON.stringify(salvaged.data));
    assert.equal(salvaged.data.salvaged.count, 2);
    assert.deepEqual(stored(salvaged.data.character), []);
    const { queue } = salvaged.data.character.crafting;
    assert.equal(queue.length, 1);
    assert.deepEqual([queue[0].count, queue[0].stored, queue[0].cancellable], [2, true, true]);
    assert.equal((await act('salvage', ids)).status, 404);

    await fillBag(0);
    const back = await call('POST', '/api/craft/cancel', { cookie, body: { all: true } });
    assert.equal(back.status, 200, JSON.stringify(back.data));
    assert.deepEqual([back.data.cancelled, back.data.items, back.data.stored], [1, 0, 2]);
    assert.equal(stored(back.data.character).length, 2);
    assert.deepEqual(back.data.character.crafting.queue, []);
    // As they were: no mark of where they came from is left on them.
    const { results } = await (await db()).prepare('SELECT data FROM storage_items').all();
    assert.ok(results.every((row) => !('fromStorage' in JSON.parse(row.data))));
  });

  test('without the Warsztat and the Szlifiernia there is no Przechowalnia, and it goes with its character', async () => {
    await run('UPDATE characters SET level = 12');
    assert.equal((await character()).professions.storage, undefined);
    await store(helmet('z'));
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM storage_items').first()).count, 0);
  });
});
