// Passwords (the author's 838 A, 12.11.2026, from the security review: a
// player whose password someone learned could not get the account back,
// and a session on someone else's phone went on, as it grows longer with
// each visit). "Zmień hasło" in the Ustawienia takes the password now and a
// new one, and ends the account's other sessions; "Nie pamiętam hasła" on
// the login screen sends a link to the account's confirmed e-mail, which
// within an hour and once opens the window for a new password, and every
// session of the account ends with it. Only for an account with a
// password: one made with Google signs in without one (NO_PASSWORD).
//
// The link's token is random, and D1 keeps only its SHA-256 hash, the
// account and when it stops working (password_resets). The answer to
// "Wyślij link" is the same whatever the login or the address, so it tells
// no one which are in the game; the mails go within the limits of email.js
// (mail_sends): one mailbox at most once a minute and five times a day.

import { passwordResetEmail } from '../engine/index.js';
import { validatePassword } from './accounts.js';
import { assertion, atomically } from './atomic.js';
import { contentIn } from './content.js';
import { DAY_MS, LINKS_PER_DAY, RESEND_MS, SENDER, TOKEN_PATTERN, mailError, mailboxKey } from './email.js';
import { sha256Hex, toBase64Url } from './encoding.js';
import { NO_PASSWORD } from './google.js';
import { ApiError, json, readJson } from './http.js';
import { accountLanguage, t } from './i18n.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { requireSession } from './sessions.js';
import { clearLoginFailures, takeLoginAttempt } from './throttle.js';

const RESET_TTL_MS = 3600000;
const MAX_IDENTIFIER = 254;
const MAX_PASSWORD = 128;

const noPassword = () => new ApiError(409, 'no_password', 'To konto loguje się przez Google i nie ma hasła.');
const resetInvalid = () => new ApiError(400, 'reset_invalid', 'Ten link już nie działa. Poproś o nowy: „Nie pamiętam hasła” na ekranie logowania.');
const tooManyTries = (blockedFor) =>
  new ApiError(429, 'too_many_attempts', `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${Math.ceil(blockedFor / 60_000)} min.`, {
    'Retry-After': String(Math.ceil(blockedFor / 1000)),
  });

// POST /api/auth/password { current, password }: the account's password
// changed, its other sessions ended (this one stays). A wrong password now
// counts toward the login's failed tries (throttle.js), as at the login.
export async function changePassword(context) {
  const session = await requireSession(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const current = typeof body.current === 'string' ? body.current : '';
  const next = validatePassword(body.password);
  const user = await db.prepare('SELECT id, login, password_hash FROM users WHERE id = ?').bind(session.userId).first();
  if (!user || user.password_hash === NO_PASSWORD) throw noPassword();
  const throttleKey = user.login.toLowerCase();
  const blockedFor = await takeLoginAttempt(db, throttleKey, context.now);
  if (blockedFor !== null) throw tooManyTries(blockedFor);
  if ([...current].length > MAX_PASSWORD || !(await verifyPassword(current, user.password_hash))) {
    throw new ApiError(403, 'wrong_password', 'Obecne hasło się nie zgadza.');
  }
  await clearLoginFailures(db, throttleKey);
  await atomically(
    db,
    [
      // Only over the password read: of two changes at once, the second
      // finds it changed.
      assertion(db, 'EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?)', [user.id, user.password_hash]),
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, session.id),
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id),
    ],
    () => new ApiError(409, 'changed', 'Hasło zmieniło się w międzyczasie. Spróbuj jeszcze raz.'),
  );
  return json({ ok: true, text: t('Hasło zmienione. Inne urządzenia zostały wylogowane.') });
}

// The account a login or an address names, with what "Nie pamiętam hasła"
// needs of it.
function accountOf(db, identifier) {
  const columns = 'id, login, email, password_hash, email_confirmed_at, language';
  return identifier.includes('@')
    ? db.prepare(`SELECT ${columns} FROM users WHERE email = ?`).bind(identifier.toLowerCase()).first()
    : db.prepare(`SELECT ${columns} FROM users WHERE login = ?`).bind(identifier).first();
}

// Sends the link to the account's address, within the mailbox's limits of
// email.js (shared with the confirmation links) and as many for the
// account: false, with no mail, past them.
async function sendResetLink(env, user, origin, now) {
  const db = env.DB;
  const mailbox = await mailboxKey(user.email);
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256Hex(token);
  const [, , counted] = await db.batch([
    db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').bind(now - DAY_MS),
    db.prepare('DELETE FROM mail_sends WHERE sent_at <= ?').bind(now - DAY_MS),
    db
      .prepare(
        `INSERT INTO mail_sends (address, sent_at) SELECT ?1, ?2
         WHERE NOT EXISTS (SELECT 1 FROM mail_sends WHERE address = ?1 AND sent_at > ?2 - ?3)
           AND (SELECT COUNT(*) FROM mail_sends WHERE address = ?1) < ?4
           AND NOT EXISTS (SELECT 1 FROM password_resets WHERE user_id = ?5 AND created_at > ?2 - ?3)
           AND (SELECT COUNT(*) FROM password_resets WHERE user_id = ?5 AND created_at > ?2 - ?6) < ?4`,
      )
      .bind(mailbox, now, RESEND_MS, LINKS_PER_DAY, user.id, DAY_MS),
    db
      .prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) SELECT ?, ?, ?, ? WHERE changes() = 1')
      .bind(id, user.id, now, now + RESET_TTL_MS),
  ]);
  if (counted.meta.changes !== 1) return false;
  const message = passwordResetEmail({ login: user.login, link: `${origin}/?reset=${token}` }, contentIn(accountLanguage(user.language)));
  try {
    if (!env.EMAIL) throw Object.assign(new Error('No EMAIL binding'), { code: 'E_NO_BINDING' });
    await env.EMAIL.send({ to: user.email, from: SENDER, ...message });
  } catch (error) {
    console.error('Password mail not sent:', error?.code, error?.message);
    // A mail that did not go out does not count toward the limits.
    await db.batch([
      db.prepare('DELETE FROM password_resets WHERE token_hash = ?').bind(id),
      db.prepare('DELETE FROM mail_sends WHERE rowid = (SELECT rowid FROM mail_sends WHERE address = ? AND sent_at = ? LIMIT 1)').bind(mailbox, now),
    ]);
    throw mailError(error);
  }
  return true;
}

// POST /api/auth/forgot { identifier }: a login or an address. A link goes
// to the account's address only while it is confirmed and the account has
// a password; the answer is the same either way, also past the limits.
// Only a mail Email Service could not send is told, so the player does not
// wait for one that never comes.
export async function forgotPassword(context) {
  const body = await readJson(context.request);
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  if (!identifier || identifier.length > MAX_IDENTIFIER) throw new ApiError(400, 'missing_identifier', 'Podaj login albo adres e-mail konta.');
  const db = context.env.DB;
  const user = await accountOf(db, identifier);
  if (user && user.email && user.email_confirmed_at !== null && user.password_hash !== NO_PASSWORD) {
    await sendResetLink(context.env, user, new URL(context.request.url).origin, context.now);
  }
  return json({ sent: true, text: t('Jeśli to konto ma potwierdzony adres e-mail, wysłaliśmy na niego link. Link działa przez godzinę. Sprawdź skrzynkę, także folder spam.') });
}

// POST /api/auth/reset { token, password }: the link's new password, once
// and within the hour; every session of the account ends with it, and so
// do its other links and its failed login tries.
export async function resetPassword(context) {
  const body = await readJson(context.request);
  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_PATTERN.test(token)) throw resetInvalid();
  const next = validatePassword(body.password);
  const db = context.env.DB;
  const now = context.now;
  const id = await sha256Hex(token);
  const row = await db
    .prepare('SELECT r.user_id, u.login, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.expires_at > ?')
    .bind(id, now)
    .first();
  if (!row) throw resetInvalid();
  await atomically(
    db,
    [
      // Once: of two at once with the same link, the second finds it gone.
      assertion(db, 'EXISTS (SELECT 1 FROM password_resets WHERE token_hash = ? AND expires_at > ?)', [id, now]),
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), row.user_id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(row.user_id),
    ],
    resetInvalid,
  );
  await clearLoginFailures(db, row.login.toLowerCase());
  if (row.email) await clearLoginFailures(db, row.email);
  return json({ ok: true, text: t('Hasło zmienione. Zaloguj się nowym hasłem.') });
}

