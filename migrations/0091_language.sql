-- The account's language in the English beta (DECISIONS.md, „Angielska
-- wersja beta”): "pl" or "en", chosen first by the phone's language and then
-- with the PL | EN switch on the login screen and in the Ustawienia
-- (src/server/i18n.js, src/client/i18n.js). On the account, so that what the
-- server sends by itself, the phone's notifications and the mail, can follow
-- it. Only where English is on (ENGLISH in wrangler.jsonc); the live game
-- keeps every account Polish.
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'pl';
