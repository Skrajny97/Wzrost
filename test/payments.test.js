// Payments for Punkty Systemu (src/server/payments.js, src/engine/payments.js;
// DECISIONS.md, "Płatności za Punkty Systemu: podwaliny"): off without
// PAYMENTS; with the tests' own gateway, an order before any payment, the
// points only from the gateway's signed news, once however often it comes,
// for the order's own amount; the won points spent first; a purchase given
// back within the days while its points are unspent; a chargeback taking
// back what is left and stopping the account's purchases; the limit; and
// the author's record of the sales.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import rules from '../data/payments.json' with { type: 'json' };
import { chargedBack, credited, orderBlock, packOf, spentFrom, spentLately, withdrawalBlock, withdrawn } from '../src/engine/index.js';
import { testSignature } from '../src/server/payment-providers.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const pack = (id) => packOf(rules, id);

describe('payments in the engine', () => {
  test('a pack by its id; nothing for another', () => {
    assert.deepEqual(pack('ps-250'), { id: 'ps-250', points: 250, price: 499 });
    assert.equal(pack('ps-7'), null);
    assert.equal(pack(250), null);
  });

  test('an order needs the terms, being of age, an account not stopped and room under the limit', () => {
    const consents = { terms: true, adult: true };
    const ok = { rules, pack: pack('ps-500'), consents, spent: 0, blocked: false };
    assert.equal(orderBlock(ok), null);
    assert.equal(orderBlock({ ...ok, pack: null }).code, 'invalid_pack');
    assert.equal(orderBlock({ ...ok, consents: { adult: true } }).code, 'terms_required');
    assert.equal(orderBlock({ ...ok, consents: { terms: true } }).code, 'adult_required');
    assert.equal(orderBlock({ ...ok, blocked: true }).code, 'purchases_blocked');
    assert.equal(orderBlock({ ...ok, spent: rules.monthlyLimit - 998 }).code, 'monthly_limit');
    assert.equal(orderBlock({ ...ok, spent: rules.monthlyLimit - 999 }), null);
    const zl = (grosze) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(grosze / 100);
    assert.equal(orderBlock({ ...ok, spent: rules.monthlyLimit - 500 }).message, `Limit zakupów to ${zl(40000)} na 30 dni. Do wykorzystania zostało ${zl(500)}.`);
    assert.match(zl(40000), /^400,00\s+zł$/);
  });

  test('the limit counts the paid and waiting purchases of the last days, not the refunded or failed', () => {
    const now = 100 * DAY;
    const purchases = [
      { status: 'paid', price: 999, createdAt: now - DAY },
      { status: 'pending', price: 499, createdAt: now - 2 * DAY },
      { status: 'refunded', price: 1999, createdAt: now - DAY },
      { status: 'failed', price: 4999, createdAt: now - DAY },
      { status: 'paid', price: 4999, createdAt: now - 31 * DAY },
    ];
    assert.equal(spentLately(purchases, now, rules), 1498);
  });

  test('spending takes the won points first, the bought last', () => {
    const bought = credited({ systemPoints: 100, systemPointsPaid: 0 }, 250);
    assert.deepEqual(bought, { systemPoints: 350, systemPointsPaid: 250 });
    assert.deepEqual(spentFrom(bought, 100), { systemPoints: 250, systemPointsPaid: 250 });
    assert.deepEqual(spentFrom(bought, 300), { systemPoints: 50, systemPointsPaid: 50 });
    assert.deepEqual(spentFrom(bought, 350), { systemPoints: 0, systemPointsPaid: 0 });
  });

  test('a purchase goes back within the days while its points are unspent', () => {
    const purchase = { status: 'paid', points: 250, paidAt: 10 * DAY };
    const balance = { systemPoints: 300, systemPointsPaid: 250 };
    const at = (now, more = {}) => withdrawalBlock({ rules, purchase, balance, now, ...more });
    assert.equal(at(10 * DAY + rules.withdrawalDays * DAY), null);
    assert.equal(at(10 * DAY + rules.withdrawalDays * DAY + 1).code, 'withdrawal_expired');
    assert.equal(at(11 * DAY, { balance: { systemPoints: 300, systemPointsPaid: 249 } }).code, 'points_spent');
    assert.equal(at(11 * DAY, { purchase: { ...purchase, status: 'refunded' } }).code, 'not_withdrawable');
    assert.equal(at(11 * DAY, { purchase: null }).code, 'not_withdrawable');
    assert.deepEqual(withdrawn(balance, 250), { systemPoints: 50, systemPointsPaid: 0 });
  });

  test('a chargeback takes back what is left, never below none', () => {
    assert.deepEqual(chargedBack({ systemPoints: 300, systemPointsPaid: 250 }, 250), { systemPoints: 50, systemPointsPaid: 0, debt: 0 });
    assert.deepEqual(chargedBack({ systemPoints: 100, systemPointsPaid: 100 }, 250), { systemPoints: 0, systemPointsPaid: 0, debt: 150 });
  });
});

describe('payments off', () => {
  const { call, signUp } = useServer();

  test('every route answers "not found" without PAYMENTS', async () => {
    const { cookie } = await signUp('kupiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Kupiec', classId: 'warrior', appearance: 'male' } });
    assert.equal((await call('GET', '/api/payments', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/payments/order', { cookie, body: { packId: 'ps-250', terms: true, adult: true } })).status, 404);
    assert.equal((await call('POST', '/api/payments/notify/test', { body: {} })).status, 404);
    assert.equal((await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: 'x' } })).status, 404);
  });
});

describe('payments through the test gateway', () => {
  const SECRET = 'tajny-klucz-testowy';
  const { server, call, db, signUp } = useServer({ PAYMENTS: 'test', PAYMENTS_TEST_SECRET: SECRET, AUTHOR_LOGINS: 'szef', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kupiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kupiec', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 30, system_points = 100 WHERE name = 'Kupiec'").run();
  });

  const order = (body = {}) => call('POST', '/api/payments/order', { cookie, body: { packId: 'ps-250', terms: true, adult: true, ...body } });
  const points = async () => (await db()).prepare("SELECT system_points, system_points_paid FROM characters WHERE name = 'Kupiec'").first();
  const purchase = async (id) => (await db()).prepare('SELECT * FROM purchases WHERE public_id = ?').bind(id).first();
  async function notify(body, secret = SECRET) {
    const text = JSON.stringify(body);
    const response = await server.fetch('/api/payments/notify/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Signature': await testSignature(secret, text) },
      body: text,
    });
    return response.status;
  }
  const paid = (orderId, more = {}) => notify({ orderId, ref: `test-${orderId}`, status: 'paid', amount: 499, currency: 'PLN', ...more });

  test('the shop shows the packs, the limit and nothing bought yet', async () => {
    const { status, data } = await call('GET', '/api/payments', { cookie });
    assert.equal(status, 200);
    assert.deepEqual(data.packs, rules.packs);
    assert.equal(data.spent, 0);
    assert.equal(data.blocked, false);
    assert.deepEqual(data.purchases, []);
  });

  test('an order waits; only the signed news of its own amount adds the points, once', async () => {
    assert.equal((await order({ terms: false })).status, 400);
    assert.equal((await order({ adult: false })).status, 403);
    assert.equal((await order({ packId: 'ps-9' })).status, 400);
    const { status, data } = await order();
    assert.equal(status, 201);
    assert.equal((await purchase(data.orderId)).status, 'pending');
    // News with a forged signature: nothing.
    assert.equal(await notify({ orderId: data.orderId, ref: `test-${data.orderId}`, status: 'paid', amount: 499, currency: 'PLN' }, 'zly-klucz'), 401);
    assert.deepEqual(await points(), { system_points: 100, system_points_paid: 0 });
    // The gateway's own: the pack's points, as bought ones.
    assert.equal(await paid(data.orderId), 200);
    assert.deepEqual(await points(), { system_points: 350, system_points_paid: 250 });
    // The same news again changes nothing.
    assert.equal(await paid(data.orderId), 200);
    assert.deepEqual(await points(), { system_points: 350, system_points_paid: 250 });
    const stored = await purchase(data.orderId);
    assert.equal(stored.status, 'paid');
    assert.equal(stored.points, 250);
    assert.equal(stored.price, 499);
    assert.equal(JSON.parse(stored.consents).terms, rules.termsVersion);
  });

  test('news of another amount or currency leaves the order waiting', async () => {
    const { data } = await order();
    assert.equal(await paid(data.orderId, { amount: 1 }), 200);
    assert.equal(await paid(data.orderId, { currency: 'EUR' }), 200);
    assert.equal((await purchase(data.orderId)).status, 'pending');
    assert.deepEqual(await points(), { system_points: 100, system_points_paid: 0 });
  });

  test('a cosmetic is paid with the won points first', async () => {
    const { data } = await order();
    await paid(data.orderId);
    const bought = await call('POST', '/api/cosmetics/buy', { cookie, body: { id: 'frame-gold' } });
    assert.equal(bought.status, 200);
    assert.deepEqual(await points(), { system_points: 50, system_points_paid: 50 });
  });

  test('a purchase goes back within the days while its points are unspent, never twice', async () => {
    const { data } = await order();
    await paid(data.orderId);
    const back = await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: data.orderId } });
    assert.equal(back.status, 200);
    assert.equal(back.data.purchase.status, 'refunded');
    assert.deepEqual(await points(), { system_points: 100, system_points_paid: 0 });
    assert.equal((await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: data.orderId } })).data.error.code, 'not_withdrawable');
  });

  test('a purchase whose points were spent, or past the days, does not go back', async () => {
    const first = (await order()).data.orderId;
    await paid(first);
    await call('POST', '/api/cosmetics/buy', { cookie, body: { id: 'frame-gold' } });
    assert.equal((await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: first } })).data.error.code, 'points_spent');
    const second = (await order()).data.orderId;
    await paid(second);
    await (await db()).prepare('UPDATE purchases SET paid_at = paid_at - ? WHERE public_id = ?').bind((rules.withdrawalDays + 1) * DAY, second).run();
    assert.equal((await call('POST', '/api/payments/withdraw', { cookie, body: { orderId: second } })).data.error.code, 'withdrawal_expired');
  });

  test('a chargeback takes the points back, never below none, and stops the purchases', async () => {
    const { data } = await order();
    await paid(data.orderId);
    await call('POST', '/api/cosmetics/buy', { cookie, body: { id: 'frame-gold' } });
    assert.equal(await notify({ orderId: data.orderId, status: 'charged_back', amount: 499, currency: 'PLN' }), 200);
    assert.deepEqual(await points(), { system_points: 0, system_points_paid: 0 });
    assert.equal((await purchase(data.orderId)).status, 'charged_back');
    assert.equal((await order()).data.error.code, 'purchases_blocked');
    assert.equal((await call('GET', '/api/payments', { cookie })).data.blocked, true);
  });

  test('the limit stops an order over it', async () => {
    for (let i = 0; i < 8; i += 1) assert.equal((await order({ packId: 'ps-2500' })).status, 201);
    const over = await order();
    assert.equal(over.status, 409);
    assert.equal(over.data.error.code, 'monthly_limit');
  });

  test('only the author sees the record of the sales', async () => {
    const { data } = await order();
    await paid(data.orderId);
    assert.equal((await call('GET', '/api/author/payments', { cookie })).status, 404);
    const { cookie: author } = await signUp('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    const record = (await call('GET', '/api/author/payments', { cookie: author })).data;
    assert.equal(record.days.length, 1);
    assert.equal(record.days[0].sales, 1);
    assert.equal(record.days[0].gross, 499);
    assert.equal(record.purchases[0].status, 'paid');
  });
});
