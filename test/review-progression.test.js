// Code review of character progression and the guild and social extras
// (12.11.2026): each test shows a hole the code has, and fails until it is
// fixed.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { toBase64Url } from '../src/server/encoding.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// Requests that start together, as a script sends them: each sent straight
// to the worker with its body held back, and all the bodies let go at once,
// so the handlers, which start once the whole body has come (bodyCome in
// index.js), run side by side (review-accounts.test.js).
async function together(server, cookie, path, bodies) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const answers = bodies.map((value) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
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
      .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: stream, duplex: 'half' })
      .then(async (response) => ({ status: response.status, data: await response.json() }));
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  return Promise.all(answers);
}

// A stand-in for a phone's push service, as in push.test.js: it takes every
// message and counts it.
const received = [];
const pushService = createServer(async (request, response) => {
  for await (const _ of request);
  received.push(request.url);
  response.writeHead(201);
  response.end();
});
await new Promise((resolve) => pushService.listen(0, '127.0.0.1', resolve));
after(() => pushService.close());

// A phone's subscription: its endpoint at the stand-in and its keys.
async function phone() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    endpoint: `http://127.0.0.1:${pushService.address().port}/push/phone`,
    expirationTime: null,
    keys: { p256dh: toBase64Url(p256dh), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
  };
}

// "Wyślij próbne powiadomienie" goes once a half minute (TEST_EVERY_MS in
// push.js): the handler reads tested_at, checks it, and then writes the new
// time whatever the row holds by then, so taps sent at the same moment all
// pass the check, and each makes the server sign and send a message to the
// push service.
describe('the test notification', () => {
  const { server, call, signUp } = useServer({ PUSH_TEST_HOSTS: '127.0.0.1' });

  test('goes at most once a half minute, also for requests sent at the same moment', async () => {
    const { cookie } = await signUp('telefon');
    const subscription = await phone();
    assert.deepEqual((await call('POST', '/api/push/subscribe', { cookie, body: subscription })).data, { ok: true });
    received.length = 0;
    const answers = await together(server, cookie, '/api/push/test', Array.from({ length: 10 }, () => ({ endpoint: subscription.endpoint })));
    const sent = answers.filter((answer) => answer.data.result === 'sent').length;
    assert.equal(sent, 1, `${sent} of 10 test notifications went out at once (${received.length} reached the push service); the limit is one a half minute`);
    assert.equal(received.length, 1);
  });
});

// A request left open in a guild the character left closes when it asks in
// its new guild (askGuild), and the gifts to it were left unthanked, as
// nobody could thank them from another guild; "Wycofaj" thanks them at once
// (cancelGuildRequest), so their givers keep the thanks in the week's
// ranking.
describe('the Prośby Gildii of a guild left', () => {
  const { call, db, signUp } = useServer();
  const HOUR = 3600000;

  test('the gifts to a request closed by asking in another guild are thanked', async () => {
    const cookies = {};
    for (const [login, name] of [['mistrz', 'Mistrz'], ['druh', 'Druh']]) {
      ({ cookie: cookies[login] } = await signUp(login));
      await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    }
    const database = await db();
    await database.prepare("UPDATE characters SET level = 30, class_level = 25, gold = ?, materials = '{\"wolf-pelt:common\": 5}'").bind(content.guilds.found.gold * 3).run();
    const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).status, 200);
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    assert.equal((await as('druh', 'POST', '/api/guild/accept', { guildId })).status, 200);
    const asked = await as('druh', 'POST', '/api/guild/requests', { kind: 'material', key: 'wolf-pelt:common', count: 5 });
    assert.equal(asked.status, 200, JSON.stringify(asked.data).slice(0, 200));
    assert.equal((await as('mistrz', 'POST', '/api/guild/requests/give', { requestId: asked.data.mine.id, count: 1 })).status, 200);
    // Druh leaves, founds a guild of its own and, past the wait, asks there.
    assert.equal((await as('druh', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('druh', 'POST', '/api/guild/found', { name: 'Nowi Bracia', tag: 'NB' })).status, 200);
    await database.prepare('UPDATE guild_requests SET created_at = created_at - ?').bind(9 * HOUR).run();
    const again = await as('druh', 'POST', '/api/guild/requests', { kind: 'material', key: 'wolf-pelt:common', count: 3 });
    assert.equal(again.status, 200, JSON.stringify(again.data).slice(0, 200));
    const gift = await database.prepare('SELECT thanked_at FROM guild_gifts').first();
    assert.notEqual(gift.thanked_at, null, 'the gift to the request closed in the guild left stays unthanked for good');
  });
});
