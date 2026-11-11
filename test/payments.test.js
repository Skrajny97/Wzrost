// Payments for Punkty Systemu (src/server/payments.js, src/engine/payments.js;
// DECISIONS.md, "Płatności za Punkty Systemu: podwaliny"): off without
// PAYMENTS; with the tests' own gateway, an order before any payment, the
// points only from the gateway's signed news, once however often it comes,
// for the order's own amount; the won points spent first; a purchase given
// back within the days while its points are unspent; a chargeback taking
// back what is left and stopping the account's purchases; the limits, of
// an account and of the quarter (804 A, an unregistered activity); an
// unpaid order closing after a day; and the author's record of the sales.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import rules from '../data/payments.json' with { type: 'json' };
import { chargedBack, credited, orderBlock, packOf, quarterAt, quarterFits, spentFrom, spentLately, withdrawalBlock, withdrawn } from '../src/engine/index.js';
import { testSignature } from '../src/server/payment-providers.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
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

  test('the limit counts the paid and waiting purchases of the last days, not the refunded, failed or long unpaid', () => {
    const now = 100 * DAY;
    const purchases = [
      { status: 'paid', price: 999, createdAt: now - DAY },
      { status: 'pending', price: 499, createdAt: now - 2 * HOUR },
      { status: 'pending', price: 1999, createdAt: now - 2 * DAY },
      { status: 'refunded', price: 1999, createdAt: now - DAY },
      { status: 'failed', price: 4999, createdAt: now - DAY },
      { status: 'paid', price: 4999, createdAt: now - 31 * DAY },
    ];
    assert.equal(spentLately(purchases, now, rules), 1498);
  });

  test('a quarter of the year on the Polish clock', () => {
    const quarter = quarterAt(Date.UTC(2026, 10, 11, 6), rules);
    assert.equal(new Date(quarter.startsAt).toISOString(), '2026-09-30T22:00:00.000Z');
    assert.equal(new Date(quarter.endsAt).toISOString(), '2026-12-31T23:00:00.000Z');
    // Half an hour into the new year in Poland is the next quarter, which
    // ends on the Polish summer time.
    const next = quarterAt(Date.UTC(2026, 11, 31, 23, 30), rules);
    assert.equal(next.startsAt, quarter.endsAt);
    assert.equal(new Date(next.endsAt).toISOString(), '2027-03-31T22:00:00.000Z');
  });

  test('a pack is sold while the quarter has room for it, and again from the next quarter', () => {
    const quarter = quarterAt(Date.UTC(2026, 10, 11, 6), rules);
    const ok = { rules, pack: pack('ps-500'), consents: { terms: true, adult: true }, spent: 0, blocked: false, quarter };
    assert.equal(orderBlock({ ...ok, taken: rules.quarterLimit - 999 }), null);
    const paused = orderBlock({ ...ok, taken: rules.quarterLimit - 998 });
    assert.equal(paused.code, 'sales_paused');
    assert.equal(paused.message, 'Ten pakiet będzie można kupić od 1.01.2027.');
    assert.equal(quarterFits({ ...rules, quarterLimit: null }, 10 ** 9, pack('ps-2500')), true);
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

describe('payments only for the author first', () => {
  const { call, db, signUp } = useServer({ PAYMENTS: 'test', PAYMENTS_TEST_SECRET: 'tajny', PAYMENTS_FOR: 'authors', AUTHOR_LOGINS: 'szef' });

  test("a player does not see them yet, the author's account does", async () => {
    const { cookie } = await signUp('kupiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Kupiec', classId: 'warrior', appearance: 'male' } });
    assert.equal((await call('GET', '/api/payments', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/payments/order', { cookie, body: { packId: 'ps-250', terms: true, adult: true } })).status, 404);
    const { cookie: author } = await signUp('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    await call('POST', '/api/character', { cookie: author, body: { name: 'Szef', classId: 'mage', appearance: 'female' } });
    assert.equal((await call('GET', '/api/payments', { cookie: author })).status, 200);
    assert.equal((await call('POST', '/api/payments/order', { cookie: author, body: { packId: 'ps-250', terms: true, adult: true } })).status, 201);
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
    assert.deepEqual(data.packs, rules.packs.map((one) => ({ ...one, available: true })));
    assert.equal(data.resumesAt, null);
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

  test("the quarter's limit stops the packs that no longer fit until the next quarter", async () => {
    // Others' purchases paid this quarter, 6 zł short of the limit.
    const now = Date.now();
    await (await db())
      .prepare(
        `INSERT INTO purchases (public_id, user_id, character_id, pack_id, points, price, currency, provider, status, consents, created_at, paid_at)
         VALUES ('inni', 999, 999, 'ps-2500', 2500, ?, 'PLN', 'test', 'paid', '{}', ?, ?)`,
      )
      .bind(rules.quarterLimit - 600, now, now)
      .run();
    const shop = (await call('GET', '/api/payments', { cookie })).data;
    assert.deepEqual(
      shop.packs.map((one) => one.available),
      [true, false, false, false],
    );
    assert.ok(shop.resumesAt > now);
    assert.equal((await order()).status, 201);
    // The first order waits for its payment, so it counts.
    const over = await order();
    assert.equal(over.status, 409);
    assert.equal(over.data.error.code, 'sales_paused');
    assert.match(over.data.error.message, /^Ten pakiet będzie można kupić od \d{1,2}\.\d{2}\.\d{4}\.$/);
  });

  test('an order unpaid for longer than it waits closes, and a payment that still comes credits it', async () => {
    const { data } = await order();
    await (await db())
      .prepare('UPDATE purchases SET created_at = created_at - ? WHERE public_id = ?')
      .bind((rules.pendingHours + 1) * HOUR, data.orderId)
      .run();
    const shop = (await call('GET', '/api/payments', { cookie })).data;
    assert.equal(shop.purchases[0].status, 'expired');
    assert.equal(shop.spent, 0);
    assert.equal(await paid(data.orderId), 200);
    assert.equal((await purchase(data.orderId)).status, 'paid');
    assert.deepEqual(await points(), { system_points: 350, system_points_paid: 250 });
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
    assert.equal(record.quarter.paid, 499);
    assert.equal(record.quarter.waiting, 0);
    assert.equal(record.quarter.limit, rules.quarterLimit);
  });
});
