import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ITERATIONS, hashPassword, needsRehash, verifyPassword } from '../src/server/passwords.js';

test('hash records the scheme and parameters', async () => {
  const hash = await hashPassword('tajne hasło');
  const [scheme, iterations, salt, digest] = hash.split('$');
  assert.equal(scheme, 'pbkdf2-sha256');
  assert.equal(Number(iterations), ITERATIONS);
  assert.equal(atob(salt).length, 16);
  assert.equal(atob(digest).length, 32);
});

test('verifies the right password and rejects a wrong one', async () => {
  const hash = await hashPassword('tajne hasło');
  assert.equal(await verifyPassword('tajne hasło', hash), true);
  assert.equal(await verifyPassword('tajne haslo', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('uses a fresh salt for every hash', async () => {
  assert.notEqual(await hashPassword('to samo hasło'), await hashPassword('to samo hasło'));
});

test('treats differently composed Unicode as the same password', async () => {
  const composed = 'zażółć'.normalize('NFC');
  const decomposed = 'zażółć'.normalize('NFD');
  assert.notEqual(composed, decomposed);
  assert.equal(await verifyPassword(decomposed, await hashPassword(composed)), true);
});

test('rejects malformed or foreign hashes', async () => {
  assert.equal(await verifyPassword('x', 'bcrypt$10$abc$def'), false);
  assert.equal(await verifyPassword('x', 'pbkdf2-sha256$zero$abc$def'), false);
  assert.equal(await verifyPassword('x', 'pbkdf2-sha256$1000'), false);
});

test('flags hashes made with other parameters for an upgrade', async () => {
  assert.equal(needsRehash(await hashPassword('hasło', ITERATIONS)), false);
  const weaker = await hashPassword('hasło', 1000);
  assert.equal(needsRehash(weaker), true);
  assert.equal(await verifyPassword('hasło', weaker), true);
});
