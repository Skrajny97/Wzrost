-- E-mail confirmation (the author: "Grać można tylko po potwierdzeniu
-- rejestracji"), src/server/email.js.

-- When the account's e-mail was confirmed with a link. An account bound to
-- Google counts as confirmed without it.
ALTER TABLE users ADD COLUMN email_confirmed_at INTEGER;
-- 1 for an account made with a password from now on: it plays only once its
-- e-mail is confirmed. Accounts made before keep playing (the author: "Te
-- konta z hasłem, które już istnieją, jeśli mają podpięty mail, nie muszą
-- tego robić") and are invited to confirm for Punkty Systemu.
ALTER TABLE users ADD COLUMN email_required INTEGER NOT NULL DEFAULT 0;
-- When the Punkty Systemu for confirming were earned: once per account.
ALTER TABLE users ADD COLUMN email_rewarded_at INTEGER;
-- Punkty Systemu earned before the account had a character. Punkty Systemu
-- belong to the character, so they go to the next one made.
ALTER TABLE users ADD COLUMN system_points_waiting INTEGER NOT NULL DEFAULT 0;

-- The links sent to confirm an e-mail. The id is the SHA-256 hash of the
-- link's token, never the token itself; the e-mail is the address the link
-- confirms, so a link to an address changed since confirms nothing.
CREATE TABLE email_links (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX email_links_user_id ON email_links (user_id);

-- Password accounts with neither an e-mail nor a character go (the author:
-- "Resztę kont bez maila bez postaci usuń").
DELETE FROM push_subscriptions
WHERE user_id IN (SELECT id FROM users WHERE google_sub IS NULL AND email IS NULL AND id NOT IN (SELECT user_id FROM characters));

DELETE FROM sessions
WHERE user_id IN (SELECT id FROM users WHERE google_sub IS NULL AND email IS NULL AND id NOT IN (SELECT user_id FROM characters));

DELETE FROM users WHERE google_sub IS NULL AND email IS NULL AND id NOT IN (SELECT user_id FROM characters);
