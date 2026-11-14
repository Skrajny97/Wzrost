// Google Play Billing (867 A; src/server/google-play.js, payments.js): the
// game's service account signs its own token request, an order gives the
// product the app buys, a purchase's token credits its order once and only
// after Google's word, and is consumed then; a token of another account, one
// Google does not know, a licence tester's purchase (no limits, no revenue),
// a purchase Google keeps pending and settles later (the cron), an order left
// in Google's window, a purchase whose order the app lost, a refund within
// the days through orders.refund and the purchases Google voided. Google is a
// local server here, at the addresses the tests give the Worker.

import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { googlePlayGateway, serviceAccount, voidedStatus } from '../src/server/google-play.js';
import { useServer } from './helpers/server.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const ACCOUNT = JSON.stringify({ type: 'service_account', client_email: 'insight@gra.iam.gserviceaccount.com', private_key: privateKey });

// Google, played by a local server: its token endpoint checks the JWT's
// signature with the account's public key; its purchases are what a test
// puts in `purchases` (by token); consumptions, refunds and the voided list
// are kept for the test to look at.
const google = { purchases: new Map(), consumed: [], refunded: [], voided: [], tokens: 0, port: 0 };
const fromBase64url = (text) => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const mock = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    const url = new URL(request.url, 'http://local');
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === '/token') {
      const form = new URLSearchParams(body);
      const [header, claims, signature] = String(form.get('assertion')).split('.');
      const good = verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), createPublicKey(publicKey), fromBase64url(signature));
      const said = JSON.parse(fromBase64url(claims).toString());
      if (!good || form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || said.iss !== 'insight@gra.iam.gserviceaccount.com' || !/androidpublisher/.test(said.scope)) return send(401, { error: 'invalid_grant' });
      google.tokens += 1;
      return send(200, { access_token: 'dostep', expires_in: 3600 });
    }
    if (request.headers.authorization !== 'Bearer dostep') return send(401, {});
    const base = '/apps/com.insightrpg.app/';
    if (!url.pathname.startsWith(base)) return send(404, {});
    const path = decodeURIComponent(url.pathname.slice(base.length));
    let match = /^purchases\/products\/([^/]+)\/tokens\/([^/]+):consume$/.exec(path);
    if (match && request.method === 'POST') {
      google.consumed.push(match[2]);
      const one = google.purchases.get(match[2]);
      if (one) one.consumptionState = 1;
      return send(200, {});
    }
    match = /^purchases\/products\/([^/]+)\/tokens\/([^/]+)$/.exec(path);
    if (match && request.method === 'GET') {
      const one = google.purchases.get(match[2]);
      return one && one.productId === match[1] ? send(200, { kind: 'androidpublisher#productPurchase', ...one }) : send(404, { error: { code: 404 } });
    }
    match = /^orders\/([^/]+):refund$/.exec(path);
    if (match && request.method === 'POST') {
      google.refunded.push(match[1]);
      return send(200, {});
    }
    if (path === 'purchases/voidedpurchases' && request.method === 'GET') return send(200, { voidedPurchases: google.voided });
    return send(404, {});
  });
});

// Listening before the Worker starts, which takes Google's addresses then.
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
google.port = mock.address().port;
after(() => mock.close());

const bought = (productId, orderId, extra = {}) => ({ productId, orderId, purchaseState: 0, consumptionState: 0, acknowledgementState: 0, purchaseTimeMillis: String(Date.now()), regionCode: 'PL', ...extra });

describe('the Google Play gateway', () => {
  test('is ready only with a service account of an e-mail and a private key', () => {
    assert.equal(googlePlayGateway.ready({ GOOGLE_PLAY_SERVICE_ACCOUNT: ACCOUNT }), true);
    assert.equal(googlePlayGateway.ready({}), false);
    assert.equal(googlePlayGateway.ready({ GOOGLE_PLAY_SERVICE_ACCOUNT: '{"client_email":"x@y"}' }), false);
    assert.equal(serviceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: 'nie json' }), null);
  });

  test('an order has no page of the gateway, only the product the app buys', async () => {
    assert.deepEqual(await googlePlayGateway.create({ packId: 'ps-1000' }), { ref: null, url: null, sku: 'ps_1000' });
  });

  test('a chargeback or a disputed purchase stops the account, other reasons are refunds', () => {
    assert.equal(voidedStatus(7), 'charged_back');
    assert.equal(voidedStatus(6), 'charged_back');
    assert.equal(voidedStatus(1), 'refunded');
    assert.equal(voidedStatus(0), 'refunded');
  });
});

describe('payments through Google Play, on the server', () => {
  const { server, call, db, signUp } = useServer({
    PAYMENTS: 'google-play',
    GOOGLE_PLAY_SERVICE_ACCOUNT: ACCOUNT,
    GOOGLE_PLAY_API: `http://127.0.0.1:${google.port}/apps`,
    GOOGLE_PLAY_TOKEN_URL: `http://127.0.0.1:${google.port}/token`,
  });

  async function buyer(name) {
    const { cookie } = await signUp(name);
    await call('POST', '/api/character', { cookie, body: { name: name[0].toUpperCase() + name.slice(1), classId: 'warrior', appearance: 'male' } });
    return cookie;
  }
  const points = async (cookie) => (await call('GET', '/api/character', { cookie })).data.character.systemPoints;
  const order = async (cookie, packId = 'ps-250') => (await call('POST', '/api/payments/order', { cookie, body: { packId, terms: true, adult: true } })).data;
  const confirm = (cookie, body) => call('POST', '/api/payments/play', { cookie, body });
  const cron = (at = Date.UTC(2026, 10, 14, 10, 0)) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });

  test('an order gives its product; the purchase credits once, after Google, and is consumed', async () => {
    const cookie = await buyer('kupiec');
    const before = await points(cookie);
    const placed = await order(cookie);
    assert.equal(placed.sku, 'ps_250');
    assert.equal(placed.url, null);
    google.purchases.set('token-kupca-1', bought('ps_250', 'GPA.1111-2222-3333-44444'));
    const first = await confirm(cookie, { orderId: placed.orderId, token: 'token-kupca-1' });
    assert.equal(first.status, 200);
    assert.equal(first.data.state, 'paid');
    assert.equal(first.data.purchase.status, 'paid');
    assert.equal(first.data.character.systemPoints, before + 250);
    assert.ok(google.consumed.includes('token-kupca-1'));
    // The same token again changes nothing.
    const again = await confirm(cookie, { orderId: placed.orderId, token: 'token-kupca-1' });
    assert.equal(again.data.state, 'paid');
    assert.equal(await points(cookie), before + 250);
    const row = await (await db()).prepare('SELECT provider_ref, provider_token, sandbox, consumed_at, country FROM purchases WHERE public_id = ?').bind(placed.orderId).first();
    assert.equal(row.provider_ref, 'GPA.1111-2222-3333-44444');
    assert.equal(row.provider_token, 'token-kupca-1');
    assert.equal(row.sandbox, 0);
    assert.ok(row.consumed_at);
    assert.equal(row.country, 'PL');
    // Another account cannot take it, and a token Google does not know is refused.
    const other = await buyer('obcy');
    const stolen = await confirm(other, { sku: 'ps_250', token: 'token-kupca-1' });
    assert.equal(stolen.status, 409);
    assert.equal(stolen.data.error.code, 'not_yours');
    const unknown = await confirm(other, { sku: 'ps_250', token: 'token-nieznany' });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.data.error.code, 'invalid_purchase');
  });

  test("a licence tester's purchase gives its points but counts to no limit", async () => {
    const cookie = await buyer('tester');
    const placed = await order(cookie, 'ps-2500');
    google.purchases.set('token-testera', bought('ps_2500', 'GPA.TEST-1', { purchaseType: 0 }));
    const done = await confirm(cookie, { orderId: placed.orderId, token: 'token-testera' });
    assert.equal(done.data.state, 'paid');
    assert.equal(done.data.purchase.sandbox, true);
    const shop = (await call('GET', '/api/payments', { cookie })).data;
    assert.equal(shop.provider, 'google-play');
    assert.equal(shop.spent, 0);
    assert.deepEqual(
      shop.packs.map((pack) => pack.playId),
      ['ps_250', 'ps_500', 'ps_1000', 'ps_2500'],
    );
  });

  test('a purchase Google keeps pending waits, and the cron credits it once Google has the money', async () => {
    const cookie = await buyer('cierpliwy');
    const before = await points(cookie);
    const placed = await order(cookie, 'ps-500');
    google.purchases.set('token-czeka', bought('ps_500', 'GPA.WAIT-1', { purchaseState: 2 }));
    const waiting = await confirm(cookie, { orderId: placed.orderId, token: 'token-czeka' });
    assert.equal(waiting.data.state, 'pending');
    assert.equal(await points(cookie), before);
    google.purchases.get('token-czeka').purchaseState = 0;
    await cron();
    assert.equal(await points(cookie), before + 500);
    assert.ok(google.consumed.includes('token-czeka'));
  });

  test('an order left in Google’s window closes at once; a purchase whose order the app lost is still credited', async () => {
    const cookie = await buyer('zapominalski');
    const before = await points(cookie);
    const left = await order(cookie, 'ps-1000');
    assert.equal((await call('POST', '/api/payments/cancel', { cookie, body: { orderId: left.orderId } })).status, 200);
    const closed = await (await db()).prepare('SELECT status FROM purchases WHERE public_id = ?').bind(left.orderId).first();
    assert.equal(closed.status, 'expired');
    // The purchase came after all, the app without its order: the closed
    // order of the same product takes it.
    google.purchases.set('token-zgubiony', bought('ps_1000', 'GPA.LOST-1'));
    const found = await confirm(cookie, { sku: 'ps_1000', token: 'token-zgubiony' });
    assert.equal(found.data.state, 'paid');
    assert.equal(found.data.purchase.id, left.orderId);
    assert.equal(await points(cookie), before + 1000);
    // No order at all: a new one is made for it.
    google.purchases.set('token-bez-zamowienia', bought('ps_250', 'GPA.LOST-2'));
    const made = await confirm(cookie, { sku: 'ps_250', token: 'token-bez-zamowienia' });
    assert.equal(made.data.state, 'paid');
    assert.notEqual(made.data.purchase.id, left.orderId);
    assert.equal(await points(cookie), before + 1250);
  });

  test('a refund within the days goes through orders.refund; a voided purchase takes its points back', async () => {
    const cookie = await buyer('zwracajacy');
    const before = await points(cookie);
    const placed = await order(cookie, 'ps-250');
    google.purchases.set('token-zwrot', bought('ps_250', 'GPA.REFUND-1'));
    await confirm(cookie, { orderId: placed.orderId, token: 'token-zwrot' });
    const withdrawn = await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: placed.orderId } });
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.data.purchase.status, 'refunded');
    assert.ok(google.refunded.includes('GPA.REFUND-1'));
    assert.equal(await points(cookie), before);
    // A purchase Google voided later (a chargeback): its points go back and
    // the account buys nothing more.
    const second = await order(cookie, 'ps-500');
    google.purchases.set('token-cofniety', bought('ps_500', 'GPA.VOID-1'));
    await confirm(cookie, { orderId: second.orderId, token: 'token-cofniety' });
    assert.equal(await points(cookie), before + 500);
    google.voided = [{ purchaseToken: 'token-cofniety', orderId: 'GPA.VOID-1', voidedReason: 7, voidedSource: 2 }];
    await cron(Date.UTC(2026, 10, 14, 10, 10));
    assert.equal(await points(cookie), before);
    const row = await (await db()).prepare('SELECT status FROM purchases WHERE public_id = ?').bind(second.orderId).first();
    assert.equal(row.status, 'charged_back');
    assert.equal((await call('GET', '/api/payments', { cookie })).data.blocked, true);
    google.voided = [];
  });
});
