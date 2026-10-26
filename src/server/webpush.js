// Web Push on WebCrypto alone: a message for a phone's push service
// (RFC 8030), encrypted so that only that phone reads it (RFC 8291,
// aes128gcm) and signed with the game's key pair (VAPID, RFC 8292). The same
// code runs in Workers and in Node, where the tests check it.

import { fromBase64Url, toBase64Url } from './encoding.js';

const encoder = new TextEncoder();
const SIGNING = { name: 'ECDSA', namedCurve: 'P-256' };
const AGREEMENT = { name: 'ECDH', namedCurve: 'P-256' };
// Who sends, for the push services: the game's address.
const SUBJECT = 'https://insightrpg.com';
// How long a signature holds (push services take at most 24 hours).
const SIGNATURE_SECONDS = 12 * 3600;
// The record size the header names: a message fits in one record.
const RECORD_SIZE = 4096;

// A new signing key pair: the public key raw, as the phone takes it, and the
// private one as a JWK, both ready to store.
export async function createVapidKeys() {
  const pair = await crypto.subtle.generateKey(SIGNING, true, ['sign', 'verify']);
  return {
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

// The Authorization header for a push service: a token naming the service,
// signed with the game's private key, and the public key beside it.
export async function vapidAuthorization(endpoint, keys, now) {
  const part = (value) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + SIGNATURE_SECONDS, sub: SUBJECT };
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part(claims)}`;
  const key = await crypto.subtle.importKey('jwk', keys.privateKey, SIGNING, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned));
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

// `text` encrypted for one subscription ({ p256dh, auth }): a header with the
// salt, the record size and a one-time public key, then the sealed record.
// The salt and the one-time ECDH key pair are drawn here; tests pass theirs.
export async function encryptMessage(subscription, text, { salt = crypto.getRandomValues(new Uint8Array(16)), ownKeys } = {}) {
  const phoneKey = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  const own = ownKeys ?? (await crypto.subtle.generateKey(AGREEMENT, true, ['deriveBits']));
  const ownKey = new Uint8Array(await crypto.subtle.exportKey('raw', own.publicKey));
  const phone = await crypto.subtle.importKey('raw', phoneKey, AGREEMENT, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: phone }, own.privateKey, 256));
  const secret = await hkdf(authSecret, shared, concat(encoder.encode('WebPush: info\0'), phoneKey, ownKey), 32);
  const contentKey = await hkdf(salt, secret, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, secret, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // The only record is the last one: the text, then the delimiter 2.
  const record = concat(encoder.encode(text), new Uint8Array([2]));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ownKey.length;
  return concat(header, ownKey, sealed);
}

// Sends `message` (JSON) to one subscription and returns the push service's
// answer: 201 when it took the message, 404 or 410 when the subscription is
// gone for good. `ttl`: seconds the service keeps it for a phone that is off;
// `topic`: a newer message of the same topic replaces one still waiting.
export async function sendPush(subscription, message, { authorization, ttl, topic }) {
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
      ...(topic ? { Topic: topic } : {}),
    },
    body: await encryptMessage(subscription, JSON.stringify(message)),
  });
  await response.body?.cancel();
  return response.status;
}

async function hkdf(salt, input, info, bytes) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

function concat(...parts) {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}
