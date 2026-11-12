// Szybkie Polowanie: from level 5, five of them, back 12 hours after the
// last (0.2.20), an exploration of 15 minutes in the inner region chosen
// that comes back with its report at once.

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
    const flash = content.balance.flashHunt;
    assert.deepEqual([rules.count, rules.refillHours, flash.count, flash.refillHours], [5, 12, 5, 6]);
    assert.deepEqual((await character()).quickHunts, {
      left: 5,
      backAt: null,
      count: 5,
      minutes: rules.minutes,
      refillHours: 12,
      flash: { left: flash.count, backAt: null, count: flash.count, minutes: flash.minutes, refillHours: 6 },
    });
    const done = await quick();
    assert.equal(done.status, 200);
    const { report, character: after } = done.data;
    assert.equal(report.quick, true);
    assert.equal(report.minutes, rules.minutes);
    assert.equal(report.areaName, 'Skraj Wiatrołomów');
    assert.equal(after.activity, null);
    assert.equal(after.quickHunts.left, 4);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].id, report.id);
  });

  test('five of them, back 12 hours after the last (0.2.20); the count by the day before starts anew', async () => {
    await set('level = 5');
    // A count by the day, as before 0.2.20, does not take any away.
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: content.quests.timeZone }).format(new Date());
    await set(`quick_hunts = '{"day":"${day}","used":3}'`);
    assert.equal((await character()).quickHunts.left, rules.count);
    for (let index = 0; index < rules.count; index++) {
      await set('hp = 999');
      assert.equal((await quick()).status, 200);
    }
    const none = await quick();
    assert.equal(none.data.error.code, 'no_quick_hunts');
    assert.equal(none.data.error.message, 'Szybkie Polowania się skończyły. Wrócą 12 godzin po ostatnim.');
    const view = (await character()).quickHunts;
    assert.equal(view.left, 0);
    assert.ok(Math.abs(view.backAt - (Date.now() + rules.refillHours * 3600000)) < 60000, `${view.backAt}`);
    const database = await db();
    const stored = JSON.parse(await database.prepare('SELECT quick_hunts FROM characters').first('quick_hunts'));
    assert.equal(stored.day, undefined);
    stored.quick.at -= rules.refillHours * 3600000;
    await database.prepare('UPDATE characters SET quick_hunts = ?').bind(JSON.stringify(stored)).run();
    assert.equal((await character()).quickHunts.left, rules.count);
  });

  test('Błyskawiczne polowanie: five of 10 minutes beside the Szybkie Polowania, back 6 hours after the last (0.2.20)', async () => {
    const flash = content.balance.flashHunt;
    const lightning = () => quick({ areaId: 'windfalls-edge', kind: 'flash' });
    await set('level = 5');
    for (let index = 0; index < flash.count; index++) {
      await set('hp = 999');
      const done = await lightning();
      assert.equal(done.status, 200);
      assert.equal(done.data.report.flash, true);
      assert.equal(done.data.report.quick, true);
      assert.equal(done.data.report.minutes, flash.minutes);
    }
    assert.equal((await lightning()).data.error.code, 'no_flash_hunts');
    const view = (await character()).quickHunts;
    assert.equal(view.flash.left, 0);
    assert.ok(Math.abs(view.flash.backAt - (Date.now() + flash.refillHours * 3600000)) < 60000, `${view.flash.backAt}`);
    // The Szybkie Polowania are all there still, and leave these as they are.
    assert.equal(view.left, rules.count);
    await set('hp = 999');
    assert.equal((await quick()).status, 200);
    assert.deepEqual([(await character()).quickHunts.left, (await character()).quickHunts.flash.left], [rules.count - 1, 0]);
    // 6 hours after the last one, all five come back.
    const database = await db();
    const stored = JSON.parse(await database.prepare('SELECT quick_hunts FROM characters').first('quick_hunts'));
    stored.flash.at -= flash.refillHours * 3600000;
    await database.prepare('UPDATE characters SET quick_hunts = ?').bind(JSON.stringify(stored)).run();
    assert.deepEqual((await character()).quickHunts.flash, { left: flash.count, backAt: null, count: flash.count, minutes: flash.minutes, refillHours: flash.refillHours });
    await set('hp = 999');
    assert.equal((await lightning()).status, 200);
    assert.equal((await character()).quickHunts.flash.left, flash.count - 1);
  });

  // The code review of 12.11.2026: the count of a Szybkie Polowanie was a
  // statement after its start, so a start whose count failed went out
  // uncounted. Now both are one batch: a start that cannot be counted does
  // not start.
  test('a start and its count are one: one that cannot be counted does not go out', async () => {
    await set('level = 5, hp = 999');
    const database = await db();
    await database.prepare("CREATE TRIGGER no_count BEFORE UPDATE OF quick_hunts ON characters BEGIN SELECT RAISE(ABORT, 'no count'); END").run();
    let refused;
    try {
      refused = await quick();
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS no_count').run();
    }
    assert.notEqual(refused.status, 200);
    assert.equal(await database.prepare('SELECT 1 AS found FROM activities').first(), null);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM reports').first()).count, 0);
    assert.equal((await character()).quickHunts.left, rules.count);
    assert.equal((await quick()).status, 200);
    assert.equal((await character()).quickHunts.left, rules.count - 1);
  });

  test('needs the character at home, and takes potions only up to its length', async () => {
    // From level 10, with the Profesje, the recipe is known.
    await set(`level = 10, potions = '{"lesser-healing":9}'`);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal((await quick()).data.error.code, 'busy');
    await call('POST', '/api/hunts/cancel', { cookie });
    const done = await quick({ areaId: 'windfalls-edge', potions: { 'lesser-healing': 9 }, healBelow: 0.4 });
    assert.equal(done.status, 200);
    assert.equal((await character()).quickHunts.left, rules.count - 1);
  });
});
