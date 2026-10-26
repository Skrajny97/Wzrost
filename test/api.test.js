// End-to-end API tests: the Worker runs in the local Workers runtime with a
// fresh local D1 database per test, built from wrangler.jsonc and migrations/.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import { MAX_FAILURES } from '../src/server/throttle.js';
import { useServer } from './helpers/server.js';

const { server, call, db, signUp } = useServer();
const DAY_MS = 24 * 60 * 60 * 1000;

// Registration needs an e-mail: a test that names none gets one of its own.
const register = (body) =>
  call('POST', '/api/auth/register', { body: 'email' in body ? body : { ...body, email: `${String(body.login).toLowerCase()}@example.com` } });
const login = (identifier, password) => call('POST', '/api/auth/login', { body: { identifier, password } });

describe('health', () => {
  test('reports server time and version', async () => {
    const before = Date.now();
    const { status, data, headers } = await call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.version, 'dev');
    // Without the Google client secrets the Google buttons stay hidden.
    assert.equal(data.google, false);
    // The game takes new accounts (the test version does not: test-version.test.js).
    assert.equal(data.registration, true);
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
    assert.deepEqual(Object.keys(data.user).sort(), ['author', 'createdAt', 'email', 'emailConfirmed', 'emailRequired', 'google', 'login', 'testMode']);
    assert.equal(data.user.author, false);
    assert.equal(data.user.google, false);
    // It waits for the link sent to its e-mail (the e-mail confirmation tests below).
    assert.equal(data.emailSent, true);
    assert.equal(data.user.emailConfirmed, false);
    assert.equal(data.user.emailRequired, true);
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

  test('needs an e-mail', async () => {
    for (const body of [{ login: 'bez_maila', email: '', password: 'tajnehaslo1' }, { login: 'tez_bez', email: undefined, password: 'tajnehaslo1' }]) {
      const { status, data, cookie } = await call('POST', '/api/auth/register', { body });
      assert.equal(status, 400);
      assert.equal(data.error.code, 'email_required');
      assert.equal(cookie, null);
    }
    const { count } = await (await db()).prepare('SELECT COUNT(*) AS count FROM users').first();
    assert.equal(count, 0);
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

describe('e-mail confirmation', () => {
  // A link of our own: the mail's link is random, and D1 keeps only its hash.
  async function linkFor(login, { email, createdAt = Date.now() } = {}) {
    const token = randomBytes(32).toString('base64url');
    const user = await (await db()).prepare('SELECT id, email FROM users WHERE login = ?').bind(login).first();
    await (await db())
      .prepare('INSERT INTO email_links (id, user_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(createHash('sha256').update(token).digest('hex'), user.id, email ?? user.email, createdAt, createdAt + DAY_MS)
      .run();
    return token;
  }
  const open = async (token) => (await server.fetch(`/api/auth/confirm?token=${token}`, { redirect: 'manual' })).headers.get('Location');
  const pointsWaiting = async (login) =>
    (await db()).prepare('SELECT system_points_waiting AS points FROM users WHERE login = ?').bind(login).first('points');
  const newCharacter = (cookie) => call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'warrior', appearance: 'female' } });

  test('a new account waits for the link: the account works, the game does not', async () => {
    const { data, cookie } = await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    assert.equal(data.emailSent, true);
    const links = (await (await db()).prepare('SELECT email, created_at, expires_at FROM email_links').all()).results;
    assert.equal(links.length, 1);
    assert.equal(links[0].email, 'karol@example.com');
    assert.equal(links[0].expires_at - links[0].created_at, DAY_MS);
    for (const answer of [await newCharacter(cookie), await call('GET', '/api/character', { cookie })]) {
      assert.equal(answer.status, 403);
      assert.equal(answer.data.error.code, 'email_unconfirmed');
    }
    assert.equal((await call('GET', '/api/me', { cookie })).status, 200);
    assert.equal((await login('karol@example.com', 'tajnehaslo1')).data.user.emailConfirmed, false);
  });

  test('the link confirms the e-mail once, and its Punkty Systemu come with the first character', async () => {
    const { cookie } = await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    const token = await linkFor('Karol');
    assert.equal(await open(token), '/?email=confirmed');
    assert.equal((await call('GET', '/api/me', { cookie })).data.user.emailConfirmed, true);
    assert.equal(await pointsWaiting('Karol'), 10);
    // Every link of the account goes, so the same one confirms nothing again.
    assert.equal(await open(token), '/?email=expired');
    const { count } = await (await db()).prepare('SELECT COUNT(*) AS count FROM email_links').first();
    assert.equal(count, 0);

    const created = await newCharacter(cookie);
    assert.equal(created.status, 201);
    assert.equal(created.data.character.systemPoints, 10);
    assert.equal(await pointsWaiting('Karol'), 0);
    // "Zacznij od nowa" does not bring them back: they came once.
    await call('DELETE', '/api/character', { cookie });
    assert.equal((await newCharacter(cookie)).data.character.systemPoints, 0);
  });

  test('an older account plays on, and confirming gives its character the points once', async () => {
    const { cookie } = await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    // Made before e-mails were confirmed (migration 0028).
    await (await db()).prepare("UPDATE users SET email_required = 0 WHERE login = 'Karol'").run();
    assert.equal((await newCharacter(cookie)).status, 201);
    assert.equal(await open(await linkFor('Karol')), '/?email=confirmed');
    const character = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(character.systemPoints, 10);
    assert.equal(await open(await linkFor('Karol')), '/?email=already');
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.systemPoints, 10);
  });

  test('a link that expired, was made up or names an address changed since confirms nothing', async () => {
    await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    assert.equal(await open(await linkFor('Karol', { createdAt: Date.now() - 2 * DAY_MS })), '/?email=expired');
    assert.equal(await open('x'.repeat(43)), '/?email=expired');
    assert.equal(await open('nie-token'), '/?email=expired');
    assert.equal(await open(await linkFor('Karol', { email: 'dawny@example.com' })), '/?email=expired');
    const user = await (await db()).prepare("SELECT email_confirmed_at, system_points_waiting FROM users WHERE login = 'Karol'").first();
    assert.deepEqual(user, { email_confirmed_at: null, system_points_waiting: 0 });
  });

  test('another link: to a new address, not twice a minute, at most five a day', async () => {
    const { cookie } = await register({ login: 'Karol', email: 'karol@example.com', password: 'tajnehaslo1' });
    await register({ login: 'Ola', email: 'ola@example.com', password: 'tajnehaslo1' });
    const again = (body = {}) => call('POST', '/api/auth/email', { cookie, body });

    const soon = await again();
    assert.equal(soon.status, 429);
    assert.equal(soon.data.error.code, 'email_wait');
    assert.ok(Number(soon.headers.get('Retry-After')) > 0);

    await (await db()).prepare('UPDATE email_links SET created_at = created_at - 120000').run();
    const moved = await again({ email: 'Nowy@Example.com' });
    assert.equal(moved.status, 200);
    assert.deepEqual(moved.data, { sent: true, email: 'nowy@example.com' });
    assert.equal((await call('GET', '/api/me', { cookie })).data.user.email, 'nowy@example.com');

    const taken = await again({ email: 'ola@example.com' });
    assert.equal(taken.status, 409);
    assert.equal(taken.data.error.code, 'email_taken');
    assert.equal((await again({ email: 'to nie mail' })).data.error.code, 'invalid_email');

    for (let i = 0; i < 4; i++) await linkFor('Karol', { createdAt: Date.now() - (i + 2) * 120000 });
    await (await db()).prepare('UPDATE email_links SET created_at = created_at - 120000').run();
    const limit = await again();
    assert.equal(limit.status, 429);
    assert.equal(limit.data.error.code, 'email_limit');

    await (await db()).prepare("UPDATE users SET email_confirmed_at = 1 WHERE login = 'Karol'").run();
    assert.equal((await again()).data.error.code, 'email_confirmed');
  });

  test('migration 0028 removes password accounts with neither an e-mail nor a character', async () => {
    const database = await db();
    const add = (login, email, google = null) =>
      database.prepare("INSERT INTO users (login, email, password_hash, created_at, google_sub) VALUES (?, ?, 'x', 0, ?)").bind(login, email, google).run();
    await add('pusty', null);
    await add('z_postacia', null);
    await add('z_mailem', 'mail@example.com');
    await add('google', null, 'sub-1');
    await database
      .prepare("INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, position, hp, hp_at, created_at) SELECT id, 'player', 'Ala', 'ala', 'warrior', 'female', 'front', 10, 0, 0 FROM users WHERE login = 'z_postacia'")
      .run();
    await database.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) SELECT 'sesja', id, 0, 1 FROM users WHERE login = 'pusty'").run();
    const migration = readFileSync(new URL('../migrations/0028_email_confirmation.sql', import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((part) => part.replace(/^\s*--.*$/gm, '').trim()).filter((part) => part.startsWith('DELETE'))) {
      await database.prepare(statement).run();
    }
    const logins = (await database.prepare('SELECT login FROM users ORDER BY login').all()).results.map((row) => row.login);
    assert.deepEqual(logins, ['google', 'z_mailem', 'z_postacia']);
    assert.equal(await database.prepare('SELECT COUNT(*) AS count FROM sessions').first('count'), 0);
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

describe('deleting the account', () => {
  test('takes the account with its character, sessions and everything else, after the login is typed', async () => {
    const { cookie } = await signUp('Znikam');
    await call('POST', '/api/character', { cookie, body: { name: 'Ulotna', classId: 'mage', appearance: 'female' } });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await login('znikam', 'zle-haslo');
    const other = await register({ login: 'Zostaje', password: 'tajnehaslo1' });

    const wrong = await call('DELETE', '/api/me', { cookie, body: { login: 'ktos' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.code, 'login_mismatch');
    const deleted = await call('DELETE', '/api/me', { cookie, body: { login: ' ZNIKAM ' } });
    assert.equal(deleted.status, 200);
    assert.match(deleted.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal((await call('GET', '/api/me', { cookie })).status, 401);

    const database = await db();
    const left = await database
      .prepare(
        `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM characters) AS characters,
                (SELECT COUNT(*) FROM activities) AS activities, (SELECT COUNT(*) FROM buildings) AS buildings,
                (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM login_failures) AS failures,
                (SELECT COUNT(*) FROM email_links) AS links`,
      )
      .first();
    assert.deepEqual(left, { users: 1, characters: 0, activities: 0, buildings: 0, sessions: 1, failures: 0, links: 1 });
    // The other player is untouched, and the login is free again.
    assert.equal((await call('GET', '/api/me', { cookie: other.cookie })).status, 200);
    assert.equal((await register({ login: 'znikam', password: 'tajnehaslo1' })).status, 201);
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

describe('Google sign-in without its secrets', () => {
  test('an account with test mode keeps its password', async () => {
    await register({ login: 'szef', password: 'tajnehaslo1' });
    await (await db()).prepare("UPDATE users SET google_sub = 'sub-1' WHERE login = 'szef'").run();
    assert.equal((await login('szef', 'tajnehaslo1')).status, 200);
  });

  test('sends the player back to the start screen', async () => {
    for (const path of ['/api/auth/google/start', '/api/auth/google/callback?code=x&state=y']) {
      const response = await server.fetch(path, { redirect: 'manual' });
      assert.equal(response.status, 302, path);
      assert.equal(response.headers.get('Location'), '/?google=unavailable', path);
    }
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
