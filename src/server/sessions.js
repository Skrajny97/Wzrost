// Login sessions kept in D1 and referenced by an HttpOnly cookie.
// The cookie holds a random token; the database stores only its SHA-256 hash.

import { ApiError } from './http.js';
import { sha256Hex, toBase64Url } from './encoding.js';
import { englishOn } from './features.js';
import { accountLanguage } from './i18n.js';

export const SESSION_COOKIE = '__Host-sid';
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
// A session used when less than this remains is extended to the full TTL.
const REFRESH_BELOW_MS = 15 * DAY_MS;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function createSession(db, userId, now) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + SESSION_TTL_MS;
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now, expiresAt)
    .run();
  return { token, expiresAt };
}

// Returns the session id (token hash) named by the request cookie, or null.
export async function sessionIdFromRequest(request) {
  const token = sessionToken(request);
  return token ? sha256Hex(token) : null;
}

export async function getSession(db, request, now) {
  const token = sessionToken(request);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.expires_at, u.id AS user_id, u.login, u.email, u.created_at, u.google_sub, u.email_confirmed_at, u.email_required, u.news_seen,
         u.skip_tutorials, u.language
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) return null;
  if (row.expires_at <= now) {
    await deleteSession(db, id);
    return null;
  }
  return {
    id,
    token,
    expiresAt: row.expires_at,
    userId: row.user_id,
    user: userView(row),
    // The newest "Co nowego?" entry the account has seen (news.js).
    newsSeen: row.news_seen ?? 0,
  };
}

// The account as the page sees it. An account bound to Google counts as
// confirmed: Google confirmed its owner (email.js). `skipTutorials`:
// "Pomijaj objaśnienia narratora" in the settings, for all the account's
// characters (tutorial.js). `language`: the account's, "pl" or "en"
// (i18n.js), only where English is on: the live game's account has none.
export function userView(row) {
  const google = row.google_sub !== null;
  return {
    login: row.login,
    email: row.email,
    createdAt: row.created_at,
    google,
    emailConfirmed: google || row.email_confirmed_at !== null,
    emailRequired: row.email_required === 1,
    skipTutorials: row.skip_tutorials === 1,
    ...(englishOn() && { language: accountLanguage(row.language) }),
  };
}

export async function requireSession({ request, env, now }) {
  const session = await getSession(env.DB, request, now);
  if (!session) throw new ApiError(401, 'unauthorized', 'Nie jesteś zalogowany.');
  return session;
}

// The game itself waits for a confirmed e-mail on an account that needs one
// (email.js). The account, signing out and sending the link do not.
export async function requirePlayable(context) {
  const session = await requireSession(context);
  if (session.user.emailRequired && !session.user.emailConfirmed) {
    throw new ApiError(403, 'email_unconfirmed', 'Najpierw potwierdź adres e-mail: link czeka w skrzynce.');
  }
  return session;
}

// Extends a session that is past half of its lifetime. Returns the new expiry or null.
export async function refreshSession(db, session, now) {
  if (session.expiresAt - now >= REFRESH_BELOW_MS) return null;
  const expiresAt = now + SESSION_TTL_MS;
  await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(expiresAt, session.id).run();
  return expiresAt;
}

export async function deleteSession(db, id) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

export function sessionCookie(token, expiresAt, now) {
  const maxAge = Math.floor((expiresAt - now) / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function sessionToken(request) {
  const token = readCookie(request, SESSION_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}
