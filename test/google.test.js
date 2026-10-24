// Google sign-in against a stand-in for Google's token endpoint: a local
// server that answers each code with an ID token of chosen claims.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const CLIENT_ID = 'insight-test.apps.googleusercontent.com';
const google = await fakeGoogle();
after(() => google.close());

const { server, call, db } = useServer({
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_URL: google.url,
  GOOGLE_HOSTS: 'insightrpg.com,localhost,127.0.0.1',
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
    assert.equal(location, '/');
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
    assert.equal(again.location, '/');
    assert.equal((await users()).length, 1);
    assert.equal((await call('GET', '/api/me', { cookie: again.session })).data.user.email, 'stały@gmail.com');
  });

  test('a taken login gets digits, and an unconfirmed e-mail is not kept', async () => {
    await call('POST', '/api/auth/register', { body: { login: 'ola', password: 'tajnehaslo1' } });
    const { session } = await signIn(codeFor(claims('google-ola', { email: 'ola@gmail.com' })));
    assert.match((await call('GET', '/api/me', { cookie: session })).data.user.login, /^ola\d{4}$/);

    const unconfirmed = await signIn(codeFor(claims('google-x', { email: 'x@example.com', email_verified: false })));
    const me = await call('GET', '/api/me', { cookie: unconfirmed.session });
    assert.equal(me.data.user.login, 'gracz');
    assert.equal(me.data.user.email, null);
  });

  test('an account with the same e-mail is not taken over: the player links Google from it', async () => {
    const registered = await call('POST', '/api/auth/register', {
      body: { login: 'karol', email: 'karol@gmail.com', password: 'tajnehaslo1' },
    });
    const { location, session } = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })));
    assert.equal(location, '/?google=exists');
    assert.equal(session, null);
    assert.equal((await users()).length, 1);

    // Signed in with the password, the player links Google in the settings.
    const link = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })), { cookie: registered.cookie, mode: 'link' });
    assert.equal(link.location, '/?google=linked');
    assert.equal(link.session, null);
    assert.equal((await call('GET', '/api/me', { cookie: registered.cookie })).data.user.google, true);

    // From now on Google opens that account.
    const next = await signIn(codeFor(claims('google-karol', { email: 'karol@gmail.com' })));
    assert.equal(next.location, '/');
    assert.equal((await call('GET', '/api/me', { cookie: next.session })).data.user.login, 'karol');
  });

  test('a Google account already linked elsewhere is refused, and linking needs a session', async () => {
    await signIn(codeFor(claims('zajete')));
    const other = await call('POST', '/api/auth/register', { body: { login: 'inny', password: 'tajnehaslo1' } });
    const taken = await signIn(codeFor(claims('zajete')), { cookie: other.cookie, mode: 'link' });
    assert.equal(taken.location, '/?google=taken');
    assert.equal((await call('GET', '/api/me', { cookie: other.cookie })).data.user.google, false);

    const signedOut = await signIn(codeFor(claims('nowe')), { mode: 'link' });
    assert.equal(signedOut.location, '/?google=expired');
    assert.equal((await users()).length, 2);
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
