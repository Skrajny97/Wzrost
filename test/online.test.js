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
