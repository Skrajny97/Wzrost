// Limits password guessing: after MAX_FAILURES failed logins for one identifier
// within WINDOW_MS, further attempts are refused until the window ends.

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// Counts one more of something in `table` for `key`, with one statement
// that reads and raises the count together, so requests sent at once
// cannot all read a count under the limit. Returns the milliseconds left
// until the window ends when this one is past `most` in `windowMs`, or
// null when it may go on. Counts from finished windows are removed.
async function countOne(db, { table, key, count }, id, now, most, windowMs) {
  const [taken] = await db.batch([
    // SET expressions see the old row, so both CASEs test the same expired window.
    db
      .prepare(
        `INSERT INTO ${table} (${key}, ${count}, window_started_at) VALUES (?1, 1, ?2)
         ON CONFLICT (${key}) DO UPDATE SET
           ${count} = CASE WHEN ?2 - window_started_at >= ?3 THEN 1 ELSE ${count} + 1 END,
           window_started_at = CASE WHEN ?2 - window_started_at >= ?3 THEN ?2 ELSE window_started_at END
         RETURNING ${count} AS count, window_started_at`,
      )
      .bind(id, now, windowMs),
    db.prepare(`DELETE FROM ${table} WHERE window_started_at <= ?`).bind(now - windowMs),
  ]);
  const row = taken.results[0];
  if (row.count <= most) return null;
  return row.window_started_at + windowMs - now;
}

// Counts this login attempt before its password is checked (review of
// 12.11.2026: the count was read before the check and raised after it, so
// guesses sent at once all checked a password). A wrong password leaves
// the attempt counted; the right one clears the count (clearLoginFailures).
export const takeLoginAttempt = (db, identifier, now) =>
  countOne(db, { table: 'login_failures', key: 'identifier', count: 'failures' }, identifier, now, MAX_FAILURES, WINDOW_MS);

// Accounts made with a password from one network a day: enough for a
// household, a school or a mobile network sharing one address, not for a
// script making accounts without end (review of 12.11.2026).
export const REGISTRATIONS_PER_DAY = 20;
const DAY_MS = 24 * 3600000;

// The network a request comes from: Cloudflare's CF-Connecting-IP, for
// IPv6 its /64 (one household's or one phone's), or null on a local server
// (the tests, npm run dev), where every request comes from the machine
// itself; Cloudflare sets the header itself, so no player can send that.
export function clientOf(request) {
  const ip = (request.headers.get('CF-Connecting-IP') ?? '').trim().toLowerCase();
  if (!ip || ip === '127.0.0.1' || ip === '::1') return null;
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

// Counts this registration of the network; null when it may go on.
export const takeRegistration = (db, client, now) =>
  countOne(db, { table: 'registration_counts', key: 'client', count: 'registrations' }, client, now, REGISTRATIONS_PER_DAY, DAY_MS);

// Asks for a "Nie pamiętam hasła" link from one network a day (password.js),
// counted like the registrations: enough for a household's forgotten
// passwords, not for a script sending mails to one player after another.
export const FORGOT_PER_DAY = 20;
export const takeForgot = (db, client, now) =>
  countOne(db, { table: 'forgot_counts', key: 'client', count: 'asks' }, client, now, FORGOT_PER_DAY, DAY_MS);

export async function clearLoginFailures(db, identifier) {
  await db.prepare('DELETE FROM login_failures WHERE identifier = ?').bind(identifier).run();
}
