// Payments for Punkty Systemu (data/payments.json; payments.js in the
// engine; DECISIONS.md, "Płatności za Punkty Systemu: podwaliny"), only
// where PAYMENTS names a gateway (features.js, payment-providers.js); off,
// every route here answers "not found".
//
// The server keeps the ledger (purchases): an order is written before any
// payment, and only the gateway's signed news turns it paid, which adds the
// pack's points to the character, as bought ones (system_points_paid). The
// player's phone never says it paid, and the price is the data's, never
// the request's. Each change of a purchase and of the points goes in one
// batch, the purchase moved only from the state it was read in and marked
// with the request's own token, the points changed only for that token: the
// same news twice, or two at once, changes the points once.
//
// Within the days of data/payments.json a player gives a purchase back while
// its points are unspent (the EU's principles on in-game currencies): the
// points go at once, the money through the gateway. A refund or a
// chargeback the gateway reports takes the points back, never below none;
// after a chargeback the account buys nothing until the author clears it.

import rules from '../../data/payments.json' with { type: 'json' };
import { orderBlock, packOf, spentLately, withdrawalBlock } from '../engine/index.js';
import { isAuthor } from './author.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { paymentsProvider } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { providerFor } from './payment-providers.js';
import { requireSession } from './sessions.js';

const DAY = 24 * 3600000;
const STATUS = { invalid_pack: 400, terms_required: 400, adult_required: 403, purchases_blocked: 403, monthly_limit: 409, not_withdrawable: 409, withdrawal_expired: 409, points_spent: 409 };

const notFound = () => new ApiError(404, 'not_found', 'Nie znaleziono.');
const refuse = (block) => new ApiError(STATUS[block.code] ?? 409, block.code, block.message);
const newToken = () => toHex(crypto.getRandomValues(new Uint8Array(12)));

// The gateway the payments go through here, or "not found" where they are off.
function requireGateway() {
  const gateway = providerFor(paymentsProvider());
  if (!gateway) throw notFound();
  return gateway;
}

const purchaseOf = (row) => ({ status: row.status, price: row.price, points: row.points, createdAt: row.created_at, paidAt: row.paid_at });
const purchaseView = (row) => ({
  id: row.public_id,
  packId: row.pack_id,
  points: row.points,
  price: row.price,
  currency: row.currency,
  status: row.status,
  createdAt: row.created_at,
  paidAt: row.paid_at,
  closedAt: row.closed_at,
});

async function accountPurchases(db, userId) {
  const { results } = await db.prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').bind(userId).all();
  return results;
}

// GET /api/payments: the packs and their prices, what the account may still
// spend, and its purchases, newest first.
export async function getPayments(context) {
  requireGateway();
  const { session } = await requirePlayer(context);
  const db = context.env.DB;
  const [rows, user] = await Promise.all([
    accountPurchases(db, session.userId),
    db.prepare('SELECT purchases_blocked FROM users WHERE id = ?').bind(session.userId).first(),
  ]);
  return json({
    currency: rules.currency,
    packs: rules.packs.map(({ id, points, price }) => ({ id, points, price })),
    monthlyLimit: rules.monthlyLimit,
    limitDays: rules.limitDays,
    spent: spentLately(rows.map(purchaseOf), context.now, rules),
    withdrawalDays: rules.withdrawalDays,
    adultOnly: rules.adultOnly,
    termsVersion: rules.termsVersion,
    blocked: Boolean(user?.purchases_blocked),
    purchases: rows.slice(0, 20).map(purchaseView),
  });
}

// POST /api/payments/order { packId, terms, adult }: the order of a pack
// for the player's character, written before the payment, and the
// gateway's payment for it (`url`: where the player pays, where the
// gateway has a page). `terms` and `adult` are the player's own ticks.
export async function orderPoints(context) {
  const gateway = requireGateway();
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const [rows, user] = await Promise.all([
    accountPurchases(db, session.userId),
    db.prepare('SELECT purchases_blocked FROM users WHERE id = ?').bind(session.userId).first(),
  ]);
  const pack = packOf(rules, body.packId);
  const block = orderBlock({
    rules,
    pack,
    consents: { terms: body.terms, adult: body.adult },
    spent: spentLately(rows.map(purchaseOf), context.now, rules),
    blocked: Boolean(user?.purchases_blocked),
  });
  if (block) throw refuse(block);
  const orderId = newToken();
  // The country of the connection (Cloudflare's), one piece of the buyer's
  // place for the VAT across the EU (OSS).
  const country = typeof context.request.cf?.country === 'string' ? context.request.cf.country : null;
  const consents = JSON.stringify({ terms: rules.termsVersion, adult: body.adult === true, at: context.now });
  await db
    .prepare(
      `INSERT INTO purchases (public_id, user_id, character_id, pack_id, points, price, currency, country, provider, status, consents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(orderId, session.userId, player.row.id, pack.id, pack.points, pack.price, rules.currency, country, paymentsProvider(), consents, context.now)
    .run();
  const payment = await gateway.create({ env: context.env, orderId, amount: pack.price, currency: rules.currency, points: pack.points });
  if (payment.ref) await db.prepare('UPDATE purchases SET provider_ref = ? WHERE public_id = ?').bind(payment.ref, orderId).run();
  return json({ orderId, url: payment.url ?? null }, 201);
}

// A payment the gateway confirmed: the purchase paid (also one closed as
// unpaid, as the money came after all) and its points added, once. The
// amount and currency must be the purchase's own. Whether the points
// reached a character (none, if it was deleted in between) is returned.
async function markPaid(db, row, notice, now) {
  if (notice.amount !== row.price || notice.currency !== row.currency) {
    console.error(`payment ${row.public_id}: the amount or the currency differs from the order`);
    return 'mismatch';
  }
  const token = newToken();
  const [moved, added] = await db.batch([
    db
      .prepare("UPDATE purchases SET status = 'paid', paid_at = ?, closed_at = NULL, provider_ref = COALESCE(provider_ref, ?), credit_token = ? WHERE id = ? AND status IN ('pending', 'failed')")
      .bind(now, notice.ref || null, token, row.id),
    db
      .prepare(
        `UPDATE characters SET system_points = system_points + ?, system_points_paid = system_points_paid + ?, version = version + 1
         WHERE id = (SELECT character_id FROM purchases WHERE id = ? AND credit_token = ?)`,
      )
      .bind(row.points, row.points, row.id, token),
  ]);
  if (moved.meta.changes !== 1) return 'already';
  if (added.meta.changes !== 1) console.error(`payment ${row.public_id}: paid, but its character is gone`);
  return 'credited';
}

// The money given back outside the game (a refund in the gateway's panel)
// or taken back by the bank (a chargeback): a paid purchase's points taken
// back, never below none; a chargeback stops the account's purchases. A
// purchase given back from the game (refunding) had its points taken when
// it was asked for, so the gateway's word only closes it.
async function takeBack(db, row, status, now) {
  const token = newToken();
  const statements = [
    db.prepare("UPDATE purchases SET status = ?, closed_at = ?, credit_token = ? WHERE id = ? AND status = 'paid'").bind(status, now, token, row.id),
    db
      .prepare(
        `UPDATE characters SET system_points = MAX(system_points - ?, 0), system_points_paid = MAX(system_points_paid - ?, 0), version = version + 1
         WHERE id = (SELECT character_id FROM purchases WHERE id = ? AND credit_token = ?)`,
      )
      .bind(row.points, row.points, row.id, token),
    db.prepare("UPDATE purchases SET status = ?, closed_at = ? WHERE id = ? AND status = 'refunding'").bind(status, now, row.id),
  ];
  if (status === 'charged_back') {
    statements.push(db.prepare('UPDATE users SET purchases_blocked = 1 WHERE id = (SELECT user_id FROM purchases WHERE id = ? AND status = ?)').bind(row.id, status));
  }
  await db.batch(statements);
}

// POST /api/payments/notify/:provider: the gateway's signed news of a
// payment. News of an order the ledger does not know, or not of this
// gateway's, is acknowledged and changes nothing.
export async function paymentNotice(context) {
  const name = paymentsProvider();
  const gateway = providerFor(name);
  if (!gateway || context.params.provider !== name) throw notFound();
  const notice = await gateway.verify(context.request, context.env);
  const db = context.env.DB;
  const row = await db.prepare('SELECT * FROM purchases WHERE public_id = ? AND provider = ?').bind(notice.orderId, name).first();
  if (!row) {
    console.error('payment news of an unknown order');
    return gateway.answer();
  }
  if (notice.status === 'paid') await markPaid(db, row, notice, context.now);
  else if (notice.status === 'failed') {
    await db.prepare("UPDATE purchases SET status = 'failed', closed_at = ? WHERE id = ? AND status = 'pending'").bind(context.now, row.id).run();
  } else await takeBack(db, row, notice.status, context.now);
  return gateway.answer();
}

// POST /api/payments/withdraw { orderId }: one of the account's purchases
// given back within the days, its points still unspent: they go at once,
// the money back through the gateway.
export async function withdrawPurchase(context) {
  const gateway = requireGateway();
  const { session } = await requirePlayer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const row = await db.prepare('SELECT * FROM purchases WHERE public_id = ? AND user_id = ?').bind(String(body.orderId ?? ''), session.userId).first();
  const character = row && (await db.prepare('SELECT system_points, system_points_paid FROM characters WHERE id = ? AND user_id = ?').bind(row.character_id, session.userId).first());
  const block = withdrawalBlock({
    rules,
    purchase: row && character ? purchaseOf(row) : null,
    balance: character ? { systemPoints: character.system_points, systemPointsPaid: character.system_points_paid } : null,
    now: context.now,
  });
  if (block) throw refuse(block);
  const token = newToken();
  const [moved] = await db.batch([
    db
      .prepare("UPDATE purchases SET status = 'refunding', credit_token = ? WHERE id = ? AND status = 'paid' AND (SELECT system_points_paid FROM characters WHERE id = ?) >= points")
      .bind(token, row.id, row.character_id),
    db
      .prepare(
        `UPDATE characters SET system_points = system_points - ?, system_points_paid = system_points_paid - ?, version = version + 1
         WHERE id = (SELECT character_id FROM purchases WHERE id = ? AND credit_token = ?)`,
      )
      .bind(row.points, row.points, row.id, token),
  ]);
  if (moved.meta.changes !== 1) throw refuse({ code: 'not_withdrawable', message: 'Tego zakupu nie można już zwrócić.' });
  const refund = await gateway.refund({ env: context.env, ref: row.provider_ref, orderId: row.public_id, amount: row.price, currency: row.currency });
  if (refund.ok && refund.done) {
    await db.prepare("UPDATE purchases SET status = 'refunded', closed_at = ? WHERE id = ? AND status = 'refunding'").bind(context.now, row.id).run();
  } else if (!refund.ok) console.error(`refund of ${row.public_id} not accepted by the gateway; it waits as refunding`);
  const after = await db.prepare('SELECT * FROM purchases WHERE id = ?').bind(row.id).first();
  return json({ purchase: purchaseView(after), character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The day in Poland a time falls on, as YYYY-MM-DD.
const polishDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date(ms));

// GET /api/author/payments: for the author only, the sales of the last 30
// days by Polish day (the record the bookkeeping needs: number, gross
// amount, country, gateway, refunds) and the purchases that wait for a hand:
// refunds the gateway has not confirmed, paid ones whose character is gone.
export async function authorPayments(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw notFound();
  const db = context.env.DB;
  const since = context.now - 30 * DAY;
  const { results } = await db
    .prepare(
      `SELECT p.public_id, p.pack_id, p.points, p.price, p.currency, p.country, p.provider, p.status, p.created_at, p.paid_at, p.closed_at,
              (SELECT COUNT(*) FROM characters c WHERE c.id = p.character_id) AS character_kept
       FROM purchases p WHERE p.created_at >= ? OR p.status = 'refunding' ORDER BY p.created_at DESC LIMIT 1000`,
    )
    .bind(since)
    .all();
  const days = new Map();
  const day = (key) => days.get(key) ?? days.set(key, { date: key, sales: 0, gross: 0, refunds: 0, refunded: 0 }).get(key);
  for (const row of results) {
    if (row.paid_at) {
      const one = day(polishDay(row.paid_at));
      one.sales += 1;
      one.gross += row.price;
    }
    if ((row.status === 'refunded' || row.status === 'charged_back') && row.closed_at) {
      const one = day(polishDay(row.closed_at));
      one.refunds += 1;
      one.refunded += row.price;
    }
  }
  return json({
    currency: rules.currency,
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    waiting: results.filter((row) => row.status === 'refunding' || (row.status === 'paid' && !row.character_kept)).map(purchaseView),
    purchases: results.map((row) => ({ ...purchaseView(row), country: row.country, provider: row.provider })),
  });
}
