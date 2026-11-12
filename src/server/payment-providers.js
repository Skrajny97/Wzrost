// The gateways the payments for Punkty Systemu go through (payments.js), by
// the name PAYMENTS gives (features.js). A gateway makes a payment for an
// order (`create`), reads its own signed news of the payment (`verify`),
// answers that news as it expects (`answer`) and gives the money back
// (`refund`). `ready` says whether the deployment has what the gateway needs;
// a gateway that is not ready is as off. Keys are Worker secrets from the
// GitHub secrets, never in the code.
//
// "autopay" is Autopay (805 D, the gateway an unregistered activity can
// have; DECISIONS.md, "Płatności: odpowiedzi autora 804–808"), by its
// documentation (developers.autopay.pl, "Bramka płatnicza", 11.11.2026):
// the payment is started from the server ("przedtransakcja"), which gets the
// address of Autopay's page where the player pays by BLIK or a transfer; the
// payment's news (ITN) comes as a form field `transactions` of XML in
// Base64, signed with SHA-256 of the values and the shared key; the answer
// is a signed XML confirmation; a refund is asked for through its
// settlement API and done by Autopay within half an hour. Its settings:
// AUTOPAY_SERVICE_ID and AUTOPAY_SHARED_KEY (secrets) and AUTOPAY_HOST, the
// gateway's address (testpay on the test version, pay in the game).
//
// "test" is the tests' own gateway. It takes no money: its payment has no
// page, and its news is JSON signed with HMAC-SHA256 under
// PAYMENTS_TEST_SECRET (the X-Test-Signature header), so a test plays the
// gateway. Without that secret it believes no news at all, so PAYMENTS set
// to "test" by mistake credits nobody.

import { toHex } from './encoding.js';
import { ApiError, json, readBody } from './http.js';

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

const sha256Hex = async (text) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

// Two signatures compared in the same time whatever they hold, any case.
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

const badSignature = () => new ApiError(401, 'bad_signature', 'Powiadomienie bez ważnego podpisu.');
const unreadable = () => new ApiError(400, 'invalid_notice', 'Nieczytelne powiadomienie.');
const gatewayDown = () => new ApiError(502, 'gateway_error', 'Bramka płatności nie przyjęła zamówienia. Spróbuj za chwilę.');

const STATUSES = ['paid', 'failed', 'refunded', 'charged_back'];

// How long the server waits for the gateway's answer to a start or a
// refund: a player's tap never hangs on a gateway that does not answer (a
// refund not answered waits for the author, payments.js).
const GATEWAY_WAIT_MS = 15000;
// A payment notice is a few kilobytes: one transaction. A bigger body is
// refused before the rest of it is read (review of 12.11.2026).
const NOTICE_BYTES = 64 * 1024;

const testGateway = {
  ready: () => true,
  async create({ orderId }) {
    return { ref: `test-${orderId}`, url: null };
  },
  async verify(request, env) {
    const secret = env.PAYMENTS_TEST_SECRET;
    const body = new TextDecoder().decode(await readBody(request, NOTICE_BYTES));
    const signature = request.headers.get('X-Test-Signature') ?? '';
    if (!secret || !sameText(signature, await hmacHex(secret, body))) throw badSignature();
    let notice;
    try {
      notice = JSON.parse(body);
    } catch {
      throw unreadable();
    }
    if (!STATUSES.includes(notice?.status)) throw unreadable();
    return {
      orderId: String(notice.orderId ?? ''),
      ref: String(notice.ref ?? ''),
      status: notice.status,
      amount: Number(notice.amount),
      currency: String(notice.currency ?? ''),
    };
  },
  // A refund is done at once, but for a payment whose number begins with
  // "refuse-" (not taken) or "later-" (taken, done later), so a test plays
  // a gateway that refunds later or not at all.
  async refund({ ref } = {}) {
    if (String(ref ?? '').startsWith('refuse-')) return { ok: false, done: false };
    if (String(ref ?? '').startsWith('later-')) return { ok: true, done: false };
    return { ok: true, done: true };
  },
  answer: (notice, env, confirmed) => json({ ok: confirmed }),
};

// --- Autopay ---------------------------------------------------------------

// Autopay's signature: SHA-256 of the values that are not empty, joined by
// "|", then "|" and the shared key, as lowercase hex.
export const autopayHash = (values, key) =>
  sha256Hex(`${values.filter((value) => value !== null && value !== undefined && String(value) !== '').join('|')}|${key}`);

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescapeXml = (text) =>
  text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole;
    return String.fromCodePoint(name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10));
  });
const escapeXml = (text) => String(text).replace(/[<>&"']/g, (char) => `&${Object.keys(ENTITIES).find((name) => ENTITIES[name] === char)};`);

// The leaf elements of Autopay's flat XML, in the document's order:
// [name, text] (workers have no DOMParser; Autopay's messages are plain
// elements, their values text only).
export function xmlLeaves(xml) {
  const leaves = [];
  for (const [, name, text] of String(xml).matchAll(/<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/\1\s*>/g)) leaves.push([name, unescapeXml(text)]);
  return leaves;
}
const leaf = (leaves, name) => leaves.find(([each]) => each === name)?.[1] ?? null;

// An amount Autopay writes ("4.99") in grosze, or NaN.
function grosze(text) {
  const match = /^(\d{1,14})\.(\d{2})$/.exec(String(text ?? '').trim());
  return match ? Number(match[1]) * 100 + Number(match[2]) : Number.NaN;
}

// The moment as Autopay takes a time ("2026-11-12 07:30:00", Polish time).
const autopayTime = (ms) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .format(new Date(ms))
    .replace('T', ' ');

const autopaySettings = (env) => ({ serviceId: String(env.AUTOPAY_SERVICE_ID ?? '').trim(), key: String(env.AUTOPAY_SHARED_KEY ?? ''), host: String(env.AUTOPAY_HOST ?? '').replace(/\/+$/, '') });

// The ITN's statuses, as the ledger has them; PENDING (a way of paying
// chosen) changes nothing.
const AUTOPAY_STATUS = { SUCCESS: 'paid', FAILURE: 'failed', PENDING: 'pending' };

export const autopayGateway = {
  ready(env) {
    const { serviceId, key, host } = autopaySettings(env);
    return /^\d{1,10}$/.test(serviceId) && key !== '' && /^https:\/\//.test(host);
  },

  // The payment started from the server: the fields in the order of the
  // documentation's hash, GatewayID 0 for Autopay's page with BLIK and the
  // banks, and the link valid until `validUntil`, after which a late
  // payment goes back to the payer. The answer gives the page to send the
  // player to and Autopay's number of the payment (remoteID).
  async create({ env, orderId, amount, currency, points, email, ip, validUntil }, fetcher = fetch) {
    const { serviceId, key, host } = autopaySettings(env);
    const fields = [
      ['ServiceID', serviceId],
      ['OrderID', orderId],
      ['Amount', (amount / 100).toFixed(2)],
      ['Description', `Insight - ${points} Punktow Systemu`],
      ['GatewayID', '0'],
      ['Currency', currency],
      ['CustomerEmail', email ?? ''],
      ['CustomerIP', ip ?? ''],
      ['ValidityTime', validUntil ? autopayTime(validUntil) : ''],
    ].filter(([, value]) => value !== '');
    fields.push(['Hash', await autopayHash(fields.map(([, value]) => value), key)]);
    let text;
    try {
      const response = await fetcher(`${host}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', BmHeader: 'pay-bm-continue-transaction-url' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(GATEWAY_WAIT_MS),
      });
      text = await response.text();
    } catch (error) {
      console.error(`autopay: no answer to the order ${orderId}: ${error?.message ?? error}`);
      throw gatewayDown();
    }
    const leaves = xmlLeaves(text);
    const status = leaf(leaves, 'status');
    const url = leaf(leaves, 'redirecturl');
    const remoteId = leaf(leaves, 'remoteID');
    const signed = await autopayHash([status, url, leaf(leaves, 'orderID'), remoteId], key);
    if (status !== 'PENDING' || !url || leaf(leaves, 'orderID') !== orderId || !sameText(leaf(leaves, 'hash') ?? '', signed) || !/^https:\/\//.test(url)) {
      console.error(`autopay: the order ${orderId} was not taken: ${leaf(leaves, 'description') ?? leaf(leaves, 'reason') ?? 'an answer without a page'}`);
      throw gatewayDown();
    }
    return { ref: remoteId, url };
  },

  // The ITN: one transaction, signed over every value in the document's
  // order but the hash's (customerData included, when it comes).
  async verify(request, env) {
    const { serviceId, key } = autopaySettings(env);
    let xml;
    try {
      // Read to at most NOTICE_BYTES, as every body (http.js readBody).
      const body = await readBody(request, NOTICE_BYTES);
      const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' } }).formData();
      const bytes = Uint8Array.from(atob(String(form.get('transactions') ?? '')), (char) => char.charCodeAt(0));
      xml = new TextDecoder('utf-8').decode(bytes);
    } catch {
      throw unreadable();
    }
    const leaves = xmlLeaves(xml);
    const hash = leaf(leaves, 'hash');
    const signed = await autopayHash(leaves.filter(([name]) => name !== 'hash').map(([, value]) => value), key);
    if (!hash || !sameText(hash, signed) || leaf(leaves, 'serviceID') !== serviceId) throw badSignature();
    const status = AUTOPAY_STATUS[leaf(leaves, 'paymentStatus')];
    if (!status) throw unreadable();
    return {
      orderId: leaf(leaves, 'orderID') ?? '',
      ref: leaf(leaves, 'remoteID') ?? '',
      status,
      amount: grosze(leaf(leaves, 'amount')),
      currency: leaf(leaves, 'currency') ?? '',
    };
  },

  // A whole payment given back: its remoteID, a message id the same for the
  // same purchase (so asking again does not refund twice), no amount. Autopay
  // takes it and does it later, so the purchase waits as refunding.
  async refund({ env, ref, orderId }, fetcher = fetch) {
    const { serviceId, key, host } = autopaySettings(env);
    if (!ref) return { ok: false, done: false };
    const messageId = (await sha256Hex(`refund:${orderId}`)).slice(0, 32);
    const fields = [
      ['ServiceID', serviceId],
      ['MessageID', messageId],
      ['RemoteID', ref],
    ];
    fields.push(['Hash', await autopayHash(fields.map(([, value]) => value), key)]);
    let text;
    try {
      const response = await fetcher(`${host}/settlementapi/transactionRefund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(GATEWAY_WAIT_MS),
      });
      text = await response.text();
    } catch (error) {
      console.error(`autopay: no answer to the refund of ${orderId}: ${error?.message ?? error}`);
      return { ok: false, done: false };
    }
    const leaves = xmlLeaves(text);
    const signed = await autopayHash([leaf(leaves, 'serviceID'), leaf(leaves, 'messageID')], key);
    const ok = leaf(leaves, 'messageID') === messageId && sameText(leaf(leaves, 'hash') ?? '', signed);
    if (!ok) console.error(`autopay: the refund of ${orderId} was not taken: ${leaf(leaves, 'description') ?? 'an answer without its signature'}`);
    return { ok, done: false };
  },

  // The answer to an ITN: CONFIRMED when the news is the order's own,
  // NOTCONFIRMED otherwise (Autopay sends it again later), signed.
  async answer(notice, env, confirmed) {
    const { serviceId, key } = autopaySettings(env);
    const confirmation = confirmed ? 'CONFIRMED' : 'NOTCONFIRMED';
    const hash = await autopayHash([serviceId, notice.orderId, confirmation], key);
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<confirmationList><serviceID>${escapeXml(serviceId)}</serviceID><transactionsConfirmations><transactionConfirmed>` +
      `<orderID>${escapeXml(notice.orderId)}</orderID><confirmation>${confirmation}</confirmation>` +
      `</transactionConfirmed></transactionsConfirmations><hash>${hash}</hash></confirmationList>`;
    return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
};

const GATEWAYS = { test: testGateway, autopay: autopayGateway };

// The gateway of `name` where this deployment has what it needs, or null.
export const providerFor = (name, env = {}) => {
  const gateway = GATEWAYS[name] ?? null;
  return gateway && gateway.ready(env) ? gateway : null;
};

// For the tests: the signature the test gateway's news carries.
export const testSignature = hmacHex;
