// Passwords (the author's 838 A, 12.11.2026): "Zmień hasło" in the
// Ustawienia ends the account's other sessions; "Nie pamiętam hasła" sends
// a link to the account's confirmed e-mail, working for an hour and once,
// and the new password set with it ends every session of the account.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { passwordResetEmail } from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { forgotPassword } from '../src/server/password.js';
import { createSession, SESSION_COOKIE } from '../src/server/sessions.js';
import { useServer } from './helpers/server.js';

const SENT = 'Jeśli to konto ma potwierdzony adres e-mail, wysłaliśmy na niego link. Link działa przez godzinę. Sprawdź skrzynkę, także folder spam.';

test('the mail of "Nie pamiętam hasła": its link as a button and as text, in Polish and in English', () => {
  const link = 'https://insightrpg.com/?reset=abc';
  const polish = passwordResetEmail({ login: 'Karol', link }, contentIn('pl'));
  assert.equal(polish.subject, 'Nowe hasło w grze Insight');
  assert.ok(polish.text.startsWith('Cześć, Karol!') && polish.text.includes(link), polish.text);
  assert.match(polish.html, /^<!doctype html><html lang="pl">/);
  assert.ok(polish.html.includes(`href="${link}"`));
  const english = passwordResetEmail({ login: 'Karol', link }, contentIn('en'));
  assert.equal(english.subject, 'A new password in Insight');
  assert.ok(english.text.includes('The link works for an hour and only once.'), english.text);
  // Nothing of the player's own goes into the page unescaped.
  assert.ok(!passwordResetEmail({ login: '<b>', link }, contentIn('pl')).html.includes('<b>'));
});

describe('Hasło: zmiana i odzyskanie konta (838 A)', () => {
  const { call, db, signUp } = useServer();
  const login = (identifier, password = 'tajnehaslo1') => call('POST', '/api/auth/login', { body: { identifier, password } });
  const status = async (cookie) => (await call('GET', '/api/me', { cookie })).status;

  test('"Zmień hasło": the password now and a new one; the other sessions end, this one stays', async () => {
    const here = (await signUp('Karol')).cookie;
    const there = (await login('Karol')).cookie;
    assert.equal((await call('GET', '/api/me', { cookie: here })).data.user.password, true);
    const change = (body) => call('POST', '/api/auth/password', { cookie: here, body });
    const wrong = await change({ current: 'zlehaslo11', password: 'nowehaslo22' });
    assert.deepEqual([wrong.status, wrong.data.error.code], [403, 'wrong_password']);
    assert.equal((await change({ current: 'tajnehaslo1', password: 'krotkie' })).data.error.code, 'invalid_password');
    assert.equal((await call('POST', '/api/auth/password', { body: { current: 'tajnehaslo1', password: 'nowehaslo22' } })).status, 401);
    const changed = await change({ current: 'tajnehaslo1', password: 'nowehaslo22' });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.text, 'Hasło zmienione. Inne urządzenia zostały wylogowane.');
    assert.deepEqual([await status(here), await status(there)], [200, 401]);
    assert.equal((await login('Karol')).status, 401);
    assert.equal((await login('Karol', 'nowehaslo22')).status, 200);
  });

  test('a wrong password now counts toward the login\'s failed tries', async () => {
    const cookie = (await signUp('Karol')).cookie;
    for (let i = 0; i < 10; i++) await call('POST', '/api/auth/password', { cookie, body: { current: `zle${i}haslo1`, password: 'nowehaslo22' } });
    const blocked = await call('POST', '/api/auth/password', { cookie, body: { current: 'tajnehaslo1', password: 'nowehaslo22' } });
    assert.deepEqual([blocked.status, blocked.data.error.code], [429, 'too_many_attempts']);
    assert.equal((await login('Karol')).status, 429);
  });

  test('an account made with Google has no password to change, nor a row for it', async () => {
    await signUp('Gosia');
    const database = await db();
    await database.prepare("UPDATE users SET password_hash = 'google', google_sub = 'sub-gosia' WHERE login = 'Gosia'").run();
    const { id } = await database.prepare("SELECT id FROM users WHERE login = 'Gosia'").first();
    const { token } = await createSession(database, id, Date.now());
    const cookie = `${SESSION_COOKIE}=${token}`;
    assert.equal((await call('GET', '/api/me', { cookie })).data.user.password, false);
    const tried = await call('POST', '/api/auth/password', { cookie, body: { current: 'google', password: 'nowehaslo22' } });
    assert.deepEqual([tried.status, tried.data.error.code], [409, 'no_password']);
  });

  test('"Nie pamiętam hasła": a link to the confirmed address only, the answer the same whatever was given, within the limits', async () => {
    await signUp('Karol');
    await signUp('Bez', { confirmed: false });
    const database = await db();
    // The mailbox's limits are shared with the confirmation links: the one
    // of the registration went two minutes ago.
    await database.prepare('UPDATE mail_sends SET sent_at = sent_at - 120000').run();
    const mails = [];
    const env = { DB: database, EMAIL: { send: async (message) => void mails.push(message) } };
    const ask = async (identifier, now = Date.now()) => {
      const request = new Request('https://test.insightrpg.com/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) });
      const answer = await forgotPassword({ request, env, now });
      return { status: answer.status, data: await answer.json() };
    };
    for (const identifier of ['Karol', 'nikt-taki', 'Bez', 'nikt@example.com']) assert.deepEqual(await ask(identifier), { status: 200, data: { sent: true, text: SENT } });
    assert.equal(mails.length, 1);
    assert.deepEqual([mails[0].to, mails[0].subject], ['karol@example.com', 'Nowe hasło w grze Insight']);
    assert.match(mails[0].text, /https:\/\/test\.insightrpg\.com\/\?reset=[A-Za-z0-9_-]{43}/);
    // By the address too, but not twice a minute (the same answer).
    assert.deepEqual((await ask('KAROL@example.com')).data, { sent: true, text: SENT });
    assert.equal(mails.length, 1);
    await database.prepare('UPDATE password_resets SET created_at = created_at - 120000').run();
    await database.prepare('UPDATE mail_sends SET sent_at = sent_at - 120000').run();
    await ask('karol@example.com');
    assert.equal(mails.length, 2);
    await assert.rejects(ask(''), { code: 'missing_identifier' });
  });

  test('the link: a new password once and within the hour; every session of the account ends', async () => {
    const here = (await signUp('Karol')).cookie;
    const database = await db();
    await database.prepare('UPDATE mail_sends SET sent_at = sent_at - 120000').run();
    const mails = [];
    const env = { DB: database, EMAIL: { send: async (message) => void mails.push(message) } };
    const request = new Request('https://test.insightrpg.com/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'Karol' }) });
    await forgotPassword({ request, env, now: Date.now() });
    const token = /\?reset=([A-Za-z0-9_-]{43})/.exec(mails[0].text)[1];
    const reset = (body) => call('POST', '/api/auth/reset', { body });
    assert.equal((await reset({ token, password: 'krotkie' })).data.error.code, 'invalid_password');
    assert.equal((await reset({ token: 'x'.repeat(43), password: 'nowehaslo22' })).data.error.code, 'reset_invalid');
    const done = await reset({ token, password: 'nowehaslo22' });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.text, 'Hasło zmienione. Zaloguj się nowym hasłem.');
    assert.equal(await status(here), 401);
    assert.equal((await login('Karol')).status, 401);
    assert.equal((await login('Karol', 'nowehaslo22')).status, 200);
    // Once.
    assert.equal((await reset({ token, password: 'innehaslo33' })).data.error.code, 'reset_invalid');
    // Past the hour.
    await database.prepare('DELETE FROM mail_sends').run();
    await forgotPassword({ request: new Request(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'Karol' }) }), env, now: Date.now() });
    const late = /\?reset=([A-Za-z0-9_-]{43})/.exec(mails[1].text)[1];
    await database.prepare('UPDATE password_resets SET expires_at = ?').bind(Date.now() - 1).run();
    assert.equal((await reset({ token: late, password: 'innehaslo33' })).data.error.code, 'reset_invalid');
  });
});
