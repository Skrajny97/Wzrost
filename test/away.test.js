// The bag while the character is away (the author: "Niech system pozwala na
// Wymianę i różne działania na przedmiotach w czasie zbierania ziół itp.
// Niech nie pozwala tylko na zakładanie i zmianę ekwipunku. Niech
// rezerwuje również ilości tego co zabiera w trasę - mikstury itp."): the
// bag stays at hand, what is worn waits for the return, on an exploration
// also the stat points, and the potions taken along leave the bag for the
// road and come back, those not drunk, with the report.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the bag while the character is away', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;
  const alchemy = content.brewing.profession;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowny'));
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Wedrowny', classId: 'warrior', appearance: 'male' } })).status, 201);
    await (await db())
      .prepare(`UPDATE characters SET level = 30, class_level = 30, gold = 1000, hp_at = 0, professions = ?, potions = '{"lesser-healing":5}'`)
      .bind(JSON.stringify({ [alchemy]: { level: 5, xp: 0 } }))
      .run();
  });

  const bagPotions = async () => JSON.parse((await (await db()).prepare('SELECT potions FROM characters').first()).potions)['lesser-healing'] ?? 0;
  const explore = (body = {}) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, ...body } });
  const item = async (slot = null) => {
    const chain = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    const { meta } = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, ?, ?, 0 FROM characters').bind(slot, JSON.stringify(chain)).run();
    return meta.last_row_id;
  };

  test('the potions taken along leave the bag at the start; those not drunk come back with the report', async () => {
    assert.equal((await explore({ potions: { 'lesser-healing': 2 } })).status, 201);
    assert.equal(await bagPotions(), 3);
    // The rest can go meanwhile, but not those on the road.
    assert.equal((await call('POST', '/api/potions/sell', { cookie, body: { potionId: 'lesser-healing', count: 4 } })).data.error.code, 'invalid_count');
    assert.equal((await call('POST', '/api/potions/sell', { cookie, body: { potionId: 'lesser-healing', count: 1 } })).status, 200);
    await call('POST', '/api/test/skip-time', { cookie });
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const left = await bagPotions();
    assert.ok(left >= 2 && left <= 4, String(left));
  });

  test('called back early, every potion taken along comes back', async () => {
    assert.equal((await explore({ potions: { 'lesser-healing': 2 } })).status, 201);
    assert.equal(await bagPotions(), 3);
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    assert.equal(await bagPotions(), 5);
  });

  test('an exploration started before the potions left the bag takes the drunk ones from it, as it did', async () => {
    assert.equal((await explore({ potions: { 'lesser-healing': 2 } })).status, 201);
    const database = await db();
    await database.prepare("UPDATE activities SET options = json_remove(options, '$.reserved')").run();
    await database.prepare(`UPDATE characters SET potions = '{"lesser-healing":5}'`).run();
    await call('POST', '/api/test/skip-time', { cookie });
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    const left = await bagPotions();
    assert.ok(left >= 3 && left <= 5, String(left));
  });

  test('on an exploration the bag is at hand, but not what is worn, the stat points nor healing', async () => {
    const bag = await item();
    assert.equal((await explore()).status, 201);
    assert.equal((await call('POST', `/api/items/${bag}/equip`, { cookie })).data.error.code, 'busy');
    assert.equal((await call('POST', '/api/character/points', { cookie, body: { points: { strength: 1 } } })).data.error.code, 'busy');
    assert.equal((await call('POST', '/api/potions/drink', { cookie, body: { potionId: 'lesser-healing' } })).data.error.code, 'busy');
    assert.equal((await call('POST', `/api/items/${bag}/sell`, { cookie })).status, 200);
  });

  test('at a profession\'s work the stat points and healing are at hand too, but not what is worn', async () => {
    const bag = await item();
    // Hurt just now, so the rest has not healed it yet.
    await (await db()).prepare("UPDATE characters SET hp = 10, hp_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000").run();
    const gathering = await call('POST', '/api/professions/gather', { cookie, body: { herbs: ['comfrey'], minutes: 60 } });
    assert.equal(gathering.status, 201, JSON.stringify(gathering.data));
    assert.equal((await call('POST', `/api/items/${bag}/equip`, { cookie })).data.error.code, 'busy');
    const points = await call('POST', '/api/character/points', { cookie, body: { points: { strength: 1 } } });
    assert.equal(points.status, 200, JSON.stringify(points.data));
    const drunk = await call('POST', '/api/potions/drink', { cookie, body: { potionId: 'lesser-healing' } });
    assert.equal(drunk.status, 200, JSON.stringify(drunk.data));
  });
});
