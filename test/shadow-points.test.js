// migrations/0108_shadow_strength_points.sql: the points a Shadow spent on
// Strength, which its daggers never use, go back to its free points (the
// author, 10.11.2026, after the Shadow's levels turned to Vitality in 0.2.37).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const { call, db, signUp } = useServer();

async function migrate(database) {
  const migration = readFileSync('migrations/0108_shadow_strength_points.sql', 'utf8')
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  await database.batch(migration.map((statement) => database.prepare(statement)));
}

describe('a Shadow gets its Strength points back (0108)', () => {
  test('only the Strength points of a Shadow go back to its free points', async () => {
    const { cookie } = await signUp('cien');
    await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'shadow', appearance: 'female' } });
    const { cookie: other } = await signUp('wojownik');
    await call('POST', '/api/character', { cookie: other, body: { name: 'Borys', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    // Level 5: 32 points of the levels; the Shadow put 10 into Strength by
    // hand, the Warrior too, where Strength is its weapon's.
    await database.prepare(`UPDATE characters SET level = 5, points = '{"strength":10,"dexterity":6}'`).run();
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(before.freePoints, 16);

    await migrate(database);

    const fromPoints = (character, stat) => character.stats.find((entry) => entry.id === stat).sources.character;
    const shadow = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(shadow.freePoints, 26);
    assert.equal(fromPoints(shadow, 'strength'), 0);
    assert.equal(fromPoints(shadow, 'dexterity'), 6);
    const warrior = (await call('GET', '/api/character', { cookie: other })).data.character;
    assert.equal(warrior.freePoints, 16);
    assert.equal(fromPoints(warrior, 'strength'), 10);

    // Run again, it changes nothing.
    await migrate(database);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.freePoints, 26);
  });
});
