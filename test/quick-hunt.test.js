// Szybkie Polowanie: from level 5, three a day in Poland, an exploration of
// 15 minutes in the inner region chosen that comes back with its report at
// once.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Szybkie Polowanie', () => {
  const { call, db, signUp } = useServer();
  let cookie;
  const rules = content.balance.quickHunt;

  beforeEach(async () => {
    ({ cookie } = await signUp('lowczyni'));
    await call('POST', '/api/character', { cookie, body: { name: 'Lowczyni', classId: 'warrior', appearance: 'female' } });
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const quick = (body = { areaId: 'windfalls-edge' }) => call('POST', '/api/hunts/quick', { cookie, body });

  test('opens at level 5 and brings a 15-minute exploration back at once', async () => {
    await set('level = 4');
    assert.equal((await character()).quickHunts, null);
    assert.equal((await quick()).data.error.code, 'locked');
    await set('level = 5, xp = 0');
    assert.deepEqual((await character()).quickHunts, { left: 3, perDay: 3, minutes: rules.minutes });
    const done = await quick();
    assert.equal(done.status, 200);
    const { report, character: after } = done.data;
    assert.equal(report.quick, true);
    assert.equal(report.minutes, rules.minutes);
    assert.equal(report.areaName, 'Skraj Wiatrołomów');
    assert.equal(after.activity, null);
    assert.equal(after.quickHunts.left, 2);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].id, report.id);
  });

  test('three a day: the fourth waits for the next day in Poland', async () => {
    await set('level = 5');
    for (let index = 0; index < rules.perDay; index++) {
      await set('hp = 999');
      assert.equal((await quick()).status, 200);
    }
    const none = await quick();
    assert.equal(none.data.error.code, 'no_quick_hunts');
    assert.equal((await character()).quickHunts.left, 0);
    await set(`quick_hunts = '{"day":"2000-01-01","used":3}'`);
    assert.equal((await character()).quickHunts.left, 3);
  });

  test('needs the character at home, and takes potions only up to its length', async () => {
    // From level 10, with the Profesje, the recipe is known.
    await set(`level = 10, potions = '{"lesser-healing":9}'`);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal((await quick()).data.error.code, 'busy');
    await call('POST', '/api/hunts/cancel', { cookie });
    const done = await quick({ areaId: 'windfalls-edge', potions: { 'lesser-healing': 9 }, healBelow: 0.4 });
    assert.equal(done.status, 200);
    assert.equal((await character()).quickHunts.left, 2);
  });
});
