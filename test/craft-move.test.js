// Orders of the Stół rozbiórki's queue moved to a new place (a player's
// note via the author: „Do zrobienia w stole do rozbiórki jakiś shuffle w
// kolejce”; the author's choice 905 C: hold ≡ by an order and drag it): a
// waiting order goes before another or last, and the "Gotowe o" are counted
// anew from the end of the order at work, which stays first and keeps its
// time; nothing goes before it. Each order keeps what it took and what it
// will make, the character's materials, minerals and parts stay, and the
// queue keeps its length. A move against a queue changed meanwhile, or read
// before another change was saved, is refused and changes nothing.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, moveInQueue, orderMaterials, settleCrafting } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const empty = { materials: {}, parts: {}, queue: [] };
// A table at plain pace that takes every rarity, with no extra parts.
const plain = { level: 5, pace: 1, maxRarity: content.rarities.length - 1, bonusChance: 0 };
const texts = content.buildings.find((building) => building.effect.kind === 'craftSpeed').queue;
const ringBase = content.bases.find((base) => base.slot === 'ring');
const withIds = (state) => ({ ...state, queue: state.queue.map((order, index) => ({ id: `o${index}`, ...order })) });
const times = (queue) => queue.map((order) => [order.id, order.startsAt / MINUTE, order.endsAt / MINUTE]);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// An order without its times, which a move counts anew.
const untimed = ({ startsAt: _start, endsAt: _end, ...order }) => order;

describe('orders moved in the queue, in the engine', () => {
  // 15 minutes of wolf pelts (at work by minute 5), then 10 of fox pelts, 8
  // of the boar's tusk and 5 of the viper's scales.
  const materials = { 'wolf-pelt:common': 3, 'fox-pelt:common': 2, 'boar-tusk:rare': 1, 'viper-scales:common': 1 };
  const ordered = withIds(orderMaterials({ ...empty, materials }, Object.keys(materials), plain, 0, createRng('kolejka'), content).state);
  const at = 5 * MINUTE;
  const queue = settleCrafting(ordered, at);

  test('a waiting order goes before another, or last; the times after the order at work are counted anew, each as long as it was', () => {
    assert.deepEqual(times(queue.queue), [
      ['o0', 0, 15],
      ['o1', 15, 25],
      ['o2', 25, 33],
      ['o3', 33, 38],
    ]);
    const up = moveInQueue(queue, 'o3', 'o1', at).state;
    assert.deepEqual(times(up.queue), [
      ['o0', 0, 15],
      ['o3', 15, 20],
      ['o1', 20, 30],
      ['o2', 30, 38],
    ]);
    const last = moveInQueue(queue, 'o1', null, at).state;
    assert.deepEqual(times(last.queue), [
      ['o0', 0, 15],
      ['o2', 15, 23],
      ['o3', 23, 28],
      ['o1', 28, 38],
    ]);
    // Nothing else changes: each order keeps what it took and will make,
    // and the materials and the parts stay.
    assert.deepEqual(up.queue.map(untimed).sort(byId), queue.queue.map(untimed).sort(byId));
    assert.deepEqual([up.materials, up.parts], [queue.materials, queue.parts]);
    // Where it stands already, it stays.
    assert.deepEqual(moveInQueue(queue, 'o2', 'o3', at).state?.queue, queue.queue);
    assert.equal(moveInQueue(queue, 'o2', 'o2', at).state, queue);
  });

  test('the order at work neither moves nor has another put before it; an order or a place no longer there is refused', () => {
    assert.deepEqual(moveInQueue(queue, 'o0', null, at), { reason: 'running' });
    assert.deepEqual(moveInQueue(queue, 'o2', 'o0', at), { reason: 'first' });
    assert.deepEqual(moveInQueue(queue, 'nie-ma', null, at), { reason: 'gone' });
    assert.deepEqual(moveInQueue(queue, 2, null, at), { reason: 'gone' });
    assert.deepEqual(moveInQueue(queue, 'o2', 'nie-ma', at), { reason: 'changed' });
    // The end is asked for with null: no place given is no place known.
    assert.deepEqual(moveInQueue(queue, 'o2', undefined, at), { reason: 'changed' });
    // The wolf pelts done: the fox pelts are at work, and stay first.
    const later = settleCrafting(ordered, 16 * MINUTE);
    assert.deepEqual(moveInQueue(later, 'o1', null, 16 * MINUTE), { reason: 'running' });
    assert.deepEqual(moveInQueue(later, 'o3', 'o1', 16 * MINUTE), { reason: 'first' });
  });
});

// A change made by "another request" between the handler's read and its
// write, as in review-towers-crafting.test.js: `body` runs as the next
// request settles the character's Punkty Czasu, after it has read the row.
async function betweenReadAndWrite(database, characterId, body) {
  await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();
  await database.prepare('UPDATE characters SET time_points_at = 0 WHERE id = ?').bind(characterId).run();
  await database.prepare(`CREATE TRIGGER meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${characterId} BEGIN ${body} END`).run();
}

describe('orders moved in the queue, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  const NAME = 'Przestawiacz';
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const craft = (keys) => call('POST', '/api/craft/materials', { cookie, body: { keys } });
  const move = (body, as = cookie) => call('POST', '/api/craft/move', { cookie: as, body });
  const stock = (materials) => run('UPDATE characters SET materials = ? WHERE name = ?', JSON.stringify(materials), NAME);
  const ids = (view) => view.crafting.queue.map((order) => order.id);
  const stored = async (column = 'crafting') => JSON.parse((await first(`SELECT ${column} FROM characters WHERE name = ?`, NAME))[column] ?? 'null');
  // Three stacks: three orders, the wolf pelts at work.
  const three = { 'wolf-pelt:common': 3, 'fox-pelt:common': 2, 'boar-tusk:rare': 1 };

  beforeEach(async () => {
    ({ cookie } = await signUp('przestawiacz'));
    await call('POST', '/api/character', { cookie, body: { name: NAME, classId: 'warrior', appearance: 'male' } });
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters");
  });

  const refused = async (body, [status, code, message], as = cookie) => {
    const answer = await move(body, as);
    assert.deepEqual([answer.status, answer.data.error?.code, answer.data.error?.message], [status, code, message], JSON.stringify(answer.data).slice(0, 300));
  };

  test('a waiting order goes before another or last, its "Gotowe o" counted anew; the orders, the materials, the minerals and the parts stay as they were', async () => {
    await stock({ ...three, 'viper-scales:common': 1 });
    await craft([...Object.keys(three), 'viper-scales:common']);
    // A ring taken apart last: an order holding its item, with the ore and
    // the gem it gave at once.
    const { meta } = await run('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters', JSON.stringify({ base: ringBase.id, slot: 'ring', rarity: 'rare', level: 30, upgrade: 0, affixes: [] }));
    const salvaged = await call('POST', `/api/items/${meta.last_row_id}/salvage`, { cookie });
    assert.equal(salvaged.status, 200, JSON.stringify(salvaged.data).slice(0, 300));
    const before = salvaged.data.character;
    const [wolf, fox, boar, viper, ring] = before.crafting.queue;
    assert.ok(ring.minerals.length > 0, 'the ring gave its ore and gem at once');
    // The words of the ≡ and of the line under the queue come with the queue.
    assert.deepEqual([before.crafting.texts.move, before.crafting.texts.moveHint], [texts.move, texts.moveHint]);
    const was = { orders: await stored(), materials: await stored('materials'), minerals: await stored('minerals'), parts: await stored('parts') };

    // The ring right after the order at work, before the fox pelts.
    const up = await move({ id: ring.id, before: fox.id });
    assert.equal(up.status, 200, JSON.stringify(up.data).slice(0, 300));
    const after = up.data.character.crafting;
    assert.deepEqual(ids(up.data.character), [wolf.id, ring.id, fox.id, boar.id, viper.id]);
    // The order at work keeps its time, the others follow it, each as long
    // as it was, and the queue ends when it did.
    const length = (order) => order.endsAt - order.startsAt;
    assert.deepEqual([after.queue[0].startsAt, after.queue[0].endsAt], [wolf.startsAt, wolf.endsAt]);
    after.queue.slice(1).forEach((order, index) => assert.equal(order.startsAt, after.queue[index].endsAt));
    assert.deepEqual(after.queue.map(length), [wolf, ring, fox, boar, viper].map(length));
    assert.equal(after.queue.at(-1).endsAt, ring.endsAt);
    // Nothing else changes.
    assert.deepEqual((await stored()).map(untimed).sort(byId), was.orders.map(untimed).sort(byId));
    assert.deepEqual(
      [await stored('materials'), await stored('minerals'), await stored('parts'), after.queue.length, after.limit],
      [was.materials, was.minerals, was.parts, 5, before.crafting.limit],
    );
    assert.deepEqual(after.materials, before.crafting.materials);

    // The fox pelts last, and so it stays for the next look.
    const last = await move({ id: fox.id, before: null });
    assert.equal(last.status, 200, JSON.stringify(last.data).slice(0, 300));
    assert.deepEqual(ids(last.data.character), [wolf.id, ring.id, boar.id, viper.id, fox.id]);
    assert.deepEqual(ids(await character()), [wolf.id, ring.id, boar.id, viper.id, fox.id]);
  });

  test('the order at work stays first and nothing goes before it; an order or a place not in the queue is refused, also another character\'s', async () => {
    await stock(three);
    const [wolf, fox, boar] = (await craft(Object.keys(three))).data.character.crafting.queue;
    const was = await stored();
    await refused({ id: wolf.id, before: null }, [409, 'order_at_work', texts.errors.atWork]);
    await refused({ id: boar.id, before: wolf.id }, [409, 'before_work', texts.errors.beforeWork]);
    await refused({ id: 'nie-ma', before: null }, [409, 'not_queued', texts.errors.gone]);
    await refused({ id: boar.id, before: 'nie-ma' }, [409, 'queue_changed', texts.errors.changed]);
    const { cookie: other } = await signUp('sasiadka');
    await call('POST', '/api/character', { cookie: other, body: { name: 'Sasiadka', classId: 'mage', appearance: 'female' } });
    await refused({ id: boar.id, before: fox.id }, [409, 'not_queued', texts.errors.gone], other);
    assert.deepEqual(await stored(), was);

    // The wolf pelts done meanwhile: the fox pelts are at work and stay
    // first, and a page that still showed the wolf pelts at work cannot put
    // the boar's tusk before the fox pelts.
    const shift = wolf.endsAt - Date.now() + MINUTE;
    await run('UPDATE characters SET crafting = ? WHERE name = ?', JSON.stringify(was.map((order) => ({ ...order, startsAt: order.startsAt - shift, endsAt: order.endsAt - shift }))), NAME);
    await refused({ id: fox.id, before: null }, [409, 'order_at_work', texts.errors.atWork]);
    await refused({ id: boar.id, before: fox.id }, [409, 'before_work', texts.errors.beforeWork]);
    const view = await character();
    assert.deepEqual([ids(view), view.crafting.parts.find((part) => part.id === 'scraps').count], [[fox.id, boar.id], 3]);
  });

  test('a move read before another change was saved is refused and changes nothing; asked again, it goes through', async () => {
    await stock(three);
    const [wolf, fox, boar] = (await craft(Object.keys(three))).data.character.crafting.queue;
    const was = await stored();
    const database = await db();
    const { id } = await first('SELECT id FROM characters WHERE name = ?', NAME);
    await betweenReadAndWrite(database, id, `UPDATE characters SET version = version + 1 WHERE id = ${id};`);
    await refused({ id: boar.id, before: fox.id }, [409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.']);
    assert.deepEqual(await stored(), was);
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();
    const again = await move({ id: boar.id, before: fox.id });
    assert.equal(again.status, 200, JSON.stringify(again.data).slice(0, 300));
    assert.deepEqual(ids(again.data.character), [wolf.id, boar.id, fox.id]);
  });

  test('a full queue stays full: a move takes no place and gives none', async () => {
    const keys = ['wolf-pelt:common', 'fox-pelt:common', 'badger-claws:common', 'viper-scales:common', 'hornet-sting:common', 'boar-tusk:rare', 'crow-feather:rare', 'owl-feather:rare', 'spider-moults:rare', 'stag-antler:rare'];
    await stock(Object.fromEntries(keys.map((key) => [key, 1])));
    const full = (await craft(keys)).data.character.crafting;
    assert.equal(full.queue.length, full.limit);
    const moved = await move({ id: full.queue.at(-1).id, before: full.queue[1].id });
    assert.equal(moved.status, 200, JSON.stringify(moved.data).slice(0, 300));
    assert.deepEqual(ids(moved.data.character), [full.queue[0], full.queue.at(-1), ...full.queue.slice(1, -1)].map((order) => order.id));
    await stock({ 'marten-fur:rare': 2 });
    const more = await craft(['marten-fur:rare']);
    assert.deepEqual([more.status, more.data.error?.code], [409, 'queue_full']);
  });
});
