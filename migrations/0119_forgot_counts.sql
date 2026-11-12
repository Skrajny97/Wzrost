-- Asks for a "Nie pamiętam hasła" link from one network (CF-Connecting-IP,
-- for IPv6 its /64) in a day (throttle.js takeForgot), counted like
-- registration_counts (the security review of 12.11.2026).
CREATE TABLE forgot_counts (
  client TEXT PRIMARY KEY,
  asks INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
