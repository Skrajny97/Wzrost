// The gateways the payments for Punkty Systemu go through (payments.js), by
// the name PAYMENTS gives (features.js). A gateway makes a payment for an
// order (`create`), reads its own signed news of the payment (`verify`),
// gives the money back (`refund`) and answers its news as it expects
// (`answer`). The real one (Tpay, PayU, Autopay or Paynow: question 805)
// comes here once the author picks it, its keys as Worker secrets from the
// GitHub secrets, never in the code.
//
// "test" is the tests' own gateway. It takes no money: its payment has no
// page, and its news is JSON signed with HMAC-SHA256 under
// PAYMENTS_TEST_SECRET (the X-Test-Signature header), so a test plays the
// gateway. Without that secret it believes no news at all, so PAYMENTS set
// to "test" by mistake credits nobody.

import { toHex } from './encoding.js';
import { ApiError, json } from './http.js';

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

// Two signatures compared in the same time whatever they hold.
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

const STATUSES = ['paid', 'failed', 'refunded', 'charged_back'];

const testGateway = {
  async create({ orderId }) {
    return { ref: `test-${orderId}`, url: null };
  },
  async verify(request, env) {
    const secret = env.PAYMENTS_TEST_SECRET;
    const body = await request.text();
    const signature = request.headers.get('X-Test-Signature') ?? '';
    if (!secret || !sameText(signature, await hmacHex(secret, body))) {
      throw new ApiError(401, 'bad_signature', 'Powiadomienie bez ważnego podpisu.');
    }
    let notice;
    try {
      notice = JSON.parse(body);
    } catch {
      throw new ApiError(400, 'invalid_notice', 'Nieczytelne powiadomienie.');
    }
    if (!STATUSES.includes(notice?.status)) throw new ApiError(400, 'invalid_notice', 'Nieczytelne powiadomienie.');
    return {
      orderId: String(notice.orderId ?? ''),
      ref: String(notice.ref ?? ''),
      status: notice.status,
      amount: Number(notice.amount),
      currency: String(notice.currency ?? ''),
    };
  },
  async refund() {
    return { ok: true, done: true };
  },
  answer: () => json({ ok: true }),
};

export const providerFor = (name) => ({ test: testGateway })[name] ?? null;

// For the tests: the signature the test gateway's news carries.
export const testSignature = hmacHex;
