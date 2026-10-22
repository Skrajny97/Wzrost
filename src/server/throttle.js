// Limits password guessing: after MAX_FAILURES failed logins for one identifier
// within WINDOW_MS, further attempts are refused until the window ends.

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// Returns the milliseconds left until login is allowed again, or null if not blocked.
export async function getLoginBlock(db, identifier, now) {
  const row = await db
    .prepare('SELECT failures, window_started_at FROM login_failures WHERE identifier = ?')
    .bind(identifier)
    .first();
  if (!row || row.failures < MAX_FAILURES || now - row.window_started_at >= WINDOW_MS) return null;
  return row.window_started_at + WINDOW_MS - now;
}

export async function recordLoginFailure(db, identifier, now) {
  await db.batch([
    // SET expressions see the old row, so both CASEs test the same expired window.
    db
      .prepare(
        `INSERT INTO login_failures (identifier, failures, window_started_at) VALUES (?1, 1, ?2)
         ON CONFLICT (identifier) DO UPDATE SET
           failures = CASE WHEN ?2 - window_started_at >= ?3 THEN 1 ELSE failures + 1 END,
           window_started_at = CASE WHEN ?2 - window_started_at >= ?3 THEN ?2 ELSE window_started_at END`,
      )
      .bind(identifier, now, WINDOW_MS),
    // Counters from finished windows no longer matter.
    db.prepare('DELETE FROM login_failures WHERE window_started_at <= ?').bind(now - WINDOW_MS),
  ]);
}

export async function clearLoginFailures(db, identifier) {
  await db.prepare('DELETE FROM login_failures WHERE identifier = ?').bind(identifier).run();
}
