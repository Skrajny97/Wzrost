-- The payments for Punkty Systemu (src/server/payments.js,
-- src/engine/payments.js; DECISIONS.md, "Płatności za Punkty Systemu:
-- podwaliny"), behind PAYMENTS (features.js): off in the game and on the
-- test version until the author picks the gateway and answers 804–808.
--
-- A purchase is the order the server writes before any payment: its own
-- number (`public_id`, the one the gateway gets and the player sees), the
-- account and the character the points go to, the pack with its points and
-- price as the data had them (in grosze, gross, and the currency), the
-- buyer's country (VAT across the EU, OSS), the gateway and its
-- transaction's id, and what the player agreed to before paying (the
-- terms' version, being of age), as JSON. `status`: 'pending' until the
-- gateway confirms; then 'paid', or 'failed'. A paid one may end
-- 'refunding' → 'refunded' (a withdrawal within the days of
-- data/payments.json, or a complaint) or 'charged_back' (the bank took the
-- money back). `credit_token`: the one request that moved the purchase on,
-- so only that request changes the character's points, however many times
-- the gateway sends the same news.
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  pack_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL,
  country TEXT,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  consents TEXT NOT NULL,
  credit_token TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  closed_at INTEGER,
  UNIQUE (provider, provider_ref)
);
CREATE INDEX purchases_by_user ON purchases (user_id, created_at);
CREATE INDEX purchases_by_status ON purchases (status, created_at);

-- How many of a character's Punkty Systemu were bought; the rest were won
-- in the game. Spending takes the won ones first, so the bought ones are
-- there to give back within the withdrawal's days. Never above
-- system_points.
ALTER TABLE characters ADD COLUMN system_points_paid INTEGER NOT NULL DEFAULT 0;

-- An account whose payment the bank took back (a chargeback) buys nothing
-- more until the author clears it.
ALTER TABLE users ADD COLUMN purchases_blocked INTEGER NOT NULL DEFAULT 0;
