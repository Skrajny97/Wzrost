// The Gildia's members with when each was last online, as the friends in
// the Znajomi (a player's wish the author found wise, 18.11.2026:
// „Przydałoby się widzieć kiedy ktoś się zalogował w gildii tak jak u
// znajomych”): each member carries its account's last time online
// (users.seen_at, which its dot follows too), null for one never seen; the
// page words it "teraz" while the dot is green, else minutes, hours,
// "wczoraj" or days ago (src/client/last-seen.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { lastSeen } from '../src/client/last-seen.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('the Gildia members with their last time online, through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const seen = (name, at) => run('UPDATE users SET seen_at = ? WHERE id = (SELECT user_id FROM characters WHERE name = ?)', at, name);

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, gold = 5000 WHERE name = ?', name);
  }

  beforeEach(async () => {
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    await player('iza', 'Iza');
    await player('ewa', 'Ewa');
    assert.equal((await as('ala', 'POST', '/api/guild/found', { name: 'Strażnicy Puszczy', tag: 'SP' })).status, 200);
    const guildId = (await as('ala', 'GET', '/api/guild')).data.guild.id;
    for (const [login, name] of [
      ['ola', 'Ola'],
      ['iza', 'Iza'],
      ['ewa', 'Ewa'],
    ]) {
      await as('ala', 'POST', '/api/guild/invite', { name });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
  });

  test('each member with its last time online, "teraz" while it plays', async () => {
    const now = Date.now();
    await seen('Ola', now - 3 * HOUR);
    await seen('Iza', now - 2 * DAY);
    await seen('Ewa', null);
    // Ala plays now: her page's ask for the players online marks her seen.
    await as('ala', 'GET', '/api/online');
    const { members } = (await as('ala', 'GET', '/api/guild')).data.guild;
    const by = Object.fromEntries(members.map((member) => [member.name, member]));
    assert.ok(by.Ala.lastSeen >= now - MINUTE && by.Ala.lastSeen <= Date.now());
    assert.equal(by.Ola.lastSeen, now - 3 * HOUR);
    assert.equal(by.Iza.lastSeen, now - 2 * DAY);
    assert.equal(by.Ewa.lastSeen, null);
    // In words, as the page shows them, the leader first.
    assert.deepEqual(
      members.map((member) => [member.name, lastSeen(member.lastSeen, now, member.online)?.unit ?? null]),
      [
        ['Ala', 'now'],
        ['Ola', 'hours'],
        ['Iza', 'days'],
        ['Ewa', null],
      ],
    );
  });
});
