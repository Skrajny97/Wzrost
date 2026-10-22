// Account endpoints: registration, login, logout and the current user.

import { ApiError, json, readJson } from './http.js';
import { hashPassword, needsRehash, verifyPassword } from './passwords.js';
import {
  clearedSessionCookie,
  createSession,
  deleteSession,
  refreshSession,
  requireSession,
  sessionCookie,
  sessionIdFromRequest,
} from './sessions.js';
import { clearLoginFailures, getLoginBlock, recordLoginFailure } from './throttle.js';

const LOGIN_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function validateLogin(value) {
  const login = typeof value === 'string' ? value.trim() : '';
  if (!LOGIN_PATTERN.test(login)) {
    throw new ApiError(
      400,
      'invalid_login',
      'Login musi mieć od 3 do 24 znaków: litery bez polskich znaków, cyfry oraz _ . -',
    );
  }
  return login;
}

// E-mail is optional: an empty value means "no e-mail".
export function validateEmail(value) {
  if (value === undefined || value === null) return null;
  const email = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (email === '') return null;
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, 'invalid_email', 'Podaj poprawny adres e-mail albo zostaw to pole puste.');
  }
  return email;
}

export function validatePassword(value) {
  const length = typeof value === 'string' ? [...value].length : 0;
  if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new ApiError(400, 'invalid_password', 'Hasło musi mieć od 8 do 128 znaków.');
  }
  return value;
}

const loginTaken = () => new ApiError(409, 'login_taken', 'Ten login jest już zajęty.');
const emailTaken = () =>
  new ApiError(409, 'email_taken', 'Ten e-mail jest już przypisany do innego konta.');

export async function register({ request, env, now }) {
  const body = await readJson(request);
  const login = validateLogin(body.login);
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);
  const db = env.DB;

  if (await db.prepare('SELECT 1 FROM users WHERE login = ?').bind(login).first()) throw loginTaken();
  if (email && (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first())) {
    throw emailTaken();
  }

  const passwordHash = await hashPassword(password);
  let userId;
  try {
    const result = await db
      .prepare('INSERT INTO users (login, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(login, email, passwordHash, now)
      .run();
    userId = result.meta.last_row_id;
  } catch (error) {
    // Another registration with the same login or e-mail won the race.
    const message = String(error?.message);
    if (message.includes('users.email')) throw emailTaken();
    if (message.includes('users.login')) throw loginTaken();
    throw error;
  }

  const session = await createSession(db, userId, now);
  return json({ user: { login, email, createdAt: now } }, 201, {
    'Set-Cookie': sessionCookie(session.token, session.expiresAt, now),
  });
}

export async function login({ request, env, now }) {
  const body = await readJson(request);
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password) {
    throw new ApiError(400, 'missing_credentials', 'Podaj login lub e-mail oraz hasło.');
  }
  const invalidCredentials = new ApiError(
    401,
    'invalid_credentials',
    'Nieprawidłowy login, e-mail lub hasło.',
  );
  if (identifier.length > MAX_EMAIL_LENGTH || [...password].length > MAX_PASSWORD_LENGTH) {
    throw invalidCredentials;
  }

  const db = env.DB;
  const throttleKey = identifier.toLowerCase();
  const blockedFor = await getLoginBlock(db, throttleKey, now);
  if (blockedFor !== null) {
    throw new ApiError(
      429,
      'too_many_attempts',
      `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${Math.ceil(blockedFor / 60_000)} min.`,
      { 'Retry-After': String(Math.ceil(blockedFor / 1000)) },
    );
  }

  const query = identifier.includes('@')
    ? 'SELECT id, login, email, password_hash, created_at FROM users WHERE email = ?'
    : 'SELECT id, login, email, password_hash, created_at FROM users WHERE login = ?';
  const user = await db.prepare(query).bind(identifier).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await recordLoginFailure(db, throttleKey, now);
    throw invalidCredentials;
  }

  await clearLoginFailures(db, throttleKey);
  if (needsRehash(user.password_hash)) {
    await db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), user.id)
      .run();
  }
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();

  const session = await createSession(db, user.id, now);
  return json(
    { user: { login: user.login, email: user.email, createdAt: user.created_at } },
    200,
    { 'Set-Cookie': sessionCookie(session.token, session.expiresAt, now) },
  );
}

export async function logout({ request, env }) {
  const sessionId = await sessionIdFromRequest(request);
  if (sessionId) await deleteSession(env.DB, sessionId);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

export async function me(context) {
  const session = await requireSession(context);
  const expiresAt = await refreshSession(context.env.DB, session, context.now);
  const headers = expiresAt ? { 'Set-Cookie': sessionCookie(session.token, expiresAt, context.now) } : {};
  return json({ user: session.user }, 200, headers);
}
