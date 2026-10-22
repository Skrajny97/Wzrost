// Password hashing with PBKDF2 from Web Crypto.
// Stored format: pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>,
// so the parameters can be raised later and old hashes upgraded on login.

import { fromBase64, toBase64 } from './encoding.js';

const SCHEME = 'pbkdf2-sha256';
// About 5 ms of CPU, which fits the 10 ms limit of the Workers Free plan
// (100 000 iterations, the runtime maximum, takes about 17 ms).
export const ITERATIONS = 30_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export async function hashPassword(password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return [SCHEME, iterations, toBase64(salt), toBase64(hash)].join('$');
}

export async function verifyPassword(password, stored) {
  const [scheme, iterationsText, saltText, hashText] = stored.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== SCHEME || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) {
    return false;
  }
  const expected = fromBase64(hashText);
  const actual = await derive(password, fromBase64(saltText), iterations);
  return constantTimeEqual(actual, expected);
}

export function needsRehash(stored) {
  return !stored.startsWith(`${SCHEME}$${ITERATIONS}$`);
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
