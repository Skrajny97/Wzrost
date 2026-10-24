import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { validateEmail, validateLogin, validatePassword } from '../src/server/accounts.js';
import { identityFromIdToken, loginBase } from '../src/server/google.js';
import { ApiError } from '../src/server/http.js';
import { clearedSessionCookie, readCookie, sessionCookie } from '../src/server/sessions.js';

const rejects = (fn, code) =>
  assert.throws(fn, (error) => error instanceof ApiError && error.status === 400 && error.code === code);

test('login: 3–24 ASCII letters, digits and _ . -', () => {
  assert.equal(validateLogin('  Karol_97 '), 'Karol_97');
  assert.equal(validateLogin('a.b-c'), 'a.b-c');
  rejects(() => validateLogin('ab'), 'invalid_login');
  rejects(() => validateLogin('a'.repeat(25)), 'invalid_login');
  rejects(() => validateLogin('żółw'), 'invalid_login');
  rejects(() => validateLogin('ma spację'), 'invalid_login');
  rejects(() => validateLogin('karol@example.com'), 'invalid_login');
  rejects(() => validateLogin(undefined), 'invalid_login');
});

test('e-mail is optional and stored in lower case', () => {
  assert.equal(validateEmail(undefined), null);
  assert.equal(validateEmail(null), null);
  assert.equal(validateEmail('   '), null);
  assert.equal(validateEmail(' Karol@Example.COM '), 'karol@example.com');
  rejects(() => validateEmail('karol'), 'invalid_email');
  rejects(() => validateEmail('karol@example'), 'invalid_email');
  rejects(() => validateEmail(42), 'invalid_email');
  rejects(() => validateEmail(`${'a'.repeat(250)}@example.com`), 'invalid_email');
});

test('password: 8–128 characters, counted as Unicode characters', () => {
  assert.equal(validatePassword('12345678'), '12345678');
  assert.equal(validatePassword(' z odstępami '), ' z odstępami ');
  assert.equal(validatePassword('😀'.repeat(128)).length, 256);
  rejects(() => validatePassword('1234567'), 'invalid_password');
  rejects(() => validatePassword('x'.repeat(129)), 'invalid_password');
  rejects(() => validatePassword(12345678), 'invalid_password');
});

test('session cookie is HttpOnly, Secure, SameSite=Lax and host-only', () => {
  const now = Date.now();
  const cookie = sessionCookie('token', now + 30 * 24 * 60 * 60 * 1000, now);
  assert.match(cookie, /^__Host-sid=token; /);
  for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=2592000']) {
    assert.ok(cookie.split('; ').includes(attribute), attribute);
  }
  assert.doesNotMatch(cookie, /Domain=/);
  assert.match(clearedSessionCookie(), /Max-Age=0/);
});

test('reads one cookie out of a Cookie header', () => {
  const request = new Request('https://example.com', {
    headers: { Cookie: 'theme=dark; __Host-sid=abc=def ; other=1' },
  });
  assert.equal(readCookie(request, '__Host-sid'), 'abc=def');
  assert.equal(readCookie(request, 'missing'), null);
  assert.equal(readCookie(new Request('https://example.com'), '__Host-sid'), null);
});

describe('Google ID tokens', () => {
  const CLIENT_ID = 'insight-test.apps.googleusercontent.com';
  const now = Date.now();
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (extra) =>
    `${encode({ alg: 'RS256' })}.${encode({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      sub: 'sub-1',
      email: 'sub-1@gmail.com',
      email_verified: true,
      exp: Math.floor(now / 1000) + 3600,
      ...extra,
    })}.signature`;
  const identity = (extra) => identityFromIdToken(token(extra), CLIENT_ID, now);

  test('keep the user id and a confirmed e-mail only', () => {
    assert.deepEqual(identity({ email: 'Ala@Gmail.com' }), { sub: 'sub-1', email: 'ala@gmail.com' });
    assert.equal(identity({ email_verified: 'true' }).email, 'sub-1@gmail.com');
    assert.equal(identity({ email_verified: false }).email, null);
    assert.equal(identity({ iss: 'accounts.google.com' }).sub, 'sub-1');
    assert.equal(identity({ aud: [CLIENT_ID, 'other'] }).sub, 'sub-1');
  });

  test('refuse other issuers and audiences, old tokens and broken ones', () => {
    assert.throws(() => identity({ iss: 'https://evil.example' }), /issuer/);
    assert.throws(() => identity({ aud: 'other' }), /audience/);
    assert.throws(() => identity({ azp: 'other' }), /audience/);
    assert.throws(() => identity({ exp: Math.floor(now / 1000) - 1 }), /expired/);
    assert.throws(() => identity({ sub: '' }), /user id/);
    assert.throws(() => identityFromIdToken('not-a-token', CLIENT_ID, now), /unreadable/);
  });

  test('a new account gets its login from the name part of the e-mail', () => {
    assert.equal(loginBase('jan.kowalski@gmail.com'), 'jan.kowalski');
    assert.equal(loginBase('Zażółć+gra@example.com'), 'Zazocgra');
    assert.equal(loginBase('a.verylongnamethatgoesonandon@gmail.com'), 'a.verylongnamethatgo');
    assert.equal(loginBase('ab@gmail.com'), 'gracz');
    assert.equal(loginBase(null), 'gracz');
  });
});
