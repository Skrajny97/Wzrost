-- The account's name for the chat (832 A, src/server/names.js, accounts.js):
-- the player chooses it in the Ustawienia, and the chat shows it before the
-- name of the character that writes, "Wędrowiec (Radomira)". The key holds
-- it in lower case (nameKey in src/server/names.js), unique among the
-- accounts, as a character's name is among the characters. account_name_at
-- is when it was set last: it changes at most once in 30 days.
-- account_name_hint is 1 once the chat told the player where to set it.
ALTER TABLE users ADD COLUMN account_name TEXT;
ALTER TABLE users ADD COLUMN account_name_key TEXT;
ALTER TABLE users ADD COLUMN account_name_at INTEGER;
ALTER TABLE users ADD COLUMN account_name_hint INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX users_account_name ON users (account_name_key);
