-- "Nie pamiętam hasła" (the author's 838 A, 12.11.2026, from the security
-- review: a player whose password someone learned could not get the account
-- back). A link to the account's confirmed e-mail sets a new password once,
-- within an hour (password.js). D1 keeps only the SHA-256 hash of the
-- link's token, the account and when the link stops working.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX password_resets_user ON password_resets (user_id, created_at);
