// Account endpoints: registration, login, logout and the current user.

import { sendLink } from './email.js';
import { registrationOpen } from './features.js';
import { googleConfigured } from './google.js';
import { ApiError, json, readJson } from './http.js';
import { LANGUAGES, language } from './i18n.js';
import { englishOn } from './features.js';
import { detachedRows } from './characters.js';
import { marketRemoval } from './market.js';
import { guildRemoval } from './guilds.js';
import { partyRemoval } from './parties.js';
import { hashPassword, needsRehash, verifyPassword } from './passwords.js';
import { testModeFor, tutorialTestsFor } from './test-mode.js';
import { isAuthor, openBugReports } from './author.js';
import {
  clearedSessionCookie,
  createSession,
  deleteSession,
  refreshSession,
  requireSession,
  sessionCookie,
  sessionIdFromRequest,
  userView,
} from './sessions.js';
import { clearLoginFailures, clientOf, takeLoginAttempt, takeRegistration } from './throttle.js';

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

// An empty value means "no e-mail": an account made with a password needs
// one (register), an older one may have none.
export function validateEmail(value) {
  if (value === undefined || value === null) return null;
  const email = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (email === '') return null;
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, 'invalid_email', 'Podaj poprawny adres e-mail.');
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

function validLanguage(value) {
  if (!LANGUAGES.includes(value)) throw new ApiError(400, 'invalid_language', 'Nie ma takiego języka.');
  return value;
}

const loginTaken = () => new ApiError(409, 'login_taken', 'Ten login jest już zajęty.');
const emailTaken = () =>
  new ApiError(409, 'email_taken', 'Ten e-mail jest już przypisany do innego konta.');

// A new account plays once the link sent to its e-mail is opened
// (email.js); until then the page asks for it.
export async function register({ request, env, now }) {
  if (!registrationOpen()) throw new ApiError(403, 'registration_closed', 'Zakładanie nowych kont jest wyłączone.');
  const body = await readJson(request);
  const login = validateLogin(body.login);
  const email = validateEmail(body.email);
  if (!email) throw new ApiError(400, 'email_required', 'Podaj adres e-mail: wyślemy na niego link, który otworzy konto.');
  const password = validatePassword(body.password);
  // The game is for people aged 16 or over (725 A): the form's "Mam co
  // najmniej 16 lat".
  if (body.adult !== true) throw new ApiError(400, 'age_required', 'Insight jest dla osób, które mają co najmniej 16 lat. Zaznacz „Mam co najmniej 16 lat”.');
  // The language picked in the form ("Język gry"), else the page's; Polish
  // where English is off.
  const chosenLanguage = englishOn() && body.language !== undefined ? validLanguage(body.language) : language();
  const db = env.DB;
  // A limit of accounts from one network a day (throttle.js), counted
  // before anything else is looked up.
  const client = clientOf(request);
  const blockedFor = client === null ? null : await takeRegistration(db, client, now);
  if (blockedFor !== null) {
    const hours = Math.ceil(blockedFor / 3600000);
    throw new ApiError(429, 'too_many_accounts', `Z tej sieci założono dziś już wiele kont. Spróbuj ponownie za ${hours} h.`, {
      'Retry-After': String(Math.ceil(blockedFor / 1000)),
    });
  }

  if (await db.prepare('SELECT 1 FROM users WHERE login = ?').bind(login).first()) throw loginTaken();
  if (email && (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first())) {
    throw emailTaken();
  }

  const passwordHash = await hashPassword(password);
  let userId;
  try {
    const result = await db
      .prepare('INSERT INTO users (login, email, password_hash, created_at, email_required, language, age_confirmed_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(login, email, passwordHash, now, chosenLanguage, now)
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
  // The account is made even when the mail fails: the page offers to send it again.
  let emailSent = true;
  try {
    // In the account's language, whatever the page shows.
    await sendLink(env, { userId, login, email, language: chosenLanguage }, new URL(request.url).origin, now);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    emailSent = false;
  }
  const user = userView({ login, email, created_at: now, google_sub: null, email_confirmed_at: null, email_required: 1, skip_tutorials: 0, language: chosenLanguage });
  return json({ user: { ...user, testMode: testModeFor(env, login), tutorialTests: tutorialTestsFor(env, login), author: false }, emailSent }, 201, {
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
  const blockedFor = await takeLoginAttempt(db, throttleKey, now);
  if (blockedFor !== null) {
    throw new ApiError(
      429,
      'too_many_attempts',
      `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${Math.ceil(blockedFor / 60_000)} min.`,
      { 'Retry-After': String(Math.ceil(blockedFor / 1000)) },
    );
  }

  const columns = 'id, login, email, password_hash, google_sub, created_at, email_confirmed_at, email_required, skip_tutorials, language, age_confirmed_at, age_required';
  const query = identifier.includes('@') ? `SELECT ${columns} FROM users WHERE email = ?` : `SELECT ${columns} FROM users WHERE login = ?`;
  const user = await db.prepare(query).bind(identifier).first();
  // The attempt is counted already (takeLoginAttempt); a wrong password
  // leaves it so.
  if (!user || !(await verifyPassword(password, user.password_hash))) throw invalidCredentials;

  await clearLoginFailures(db, throttleKey);
  // An account with test mode, and the author's account, once linked to
  // Google, open only with Google while Google sign-in works, so its test
  // tools and the Author Panel stay with its owner, also with test mode off.
  const google = user.google_sub !== null;
  if (google && googleConfigured(env) && (testModeFor(env, user.login) || isAuthor(env, { login: user.login, google }))) {
    throw new ApiError(403, 'google_only', 'To konto otwiera się tylko przez Google. Stuknij „Zaloguj się przez Google”.');
  }
  if (needsRehash(user.password_hash)) {
    await db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), user.id)
      .run();
  }
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();

  const session = await createSession(db, user.id, now);
  return json(
    {
      user: {
        ...userView(user),
        testMode: testModeFor(env, user.login),
        tutorialTests: tutorialTestsFor(env, user.login),
        author: isAuthor(env, { login: user.login, google: user.google_sub !== null }),
      },
    },
    200,
    { 'Set-Cookie': sessionCookie(session.token, session.expiresAt, now) },
  );
}

export async function logout({ request, env }) {
  const sessionId = await sessionIdFromRequest(request);
  if (sessionId) await deleteSession(env.DB, sessionId);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

// "Usuń konto" in the settings: the account goes for good, with its
// character and everything the character has, its sessions and its link to
// Google. Typing the login again confirms it. Google Play asks apps where
// one makes an account for this path inside the app.
export async function deleteAccount(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  const typed = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
  if (typed !== session.user.login.toLowerCase()) {
    throw new ApiError(400, 'login_mismatch', 'Wpisz swój login, żeby potwierdzić usunięcie konta.');
  }
  await removeAccount(context.env.DB, session, context.now);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

// POST /api/me/age { adult }: a new account made by signing in with Google
// answers once whether its player is 16 or over (725 A). "Mam co najmniej
// 16 lat" lets it play; "Nie mam 16 lat" deletes it at once, as "Usuń
// konto" does.
export async function confirmAge(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  if (typeof body.adult !== 'boolean') throw new ApiError(400, 'invalid_answer', 'Wybierz jedną z odpowiedzi.');
  // "Nie" removes the account only while the question waits: an account
  // that answered goes only with "Usuń konto" and its typed login (review
  // of 12.11.2026).
  if (!body.adult && !session.user.ageRequired) throw new ApiError(409, 'age_answered', 'Wiek jest już potwierdzony. Konto usuniesz w Ustawieniach.');
  if (!body.adult) {
    await removeAccount(context.env.DB, session, context.now);
    return json({ deleted: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
  }
  await context.env.DB.prepare('UPDATE users SET age_confirmed_at = COALESCE(age_confirmed_at, ?), age_required = 0 WHERE id = ?').bind(context.now, session.userId).run();
  return json({ user: { ...session.user, ageRequired: false } });
}

// The account goes for good, with its characters and everything they have,
// its sessions and its link to Google.
async function removeAccount(db, session, now) {
  const { login, email } = session.user;
  const id = session.userId;
  const characters = 'SELECT id FROM characters WHERE user_id = ?';
  await db.batch([
    db
      .prepare(`DELETE FROM chat_reports WHERE user_id = ? OR message_id IN (SELECT id FROM chat_messages WHERE user_id = ? OR recipient_id IN (${characters}))`)
      .bind(id, id, id),
    db
      .prepare(`DELETE FROM chat_mentions WHERE character_id IN (${characters}) OR message_id IN (SELECT id FROM chat_messages WHERE user_id = ? OR recipient_id IN (${characters}))`)
      .bind(id, id, id),
    db.prepare(`DELETE FROM chat_messages WHERE user_id = ? OR recipient_id IN (${characters})`).bind(id, id),
    db.prepare('DELETE FROM chat_blocks WHERE user_id = ? OR blocked_id = ?').bind(id, id),
    db.prepare(`DELETE FROM chat_closed WHERE character_id IN (${characters}) OR other_id IN (${characters})`).bind(id, id),
    db.prepare('DELETE FROM trade_blocks WHERE user_id = ? OR blocked_id = ?').bind(id, id),
    db.prepare(`DELETE FROM trades WHERE from_id IN (${characters}) OR to_id IN (${characters})`).bind(id, id),
    db.prepare(`DELETE FROM friends WHERE character_id IN (${characters}) OR friend_id IN (${characters})`).bind(id, id),
    db.prepare(`DELETE FROM gifts WHERE sender_id IN (${characters}) OR receiver_id IN (${characters})`).bind(id, id),
    ...['reports', 'activities', 'avatar_activities', 'items', 'buildings', 'lottery_tickets'].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE character_id IN (${characters})`).bind(id),
    ),
    ...marketRemoval(db, characters, [id]),
    ...partyRemoval(db, characters, [id]),
    ...guildRemoval(db, characters, [id], now),
    // Its purchases of Punkty Systemu stay for the bookkeeping, detached
    // (the ids made negative), as its ids may be given again (payments.js).
    db
      .prepare('UPDATE purchases SET user_id = -user_id, character_id = CASE WHEN character_id > 0 THEN -character_id ELSE character_id END WHERE user_id = ?')
      .bind(id),
    // The Loteria draws its characters won, detached the same way.
    ...detachedRows(db, `IN (${characters})`, [id]),
    db.prepare('DELETE FROM characters WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM email_links WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM gift_codes_used WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM chest_items WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM bug_report_images WHERE report_id IN (SELECT id FROM bug_reports WHERE user_id = ?)').bind(id),
    db.prepare('DELETE FROM bug_reports WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM login_failures WHERE identifier IN (?, ?)').bind(login.toLowerCase(), email ?? ''),
    db.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
}

export async function me(context) {
  const session = await requireSession(context);
  const expiresAt = await refreshSession(context.env.DB, session, context.now);
  const headers = expiresAt ? { 'Set-Cookie': sessionCookie(session.token, expiresAt, context.now) } : {};
  const user = {
    ...session.user,
    testMode: testModeFor(context.env, session.user.login),
    tutorialTests: tutorialTestsFor(context.env, session.user.login),
    author: isAuthor(context.env, session.user),
  };
  // The author sees on the settings that players' bug reports wait.
  if (user.author) user.bugReports = await openBugReports(context.env.DB);
  return json({ user }, 200, headers);
}

// POST /api/me/language {language}: the PL | EN switch of the login screen
// and the Ustawienia (src/client/i18n.js), kept on the account, so that what
// the server sends it by itself can follow it. Only where English is on.
export async function setLanguage(context) {
  const session = await requireSession(context);
  if (!englishOn()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const body = await readJson(context.request);
  const chosen = validLanguage(body.language);
  await context.env.DB.prepare('UPDATE users SET language = ? WHERE id = ?').bind(chosen, session.userId).run();
  return json({ language: chosen });
}
