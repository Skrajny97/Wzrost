// Google sign-in: OAuth 2.0 with PKCE and OpenID Connect. "Zaloguj się przez
// Google" on the start screen signs in, or makes an account on the first
// visit; "Połącz z Google" in the settings links Google to the account in
// use. The Google client comes from the GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET secrets; without them the buttons stay hidden.
//
// /api/auth/google/start keeps a random state and the PKCE verifier in a
// short-lived cookie and sends the browser to Google, which sends it back to
// /api/auth/google/callback with a code. The server trades the code for an ID
// token that comes straight from Google over TLS, so the token's claims are
// checked without its signature (OpenID Connect Core 3.1.3.7). An account is
// found by its Google user id, never by e-mail: e-mails in the game are not
// confirmed. The page learns how it went from /?google=… (app.js). An
// account made with Google, or linked to it, gets the Punkty Systemu of a
// confirmed e-mail, once an account (the author: "Niech rejestracja/podpięcie
// konta Google też daje ten bonus 10 Punktów Systemu").

import { content } from './content.js';
import { rewardStatements } from './email.js';
import { fromBase64Url, toBase64Url } from './encoding.js';
import { registrationOpen } from './features.js';
import { language } from './i18n.js';
import { createSession, deleteSession, getSession, readCookie, sessionCookie } from './sessions.js';
import { testModeFor } from './test-mode.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// Tests point GOOGLE_TOKEN_URL at a stand-in for Google.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const CALLBACK_PATH = '/api/auth/google/callback';
const FLOW_COOKIE = '__Host-google';
const FLOW_SECONDS = 600; // the time to choose an account at Google
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MODES = ['login', 'link'];
// The password hash of accounts made with Google: no password matches it.
export const NO_PASSWORD = 'google';

export const googleConfigured = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export async function startGoogle({ request, env }) {
  const url = new URL(request.url);
  if (!googleConfigured(env)) return redirect('/?google=unavailable');
  // Google sends the browser back only to the registered addresses
  // (GOOGLE_HOSTS); from any other one, such as the spare workers.dev
  // address, the sign-in moves to the first of them.
  const hosts = registeredHosts(env);
  if (hosts.length > 0 && !hosts.includes(url.hostname)) {
    return redirect(`https://${hosts[0]}${url.pathname}${url.search}`);
  }
  const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const state = randomToken();
  const verifier = randomToken();
  const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const target = new URL(AUTHORIZE_URL);
  target.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}${CALLBACK_PATH}`,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: toBase64Url(new Uint8Array(challenge)),
    code_challenge_method: 'S256',
    // The player picks the account, also when the phone has only one.
    prompt: 'select_account',
  });
  return redirect(target.href, flowCookie(`${state}.${verifier}.${mode}`, FLOW_SECONDS));
}

export async function googleCallback({ request, env, now }) {
  const url = new URL(request.url);
  const finish = (location, ...cookies) => redirect(location, flowCookie('', 0), ...cookies);
  if (!googleConfigured(env)) return finish('/?google=unavailable');
  const flow = readFlow(request);
  const params = url.searchParams;
  if (!flow || params.get('state') !== flow.state) return finish('/?google=expired');
  if (params.has('error')) return finish(params.get('error') === 'access_denied' ? '/?google=cancelled' : '/?google=failed');

  try {
    const identity = await exchangeCode(env, params.get('code'), flow.verifier, `${url.origin}${CALLBACK_PATH}`, now);
    const db = env.DB;
    const session = await getSession(db, request, now);
    if (flow.mode === 'link') {
      if (!session) return finish('/?google=expired');
      return finish(`/?google=${await linkGoogle(db, env, session, identity, now)}`);
    }

    let user = await userByGoogle(db, identity.sub);
    const made = !user;
    if (user) await keepEmail(db, user.id, identity.email);
    if (!user) {
      // An account with the same e-mail may belong to the same person, who
      // signs in with the password and links Google in the settings. It is
      // not linked here, because nobody confirmed that e-mail in the game.
      if (identity.email && (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(identity.email).first())) {
        return finish('/?google=exists');
      }
      if (!registrationOpen()) return finish('/?google=closed');
      user = await createGoogleUser(db, identity, now);
    }
    if (session) await deleteSession(db, session.id);
    await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
    const created = await createSession(db, user.id, now);
    // A new account hears of its Punkty Systemu; one that exists chooses
    // the character to play, as after a sign-in with the login (app.js).
    return finish(made ? '/?google=created' : '/?google=signed', sessionCookie(created.token, created.expiresAt, now));
  } catch (error) {
    console.error(error);
    return finish('/?google=failed');
  }
}

// Trades the code for an ID token. Returns the Google user id and the
// e-mail, if Google confirmed it.
async function exchangeCode(env, code, verifier, redirectUri, now) {
  if (!code) throw new Error('Google sign-in: no code');
  const response = await fetch(env.GOOGLE_TOKEN_URL || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.id_token !== 'string') {
    throw new Error(`Google sign-in: token endpoint answered ${response.status} ${data?.error ?? ''}`.trim());
  }
  return identityFromIdToken(data.id_token, env.GOOGLE_CLIENT_ID, now);
}

// The claims of an ID token that came straight from Google's token endpoint.
export function identityFromIdToken(idToken, clientId, now) {
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(idToken.split('.')[1])));
  } catch {
    throw new Error('Google sign-in: unreadable ID token');
  }
  if (!ISSUERS.includes(claims?.iss)) throw new Error('Google sign-in: wrong issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId) || (claims.azp !== undefined && claims.azp !== clientId)) {
    throw new Error('Google sign-in: wrong audience');
  }
  if (!(Number(claims.exp) * 1000 > now)) throw new Error('Google sign-in: expired ID token');
  if (typeof claims.sub !== 'string' || claims.sub === '' || claims.sub.length > 255) {
    throw new Error('Google sign-in: no user id');
  }
  const confirmed = claims.email_verified === true || claims.email_verified === 'true';
  const email = confirmed && typeof claims.email === 'string' && claims.email.length <= 254 ? claims.email.toLowerCase() : null;
  return { sub: claims.sub, email };
}

// A login made from the name part of the e-mail (jan.kowalski@gmail.com
// gives jan.kowalski), fitted to the login rules, or "gracz".
export function loginBase(email) {
  const name = String(email ?? '')
    .split('@')[0]
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 20);
  return name.length >= 3 ? name : 'gracz';
}

// A new account for the Google account, with the Punkty Systemu for the
// first character it makes, in the language of the return from Google (the
// browser's, i18n.js). A taken login gets 4 digits.
async function createGoogleUser(db, identity, now) {
  const base = loginBase(identity.email);
  for (let attempt = 0; attempt < 10; attempt++) {
    const login = attempt === 0 ? base : `${base}${randomDigits(4)}`;
    if (await db.prepare('SELECT 1 FROM users WHERE login = ?').bind(login).first()) continue;
    try {
      const result = await db
        .prepare('INSERT INTO users (login, email, password_hash, google_sub, created_at, system_points_waiting, email_rewarded_at, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(login, identity.email, NO_PASSWORD, identity.sub, now, content().balance.account.emailSystemPoints, now, language())
        .run();
      return { id: result.meta.last_row_id };
    } catch (error) {
      // The same Google account signed in twice at once, or another account
      // took the login a moment ago.
      const message = String(error?.message);
      if (message.includes('users.google_sub')) return userByGoogle(db, identity.sub);
      if (!message.includes('users.login')) throw error;
    }
  }
  throw new Error('Google sign-in: no free login');
}

// Links the Google account to the player's account, with the Punkty
// Systemu the account has not had yet (rewardStatements); returns how it
// went: "rewarded" when it brought them.
async function linkGoogle(db, env, session, { sub, email }, now) {
  const owner = await userByGoogle(db, sub);
  if (owner && owner.id !== session.userId) return 'taken';
  const before = await db.prepare('SELECT email_rewarded_at FROM users WHERE id = ?').bind(session.userId).first();
  try {
    await db.batch([db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(sub, session.userId), ...rewardStatements(db, session.userId, now)]);
  } catch (error) {
    // Linked to another account a moment ago.
    if (String(error?.message).includes('users.google_sub')) return 'taken';
    throw error;
  }
  await keepEmail(db, session.userId, email);
  // An account with test mode opens only with Google from now on
  // (accounts.js), so its other sessions, opened with the password, end.
  if (testModeFor(env, session.user.login)) {
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(session.userId, session.id).run();
  }
  return before?.email_rewarded_at === null ? 'rewarded' : 'linked';
}

const userByGoogle = (db, sub) => db.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first();

// The e-mail Google confirmed, kept for an account that has none yet (one
// linked to Google after it was made), unless another account has it. The
// author's panel shows it (author.js).
async function keepEmail(db, userId, email) {
  if (!email) return;
  await db
    .prepare('UPDATE users SET email = ? WHERE id = ? AND email IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE email = ?)')
    .bind(email, userId, email)
    .run();
}

function registeredHosts(env) {
  return String(env.GOOGLE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function readFlow(request) {
  const [state = '', verifier = '', mode] = (readCookie(request, FLOW_COOKIE) ?? '').split('.');
  if (!TOKEN_PATTERN.test(state) || !TOKEN_PATTERN.test(verifier) || !MODES.includes(mode)) return null;
  return { state, verifier, mode };
}

// SameSite=Lax, so that the cookie comes back with the browser from Google.
function flowCookie(value, maxAge) {
  return `${FLOW_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const randomToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const randomDigits = (count) => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** count).padStart(count, '0');

function redirect(location, ...cookies) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}
