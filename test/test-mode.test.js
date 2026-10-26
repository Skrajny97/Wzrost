import assert from 'node:assert/strict';
import { test } from 'node:test';

import { testModeFor } from '../src/server/test-mode.js';
import { useServer } from './helpers/server.js';

// As in the live game: test mode only for the listed account.
const { call, signUp } = useServer({ TEST_LOGINS: 'Skrajny' });

async function player(login, name) {
  const registered = await signUp(login);
  await call('POST', '/api/character', { cookie: registered.cookie, body: { name, classId: 'warrior', appearance: 'male' } });
  return registered;
}

test('test mode belongs to the listed accounts, in any case', () => {
  const env = { TEST_MODE: 'on', TEST_LOGINS: 'Skrajny, Inna' };
  assert.deepEqual(['Skrajny', 'skrajny', 'INNA', 'karol'].map((login) => testModeFor(env, login)), [true, true, true, false]);
  // Empty or missing: every account; test mode off: nobody.
  assert.equal(testModeFor({ TEST_MODE: 'on', TEST_LOGINS: '' }, 'karol'), true);
  assert.equal(testModeFor({ TEST_MODE: 'on' }, 'karol'), true);
  assert.equal(testModeFor({ TEST_MODE: 'off', TEST_LOGINS: '' }, 'skrajny'), false);
});

test('with TEST_LOGINS only that account sees and uses "Pomiń czas"', async () => {
  const other = await player('karol', 'Mira');
  assert.equal(other.data.user.testMode, false);
  assert.equal((await call('GET', '/api/me', { cookie: other.cookie })).data.user.testMode, false);
  assert.equal((await call('POST', '/api/test/skip-time', { cookie: other.cookie })).status, 404);
  assert.equal((await call('POST', '/api/test/skip-build', { cookie: other.cookie })).status, 404);

  const author = await player('skrajny', 'Wera');
  assert.equal(author.data.user.testMode, true);
  const login = await call('POST', '/api/auth/login', { body: { identifier: 'SKRAJNY', password: 'tajnehaslo1' } });
  assert.equal(login.data.user.testMode, true);
  assert.equal((await call('GET', '/api/me', { cookie: author.cookie })).data.user.testMode, true);
  assert.equal((await call('POST', '/api/test/skip-time', { cookie: author.cookie })).status, 200);
});
