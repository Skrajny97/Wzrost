// Phone notifications: the encryption against the example of RFC 8291, the
// signature for the push services, what comes due when (engine), and the
// whole way through the API and the minute's cron run to a stand-in push
// service, where a stand-in phone decrypts what it gets.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, beforeEach, describe, test } from 'node:test';

import { notificationsDue } from '../src/engine/index.js';
import { fromBase64Url, toBase64Url } from '../src/server/encoding.js';
import { createVapidKeys, encryptMessage, vapidAuthorization } from '../src/server/webpush.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const pushService = await fakePushService();
after(() => pushService.close());

const { server, call, db } = useServer({ PUSH_TEST_HOSTS: '127.0.0.1' });

const AGREEMENT = { name: 'ECDH', namedCurve: 'P-256' };
const HOUR = 3600000;
const text = (value) => new TextEncoder().encode(value);

function concat(...parts) {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

async function hkdf(salt, input, info, bytes) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// A push service on this machine: it keeps what it gets and answers with
// `status` (201: taken).
async function fakePushService() {
  const received = [];
  const service = {
    received,
    status: 201,
    close: () => http.close(),
  };
  const http = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, headers: request.headers, body: new Uint8Array(Buffer.concat(chunks)) });
    response.writeHead(service.status);
    response.end();
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  service.url = `http://127.0.0.1:${http.address().port}`;
  return service;
}

// A phone with its subscription keys; it reads a message as RFC 8291 says
// the receiving side does.
async function fakePhone(path = '/push/phone-1') {
  const pair = await crypto.subtle.generateKey(AGREEMENT, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const phoneKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    subscription: { endpoint: `${pushService.url}${path}`, expirationTime: null, keys: { p256dh: toBase64Url(phoneKey), auth: toBase64Url(auth) } },
    async read(body) {
      const salt = body.slice(0, 16);
      assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
      const serverKey = body.slice(21, 21 + body[20]);
      const sealed = body.slice(21 + body[20]);
      const server = await crypto.subtle.importKey('raw', serverKey, AGREEMENT, false, []);
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, pair.privateKey, 256));
      const secret = await hkdf(auth, shared, concat(text('WebPush: info\0'), phoneKey, serverKey), 32);
      const key = await crypto.subtle.importKey('raw', await hkdf(salt, secret, text('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
      const nonce = await hkdf(salt, secret, text('Content-Encoding: nonce\0'), 12);
      const record = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
      // The only record is the last: its text ends with the delimiter 2.
      assert.equal(record.at(-1), 2);
      return JSON.parse(new TextDecoder().decode(record.slice(0, -1)));
    },
  };
}

// The signed token of an Authorization header, checked with its key.
async function verifiedClaims(authorization) {
  const [, token, key] = authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  const [header, claims, signature] = token.split('.');
  const publicKey = await crypto.subtle.importKey('raw', fromBase64Url(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromBase64Url(signature), text(`${header}.${claims}`));
  assert.ok(valid, 'the signature holds');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64Url(header))), { typ: 'JWT', alg: 'ES256' });
  return { key, claims: JSON.parse(new TextDecoder().decode(fromBase64Url(claims))) };
}

describe('message encryption', () => {
  test('gives the example of RFC 8291, appendix A', async () => {
    const ownPublic = fromBase64Url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const jwk = { kty: 'EC', crv: 'P-256', x: toBase64Url(ownPublic.slice(1, 33)), y: toBase64Url(ownPublic.slice(33)), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' };
    const ownKeys = {
      privateKey: await crypto.subtle.importKey('jwk', jwk, AGREEMENT, false, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('raw', ownPublic, AGREEMENT, true, []),
    };
    const message = await encryptMessage(
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      'When I grow up, I want to be a watermelon',
      { salt: fromBase64Url('DGv6ra1nlYgDCS1FRnbzlw'), ownKeys },
    );
    assert.equal(
      toBase64Url(message),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  test('a phone reads what was encrypted for it', async () => {
    const phone = await fakePhone();
    const body = await encryptMessage(phone.subscription.keys, JSON.stringify({ title: 'Koniec wyprawy' }));
    assert.deepEqual(await phone.read(body), { title: 'Koniec wyprawy' });
  });

  test('the signature names the push service and holds for 12 hours', async () => {
    const keys = await createVapidKeys();
    const now = Date.UTC(2026, 9, 26, 12);
    const { key, claims } = await verifiedClaims(await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, now));
    assert.equal(key, keys.publicKey);
    assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://insightrpg.com' });
  });
});

describe('what comes due (engine)', () => {
  const t0 = Date.UTC(2026, 9, 26, 10);
  const player = (extra) => ({ level: 1, activity: null, buildings: {}, queue: [], ...extra });

  test('the end of an exploration, once, within its minute', () => {
    const activity = { kind: 'hunt', areaId: 'windfalls-edge', endsAt: t0 };
    assert.deepEqual(notificationsDue(player({ activity }), t0 - 60000, t0, content), [
      { tag: 'hunt', url: '#/walka', at: t0, title: 'Koniec wyprawy', body: 'Eksploracja zakończona: Skraj Wiatrołomów. Raport czeka na odbiór.' },
    ]);
    // The minute after has nothing more.
    assert.deepEqual(notificationsDue(player({ activity }), t0, t0 + 60000, content), []);
  });

  test('builds that end: the one under way and one from the queue', () => {
    const buildings = { campfire: { level: 2, startedAt: t0 - HOUR, endsAt: t0 - 30000, collectedAt: null } };
    const queue = [{ buildingId: 'loot-shed', level: 1, startsAt: t0 - 30000, endsAt: t0 - 10000 }];
    const [build] = notificationsDue(player({ buildings, queue }), t0 - 60000, t0, content);
    assert.equal(build.tag, 'build');
    assert.equal(build.title, 'Koniec budowy');
    assert.equal(build.body, 'Ognisko: poziom 2 gotowy. Szałas na łupy: poziom 1 gotowy.');
  });

  test('a store that fills up names every full store; an upgrade from the queue takes its store along', () => {
    // The Tartak (level 1) holds 2 hours of production, the Kopalnia (level 2) 4.
    const buildings = {
      sawmill: { level: 1, startedAt: t0 - 3 * HOUR, endsAt: t0 - 2 * HOUR, collectedAt: null },
      mine: { level: 2, startedAt: t0 - 6 * HOUR, endsAt: t0 - 5 * HOUR, collectedAt: null },
    };
    const [store] = notificationsDue(player({ buildings }), t0 - 60000, t0, content);
    assert.deepEqual(store, { tag: 'store', url: '#/oboz', at: t0, title: 'Pełny magazyn', body: 'Tartak, Kopalnia: produkcja stoi do zebrania.' });
    // Only the Kopalnia, full for an hour already: nothing new.
    assert.deepEqual(notificationsDue(player({ buildings: { mine: buildings.mine } }), t0 - 60000, t0, content), []);
    // The Tartak's upgrade started from the queue before its store filled.
    const queue = [{ buildingId: 'sawmill', level: 2, startsAt: t0 - 10 * 60000, endsAt: t0 + HOUR }];
    assert.deepEqual(notificationsDue(player({ buildings, queue }), t0 - 60000, t0, content), []);
  });

  test('no store fills while its building is being built', () => {
    const buildings = { quarry: { level: 1, startedAt: t0 - HOUR, endsAt: t0 + HOUR, collectedAt: t0 + HOUR } };
    assert.deepEqual(notificationsDue(player({ buildings }), t0 - 60000, t0, content), []);
  });
});

describe('notifications through the server', () => {
  let cookie;
  beforeEach(async () => {
    pushService.received.length = 0;
    pushService.status = 201;
    ({ cookie } = await call('POST', '/api/auth/register', { body: { login: 'karol', password: 'tajnehaslo1' } }));
  });

  const run = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  const subscriptions = async () => (await (await db()).prepare('SELECT endpoint, user_id FROM push_subscriptions').all()).results;

  test('the key and the subscription need a signed-in player', async () => {
    assert.equal((await call('GET', '/api/push/key')).status, 401);
    const { status, data } = await call('GET', '/api/push/key', { cookie });
    assert.equal(status, 200);
    const key = fromBase64Url(data.key);
    assert.equal(key.length, 65);
    assert.equal(key[0], 4);
    // The pair is made once and kept.
    assert.equal((await call('GET', '/api/push/key', { cookie })).data.key, data.key);
    const phone = await fakePhone();
    assert.equal((await call('POST', '/api/push/subscribe', { body: phone.subscription })).status, 401);
  });

  test('a subscription leads only to a push service, with proper keys', async () => {
    const phone = await fakePhone();
    const wrong = [
      { ...phone.subscription, endpoint: 'https://example.com/push/1' },
      { ...phone.subscription, endpoint: 'http://fcm.googleapis.com/fcm/send/1' },
      { ...phone.subscription, keys: { ...phone.subscription.keys, auth: 'krótki' } },
      { ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: toBase64Url(new Uint8Array(65)) } },
      { endpoint: phone.subscription.endpoint },
    ];
    for (const body of wrong) {
      const { status, data } = await call('POST', '/api/push/subscribe', { cookie, body });
      assert.equal(status, 400);
      assert.equal(data.error.code, 'invalid_subscription');
    }
    assert.equal((await call('POST', '/api/push/subscribe', { cookie, body: phone.subscription })).status, 200);
    assert.equal((await subscriptions()).length, 1);
    // The same phone again stays one subscription; switched off, it is gone.
    assert.equal((await call('POST', '/api/push/subscribe', { cookie, body: phone.subscription })).status, 200);
    assert.equal((await subscriptions()).length, 1);
    assert.equal((await call('POST', '/api/push/unsubscribe', { cookie, body: { endpoint: phone.subscription.endpoint } })).status, 200);
    assert.deepEqual(await subscriptions(), []);
  });

  test('a phone signed in to another account moves to it', async () => {
    const phone = await fakePhone();
    await call('POST', '/api/push/subscribe', { cookie, body: phone.subscription });
    const other = (await call('POST', '/api/auth/register', { body: { login: 'ola', password: 'tajnehaslo1' } })).cookie;
    await call('POST', '/api/push/subscribe', { cookie: other, body: phone.subscription });
    const [moved] = await subscriptions();
    const ola = await (await db()).prepare("SELECT id FROM users WHERE login = 'ola'").first('id');
    assert.equal(moved.user_id, ola);
    // The first account cannot switch it off for the other one.
    await call('POST', '/api/push/unsubscribe', { cookie, body: { endpoint: phone.subscription.endpoint } });
    assert.equal((await subscriptions()).length, 1);
  });

  test('the end of an exploration reaches the phone once, encrypted and signed', async () => {
    await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'warrior', appearance: 'female' } });
    const phone = await fakePhone();
    await call('POST', '/api/push/subscribe', { cookie, body: phone.subscription });
    const { data } = await call('GET', '/api/push/key', { cookie });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const endsAt = await (await db()).prepare('SELECT ends_at FROM activities').first('ends_at');

    // A minute before the end: nothing yet.
    assert.equal((await run(endsAt - 30000)).outcome, 'ok');
    assert.equal(pushService.received.length, 0);
    await run(endsAt + 30000);
    assert.equal(pushService.received.length, 1);
    const [message] = pushService.received;
    assert.equal(message.path, '/push/phone-1');
    assert.equal(message.headers['content-encoding'], 'aes128gcm');
    assert.equal(message.headers.ttl, String(6 * 3600));
    assert.equal(message.headers.topic, 'hunt');
    const { key, claims } = await verifiedClaims(message.headers.authorization);
    assert.equal(key, data.key);
    assert.equal(claims.aud, pushService.url);
    assert.deepEqual(await phone.read(message.body), {
      title: 'Koniec wyprawy',
      body: 'Eksploracja zakończona: Skraj Wiatrołomów. Raport czeka na odbiór.',
      tag: 'hunt',
      url: '#/walka',
      at: endsAt,
    });
    // The next minute has nothing new, and the same minute is not sent twice.
    await run(endsAt + 90000);
    await run(endsAt + 90000);
    assert.equal(pushService.received.length, 1);
  });

  test('a build that ends and a store that fills up; a phone gone for good is forgotten', async () => {
    await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'warrior', appearance: 'female' } });
    const phone = await fakePhone();
    await call('POST', '/api/push/subscribe', { cookie, body: phone.subscription });
    const t0 = Date.now() + 10 * 60000;
    const database = await db();
    const characterId = await database.prepare('SELECT id FROM characters').first('id');
    await database
      .prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)')
      .bind(characterId, 'campfire', 1, t0 - HOUR, t0, null, characterId, 'sawmill', 1, t0 - 3 * HOUR, t0 - 2 * HOUR, t0 - 2 * HOUR)
      .run();
    await run(t0 + 20000);
    const messages = await Promise.all(pushService.received.map((message) => phone.read(message.body)));
    assert.deepEqual(
      messages.map(({ title, body }) => [title, body]).sort(),
      [
        ['Koniec budowy', 'Ognisko: poziom 1 gotowy.'],
        ['Pełny magazyn', 'Tartak: produkcja stoi do zebrania.'],
      ],
    );
    // The push service no longer knows the phone: the subscription goes.
    pushService.status = 410;
    await database.prepare("UPDATE buildings SET ends_at = ? WHERE building_id = 'campfire'").bind(t0 + 60000).run();
    await run(t0 + 80000);
    assert.deepEqual(await subscriptions(), []);
  });
});
