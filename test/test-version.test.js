// The test version (env.test in wrangler.jsonc) takes no new accounts: only
// the author's, made before registration closed.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { hashPassword } from '../src/server/passwords.js';
import { useServer } from './helpers/server.js';

describe('the test version', () => {
  const { call, db } = useServer({ REGISTRATION: 'closed' });

  test('makes no new accounts, and the start screen hides the form', async () => {
    assert.equal((await call('GET', '/api/health')).data.registration, false);
    const refused = await call('POST', '/api/auth/register', { body: { login: 'nowy', password: 'tajnehaslo1' } });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error.code, 'registration_closed');
    assert.equal(await (await db()).prepare('SELECT COUNT(*) AS count FROM users').first('count'), 0);
  });

  test('an account made before still logs in', async () => {
    await (await db())
      .prepare('INSERT INTO users (login, email, password_hash, created_at) VALUES (?, NULL, ?, ?)')
      .bind('Skrajny', await hashPassword('tajnehaslo1'), Date.now())
      .run();
    const { status } = await call('POST', '/api/auth/login', { body: { identifier: 'Skrajny', password: 'tajnehaslo1' } });
    assert.equal(status, 200);
  });
});
