// The accounts after the security review of 12.11.2026: a new e-mail
// address only with the account's password, a sign-in that opens no
// session over a password changed at the same moment, the notifications'
// phones forgotten with a new password, a limit on "Nie pamiętam hasła"
// asks from one network, and names that look like another's, like the
// chat's role tags or like the account's login refused.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { forgotPassword } from '../src/server/password.js';
import { createSession } from '../src/server/sessions.js';
import { useServer } from './helpers/server.js';

const words = content.chat.accounts;

describe('account security (the review of 12.11.2026)', () => {
  const { call, db, signUp } = useServer();
  const login = (identifier, password = 'tajnehaslo1') => call('POST', '/api/auth/login', { body: { identifier, password } });
  const email = async (loginName) => (await (await db()).prepare('SELECT email FROM users WHERE login = ?').bind(loginName).first()).email;
  // The mails' limits of a minute behind, as if the last one went before.
  const later = async () => {
    const database = await db();
    await database.prepare('UPDATE email_links SET created_at = created_at - 120000').run();
    await database.prepare('UPDATE mail_sends SET sent_at = sent_at - 120000').run();
  };

  test('a new e-mail address needs the account\'s password; the same one does not', async () => {
    const { cookie } = await signUp('Nowy', { confirmed: false });
    const change = (body) => call('POST', '/api/auth/email', { cookie, body });
    const bare = await change({ email: 'inny@example.com' });
    assert.deepEqual([bare.status, bare.data.error.code], [400, 'password_required']);
    assert.equal(bare.data.error.message, 'Podaj obecne hasło, by zmienić adres e-mail.');
    const wrong = await change({ email: 'inny@example.com', password: 'zlehaslo11' });
    assert.deepEqual([wrong.status, wrong.data.error.code], [403, 'wrong_password']);
    assert.equal(await email('Nowy'), 'nowy@example.com');
    await later();
    const moved = await change({ email: 'inny@example.com', password: 'tajnehaslo1' });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    assert.equal(await email('Nowy'), 'inny@example.com');
    // Another link to the address the account has: no password.
    await later();
    assert.equal((await change({})).status, 200);
    await later();
    assert.equal((await change({ email: 'INNY@example.com' })).status, 200);
    // Wrong passwords count toward the login's failed tries, as at the login.
    for (let i = 0; i < 10; i++) await change({ email: 'trzeci@example.com', password: `zle${i}haslo1` });
    const blocked = await change({ email: 'trzeci@example.com', password: 'tajnehaslo1' });
    assert.deepEqual([blocked.status, blocked.data.error.code], [429, 'too_many_attempts']);
  });

  test('a sign-in opens no session over a password changed since it was checked', async () => {
    await signUp('Karol');
    const database = await db();
    const { id, password_hash: hash } = await database.prepare("SELECT id, password_hash FROM users WHERE login = 'Karol'").first();
    const sessions = async () => (await database.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').bind(id).first()).count;
    const before = await sessions();
    // The hash checked is no longer the account's: a reset came between.
    assert.equal(await createSession(database, id, Date.now(), 'pbkdf2-sha256$30000$c3RhcmU=$c3RhcnloYXNo'), null);
    assert.equal(await sessions(), before);
    const made = await createSession(database, id, Date.now(), hash);
    assert.match(made.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await sessions(), before + 1);
    // And the sign-in itself as before.
    assert.equal((await login('Karol')).status, 200);
  });

  test('a new password forgets the phones that got the account\'s notifications', async () => {
    const { cookie } = await signUp('Karol');
    const database = await db();
    const { id } = await database.prepare("SELECT id FROM users WHERE login = 'Karol'").first();
    const phone = (n) =>
      database
        .prepare('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(`https://fcm.googleapis.com/fcm/send/telefon-${n}`, id, 'klucz', 'auth', Date.now())
        .run();
    const phones = async () => (await database.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?').bind(id).first()).count;
    await phone(1);
    await phone(2);
    const changed = await call('POST', '/api/auth/password', { cookie, body: { current: 'tajnehaslo1', password: 'nowehaslo22' } });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(await phones(), 0);

    // And the link of "Nie pamiętam hasła".
    await phone(3);
    await later();
    const mails = [];
    const env = { DB: database, EMAIL: { send: async (message) => void mails.push(message) } };
    const request = new Request('https://test.insightrpg.com/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'Karol' }) });
    await forgotPassword({ request, env, now: Date.now() });
    const token = /\?reset=([A-Za-z0-9_-]{43})/.exec(mails[0].text)[1];
    assert.equal((await call('POST', '/api/auth/reset', { body: { token, password: 'innehaslo33' } })).status, 200);
    assert.equal(await phones(), 0);
  });

  test('"Nie pamiętam hasła": at most 20 asks a day from one network, whatever the accounts', async () => {
    const env = { DB: await db(), EMAIL: { send: async () => {} } };
    const ask = (network) =>
      forgotPassword({
        request: new Request('https://test.insightrpg.com/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': network },
          body: JSON.stringify({ identifier: 'nikt-taki' }),
        }),
        env,
        now: Date.now(),
      });
    for (let i = 0; i < 20; i++) assert.equal((await ask('203.0.113.7')).status, 200);
    await assert.rejects(ask('203.0.113.7'), (error) => error.code === 'too_many_resets' && error.status === 429);
    assert.equal((await ask('198.51.100.4')).status, 200);
  });

  describe('names', () => {
    // A character of that name on a new account of that login.
    async function player(loginName, name) {
      const { cookie } = await signUp(loginName);
      const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'mage', appearance: 'female' } });
      return { cookie, made };
    }
    const choose = (cookie, name) => call('POST', '/api/account/name', { cookie, body: { name } });

    test('a character\'s name like another\'s but for a capital I of any alphabet, a digit 1 or 0, is taken', async () => {
      assert.equal((await player('pierwszy', 'Ice')).made.status, 201);
      // Cyrillic І, с, е.
      const cyrillic = await player('drugi', 'Ісе');
      assert.deepEqual([cyrillic.made.status, cyrillic.made.data.error.code], [409, 'name_taken']);
      // Made first in Cyrillic (І, р, а), then the Latin and a small l.
      assert.equal((await player('trzeci', 'Іра')).made.status, 201);
      for (const [loginName, name] of [['czwarty', 'Ipa'], ['piaty', 'lpa']]) assert.equal((await player(loginName, name)).made.status, 409, name);
      assert.equal((await player('szosty', 'Ola')).made.status, 201);
      assert.equal((await player('siodmy', 'O1a')).made.status, 409);
      assert.equal((await player('osmy', 'Ol0')).made.status, 201);
      assert.equal((await player('dziewiaty', 'OlO')).made.status, 409);
    });

    test('no name of the chat\'s role tags or of the System, also written with a 1, a 0 or a capital I', async () => {
      for (const [n, name] of ['System', 'ADMIN', 'AdmIn', 'Moderat0r'].entries()) {
        const made = (await player(`gracz${n}`, name)).made;
        assert.deepEqual([made.status, made.data.error.message], [400, 'To imię jest zastrzeżone. Wybierz inne.'], name);
      }
      const { cookie } = await player('konto', 'Radomira');
      for (const name of ['Admin', 'Adm1n', 'SYSTEM', 'Administrat0r']) {
        const chosen = await choose(cookie, name);
        assert.deepEqual([chosen.status, chosen.data.error.code, chosen.data.error.message], [400, 'invalid_name', words.reserved], name);
      }
      // A name with those letters among others is a name like any.
      assert.equal((await choose(cookie, 'Systemowiec')).status, 200);
    });

    test('the account name is not the account\'s login, nor a look of it', async () => {
      const { cookie } = await player('wedrowiec', 'Radomira');
      for (const name of ['Wedrowiec', 'WEDROWIEC', 'Wedr0wiec']) {
        const chosen = await choose(cookie, name);
        assert.deepEqual([chosen.status, chosen.data.error.code, chosen.data.error.message], [400, 'account_name_login', words.login], name);
      }
      assert.equal((await choose(cookie, 'Wędrowiec')).status, 200);
    });
  });
});
