// Google Play's side of the payments for Punkty Systemu (867 A, 12.11.2026:
// bought only in the app from the Sklep Play, through Google Play Billing;
// payments.js keeps the ledger). The app, a Trusted Web Activity, buys a
// pack's one-time product with the Digital Goods API and the Payment Request
// API (src/client/screens/shop-points.js) and gives the server the
// purchase's token. The server reads that purchase in the Google Play
// Developer API (Android Publisher v3) as the game's service account, so
// only Google's word turns an order paid; then it consumes the purchase,
// which also confirms it (Google refunds a purchase nobody confirms within
// three days). A refund the player asks for within the days of
// data/payments.json goes through the API's orders.refund, and the
// purchases Google voided later (refunds, chargebacks) are read from its
// voided purchases (payments.js, playMaintenance).
//
// The service account is a Worker secret, GOOGLE_PLAY_SERVICE_ACCOUNT: the
// JSON key Google Cloud gives (client_email, private_key), from the GitHub
// secret of the same name; never in the code. Without it the gateway is not
// ready, as off. GOOGLE_PLAY_API and GOOGLE_PLAY_TOKEN_URL replace Google's
// addresses for the tests only.

import data from '../../data/payments.json' with { type: 'json' };

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
// How long the server waits for Google: a player's tap never hangs on it.
const WAIT_MS = 15000;

// The service account of the secret, or null without a usable one.
export function serviceAccount(env = {}) {
  try {
    const account = JSON.parse(String(env.GOOGLE_PLAY_SERVICE_ACCOUNT ?? ''));
    if (typeof account?.client_email === 'string' && account.client_email.includes('@') && typeof account.private_key === 'string' && account.private_key.includes('PRIVATE KEY')) return account;
  } catch {}
  return null;
}

const apiBase = (env) => String(env.GOOGLE_PLAY_API || API).replace(/\/+$/, '');
const tokenUrl = (env) => String(env.GOOGLE_PLAY_TOKEN_URL || TOKEN_URL);

// The pack of a Play product id, and the product of a pack.
export const packOfProduct = (productId) => data.packs.find((pack) => pack.playId === productId) ?? null;
export const productOf = (packId) => data.packs.find((pack) => pack.id === packId)?.playId ?? null;

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const textBase64url = (text) => base64url(new TextEncoder().encode(text));

// The account's key, from the PEM of the JSON key (PKCS #8).
function signingKey(pem) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

export class PlayError extends Error {}

// An access token for the API, from a JWT the account signs (OAuth 2.0 for
// service accounts), kept while it is good for more than a minute.
let cached = null;
export async function accessToken(env, fetcher = fetch) {
  const account = serviceAccount(env);
  if (!account) throw new PlayError('no service account');
  const now = Date.now();
  if (cached && cached.email === account.client_email && cached.url === tokenUrl(env) && cached.until > now + 60000) return cached.token;
  const issued = Math.floor(now / 1000);
  const header = textBase64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = textBase64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUrl(env), iat: issued, exp: issued + 3600 }));
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(account.private_key), new TextEncoder().encode(`${header}.${claims}`)));
  const response = await fetcher(tokenUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${base64url(signature)}` }).toString(),
    signal: AbortSignal.timeout(WAIT_MS),
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok || typeof answer?.access_token !== 'string') throw new PlayError(`no access token (${response.status})`);
  cached = { email: account.client_email, url: tokenUrl(env), token: answer.access_token, until: now + Math.max(60, Number(answer.expires_in) || 3600) * 1000 };
  return cached.token;
}

// A call of the API for the game's app, as the account.
async function call(env, method, path, fetcher) {
  const token = await accessToken(env, fetcher);
  return fetcher(`${apiBase(env)}/${encodeURIComponent(data.play.package)}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? '{}' : undefined,
    signal: AbortSignal.timeout(WAIT_MS),
  });
}

// A one-time product's purchase as Google has it (purchases.products.get):
// purchaseState 0 bought, 1 canceled, 2 pending; consumptionState;
// purchaseType 0 for a licence tester's; orderId; regionCode. null when
// Google does not know the token; an error when Google does not answer.
export async function productPurchase(env, productId, token, fetcher = fetch) {
  const response = await call(env, 'GET', `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`, fetcher);
  if (response.status === 400 || response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new PlayError(`purchase not read (${response.status})`);
  return response.json();
}

// The purchase used up (purchases.products.consume), which confirms it too,
// so it can be bought again. Whether Google took it.
export async function consumePurchase(env, productId, token, fetcher = fetch) {
  const response = await call(env, 'POST', `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`, fetcher);
  return response.ok;
}

// The money of an order given back (orders.refund). Whether Google took it.
export async function refundOrder(env, orderId, fetcher = fetch) {
  const response = await call(env, 'POST', `orders/${encodeURIComponent(orderId)}:refund`, fetcher);
  return response.ok;
}

// The purchases voided since `startTime` (purchases.voidedpurchases.list),
// a page of them and the next page's token.
export async function voidedPurchases(env, startTime, pageToken = null, fetcher = fetch) {
  const query = new URLSearchParams({ startTime: String(Math.floor(startTime)), maxResults: '1000' });
  if (pageToken) query.set('token', pageToken);
  const response = await call(env, 'GET', `purchases/voidedpurchases?${query}`, fetcher);
  if (!response.ok) throw new PlayError(`voided purchases not read (${response.status})`);
  const answer = await response.json();
  return { voided: Array.isArray(answer.voidedPurchases) ? answer.voidedPurchases : [], next: answer.tokenPagination?.nextPageToken ?? null };
}

// The ledger's state for Google's reason of a voided purchase: a chargeback
// (7) or a buyer's dispute of a good purchase (6, friendly fraud) stops the
// account's purchases, as a bank's chargeback does; the rest are refunds.
export const voidedStatus = (reason) => (Number(reason) === 6 || Number(reason) === 7 ? 'charged_back' : 'refunded');

// The gateway as payments.js uses it: ready with the service account; an
// order's payment has no page of the gateway's, only the product the app
// buys (`sku`); a refund through orders.refund, done once Google takes it.
export const googlePlayGateway = {
  ready: (env) => serviceAccount(env) !== null,
  async create({ packId }) {
    return { ref: null, url: null, sku: productOf(packId) };
  },
  async refund({ env, ref }, fetcher = fetch) {
    if (!ref) return { ok: false, done: false };
    try {
      const ok = await refundOrder(env, ref, fetcher);
      if (!ok) console.error(`google play: the refund of ${ref} was not taken`);
      return { ok, done: ok };
    } catch (error) {
      console.error(`google play: no answer to the refund of ${ref}: ${error?.message ?? error}`);
      return { ok: false, done: false };
    }
  },
};

// For the tests: the token cache forgotten.
export const forgetAccessToken = () => {
  cached = null;
};
