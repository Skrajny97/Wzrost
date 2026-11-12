// Security review of accounts, logins and names (12.11.2026): each test
// shows a hole the code had, and fails without its fix.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { blockedName } from '../src/engine/index.js';
import { validateName } from '../src/server/characters.js';
import { contentIn } from '../src/server/content.js';
import { mailboxKey } from '../src/server/email.js';
import { ApiError, readJson } from '../src/server/http.js';
import { clientOf, MAX_FAILURES, REGISTRATIONS_PER_DAY } from '../src/server/throttle.js';
import { useServer } from './helpers/server.js';

const invalidName = (error) => error instanceof ApiError && error.status === 400 && error.code === 'invalid_name';

// Requests that start together, as a script sends them: each sent straight
// to the worker with its body held back, and all the bodies let go at once,
// so the handlers, which start once the whole body has come (bodyCome in
// index.js), run side by side.
async function together(server, cookie, path, bodies) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const answers = bodies.map(({ type, bytes }) => {
    const stream = new ReadableStream(
      {
        async pull(controller) {
          await gate;
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return server
      .getWorker()
      .fetch(path, { method: 'POST', headers: { 'Content-Type': type, Cookie: cookie }, body: stream, duplex: 'half' })
      .then(async (response) => ({ status: response.status, data: await response.json() }));
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  return Promise.all(answers);
}
const jsonBody = (value) => ({ type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(value)) });

// A stand-in for Google's token endpoint, as in google.test.js: each code
// gets an ID token with the claims set for it.
const CLIENT_ID = 'insight-test.apps.googleusercontent.com';
const googleCodes = new Map();
const fakeGoogle = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const claims = googleCodes.get(new URLSearchParams(body).get('code'));
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  response.writeHead(claims ? 200 : 400, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(claims ? { id_token: `${encode({ alg: 'RS256' })}.${encode(claims)}.signature` } : { error: 'invalid_grant' }));
});
await new Promise((resolve) => fakeGoogle.listen(0, '127.0.0.1', resolve));
after(() => fakeGoogle.close());
const googleVars = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_URL: `http://127.0.0.1:${fakeGoogle.address().port}/token`,
  GOOGLE_HOSTS: 'insightrpg.com,localhost,127.0.0.1',
};

let codes = 0;
// Start, a choice of account at Google with these claims, then the return.
async function googleSignIn(server, sub, { email = `${sub}@gmail.com`, cookie, mode } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const code = `code-${++codes}`;
  googleCodes.set(code, { iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub, email, email_verified: true, exp: now + 3600 });
  const start = await server.fetch(`/api/auth/google/start${mode ? `?mode=${mode}` : ''}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
  const flow = start.headers.getSetCookie().find((line) => line.startsWith('__Host-google=')).split(';')[0];
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const back = await server.fetch(`/api/auth/google/callback?state=${state}&code=${code}`, {
    headers: { Cookie: [cookie, flow].filter(Boolean).join('; ') },
    redirect: 'manual',
  });
  return back.headers.get('Location');
}

// The login limit (MAX_FAILURES wrong passwords for one login or e-mail in
// 15 minutes) was read before the password was checked and the failure
// written after it, so guesses sent at once all read "under the limit" and
// each checked a password.
describe('the login limit', () => {
  const { call, signUp } = useServer();

  test('wrong passwords sent at once are checked no more than the limit allows', async () => {
    await signUp('Ofiara');
    const attempts = 4 * MAX_FAILURES;
    const answers = await Promise.all(
      Array.from({ length: attempts }, (_, i) => call('POST', '/api/auth/login', { body: { identifier: 'Ofiara', password: `zgaduje-${i}` } })),
    );
    const checked = answers.filter((answer) => answer.status === 401).length;
    assert.ok(checked <= MAX_FAILURES, `${checked} of ${attempts} passwords were checked in one window; the limit is ${MAX_FAILURES}`);
    assert.equal(answers.filter((answer) => answer.status === 429).length, attempts - checked);
    // The right password waits for the window's end too.
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'ofiara', password: 'tajnehaslo1' } })).status, 429);
  });
});

// The author's account, linked to Google, refused its password only while
// it had test mode: with TEST_MODE off the password opened it again, with
// the Author Panel and every account's e-mail.
describe("the author's account with test mode off", () => {
  const { server, call, signUp } = useServer({ ...googleVars, TEST_MODE: 'off', TEST_LOGINS: 'szef', AUTHOR_LOGINS: 'szef' });

  test('opens only with Google once linked', async () => {
    const author = await signUp('szef');
    assert.equal(author.data.user.testMode, false);
    assert.equal(await googleSignIn(server, 'google-szef', { cookie: author.cookie, mode: 'link' }), '/?google=rewarded');
    const password = await call('POST', '/api/auth/login', { body: { identifier: 'szef', password: 'tajnehaslo1' } });
    assert.equal(password.status, 403);
    assert.equal(password.data.error.code, 'google_only');
    assert.equal(password.cookie, null);
    // Other accounts keep their password after linking.
    const player = await signUp('gracz2');
    assert.equal(await googleSignIn(server, 'google-gracz2', { cookie: player.cookie, mode: 'link' }), '/?google=rewarded');
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'gracz2', password: 'tajnehaslo1' } })).status, 200);
  });
});

// Registration had no limit, and a mailbox got a mail from every account
// made with it and removed again: the mail limits counted per account.
describe('registration and its mail', () => {
  const { server, call, db } = useServer();
  const register = (login, email, headers = {}) =>
    server.fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ login, email, password: 'tajnehaslo1', adult: true }),
    });

  test('one network makes at most the day\'s accounts, then waits', async () => {
    const statuses = [];
    for (let i = 0; i < REGISTRATIONS_PER_DAY + 3; i++) {
      const response = await register(`bot${i}`, `bot${i}@example.net`, { 'CF-Connecting-IP': '198.51.100.7' });
      statuses.push(response.status);
      if (response.status === 429) {
        const data = await response.json();
        assert.equal(data.error.code, 'too_many_accounts');
        assert.ok(Number(response.headers.get('Retry-After')) > 0);
      }
    }
    assert.deepEqual(statuses, [...Array(REGISTRATIONS_PER_DAY).fill(201), 429, 429, 429]);
    // Another network, and the IPv6 /64 counted as one.
    assert.equal((await register('inny', 'inny@example.net', { 'CF-Connecting-IP': '203.0.113.9' })).status, 201);
    assert.equal(clientOf(new Request('https://x/', { headers: { 'CF-Connecting-IP': '2001:db8:85a3::8a2e:370:7334' } })), '2001:db8:85a3:0::/64');
    assert.equal(clientOf(new Request('https://x/', { headers: { 'CF-Connecting-IP': '2001:db8:85a3:0:ffff::1' } })), '2001:db8:85a3:0::/64');
  });

  test('one mailbox gets one mail a minute, whatever accounts are made and removed with it', async () => {
    let mails = 0;
    for (let i = 0; i < 6; i++) {
      const login = `spam${i}`;
      // The same Gmail mailbox, written with dots and a "+tag".
      const email = ['ofiara@gmail.com', 'o.f.i.a.r.a@gmail.com', 'ofiara+gra@gmail.com', 'OFIARA@googlemail.com', 'ofiara@gmail.com', 'of.iara+1@gmail.com'][i];
      const response = await register(login, email);
      const data = await response.json();
      assert.equal(response.status, 201);
      if (data.emailSent) mails += 1;
      const cookie = response.headers.get('Set-Cookie').split(';')[0];
      assert.equal((await call('DELETE', '/api/me', { cookie, body: { login } })).status, 200);
    }
    assert.equal(mails, 1);
    // A day keeps only a hash of the mailbox, never the address.
    const kept = await (await db()).prepare('SELECT address FROM mail_sends').all();
    assert.deepEqual(kept.results.map((row) => row.address), [await mailboxKey('ofiara@gmail.com')]);
    assert.notEqual(kept.results[0].address.includes('@'), true);
  });

  test('a refused mail leaves the address where it was', async () => {
    // A throwaway account, its first mail sent a moment ago, asks for a
    // link to someone else's address: refused, as one link a minute.
    const response = await register('napastnik', 'napastnik@example.com');
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    const moved = await call('POST', '/api/auth/email', { cookie, body: { email: 'ofiara@gmail.com' } });
    assert.equal(moved.status, 429);
    assert.equal(moved.data.error.code, 'email_wait');
    assert.equal((await call('GET', '/api/me', { cookie })).data.user.email, 'napastnik@example.com');
  });
});

// "Wyślij link" read the account's links, then wrote one and mailed it,
// so links asked for at once all passed the limits.
describe('links asked for at once', () => {
  const { server, db, signUp } = useServer();

  test('"Wyślij link" sends at most one mail a minute, also when asked many times at once', async () => {
    const sent = [];
    for (let n = 0; n < 3; n += 1) {
      const { cookie } = await signUp(`gracz${n}`, { email: `ofiara${n}@example.com`, confirmed: false });
      // The registration's link two minutes ago: the next one may go.
      await (await db()).prepare('UPDATE email_links SET created_at = created_at - 120000').run();
      await (await db()).prepare('UPDATE mail_sends SET sent_at = sent_at - 120000').run();
      const answers = await together(server, cookie, '/api/auth/email', Array.from({ length: 10 }, () => jsonBody({})));
      sent.push(answers.filter((answer) => answer.status === 200).length);
      assert.ok(answers.every((answer) => answer.status === 200 || answer.data.error.code === 'email_wait'));
    }
    assert.deepEqual(sent, [1, 1, 1]);
  });
});

// The name filter let through invisible names, copies of another player's
// name, and slurs written with look-alike letters.
describe('character names', () => {
  test('a name of invisible letters (Hangul fillers) is refused', () => {
    for (const name of ['\u{3164}\u{3164}', '\u{FFA0}\u{FFA0}\u{FFA0}', '\u{115F}\u{115F}', 'Mira\u{3164}']) {
      assert.throws(() => validateName(name), invalidName, `accepted ${JSON.stringify(name)}`);
    }
  });

  test('the filter of vulgar names reads look-alike letters', () => {
    // A dotless i (U+0131), a small capital I (U+026A), full-width and mathematical letters,
    // a Greek kappa: each reads on screen as the word the filter blocks.
    for (const name of ['n\u{131}gger', 'n\u{26A}gger', '\u{FF4B}\u{FF55}\u{FF52}\u{FF57}\u{FF41}', '\u{1D424}\u{1D42E}\u{1D42B}\u{1D430}\u{1D41A}', '\u{3BA}urwa', 'sh\u{131}t']) {
      assert.throws(() => validateName(name), invalidName, `accepted ${JSON.stringify(name)}`);
      // The filter itself, which also reads the names characters have now.
      assert.equal(blockedName(name, contentIn('pl')), true, `the filter missed ${JSON.stringify(name)}`);
    }
  });

  test('names of one alphabet pass as before, wide letters become plain ones', () => {
    for (const [typed, kept] of [['Justi_725', 'Justi_725'], ['Łukasz', 'Łukasz'], ['Ёжик', 'Ёжик'], ['Νίκη', 'Νίκη'], ['\u{FF2D}\u{FF49}\u{FF52}\u{FF41}', 'Mira'], ['O\u{2019}Neil', "O'Neil"], ['Ana Maria', 'Ana Maria']]) {
      assert.equal(validateName(typed), kept);
    }
    assert.throws(() => validateName('Mir\u{430}'), (error) => invalidName(error) && /jednym alfabetem/.test(error.message));
    assert.throws(() => validateName('\u{3042}\u{3044}'), invalidName);
  });

  describe('in the game', () => {
    const { call, db, signUp } = useServer();
    const create = (cookie, name) => call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });

    test("another player's name cannot be copied with a look-alike or an invisible letter", async () => {
      const first = await signUp('pierwsza');
      assert.equal((await create(first.cookie, 'Kasia')).status, 201);
      const copier = await signUp('podszywacz');
      assert.equal((await create(copier.cookie, 'KASIA')).data.error.code, 'name_taken');
      // A Cyrillic a, an invisible Hangul filler, a dotless i, the whole name in Cyrillic (К а ѕ і а).
      for (const copy of ['K\u{430}sia', 'Kasia\u{3164}', 'Kas\u{131}a', '\u{41A}\u{430}\u{455}\u{456}\u{430}']) {
        const answer = await create(copier.cookie, copy);
        assert.notEqual(answer.status, 201, `${JSON.stringify(copy)} shows as "Kasia" and was accepted`);
      }
      // Nor by a change of name.
      assert.equal((await create(copier.cookie, 'Kora')).status, 201);
      const renamed = await call('POST', '/api/character/name', { cookie: copier.cookie, body: { name: '\u{41A}\u{430}\u{455}\u{456}\u{430}' } });
      assert.equal(renamed.data.error.code, 'name_taken');
      // Names of other alphabets that look like none pass.
      assert.equal((await call('POST', '/api/character/name', { cookie: copier.cookie, body: { name: '\u{416}\u{435}\u{43D}\u{44F}' } })).status, 200);
    });

    test("a guild's name or tag cannot copy another guild's with look-alike letters", async () => {
      const founders = [];
      for (const login of ['zalozyciel', 'kopista']) {
        const { cookie } = await signUp(login);
        await create(cookie, login === 'zalozyciel' ? 'Brom' : 'Wega');
        await (await db()).prepare("UPDATE characters SET level = 40, gold = 100000 WHERE user_id = (SELECT id FROM users WHERE login = ?)").bind(login).run();
        founders.push(cookie);
      }
      assert.equal((await call('POST', '/api/guild/found', { cookie: founders[0], body: { name: 'Moc', tag: 'MAX' } })).status, 200);
      // The name in Cyrillic (М о с), or with one Cyrillic о.
      const byName = await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: '\u{41C}\u{43E}\u{441}', tag: 'XYZ' } });
      assert.equal(byName.data.error.code, 'name_taken');
      const mixed = await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: 'M\u{43E}c', tag: 'XYZ' } });
      assert.equal(mixed.data.error.code, 'invalid_name');
      // The tag in Cyrillic (М А Х).
      const tag = await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: 'Inni', tag: '\u{41C}\u{410}\u{425}' } });
      assert.equal(tag.data.error.code, 'tag_taken');
      const blank = await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: '\u{3164}\u{3164}\u{3164}', tag: 'XYZ' } });
      assert.equal(blank.status, 400);
      const bold = await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: 'Inni', tag: '\u{1D402}\u{1D414}\u{1D40D}\u{1D413}' } });
      assert.equal(bold.data.error.code, 'invalid_tag');
      assert.equal((await call('POST', '/api/guild/found', { cookie: founders[1], body: { name: 'Inni', tag: 'XYZ' } })).status, 200);
    });
  });
});

// An address nobody confirmed kept its Google owner out for good: a
// password account made with someone else's e-mail answered every Google
// sign-in with it "exists".
describe('an e-mail nobody confirmed', () => {
  const { server, call, db, signUp } = useServer(googleVars);

  test("goes to the address's Google owner, from an account that cannot play yet", async () => {
    const squatter = await signUp('napastnik', { email: 'ofiara@gmail.com', confirmed: false });
    assert.equal(squatter.data.user.emailConfirmed, false);
    assert.equal(await googleSignIn(server, 'google-ofiara', { email: 'ofiara@gmail.com' }), '/?google=created');
    const owner = await (await db()).prepare("SELECT login FROM users WHERE email = 'ofiara@gmail.com'").first();
    assert.notEqual(owner.login, 'napastnik');
    const me = await call('GET', '/api/me', { cookie: squatter.cookie });
    assert.equal(me.data.user.email, null);
    assert.equal((await (await db()).prepare("SELECT COUNT(*) AS count FROM email_links WHERE user_id = (SELECT id FROM users WHERE login = 'napastnik')").first()).count, 0);
  });

  test('stays with an account that confirmed it, or that played before e-mails were confirmed', async () => {
    await signUp('potwierdzony', { email: 'jan@gmail.com' });
    assert.equal(await googleSignIn(server, 'google-jan', { email: 'jan@gmail.com' }), '/?google=exists');
    await signUp('dawny', { email: 'ola@gmail.com', confirmed: false });
    await (await db()).prepare("UPDATE users SET email_required = 0 WHERE login = 'dawny'").run();
    assert.equal(await googleSignIn(server, 'google-ola', { email: 'ola@gmail.com' }), '/?google=exists');
    assert.equal((await (await db()).prepare("SELECT email FROM users WHERE login = 'dawny'").first()).email, 'ola@gmail.com');
  });
});

// readJson refused a body over 4096 bytes by its Content-Length, but read
// one sent in pieces, without that header, whole into memory first.
describe('the JSON body limit', () => {
  test('a body sent in pieces is not read past the limit', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    const total = 16 * 1024 * 1024;
    let pulled = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (pulled >= total) return controller.close();
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const request = new Request('https://insightrpg.com/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' });
    assert.equal(request.headers.get('Content-Length'), null);
    await assert.rejects(readJson(request), (error) => error instanceof ApiError && error.status === 413);
    assert.ok(pulled <= 128 * 1024, `${pulled} bytes were read for a limit of 4096`);
  });

  test('a body in pieces under the limit reads as before', async () => {
    const text = JSON.stringify({ identifier: 'Łucja', password: 'tajne hasło' });
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream({
      start(controller) {
        // Split inside the two bytes of "Ł".
        controller.enqueue(bytes.slice(0, 16));
        controller.enqueue(bytes.slice(16));
        controller.close();
      },
    });
    const request = new Request('https://insightrpg.com/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' });
    assert.deepEqual(await readJson(request), { identifier: 'Łucja', password: 'tajne hasło' });
  });
});

// "Nie mam 16 lat" removed any account, also one that answered long ago,
// without the typed login "Usuń konto" asks for.
describe('the age answer', () => {
  const { call, signUp } = useServer();

  test('removes an account only while its question waits', async () => {
    const player = await signUp('dorosly');
    const answer = await call('POST', '/api/me/age', { cookie: player.cookie, body: { adult: false } });
    assert.equal(answer.status, 409);
    assert.equal(answer.data.error.code, 'age_answered');
    assert.equal((await call('GET', '/api/me', { cookie: player.cookie })).status, 200);
    // "Mam co najmniej 16 lat" again changes nothing.
    assert.equal((await call('POST', '/api/me/age', { cookie: player.cookie, body: { adult: true } })).status, 200);
  });
});
