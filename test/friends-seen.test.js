// The Znajomi by level, with when each was last online (the author,
// 10.11.2026: „Sortowanie listy znajomych po poziomach oraz wskazywanie u
// każdego kiedy ostatnio był online.”): the friends come by their level,
// the highest first, and of one level by name, each with its account's
// last time online (users.seen_at, which its dot follows too); the page
// words it "teraz" while the dot is green or yellow, else minutes, hours,
// "wczoraj" or days ago (src/client/last-seen.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { lastSeen } from '../src/client/last-seen.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('when a friend was last online, in words', () => {
  test('"teraz" while online, else minutes, hours, "wczoraj" and days ago', () => {
    const now = 1_800_000_000_000;
    assert.deepEqual(lastSeen(now - 5 * DAY, now, true), { unit: 'now', count: 0 });
    assert.equal(lastSeen(null, now), null);
    assert.equal(lastSeen(undefined, now), null);
    // Under a minute (as for a character set aside while its player plays
    // another one): a minute.
    assert.deepEqual(lastSeen(now - 20000, now), { unit: 'minutes', count: 1 });
    assert.deepEqual(lastSeen(now - 59 * MINUTE - 59000, now), { unit: 'minutes', count: 59 });
    assert.deepEqual(lastSeen(now - HOUR, now), { unit: 'hours', count: 1 });
    assert.deepEqual(lastSeen(now - 23 * HOUR - 59 * MINUTE, now), { unit: 'hours', count: 23 });
    assert.deepEqual(lastSeen(now - DAY, now), { unit: 'yesterday', count: 1 });
    assert.deepEqual(lastSeen(now - 2 * DAY + MINUTE, now), { unit: 'yesterday', count: 1 });
    assert.deepEqual(lastSeen(now - 2 * DAY, now), { unit: 'days', count: 2 });
    assert.deepEqual(lastSeen(now - 40 * DAY, now), { unit: 'days', count: 40 });
  });
});

describe('the Znajomi by level, with their last time online, through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  async function player(name, level) {
    ({ cookie: cookies[name] } = await signUp(name));
    await call('POST', '/api/character', { cookie: cookies[name], body: { name, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ? WHERE name = ?').bind(level, name).run();
  }
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const seen = (name, at) => run('UPDATE users SET seen_at = ? WHERE id = (SELECT user_id FROM characters WHERE name = ?)', at, name);

  beforeEach(async () => {
    await player('Ala', 12);
    for (const [name, level] of [
      ['Ola', 7],
      ['Ewa', 30],
      ['Iza', 12],
      ['Basia', 12],
    ]) {
      await player(name, level);
      await run(
        "INSERT INTO friends (character_id, friend_id, created_at, accepted_at) SELECT a.id, o.id, 0, 0 FROM characters a, characters o WHERE a.name = 'Ala' AND o.name = ?",
        name,
      );
    }
  });

  test('the highest level first, and of one level by name, each with its last time online', async () => {
    const now = Date.now();
    await seen('Ewa', null);
    await seen('Ola', now - 3 * HOUR);
    await seen('Iza', now - 2 * DAY);
    // Basia plays now: her request marks her seen.
    await call('GET', '/api/chat/latest', { cookie: cookies.Basia });
    const { friends } = (await call('GET', '/api/friends', { cookie: cookies.Ala })).data;
    assert.deepEqual(
      friends.map(({ name, level, status }) => [name, level, status]),
      [
        ['Ewa', 30, 'offline'],
        ['Basia', 12, 'online'],
        ['Iza', 12, 'offline'],
        ['Ola', 7, 'offline'],
      ],
    );
    const by = Object.fromEntries(friends.map((friend) => [friend.name, friend.lastSeen]));
    assert.equal(by.Ewa, null);
    assert.equal(by.Ola, now - 3 * HOUR);
    assert.equal(by.Iza, now - 2 * DAY);
    assert.ok(by.Basia >= now - MINUTE && by.Basia <= Date.now());
    // In words, as the page shows them.
    assert.deepEqual(
      friends.map((friend) => lastSeen(friend.lastSeen, now, friend.status !== 'offline')?.unit ?? null),
      [null, 'now', 'days', 'hours'],
    );
  });
});
