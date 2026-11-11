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
// Whether the gateway took the refund is kept (refund_state); one it did
// not take waits for the author (authorPaymentAction), who asks again,
// marks it given back or restores the purchase, and who also takes back the
// points of a purchase refunded in the gateway's own panel.
//
// The game sells as the author's unregistered activity (804 A), whose
// revenue has a limit in each quarter: an order is written only while what
// the game took in the quarter (paid and kept, or waiting for its payment),
// with the order, stays within data/payments.json's quarterLimit, and while
// the account's purchases of the last limitDays, with it, stay within
// monthlyLimit; both are checked in the same statement that writes it, so
// two orders at once cannot both pass. An order unpaid after pendingHours
// closes as expired; a payment that still comes for it credits it. An
// order whose try of paying failed is shown as failed, but keeps counting
// against both limits until it expires, as the player may still pay it.
//
// The points go only to the character the order was made for, of the same
// account, made before the order: the ids of a deleted account or character
// may be given again to new ones, so a deletion makes the ids in its
// purchases negative (accounts.js, characters.js), and a payment that comes
// after it credits nobody and waits for the author. A second payment of an
// order already paid (another number of the gateway's) credits nothing
// either: it is kept (purchase_extras) for the author to give back.

import rules from '../../data/payments.json' with { type: 'json' };
import { orderBlock, packOf, quarterAt, quarterBlock, quarterFits, spentLately, withdrawalBlock } from '../engine/index.js';
import { isAuthor } from './author.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { toHex } from './encoding.js';
import { paymentsOnlyForAuthors, paymentsProvider } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { providerFor } from './payment-providers.js';
import { requireSession } from './sessions.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const STATUS = {
  invalid_pack: 400,
  terms_required: 400,
  adult_required: 403,
  purchases_blocked: 403,
  monthly_limit: 409,
  sales_paused: 409,
  not_withdrawable: 409,
  withdrawal_expired: 409,
  points_spent: 409,
};

const notFound = () => new ApiError(404, 'not_found', 'Nie znaleziono.');
const refuse = (block) => new ApiError(STATUS[block.code] ?? 409, block.code, block.message);
const newToken = () => toHex(crypto.getRandomValues(new Uint8Array(12)));

// The gateway the payments go through here, or "not found" where they are
// off or the gateway's keys are missing.
function requireGateway(env) {
  const gateway = providerFor(paymentsProvider(), env);
  if (!gateway) throw notFound();
  return gateway;
}

// The player's purchases, or "not found" for an account that may not buy yet
// (PAYMENTS_FOR "authors": only the author's accounts, while the first real
// purchase is tried).
async function requireBuyer(context) {
  const found = await requirePlayer(context);
  if (paymentsOnlyForAuthors() && !isAuthor(context.env, found.session.user)) throw notFound();
  return found;
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

// The account's orders left unpaid longer than an order waits, closed as
// unpaid.
const expireOrders = (db, userId, now) =>
  db
    .prepare("UPDATE purchases SET status = 'expired', closed_at = ? WHERE user_id = ? AND status = 'pending' AND created_at <= ?")
    .bind(now, userId, now - rules.pendingHours * HOUR)
    .run();

// What the game took in the quarter, as SQL with its three values (the
// quarter's start, twice, and the moment before which an order no longer
// waits): the purchases paid in it and kept or being given back, and the
// orders made in it that can still be paid (waiting, or a try failed).
const TAKEN = `SELECT COALESCE(SUM(price), 0) FROM purchases
  WHERE (status IN ('paid', 'refunding') AND paid_at >= ?) OR (status IN ('pending', 'failed') AND created_at >= ? AND created_at > ?)`;
const takenValues = (quarter, now) => [quarter.startsAt, quarter.startsAt, now - rules.pendingHours * HOUR];

// What an account paid lately, as SQL with its three values (the account,
// the start of the last limitDays, the moment before which an order no
// longer waits): its paid purchases and its orders that can still be
// paid, as the engine's spentLately counts them.
const SPENT = `SELECT COALESCE(SUM(price), 0) FROM purchases
  WHERE user_id = ? AND created_at > ? AND (status = 'paid' OR (status IN ('pending', 'failed') AND created_at > ?))`;
const spentValues = (userId, now) => [userId, now - rules.limitDays * DAY, now - rules.pendingHours * HOUR];

// The character a purchase's points go to, as SQL with the purchase's id
// three times: the purchase's own, of the same account, made before the
// order (the ids of deleted ones are given again).
const BUYER = `id = (SELECT character_id FROM purchases WHERE id = ?)
  AND user_id = (SELECT user_id FROM purchases WHERE id = ?) AND created_at <= (SELECT created_at FROM purchases WHERE id = ?)`;

// The gateway's word on a refund, as the ledger keeps it.
const refundState = (refund) => (refund.ok ? (refund.done ? 'done' : 'asked') : 'refused');

async function quarterTaken(db, quarter, now) {
  const row = await db.prepare(`SELECT (${TAKEN}) AS taken`).bind(...takenValues(quarter, now)).first();
  return row?.taken ?? 0;
}

// GET /api/payments: the packs and their prices, what the account may still
// spend, and its purchases, newest first.
// A pack the quarter has no room for is not `available`, and `resumesAt` is
// when the next quarter sells it again.
export async function getPayments(context) {
  requireGateway(context.env);
  const { session } = await requireBuyer(context);
  const db = context.env.DB;
  await expireOrders(db, session.userId, context.now);
  const quarter = quarterAt(context.now, rules);
  const [rows, user, taken] = await Promise.all([
    accountPurchases(db, session.userId),
    db.prepare('SELECT purchases_blocked FROM users WHERE id = ?').bind(session.userId).first(),
    quarterTaken(db, quarter, context.now),
  ]);
  const packs = rules.packs.map(({ id, points, price }) => ({ id, points, price, available: quarterFits(rules, taken, { price }) }));
  return json({
    currency: rules.currency,
    packs,
    resumesAt: packs.every((pack) => pack.available) ? null : quarter.endsAt,
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
  const gateway = requireGateway(context.env);
  const { session, player } = await requireBuyer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  await expireOrders(db, session.userId, context.now);
  const quarter = quarterAt(context.now, rules);
  const [rows, user, taken] = await Promise.all([
    accountPurchases(db, session.userId),
    db.prepare('SELECT purchases_blocked, email FROM users WHERE id = ?').bind(session.userId).first(),
    quarterTaken(db, quarter, context.now),
  ]);
  const pack = packOf(rules, body.packId);
  const block = orderBlock({
    rules,
    pack,
    consents: { terms: body.terms, adult: body.adult },
    spent: spentLately(rows.map(purchaseOf), context.now, rules),
    blocked: Boolean(user?.purchases_blocked),
    taken,
    quarter,
  });
  if (block) throw refuse(block);
  const orderId = newToken();
  // The country of the connection (Cloudflare's), one piece of the buyer's
  // place for the VAT across the EU (OSS).
  const country = typeof context.request.cf?.country === 'string' ? context.request.cf.country : null;
  const consents = JSON.stringify({ terms: rules.termsVersion, adult: body.adult === true, at: context.now });
  // Written only if the quarter and the account's limit still have room for
  // it, counted in the same statement: two orders at once never both pass.
  const written = await db
    .prepare(
      `INSERT INTO purchases (public_id, user_id, character_id, pack_id, points, price, currency, country, provider, status, consents, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
       WHERE (? IS NULL OR (${TAKEN}) + ? <= ?) AND (${SPENT}) + ? <= ?`,
    )
    .bind(
      orderId,
      session.userId,
      player.row.id,
      pack.id,
      pack.points,
      pack.price,
      rules.currency,
      country,
      paymentsProvider(),
      consents,
      context.now,
      rules.quarterLimit,
      ...takenValues(quarter, context.now),
      pack.price,
      rules.quarterLimit,
      ...spentValues(session.userId, context.now),
      pack.price,
      rules.monthlyLimit,
    )
    .run();
  if (written.meta.changes !== 1) {
    // Another order took the room meanwhile: the account's limit or the
    // quarter's, whichever it now is.
    const [now, takenNow] = await Promise.all([accountPurchases(db, session.userId), quarterTaken(db, quarter, context.now)]);
    const spent = spentLately(now.map(purchaseOf), context.now, rules);
    throw refuse(orderBlock({ rules, pack, consents: { terms: true, adult: true }, spent, blocked: false, taken: takenNow, quarter }) ?? quarterBlock(rules, quarter));
  }
  // The gateway's payment, valid as long as the order waits; one the gateway
  // does not take closes the order at once, so it holds no limit.
  let payment;
  try {
    payment = await gateway.create({
      env: context.env,
      orderId,
      amount: pack.price,
      currency: rules.currency,
      points: pack.points,
      email: user?.email ?? null,
      ip: context.request.headers.get('CF-Connecting-IP'),
      validUntil: context.now + rules.pendingHours * HOUR,
    });
  } catch (error) {
    // Never payable, it is closed as unpaid at once ('expired'), so it
    // holds no limit.
    await db.prepare("UPDATE purchases SET status = 'expired', closed_at = ? WHERE public_id = ? AND status = 'pending'").bind(context.now, orderId).run();
    throw error;
  }
  if (payment.ref) await db.prepare('UPDATE purchases SET provider_ref = ? WHERE public_id = ?').bind(payment.ref, orderId).run();
  return json({ orderId, url: payment.url ?? null }, 201);
}

// A payment the gateway confirmed: the purchase paid (also one closed as
// failed or expired, as the money came after all) and its points added,
// once, to the character it was made for (BUYER). The amount and currency
// must be the purchase's own. The gateway's number of the payment that
// succeeded is kept (a player can try another way of paying within one
// order, each with its own number), as a refund needs it. A payment of an
// order already paid under another number is the player's second one: it
// is kept for the author to give back ('extra'). Returned: 'credited',
// 'already' (the same news again), 'extra' or 'mismatch'.
async function markPaid(db, row, notice, now) {
  if (notice.amount !== row.price || notice.currency !== row.currency) {
    console.error(`payment ${row.public_id}: the amount or the currency differs from the order`);
    return 'mismatch';
  }
  const token = newToken();
  const [moved, added] = await db.batch([
    db
      .prepare("UPDATE purchases SET status = 'paid', paid_at = ?, closed_at = NULL, provider_ref = COALESCE(?, provider_ref), credit_token = ? WHERE id = ? AND status IN ('pending', 'failed', 'expired')")
      .bind(now, notice.ref || null, token, row.id),
    db
      .prepare(
        `UPDATE characters SET system_points = system_points + ?, system_points_paid = system_points_paid + ?, version = version + 1
         WHERE ${BUYER} AND (SELECT credit_token FROM purchases WHERE id = ?) = ?`,
      )
      .bind(row.points, row.points, row.id, row.id, row.id, row.id, token),
  ]);
  if (moved.meta.changes !== 1) {
    const current = await db.prepare('SELECT provider_ref FROM purchases WHERE id = ?').bind(row.id).first();
    if (!notice.ref || notice.ref === current?.provider_ref) return 'already';
    const kept = await db
      .prepare('INSERT OR IGNORE INTO purchase_extras (purchase_id, provider, provider_ref, amount, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.provider, notice.ref, notice.amount, notice.currency, now)
      .run();
    if (kept.meta.changes === 1) console.error(`payment ${row.public_id}: a second payment (${notice.ref}) of an order already paid; it waits for the author to give it back`);
    return 'extra';
  }
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
         WHERE ${BUYER} AND (SELECT credit_token FROM purchases WHERE id = ?) = ?`,
      )
      .bind(row.points, row.points, row.id, row.id, row.id, row.id, token),
    db.prepare("UPDATE purchases SET status = ?, closed_at = ? WHERE id = ? AND status = 'refunding'").bind(status, now, row.id),
  ];
  if (status === 'charged_back') {
    statements.push(db.prepare('UPDATE users SET purchases_blocked = 1 WHERE id = (SELECT user_id FROM purchases WHERE id = ? AND status = ?)').bind(row.id, status));
  }
  const [moved] = await db.batch(statements);
  return moved.meta.changes === 1;
}

// POST /api/payments/notify/:provider: the gateway's signed news of a
// payment, answered as the gateway expects: confirmed, or, for news of an
// order the ledger does not know or of another amount, not confirmed (the
// gateway sends it again later, and the log tells of it). News that a way of
// paying was chosen (pending) changes nothing. News that a try of paying
// failed shows the order as failed, but it still counts against the limits
// until it expires, as the player may still pay it another way from the
// same page (and it is credited then). News the server cannot read or whose
// signature is wrong is refused and written in the log.
export async function paymentNotice(context) {
  const name = paymentsProvider();
  const gateway = providerFor(name, context.env);
  if (!gateway || context.params.provider !== name) throw notFound();
  let notice;
  try {
    notice = await gateway.verify(context.request, context.env);
  } catch (error) {
    console.error(`payment news refused: ${error?.code ?? error?.message ?? error}`);
    throw error;
  }
  const db = context.env.DB;
  const row = await db.prepare('SELECT * FROM purchases WHERE public_id = ? AND provider = ?').bind(notice.orderId, name).first();
  if (!row) {
    console.error('payment news of an unknown order');
    return gateway.answer(notice, context.env, false);
  }
  let confirmed = true;
  if (notice.status === 'paid') confirmed = (await markPaid(db, row, notice, context.now)) !== 'mismatch';
  else if (notice.status === 'failed') {
    await db.prepare("UPDATE purchases SET status = 'failed', closed_at = ? WHERE id = ? AND status = 'pending'").bind(context.now, row.id).run();
  } else if (notice.status === 'refunded' || notice.status === 'charged_back') await takeBack(db, row, notice.status, context.now);
  return gateway.answer(notice, context.env, confirmed);
}

// GET /api/payments/return: the player back from the gateway's page, sent on
// to the shop's page of the points, which shows the order waiting until the
// gateway's news comes (what the gateway adds to this address says nothing
// of the payment, so nothing of it is read). A page that answers 200 and
// moves on by itself, so a check of the address in the gateway's panel finds
// it working whether or not it follows a redirect.
const RETURN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=/#/sklep/punkty"><title>Insight</title></head>
<body><p><a href="/#/sklep/punkty">Insight</a></p><script>location.replace('/#/sklep/punkty');</script></body></html>`;

export function paymentReturn() {
  return new Response(RETURN_PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// GET /api/payments/notify/:provider: the address of the gateway's news
// answers that it is there (a panel may check it when it is set); the news
// itself comes by POST.
export const paymentNoticeAddress = () => new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// POST /api/payments/withdraw { orderId }: one of the account's purchases
// given back within the days, its points still unspent: they go at once,
// the money back through the gateway.
export async function withdrawPurchase(context) {
  const gateway = requireGateway(context.env);
  const { session } = await requireBuyer(context);
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
         WHERE ${BUYER} AND (SELECT credit_token FROM purchases WHERE id = ?) = ?`,
      )
      .bind(row.points, row.points, row.id, row.id, row.id, row.id, token),
  ]);
  if (moved.meta.changes !== 1) throw refuse({ code: 'not_withdrawable', message: 'Tego zakupu nie można już zwrócić.' });
  await askRefund(db, gateway, context.env, row, context.now);
  const after = await db.prepare('SELECT * FROM purchases WHERE id = ?').bind(row.id).first();
  return json({ purchase: purchaseView(after), character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The money of a purchase being given back ('refunding') asked of the
// gateway, and its word kept: done at once closes it as refunded; taken
// ('asked') or not taken ('refused', also no answer) leaves it refunding,
// the latter for the author to ask again.
async function askRefund(db, gateway, env, row, now) {
  const refund = await gateway.refund({ env, ref: row.provider_ref, orderId: row.public_id, amount: row.price, currency: row.currency });
  const state = refundState(refund);
  if (!refund.ok) console.error(`refund of ${row.public_id} not taken by the gateway; it waits for the author`);
  await db
    .prepare(
      `UPDATE purchases SET refund_state = ?, refund_at = ?, status = CASE WHEN ? = 'done' THEN 'refunded' ELSE status END,
         closed_at = CASE WHEN ? = 'done' THEN ? ELSE closed_at END
       WHERE id = ? AND status = 'refunding'`,
    )
    .bind(state, now, state, state, now, row.id)
    .run();
  return state;
}

// The day in Poland a time falls on, as YYYY-MM-DD.
const polishDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: rules.timeZone }).format(new Date(ms));

// GET /api/author/payments: for the author only, the sales of the last 30
// days by Polish day (the record the bookkeeping needs: number, gross
// amount, country, gateway, refunds), the quarter against the limit of an
// unregistered activity (paid and kept, waiting for the payment, the
// limit), and the purchases that wait for a hand: refunds the gateway has
// not confirmed, paid ones whose character is gone.
export async function authorPayments(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw notFound();
  const db = context.env.DB;
  const since = context.now - 30 * DAY;
  const quarter = quarterAt(context.now, rules);
  const sums = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('paid', 'refunding') AND paid_at >= ? THEN price ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN status IN ('pending', 'failed') AND created_at >= ? AND created_at > ? THEN price ELSE 0 END), 0) AS waiting
       FROM purchases`,
    )
    .bind(...takenValues(quarter, context.now))
    .first();
  const { results } = await db
    .prepare(
      `SELECT p.public_id, p.pack_id, p.points, p.price, p.currency, p.country, p.provider, p.status, p.refund_state, p.created_at, p.paid_at, p.closed_at,
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
  const extras = await db
    .prepare(
      `SELECT e.id, e.provider_ref, e.amount, e.currency, e.status, e.refund_state, e.created_at, e.closed_at, p.public_id
       FROM purchase_extras e JOIN purchases p ON p.id = e.purchase_id
       WHERE e.status != 'refunded' OR e.created_at >= ? ORDER BY e.created_at DESC LIMIT 200`,
    )
    .bind(since)
    .all();
  const authorView = (row) => ({ ...purchaseView(row), country: row.country, provider: row.provider, refundState: row.refund_state ?? null });
  return json({
    currency: rules.currency,
    quarter: { startsAt: quarter.startsAt, endsAt: quarter.endsAt, limit: rules.quarterLimit, paid: sums?.paid ?? 0, waiting: sums?.waiting ?? 0 },
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    waiting: results.filter((row) => row.status === 'refunding' || (row.status === 'paid' && !row.character_kept)).map(authorView),
    // Second payments of orders already paid, to give back (markPaid).
    extras: extras.results.map((row) => ({
      id: row.id,
      orderId: row.public_id,
      ref: row.provider_ref,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      refundState: row.refund_state ?? null,
      createdAt: row.created_at,
      closedAt: row.closed_at,
    })),
    purchases: results.map(authorView),
  });
}

// POST /api/author/payments/action { orderId, action, extraId }: for the
// author only, what a purchase waiting for a hand needs:
// - 'refund_again': a purchase being given back whose refund the gateway did
//   not take (or that waits too long) is asked of the gateway again; the
//   same purchase's refund is the same message, so it is never done twice;
// - 'refund_done': the author saw the money go back in the gateway's panel,
//   and the purchase closes as refunded;
// - 'restore': a purchase being given back stays after all (the refund
//   cannot be made, or the player asked to keep it): paid again, with its
//   points back to its character;
// - 'take_back': the money of a paid purchase was given back in the
//   gateway's own panel, so its points go back, as a refund the gateway
//   reports takes them;
// - 'extra_refund' and 'extra_done' (with `extraId`): a second payment of
//   the order asked back of the gateway, or marked given back.
// Answers with the record, as GET /api/author/payments does.
export async function authorPaymentAction(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw notFound();
  const body = await readJson(context.request);
  const db = context.env.DB;
  const row = await db.prepare('SELECT * FROM purchases WHERE public_id = ?').bind(String(body.orderId ?? '')).first();
  if (!row) throw new ApiError(404, 'no_purchase', 'Nie ma takiego zakupu.');
  const wrong = () => new ApiError(409, 'wrong_state', 'Ten zakup jest już w innym stanie. Odśwież listę.');
  const now = context.now;
  switch (body.action) {
    case 'refund_again': {
      if (row.status !== 'refunding') throw wrong();
      await askRefund(db, requireGateway(context.env), context.env, row, now);
      break;
    }
    case 'refund_done': {
      const done = await db.prepare("UPDATE purchases SET status = 'refunded', closed_at = ? WHERE id = ? AND status = 'refunding'").bind(now, row.id).run();
      if (done.meta.changes !== 1) throw wrong();
      break;
    }
    case 'restore': {
      const token = newToken();
      const [moved] = await db.batch([
        db
          .prepare("UPDATE purchases SET status = 'paid', closed_at = NULL, refund_state = NULL, refund_at = NULL, credit_token = ? WHERE id = ? AND status = 'refunding'")
          .bind(token, row.id),
        db
          .prepare(
            `UPDATE characters SET system_points = system_points + ?, system_points_paid = system_points_paid + ?, version = version + 1
             WHERE ${BUYER} AND (SELECT credit_token FROM purchases WHERE id = ?) = ?`,
          )
          .bind(row.points, row.points, row.id, row.id, row.id, row.id, token),
      ]);
      if (moved.meta.changes !== 1) throw wrong();
      break;
    }
    case 'take_back': {
      if (row.status !== 'paid' || !(await takeBack(db, row, 'refunded', now))) throw wrong();
      break;
    }
    case 'extra_refund':
    case 'extra_done': {
      const extra = await db.prepare('SELECT * FROM purchase_extras WHERE id = ? AND purchase_id = ?').bind(Number(body.extraId), row.id).first();
      if (!extra || extra.status === 'refunded') throw wrong();
      if (body.action === 'extra_done') {
        await db.prepare("UPDATE purchase_extras SET status = 'refunded', closed_at = ? WHERE id = ? AND status != 'refunded'").bind(now, extra.id).run();
        break;
      }
      // Its own message, apart from the purchase's refund.
      const refund = await requireGateway(context.env).refund({ env: context.env, ref: extra.provider_ref, orderId: `${row.public_id}:${extra.provider_ref}`, amount: extra.amount, currency: extra.currency });
      const state = refundState(refund);
      if (!refund.ok) console.error(`refund of the second payment ${extra.provider_ref} of ${row.public_id} not taken by the gateway`);
      await db
        .prepare(
          `UPDATE purchase_extras SET refund_state = ?, refund_at = ?, status = CASE WHEN ? = 'done' THEN 'refunded' ELSE 'refunding' END,
             closed_at = CASE WHEN ? = 'done' THEN ? ELSE closed_at END
           WHERE id = ? AND status != 'refunded'`,
        )
        .bind(state, now, state, state, now, extra.id)
        .run();
      break;
    }
    default:
      throw new ApiError(400, 'invalid_action', 'Nie ma takiego działania.');
  }
  return authorPayments(context);
}
