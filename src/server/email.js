// E-mail confirmation (the author: "Grać można tylko po potwierdzeniu
// rejestracji"). An account made with a password from now on plays once its
// e-mail is confirmed with a link from a mail that Cloudflare Email Service
// sends (the EMAIL binding in wrangler.jsonc). Accounts made before play on
// and are invited to confirm for Punkty Systemu; an account bound to Google
// counts as confirmed, because Google confirmed its owner (sessions.js), and
// gets the same Punkty Systemu (google.js), once an account.
//
// The link's token is random, and D1 keeps only its SHA-256 hash, the
// address it confirms and when it stops working. The page learns how the
// link went from /?email=… (app.js).

import { confirmationEmail } from '../engine/index.js';
import { validateEmail } from './accounts.js';
import { content, contentIn } from './content.js';
import { sha256Hex, toBase64Url } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { accountLanguage } from './i18n.js';
import { requireSession } from './sessions.js';

const SENDER = { email: 'no-reply@insightrpg.com', name: 'Insight' };
const CONFIRM_PATH = '/api/auth/confirm';
const LINK_TTL_MS = 24 * 3600000;
// A new link at most once a minute and five a day for one account, and the
// same for one mailbox, whichever accounts ask for it (mail_sends, review of
// 12.11.2026: an address got a mail from every account made with it and
// removed again).
const RESEND_MS = 60000;
const LINKS_PER_DAY = 5;
const DAY_MS = 24 * 3600000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Why a mail did not go, in the player's words, by Email Service's error code.
const SEND_ERRORS = {
  E_RATE_LIMIT_EXCEEDED: () => new ApiError(503, 'email_busy', 'Poczta gry jest teraz zajęta. Spróbuj ponownie za kilka minut.'),
  E_DAILY_LIMIT_EXCEEDED: () => new ApiError(503, 'email_busy', 'Poczta gry wysłała już dziś wszystko, co mogła. Spróbuj ponownie jutro.'),
  E_RECIPIENT_SUPPRESSED: () => new ApiError(400, 'email_rejected', 'Ten adres nie przyjmuje poczty. Sprawdź go albo podaj inny.'),
  E_VALIDATION_ERROR: () => new ApiError(400, 'email_rejected', 'Ten adres nie przyjmuje poczty. Sprawdź go albo podaj inny.'),
};
const sendFailed = () => new ApiError(503, 'email_failed', 'Nie udało się wysłać maila. Spróbuj ponownie za chwilę.');

// The key a mailbox is counted under in mail_sends: the SHA-256 hash of
// the address without a "+tag" (most mail services deliver those to the
// same mailbox), and for Gmail without dots, which Gmail ignores.
export async function mailboxKey(email) {
  const at = email.lastIndexOf('@');
  const domain = email.slice(at + 1).toLowerCase();
  let local = email.slice(0, at).toLowerCase().split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replaceAll('.', '');
  return sha256Hex(`${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`);
}

const tooSoon = (seconds) =>
  new ApiError(429, 'email_wait', `Link został już wysłany. Sprawdź skrzynkę, także folder spam, albo spróbuj ponownie za ${seconds} s.`, {
    'Retry-After': String(seconds),
  });
const tooMany = () => new ApiError(429, 'email_limit', 'Na dziś to już wszystkie linki. Sprawdź skrzynkę, także folder spam, albo spróbuj ponownie jutro.');

// Throws when the account or the mailbox may get no link now: too soon
// after the last one, or too many today.
async function checkMailLimits(db, userId, mailbox, now) {
  const [account, address] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count, MAX(created_at) AS last FROM email_links WHERE user_id = ? AND created_at > ?').bind(userId, now - LINK_TTL_MS),
    db.prepare('SELECT COUNT(*) AS count, MAX(sent_at) AS last FROM mail_sends WHERE address = ? AND sent_at > ?').bind(mailbox, now - DAY_MS),
  ]);
  const last = Math.max(account.results[0].last ?? -Infinity, address.results[0].last ?? -Infinity);
  if (now - last < RESEND_MS) throw tooSoon(Math.ceil((RESEND_MS - (now - last)) / 1000));
  if (account.results[0].count >= LINKS_PER_DAY || address.results[0].count >= LINKS_PER_DAY) throw tooMany();
}

// Sends a new link to `email`, the account's address, in the account's
// `language` (users.language, i18n.js), whatever the page's. Throws an
// ApiError when it cannot: too soon after the last one, too many today
// (for the account or for the mailbox), or the mail failed.
export async function sendLink(env, { userId, login, email, language }, origin, now) {
  const db = env.DB;
  const mailbox = await mailboxKey(email);
  await checkMailLimits(db, userId, mailbox, now);

  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256Hex(token);
  const [, , counted] = await db.batch([
    db.prepare('DELETE FROM email_links WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM mail_sends WHERE sent_at <= ?').bind(now - DAY_MS),
    // The limits read again in the statement that counts the mail, so that
    // links asked for at once cannot all pass the reading above.
    db
      .prepare(
        `INSERT INTO mail_sends (address, sent_at) SELECT ?1, ?2
         WHERE NOT EXISTS (SELECT 1 FROM mail_sends WHERE address = ?1 AND sent_at > ?2 - ?3)
           AND (SELECT COUNT(*) FROM mail_sends WHERE address = ?1) < ?4
           AND NOT EXISTS (SELECT 1 FROM email_links WHERE user_id = ?5 AND created_at > ?2 - ?3)
           AND (SELECT COUNT(*) FROM email_links WHERE user_id = ?5 AND created_at > ?2 - ?6) < ?4`,
      )
      .bind(mailbox, now, RESEND_MS, LINKS_PER_DAY, userId, LINK_TTL_MS),
    db
      .prepare('INSERT INTO email_links (id, user_id, email, created_at, expires_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1')
      .bind(id, userId, email, now, now + LINK_TTL_MS),
  ]);
  if (counted.meta.changes !== 1) throw tooSoon(Math.ceil(RESEND_MS / 1000));
  const message = confirmationEmail({ login, link: `${origin}${CONFIRM_PATH}?token=${token}` }, contentIn(accountLanguage(language)));
  try {
    if (!env.EMAIL) throw Object.assign(new Error('No EMAIL binding'), { code: 'E_NO_BINDING' });
    await env.EMAIL.send({ to: email, from: SENDER, ...message });
  } catch (error) {
    console.error('Confirmation mail not sent:', error?.code, error?.message);
    // A mail that did not go out does not count toward the limits.
    await db.batch([
      db.prepare('DELETE FROM email_links WHERE id = ?').bind(id),
      db.prepare('DELETE FROM mail_sends WHERE rowid = (SELECT rowid FROM mail_sends WHERE address = ? AND sent_at = ? LIMIT 1)').bind(mailbox, now),
    ]);
    throw (SEND_ERRORS[error?.code] ?? sendFailed)();
  }
}

// "Wyślij link": a link to the account's e-mail, or to a new address given
// (an account without one, or a mistyped one), while it is not confirmed.
export async function requestLink(context) {
  const session = await requireSession(context);
  const { user, userId } = session;
  if (user.emailConfirmed) throw new ApiError(409, 'email_confirmed', 'Ten adres e-mail jest już potwierdzony.');
  const body = await readJson(context.request);
  const email = body.email === undefined ? user.email : validateEmail(body.email);
  if (!email) throw new ApiError(400, 'email_required', 'Podaj adres e-mail, a wyślemy na niego link.');

  const db = context.env.DB;
  if (email !== user.email) {
    const taken = () => new ApiError(409, 'email_taken', 'Ten e-mail jest już przypisany do innego konta.');
    if (await db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, userId).first()) throw taken();
    // The limits before the change, so that an address refused a mail is
    // not left on the account either (review of 12.11.2026: an account took
    // an address with no mail reaching it).
    await checkMailLimits(db, userId, await mailboxKey(email), context.now);
    try {
      await db.prepare('UPDATE users SET email = ? WHERE id = ? AND email_confirmed_at IS NULL').bind(email, userId).run();
    } catch (error) {
      if (String(error?.message).includes('users.email')) throw taken();
      throw error;
    }
  }
  await sendLink(context.env, { userId, login: user.login, email, language: user.language }, new URL(context.request.url).origin, context.now);
  return json({ sent: true, email });
}

// Punkty Systemu for a confirmed account, once an account
// (`email_rewarded_at`): to its character, or to the first character made
// when there is none yet. Statements for one batch with the rest of the
// change, so two at once pay once. With `email`, only while the account
// still has that address.
export function rewardStatements(db, userId, now, email = null) {
  const points = content().balance.account.emailSystemPoints;
  const account = email === null ? 'id = ?' : 'id = ? AND email = ?';
  const keys = email === null ? [userId] : [userId, email];
  return [
    db
      .prepare(
        `UPDATE characters SET system_points = system_points + ?, version = version + 1
         WHERE user_id = ? AND role = 'player' AND EXISTS (SELECT 1 FROM users WHERE ${account} AND email_rewarded_at IS NULL)`,
      )
      .bind(points, userId, ...keys),
    db
      .prepare(
        `UPDATE users SET
           system_points_waiting = system_points_waiting
             + CASE WHEN email_rewarded_at IS NULL AND NOT EXISTS (SELECT 1 FROM characters WHERE user_id = users.id AND role = 'player') THEN ? ELSE 0 END,
           email_rewarded_at = COALESCE(email_rewarded_at, ?)
         WHERE ${account}`,
      )
      .bind(points, now, ...keys),
  ];
}

// The link from the mail. It confirms the address while the account still
// has it, and the first time gives Punkty Systemu (rewardStatements). All
// in one batch, so a link opened twice at once pays once.
export async function confirmEmail({ request, env, now }) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!TOKEN_PATTERN.test(token)) return redirect('/?email=expired');
  const db = env.DB;
  const link = await db.prepare('SELECT user_id, email, expires_at FROM email_links WHERE id = ?').bind(await sha256Hex(token)).first();
  if (!link || link.expires_at <= now) return redirect('/?email=expired');
  const before = await db.prepare('SELECT email_confirmed_at FROM users WHERE id = ? AND email = ?').bind(link.user_id, link.email).first();
  if (!before) return redirect('/?email=expired');

  await db.batch([
    ...rewardStatements(db, link.user_id, now, link.email),
    db.prepare('UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ? AND email = ?').bind(now, link.user_id, link.email),
    db.prepare('DELETE FROM email_links WHERE user_id = ?').bind(link.user_id),
  ]);
  return redirect(before.email_confirmed_at === null ? '/?email=confirmed' : '/?email=already');
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
}
