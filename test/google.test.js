// Google sign-in against a stand-in for Google's token endpoint: a local
// server that answers each code with an ID token of chosen claims.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const CLIENT_ID = 'insight-test.apps.googleusercontent.com';
const google = await fakeGoogle();
after(() => google.close());

const { server, call, db, signUp } = useServer({
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_URL: google.url,
  GOOGLE_HOSTS: 'insightrpg.com,localhost,127.0.0.1',
  // Only this account has test mode here, and the author's panel.
  TEST_LOGINS: 'szef',
  AUTHOR_LOGINS: 'szef',
});

async function fakeGoogle() {
  const codes = new Map(); // code → ID token claims
  const requests = [];
  const http = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    requests.push(form);
    const claims = codes.get(form.get('code'));
    response.writeHead(claims ? 200 : 400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(claims ? { access_token: 'access', token_type: 'Bearer', expires_in: 3599, id_token: idToken(claims) } : { error: 'invalid_grant' }));
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${http.address().port}/token`, codes, requests, close: () => http.close() };
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims) => `${encode({ alg: 'RS256', kid: 'test' })}.${encode(claims)}.signature`;

function claims(sub, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: 'https://accounts.google.com', azp: CLIENT_ID, aud: CLIENT_ID, sub, email: `${sub}@gmail.com`, email_verified: true, iat: now, exp: now + 3600, ...extra };
}

// The code Google would give for an account with these claims.
let codes = 0;
function codeFor(tokenClaims) {
  const code = `code-${++codes}`;
  google.codes.set(code, tokenClaims);
  return code;
}

const fetchRaw = (path, cookie) => server.fetch(path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });

// "name=value" of a cookie the response sets, or null when it is removed.
function cookieOf(response, name) {
  const cookie = response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
  const pair = cookie?.split(';')[0];
  return pair && pair !== `${name}=` ? pair : null;
}

// Start, a choice of account at Google, then the return with the code.
async function signIn(code, { cookie, mode } = {}) {
  const start = await fetchRaw(`/api/auth/google/start${mode ? `?mode=${mode}` : ''}`, cookie);
  const flow = cookieOf(start, '__Host-google');
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const callback = await fetchRaw(`/api/auth/google/callback?state=${state}&code=${code}`, [cookie, flow].filter(Boolean).join('; '));
  return { start, callback, location: callback.headers.get('Location'), session: cookieOf(callback, '__Host-sid') };
}

const users = async () => (await (await db()).prepare('SELECT login, email, password_hash, google_sub FROM users ORDER BY id').all()).results;

describe('Google sign-in', () => {
  test('health says the buttons can show', async () => {
    assert.equal((await call('GET', '/api/health')).data.google, true);
  });

  test('start sends the browser to Google with PKCE and keeps the flow in a short cookie', async () => {
    const response = await fetchRaw('/api/auth/google/start');
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('Location'));
    assert.equal(`${location.origin}${location.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
    const params = Object.fromEntries(location.searchParams);
    const origin = (await server.listen()).url.origin;
    assert.equal(params.client_id, CLIENT_ID);
    assert.equal(params.redirect_uri, `${origin}/api/auth/google/callback`);
    assert.equal(params.response_type, 'code');
    assert.equal(params.scope, 'openid email');
    assert.equal(params.code_challenge_method, 'S256');
    assert.equal(params.prompt, 'select_account');
    assert.match(params.state, /^[A-Za-z0-9_-]{43}$/);
    assert.match(params.code_challenge, /^[A-Za-z0-9_-]{43}$/);

    const cookie = response.headers.getSetCookie()[0];
    assert.match(cookie, new RegExp(`^__Host-google=${params.state}\\.[A-Za-z0-9_-]{43}\\.login; `));
    for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']) {
      assert.ok(cookie.split('; ').includes(attribute), attribute);
    }
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });

  test('a start on an address Google does not know moves to the main one', async () => {
    const response = await server.fetch('https://wzrost.wzrost.workers.dev/api/auth/google/start?mode=link', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://insightrpg.com/api/auth/google/start?mode=link');
    assert.equal(cookieOf(response, '__Host-google'), null);
  });

  test('the first sign-in makes an account without a password and signs in', async () => {
    const { callback, location, session } = await signIn(codeFor(claims('jan.kowalski')));
    assert.equal(callback.status, 302);
    assert.equal(location, '/?google=created');
    assert.match(session, /^__Host-sid=[A-Za-z0-9_-]{43}$/);
    assert.ok(callback.headers.getSetCookie().some((line) => line.startsWith('__Host-google=;') && line.includes('Max-Age=0')));

    const me = await call('GET', '/api/me', { cookie: session });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.login, 'jan.kowalski');
    assert.equal(me.data.user.email, 'jan.kowalski@gmail.com');
    assert.equal(me.data.user.google, true);
    const [user] = await users();
    assert.equal(user.google_sub, 'jan.kowalski');
    assert.equal(user.password_hash, 'google');

    // The code went to Google with the client secret and the PKCE verifier
    // whose hash went out at the start.
    const sent = google.requests.at(-1);
    assert.equal(sent.get('grant_type'), 'authorization_code');
    assert.equal(sent.get('client_id'), CLIENT_ID);
    assert.equal(sent.get('client_secret'), 'test-secret');
    assert.equal(sent.get('redirect_uri'), `${(await server.listen()).url.origin}/api/auth/google/callback`);
    assert.match(sent.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);

    // No password opens that account.
    const login = await call('POST', '/api/auth/login', { body: { identifier: 'jan.kowalski', password: 'google' } });
    assert.equal(login.status, 401);

    // The Punkty Systemu of a confirmed e-mail wait for the first character.
    const made = await call('POST', '/api/character', { cookie: session, body: { name: 'Jan', classId: 'warrior', appearance: 'male' } });
    assert.equal(made.status, 201);
    assert.equal(made.data.character.systemPoints, 10);
    const again = await signIn(codeFor(claims('jan.kowalski')));
    assert.equal(again.location, '/?google=signed');
    assert.equal((await call('GET', '/api/character', { cookie: again.session })).data.character.systemPoints, 10);
  });

  test('linking Google gives the Punkty Systemu once an account, also after a confirmed e-mail', async () => {
    const database = await db();
    const points = async (login) =>
      (await database.prepare('SELECT COALESCE(SUM(c.system_points), 0) + u.system_points_waiting AS points FROM users u LEFT JOIN characters c ON c.user_id = u.id WHERE u.login = ? GROUP BY u.id').bind(login).first()).points;
    // A player with a character: the points go to it.
    const player = await signUp('bartek');
    assert.equal((await call('POST', '/api/character', { cookie: player.cookie, body: { name: 'Bartek', classId: 'mage', appearance: 'male' } })).status, 201);
    const link = await signIn(codeFor(claims('google-bartek')), { cookie: player.cookie, mode: 'link' });
    assert.equal(link.location, '/?google=rewarded');
    assert.equal((await call('GET', '/api/character', { cookie: player.cookie })).data.character.systemPoints, 10);
    // Rewarded for the e-mail already: nothing more.
    const rewarded = await signUp('ewa');
    await database.prepare("UPDATE users SET email_rewarded_at = 1, system_points_waiting = 10 WHERE login = 'ewa'").run();
    const second = await signIn(codeFor(claims('google-ewa')), { cookie: rewarded.cookie, mode: 'link' });
    assert.equal(second.location, '/?google=linked');
    assert.equal(await points('ewa'), 10);
  });

  test('migration 0029 gives the Punkty Systemu to accounts bound to Google before', async () => {
    const database = await db();
    const add = (login, google, rewarded = null) =>
      database.prepare("INSERT INTO users (login, email, password_hash, created_at, google_sub, email_rewarded_at) VALUES (?, NULL, 'google', 0, ?, ?)").bind(login, google, rewarded).run();
    await add('z_postacia', 'sub-1');
    await add('bez_postaci', 'sub-2');
    await add('nagrodzony', 'sub-3', 5);
    await add('haslo', null);
    for (const login of ['z_postacia', 'nagrodzony', 'haslo']) {
      await database
        .prepare("INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, position, hp, hp_at, created_at) SELECT id, 'player', ?, ?, 'warrior', 'female', 'front', 10, 0, 0 FROM users WHERE login = ?")
        .bind(login, login, login)
        .run();
    }
    const migration = readFileSync(new URL('../migrations/0029_google_reward.sql', import.meta.url), 'utf8');
    const statements = migration.split(';').map((part) => part.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    // Twice, as a check that it pays once.
    for (const statement of [...statements, ...statements]) await database.prepare(statement).run();
    const rows = (
      await database
        .prepare('SELECT u.login, u.system_points_waiting AS waiting, c.system_points AS points, u.email_rewarded_at IS NOT NULL AS rewarded FROM users u LEFT JOIN characters c ON c.user_id = u.id ORDER BY u.login')
        .all()
    ).results;
    assert.deepEqual(rows, [
      { login: 'bez_postaci', waiting: 10, points: null, rewarded: 1 },
      { login: 'haslo', waiting: 0, points: 0, rewarded: 0 },
      { login: 'nagrodzony', waiting: 0, points: 0, rewarded: 1 },
      { login: 'z_postacia', waiting: 0, points: 10, rewarded: 1 },
    ]);
  });

  test('the verifier sent to Google matches the challenge from the start', async () => {
    const { start } = await signIn(codeFor(claims('pkce')));
    const challenge = new URL(start.headers.get('Location')).searchParams.get('code_challenge');
    const verifier = google.requests.at(-1).get('code_verifier');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    assert.equal(Buffer.from(digest).toString('base64url'), challenge);
  });

  test('the next sign-in opens the same account', async () => {
    await signIn(codeFor(claims('stały')));
    const again = await signIn(codeFor(claims('stały', { email: 'nowy.adres@gmail.com' })));
    assert.equal(again.location, '/?google=signed');
    assert.equal((await users()).length, 1);
    assert.equal((await call('GET', '/api/me', { cookie: again.session })).data.user.email, 'stały@gmail.com');
  });

  test('a taken login gets digits, and an unconfirmed e-mail is not kept', async () => {
    await signUp('ola');
    const { session } = await signIn(codeFor(claims('google-ola', { email: 'ola@gmail.com' })));
    assert.match((await call('GET', '/api/me', { cookie: session })).data.user.login, /^ola\d{4}$/);

    const unconfirmed = await signIn(codeFor(claims('google-x', { email: 'x@example.com', email_verified: false })));
    const me = await call('GET', '/api/me', { cookie: unconfirmed.session });
    assert.equal(me.data.user.login, 'gracz');
    assert.equal(me.data.user.email, null);
  });

  test('an account with the same e-mail is not taken over: the player links Google from it', async () => {
    const registered = await signUp('karol', { email: 'karol@gmail.com' });
    const { location, session } = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })));
    assert.equal(location, '/?google=exists');
    assert.equal(session, null);
    assert.equal((await users()).length, 1);

    // Signed in with the password, the player links Google in the settings.
    const link = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })), { cookie: registered.cookie, mode: 'link' });
    assert.equal(link.location, '/?google=rewarded');
    assert.equal(link.session, null);
    assert.equal((await call('GET', '/api/me', { cookie: registered.cookie })).data.user.google, true);

    // From now on Google opens that account.
    const next = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })));
    assert.equal(next.location, '/?google=signed');
    assert.equal((await call('GET', '/api/me', { cookie: next.session })).data.user.login, 'karol');
  });

  test('a Google account already linked elsewhere is refused, and linking needs a session', async () => {
    await signIn(codeFor(claims('zajete')));
    const other = await signUp('inny');
    const taken = await signIn(codeFor(claims('zajete')), { cookie: other.cookie, mode: 'link' });
    assert.equal(taken.location, '/?google=taken');
    assert.equal((await call('GET', '/api/me', { cookie: other.cookie })).data.user.google, false);

    const signedOut = await signIn(codeFor(claims('nowe')), { mode: 'link' });
    assert.equal(signedOut.location, '/?google=expired');
    assert.equal((await users()).length, 2);
  });

  test('an account with test mode opens only with Google once linked, and its other sessions end', async () => {
    const first = await signUp('szef');
    const second = await call('POST', '/api/auth/login', { body: { identifier: 'szef', password: 'tajnehaslo1' } });
    assert.equal(first.data.user.testMode, true);
    const link = await signIn(codeFor(claims('google-szef')), { cookie: first.cookie, mode: 'link' });
    assert.equal(link.location, '/?google=rewarded');
    assert.equal((await call('GET', '/api/me', { cookie: first.cookie })).status, 200);
    assert.equal((await call('GET', '/api/me', { cookie: second.cookie })).status, 401);

    const password = await call('POST', '/api/auth/login', { body: { identifier: 'szef', password: 'tajnehaslo1' } });
    assert.equal(password.status, 403);
    assert.equal(password.data.error.code, 'google_only');
    assert.equal(password.cookie, null);
    // A wrong password gets the usual answer, so it tells nothing.
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'szef', password: 'zlehaslo12' } })).status, 401);

    const google = await signIn(codeFor(claims('google-szef')));
    const me = await call('GET', '/api/me', { cookie: google.session });
    assert.equal(me.data.user.login, 'szef');
    assert.equal(me.data.user.testMode, true);

    // Other accounts keep their password after linking.
    const player = await signUp('gracz2');
    await signIn(codeFor(claims('google-gracz2')), { cookie: player.cookie, mode: 'link' });
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'gracz2', password: 'tajnehaslo1' } })).status, 200);
    assert.equal((await call('GET', '/api/me', { cookie: player.cookie })).status, 200);
  });

  test("the author's panel: only the author's account bound to Google sees every account with its e-mail", async () => {
    const author = await signUp('szef');
    // An account from before e-mails were needed, without one.
    await (await db()).prepare("UPDATE users SET email = NULL, email_confirmed_at = NULL, email_required = 0 WHERE login = 'szef'").run();
    // Not yet bound to Google: a password alone does not open it.
    assert.equal((await call('GET', '/api/me', { cookie: author.cookie })).data.user.author, false);
    assert.equal((await call('GET', '/api/author', { cookie: author.cookie })).status, 404);
    await signIn(codeFor(claims('google-szef')), { cookie: author.cookie, mode: 'link' });
    assert.equal((await call('GET', '/api/me', { cookie: author.cookie })).data.user.author, true);

    const player = await signUp('gracz', { confirmed: false });
    await (await db()).prepare("UPDATE users SET email_required = 0 WHERE login = 'gracz'").run();
    await call('POST', '/api/character', { cookie: player.cookie, body: { name: 'Wędrowiec', classId: 'mage', appearance: 'female' } });
    await signIn(codeFor(claims('nowy-gracz')));
    // Another player sees nothing.
    assert.equal((await call('GET', '/api/author', { cookie: player.cookie })).status, 404);
    assert.equal((await call('GET', '/api/me', { cookie: player.cookie })).data.user.author, false);

    const panel = (await call('GET', '/api/author', { cookie: author.cookie })).data;
    assert.deepEqual(panel.counts, { bugs: 0, accounts: 3, google: 2, newAccounts: 3, characters: 1, newCharacters: 1 });
    assert.deepEqual(
      panel.accounts.map((account) => [account.login, account.email, account.google, account.emailConfirmed, account.character?.name ?? null]),
      [
        ['nowy-gracz', 'nowy-gracz@gmail.com', true, true, null],
        // An older account plays without confirming its e-mail.
        ['gracz', 'gracz@example.com', false, false, 'Wędrowiec'],
        // The e-mail Google confirmed is kept when Google is linked.
        ['szef', 'google-szef@gmail.com', true, true, null],
      ],
    );
    assert.deepEqual(panel.accounts[1].character, { ...panel.accounts[1].character, className: 'Mag', level: 1, classLevel: 1 });
  });

  test('a return without the flow cookie, with another state or a refusal signs nobody in', async () => {
    const code = codeFor(claims('ktos'));
    const noCookie = await fetchRaw(`/api/auth/google/callback?state=${'a'.repeat(43)}&code=${code}`);
    assert.equal(noCookie.headers.get('Location'), '/?google=expired');

    const start = await fetchRaw('/api/auth/google/start');
    const flow = cookieOf(start, '__Host-google');
    const otherState = await fetchRaw(`/api/auth/google/callback?state=${'b'.repeat(43)}&code=${code}`, flow);
    assert.equal(otherState.headers.get('Location'), '/?google=expired');

    const state = new URL(start.headers.get('Location')).searchParams.get('state');
    const refused = await fetchRaw(`/api/auth/google/callback?state=${state}&error=access_denied`, flow);
    assert.equal(refused.headers.get('Location'), '/?google=cancelled');
    assert.equal(cookieOf(refused, '__Host-sid'), null);
    assert.equal((await users()).length, 0);
  });

  test('a code Google refuses or a token for another app signs nobody in', async () => {
    assert.equal((await signIn('unknown-code')).location, '/?google=failed');
    assert.equal((await signIn(codeFor(claims('obcy', { aud: 'other-app', azp: 'other-app' })))).location, '/?google=failed');
    assert.equal((await signIn(codeFor(claims('obcy', { iss: 'https://evil.example' })))).location, '/?google=failed');
    assert.equal((await signIn(codeFor(claims('obcy', { exp: Math.floor(Date.now() / 1000) - 60 })))).location, '/?google=failed');
    assert.equal((await users()).length, 0);
  });
});
