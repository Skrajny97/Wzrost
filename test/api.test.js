// End-to-end API tests: the Worker runs in the local Workers runtime with a
// fresh local D1 database per test, built from wrangler.jsonc and migrations/.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { MAX_FAILURES } from '../src/server/throttle.js';
import { useServer } from './helpers/server.js';

const { server, call, db } = useServer();
const DAY_MS = 24 * 60 * 60 * 1000;

const register = (body) => call('POST', '/api/auth/register', { body });
const login = (identifier, password) => call('POST', '/api/auth/login', { body: { identifier, password } });

describe('health', () => {
  test('reports server time and version', async () => {
    const before = Date.now();
    const { status, data, headers } = await call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.version, 'dev');
    assert.ok(data.time >= before - 1000 && data.time <= Date.now() + 1000);
    assert.equal(headers.get('Cache-Control'), 'no-store');
  });
});

describe('registration', () => {
  test('creates the account and signs in', async () => {
    const { status, data, cookie } = await register({
      login: 'Karol_97',
      email: 'Karol@Example.com',
      password: 'tajnehaslo1',
    });
    assert.equal(status, 201);
    assert.deepEqual(Object.keys(data.user).sort(), ['createdAt', 'email', 'login', 'testMode']);
    // In tests every account has test mode (test/helpers/server.js).
    assert.equal(data.user.testMode, true);
    assert.equal(data.user.login, 'Karol_97');
    assert.equal(data.user.email, 'karol@example.com');
    assert.match(cookie, /^__Host-sid=[A-Za-z0-9_-]{43}$/);

    const me = await call('GET', '/api/me', { cookie });
    assert.equal(me.status, 200);
    assert.deepEqual(me.data.user, data.user);
  });

  test('stores only hashes of the password and the session token', async () => {
    const { cookie } = await register({ login: 'karol', password: 'tajnehaslo1' });
    const user = await (await db()).prepare('SELECT password_hash FROM users').first();
    assert.match(user.password_hash, /^pbkdf2-sha256\$/);
    assert.ok(!user.password_hash.includes('tajnehaslo1'));
    const session = await (await db()).prepare('SELECT id FROM sessions').first();
    assert.match(session.id, /^[0-9a-f]{64}$/);
    assert.ok(!cookie.includes(session.id));
  });

  test('works without an e-mail', async () => {
    const first = await register({ login: 'bez_maila', email: '', password: 'tajnehaslo1' });
    const second = await register({ login: 'tez_bez', password: 'tajnehaslo1' });
    assert.equal(first.status, 201);
    assert.equal(first.data.user.email, null);
    assert.equal(second.status, 201);
  });

  test('refuses a login or e-mail that is already used, ignoring case', async () => {
    await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    const sameLogin = await register({ login: 'KAROL', password: 'tajnehaslo1' });
    assert.equal(sameLogin.status, 409);
    assert.equal(sameLogin.data.error.code, 'login_taken');
    const sameEmail = await register({ login: 'inny', email: 'KAROL@example.com', password: 'tajnehaslo1' });
    assert.equal(sameEmail.status, 409);
    assert.equal(sameEmail.data.error.code, 'email_taken');
  });

  test('explains invalid input in Polish', async () => {
    const { status, data, cookie } = await register({ login: 'karol', password: 'krotkie' });
    assert.equal(status, 400);
    assert.equal(data.error.code, 'invalid_password');
    assert.equal(data.error.message, 'Hasło musi mieć od 8 do 128 znaków.');
    assert.equal(cookie, null);
  });
});

describe('login and logout', () => {
  beforeEach(() => register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' }));

  test('accepts the login or the e-mail, in any letter case', async () => {
    for (const identifier of ['Karol', 'karol', 'KAROL@example.com']) {
      const { status, data, cookie } = await login(identifier, 'tajnehaslo1');
      assert.equal(status, 200, identifier);
      assert.equal(data.user.login, 'Karol');
      assert.ok(cookie);
    }
  });

  test('gives the same answer for a wrong password and an unknown account', async () => {
    const wrongPassword = await login('Karol', 'zlehaslo00');
    const unknownAccount = await login('nikt', 'tajnehaslo1');
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.data, unknownAccount.data);
    assert.equal(wrongPassword.data.error.code, 'invalid_credentials');
  });

  test('logout ends the session', async () => {
    const { cookie } = await login('Karol', 'tajnehaslo1');
    const out = await call('POST', '/api/auth/logout', { cookie });
    assert.equal(out.status, 200);
    assert.equal(out.headers.get('Set-Cookie').includes('Max-Age=0'), true);
    assert.equal((await call('GET', '/api/me', { cookie })).status, 401);
  });

  test('blocks guessing after too many failures, also for the right password', async () => {
    for (let i = 0; i < MAX_FAILURES; i++) assert.equal((await login('karol', `zle${i}haslo`)).status, 401);
    const blocked = await login('Karol', 'tajnehaslo1');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.error.code, 'too_many_attempts');
    assert.match(blocked.data.error.message, /Spróbuj ponownie za 15 min\.$/);
    assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  });

  test('failure counters from finished windows are removed', async () => {
    await login('stary', 'zlehaslo00');
    await (await db()).prepare('UPDATE login_failures SET window_started_at = ?').bind(Date.now() - DAY_MS).run();
    await login('Karol', 'zlehaslo00');
    const { results } = await (await db()).prepare('SELECT identifier FROM login_failures').all();
    assert.deepEqual(results, [{ identifier: 'karol' }]);
  });

  test('a successful login resets the failure counter', async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await login('Karol', 'zlehaslo00');
    assert.equal((await login('Karol', 'tajnehaslo1')).status, 200);
    for (let i = 0; i < MAX_FAILURES - 1; i++) await login('Karol', 'zlehaslo00');
    assert.equal((await login('Karol', 'tajnehaslo1')).status, 200);
  });
});

describe('sessions', () => {
  let cookie;
  beforeEach(async () => {
    ({ cookie } = await register({ login: 'Karol', password: 'tajnehaslo1' }));
  });

  test('an expired session is rejected and removed', async () => {
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1).run();
    assert.equal((await call('GET', '/api/me', { cookie })).status, 401);
    const { count } = await (await db()).prepare('SELECT COUNT(*) AS count FROM sessions').first();
    assert.equal(count, 0);
  });

  test('logging in clears expired sessions of all players', async () => {
    await register({ login: 'Druga', password: 'tajnehaslo2' });
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1).run();
    assert.equal((await login('Druga', 'tajnehaslo2')).status, 200);
    const { count } = await (await db()).prepare('SELECT COUNT(*) AS count FROM sessions').first();
    assert.equal(count, 1);
  });

  test('a session close to expiry is extended to 30 days', async () => {
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() + DAY_MS).run();
    const me = await call('GET', '/api/me', { cookie });
    assert.equal(me.status, 200);
    assert.match(me.headers.get('Set-Cookie'), /Max-Age=259\d{4}/);
    const { expires_at } = await (await db()).prepare('SELECT expires_at FROM sessions').first();
    assert.ok(expires_at > Date.now() + 29 * DAY_MS);
  });

  test('a fresh session is not rewritten on every request', async () => {
    const me = await call('GET', '/api/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.headers.get('Set-Cookie'), null);
  });

  test('a made-up token is rejected', async () => {
    const forged = `__Host-sid=${'A'.repeat(43)}`;
    assert.equal((await call('GET', '/api/me', { cookie: forged })).status, 401);
    assert.equal((await call('GET', '/api/me')).status, 401);
  });
});

describe('request checks', () => {
  test('refuses POST requests from another origin', async () => {
    const { status, data } = await call('POST', '/api/auth/login', {
      body: { identifier: 'karol', password: 'tajnehaslo1' },
      origin: 'https://evil.example',
    });
    assert.equal(status, 403);
    assert.equal(data.error.code, 'forbidden_origin');
  });

  test('refuses bodies that are not JSON objects', async () => {
    const form = await server.fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'identifier=karol&password=x',
    });
    assert.equal(form.status, 415);
    for (const body of ['{oops', '[]', 'null']) {
      const response = await server.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(response.status, 400, body);
    }
    const large = await call('POST', '/api/auth/login', { body: { identifier: 'x'.repeat(5000), password: 'y' } });
    assert.equal(large.status, 413);
  });

  test('answers unknown API paths and wrong methods with JSON errors', async () => {
    assert.equal((await call('GET', '/api/nothing')).data.error.code, 'not_found');
    const wrongMethod = await call('GET', '/api/auth/login');
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('Allow'), 'POST');
  });
});

describe('static files', () => {
  test('serves the game page with security headers', async () => {
    const response = await server.fetch('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /text\/html/);
    assert.match(response.headers.get('Content-Security-Policy'), /default-src 'self'/);
    assert.match(await response.text(), /<html lang="pl">/);
  });

  test('does not expose the headers file', async () => {
    assert.equal((await server.fetch('/_headers')).status, 404);
  });
});
