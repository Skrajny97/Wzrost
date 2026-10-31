// The Skrzynia Konta in the camp (src/server/chest.js): a few places for the
// items an account's characters share. An item from another character is
// worn from its own level and the Encyklopedia leaves it out; the one that
// put it in takes it back as it was.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { ownDiscoveries } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('what counts for the Encyklopedia', () => {
  test('no item from a trade or the chest, and of a stack only what is over the pieces from a trade', () => {
    const herb = content.herbs[0].id;
    const amulet = { base: 'amulet', rarity: 'common' };
    const { found, foreign } = ownDiscoveries(
      { items: [{ ...amulet, traded: 1 }, { base: 'ring', rarity: 'rare', chest: 1 }], herbs: { [herb]: 3 }, potions: {}, materials: { 'wolf-pelt:common': 2 } },
      { [`herb:${herb}`]: 5, 'material:wolf-pelt:common': 1 },
      content,
    );
    assert.deepEqual(found, { 'material:wolf-pelt:common': 1 });
    // Fewer herbs held than came from the trade: the rest was used up.
    assert.deepEqual(foreign, { [`herb:${herb}`]: 3, 'material:wolf-pelt:common': 1 });
    // Its own amulet and herbs over those from the trade count.
    const own = ownDiscoveries({ items: [amulet], herbs: { [herb]: 6 } }, { [`herb:${herb}`]: 5 }, content);
    assert.deepEqual(own.found, { 'item:amulet': 1, [`herb:${herb}`]: 1 });
  });
});

describe('Skrzynia Konta', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const create = (name) => call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
  const amulet = (level) => ({ base: 'amulet', slot: 'amulet', level, rarity: 'common', affixes: [], implicit: { stat: 'will', value: 2 } });
  async function inBag(name, item) {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters WHERE name = ?').bind(name).first();
    return (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item)).run()).meta.last_row_id;
  }
  const chest = async () => (await call('GET', '/api/chest', { cookie })).data.chest;
  const put = (itemId) => call('POST', '/api/chest/put', { cookie, body: { itemId } });
  const take = (id) => call('POST', '/api/chest/take', { cookie, body: { id } });
  const discovered = async (name) => JSON.parse((await (await db()).prepare('SELECT discovered FROM characters WHERE name = ?').bind(name).first()).discovered);

  beforeEach(async () => {
    ({ cookie } = await signUp('skrzynia'));
  });

  test('an item another character put in comes marked: worn from its own level and left out of the Encyklopedia', async () => {
    await create('Mira');
    const given = await inBag('Mira', amulet(30));
    await call('GET', '/api/character', { cookie });
    const putIn = await put(given);
    assert.equal(putIn.status, 200, JSON.stringify(putIn.data));
    assert.equal(putIn.data.chest.slots, 5);
    assert.deepEqual(
      putIn.data.chest.items.map(({ name, own, from, wornFrom }) => ({ name, own, from, wornFrom })),
      [{ name: 'Amulet', own: true, from: 'Mira', wornFrom: null }],
    );
    assert.equal(putIn.data.character.bag.length, 0);

    await create('Druga');
    const seen = await chest();
    assert.deepEqual([seen.items[0].own, seen.items[0].from, seen.items[0].wornFrom], [false, 'Mira', 30]);
    const taken = await take(seen.items[0].id);
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.chest.items.length, 0);
    const item = taken.data.character.bag[0];
    assert.equal(item.chest, true);
    const worn = await call('POST', `/api/items/${item.id}/equip`, { cookie });
    assert.equal(worn.data.error.code, 'trade_level');
    assert.equal(worn.data.error.message, 'Przedmiot ze Skrzyni Konta założysz od poziomu postaci 30.');
    assert.equal((await discovered('Druga'))['item:amulet'], undefined);
    assert.equal((await discovered('Mira'))['item:amulet'], 1);
  });

  test('the character that put an item in takes it back as it was', async () => {
    await create('Mira');
    const given = await inBag('Mira', amulet(30));
    const { items } = (await put(given)).data.chest;
    const item = (await take(items[0].id)).data.character.bag[0];
    assert.equal(item.chest, undefined);
    assert.equal((await call('POST', `/api/items/${item.id}/equip`, { cookie })).status, 200);
  });

  test('five places, also during an exploration; the chest stays when its character goes and leaves with the account', async () => {
    await create('Mira');
    const ids = [];
    for (let index = 0; index < 6; index += 1) ids.push(await inBag('Mira', amulet(5 + index)));
    for (const id of ids.slice(0, 5)) assert.equal((await put(id)).status, 200);
    const full = await put(ids[5]);
    assert.equal(full.data.error.code, 'chest_full');
    assert.equal(full.data.error.message, 'Skrzynia Konta mieści 5 przedmiotów. Wyjmij coś, żeby włożyć nowy.');
    assert.equal((await chest()).items.length, 5);
    // Not an item of another character, nor a worn one.
    assert.equal((await put(999999)).data.error.code, 'item_not_found');

    // The bag stays at hand while the character is away (the author: "Niech
    // system pozwala na Wymianę i różne działania na przedmiotach w czasie
    // zbierania ziół itp.").
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal((await take((await chest()).items[0].id)).status, 200);
    assert.equal((await put(ids[5])).status, 200);
    await call('POST', '/api/hunts/cancel', { cookie });

    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    const count = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM chest_items').first()).count;
    assert.equal(await count(), 5);
    assert.equal((await call('DELETE', '/api/me', { cookie, body: { login: 'skrzynia' } })).status, 200);
    assert.equal(await count(), 0);
  });
});
