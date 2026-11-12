-- Limits from the security review of 12.11.2026.
--
-- Mails with a link go to one mailbox at most once a minute and five
-- times a day, whichever accounts ask for them, also accounts made and
-- removed one after another (email.js). Each mail sent keeps a row for a
-- day: the SHA-256 hash of the mailbox (the address in lower case, without
-- a "+tag", and for Gmail without dots), never the address itself.
CREATE TABLE mail_sends (
  address TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

CREATE INDEX mail_sends_address ON mail_sends (address, sent_at);

-- Accounts made with a password from one network (CF-Connecting-IP, for
-- IPv6 its /64) in a day (throttle.js), counted like login_failures.
CREATE TABLE registration_counts (
  client TEXT PRIMARY KEY,
  registrations INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);

-- Failed chat translations given back to the day's (chat.js), at most as
-- many a day as the day has: a text the translator answers with nothing
-- no longer goes to it without end.
ALTER TABLE users ADD COLUMN translations_returned INTEGER NOT NULL DEFAULT 0;
