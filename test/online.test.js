// The players online (src/server/online.js): the accounts heard from within
// community.trade.onlineSeconds; asking counts the asking account in.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('players online', () => {
  const { call, db, signUp } = useServer();

  test('counts the accounts seen lately, the asking one too, and not those gone quiet', async () => {
    assert.equal((await call('GET', '/api/online')).status, 401);
    const first = (await signUp('pierwsza')).cookie;
    const second = (await signUp('druga')).cookie;
    assert.deepEqual((await call('GET', '/api/online', { cookie: first })).data, { count: 1 });
    assert.deepEqual((await call('GET', '/api/online', { cookie: second })).data, { count: 2 });
    // Quiet for longer than onlineSeconds: no longer online.
    const gone = Date.now() - (content.community.trade.onlineSeconds + 5) * 1000;
    await (await db()).prepare("UPDATE users SET seen_at = ? WHERE login = 'pierwsza'").bind(gone).run();
    assert.deepEqual((await call('GET', '/api/online', { cookie: second })).data, { count: 1 });
  });
});

// Their list (the author, 13.11.2026: "Dodaj opcje otwierania listy graczy
// online pod zieloną kropka ilu graczy online jest"): the character each
// account online plays now, the highest level first, as the chat names it.
describe('the list of the players online', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();

  async function player(login, name, level) {
    ({ cookie: cookies[name] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[name], body: { name, classId: 'mage', appearance: 'female' } });
    await run('UPDATE characters SET level = ? WHERE name = ?', level, name);
  }

  test('lists the characters played now, highest level first, with the count, and not those gone quiet', async () => {
    assert.equal((await call('GET', '/api/online/players')).status, 401);
    await player('pierwsza', 'Radomira', 12);
    await player('druga', 'Bogna', 40);
    await player('trzecia', 'Wiesna', 7);
    await run("UPDATE users SET account_name = 'Wędrowiec' WHERE login = 'druga'");
    // The third one went quiet: counted out of the list and the number.
    for (const name of ['Radomira', 'Bogna']) await call('GET', '/api/online', { cookie: cookies[name] });
    const gone = Date.now() - (content.community.trade.onlineSeconds + 5) * 1000;
    await run("UPDATE users SET seen_at = ? WHERE login = 'trzecia'", gone);
    const answer = await call('GET', '/api/online/players', { cookie: cookies.Radomira });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.count, 2);
    assert.deepEqual(
      answer.data.players.map(({ name, account, level, own }) => ({ name, account, level, own })),
      [
        { name: 'Bogna', account: 'Wędrowiec', level: 40, own: false },
        { name: 'Radomira', account: null, level: 12, own: true },
      ],
    );
    assert.equal(answer.data.players[0].classId, 'mage');
    assert.equal(answer.data.players[0].guildTag, null);
    // A character set aside is not the one played: no row for it.
    await run("UPDATE characters SET role = 'aside' WHERE name = 'Bogna'");
    const after = await call('GET', '/api/online/players', { cookie: cookies.Radomira });
    assert.equal(after.data.count, 2);
    assert.deepEqual(after.data.players.map((one) => one.name), ['Radomira']);
  });
});
