-- Fixes to the payments for Punkty Systemu after the code review of
-- 11.11.2026 (src/server/payments.js; DECISIONS.md, "Wersja 0.2.68").

-- A refund asked of the gateway for a purchase: whether the gateway took
-- the request ('asked'), did not take it or did not answer ('refused'), or
-- did it at once ('done'), and when it was asked last. A purchase being
-- given back ('refunding') whose refund the gateway has not taken waits for
-- the author, who asks again, marks it given back or restores it.
ALTER TABLE purchases ADD COLUMN refund_state TEXT;
ALTER TABLE purchases ADD COLUMN refund_at INTEGER;

-- A payment that came for an order already paid, under another payment
-- number of the gateway: the player paid twice. It credits nothing and
-- waits for the author to give it back: 'paid' until the refund is asked,
-- then 'refunding' (its refund_state as above) and 'refunded'.
CREATE TABLE purchase_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  refund_state TEXT,
  refund_at INTEGER,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  UNIQUE (provider, provider_ref)
);
CREATE INDEX purchase_extras_by_status ON purchase_extras (status, created_at);

-- The ids of accounts and characters are given again after the highest one
-- is deleted, so a purchase keeps the record of a deleted account or
-- character with its id made negative (accounts.js, characters.js) and no
-- new account or character ever takes it. The purchases of those deleted
-- before 0.2.68 are detached here the same way.
UPDATE purchases SET user_id = -user_id
  WHERE user_id > 0 AND (user_id NOT IN (SELECT id FROM users) OR user_id IN (SELECT u.id FROM users u WHERE u.created_at > purchases.created_at));
UPDATE purchases SET character_id = -character_id
  WHERE character_id > 0 AND (character_id NOT IN (SELECT id FROM characters) OR character_id IN (SELECT c.id FROM characters c WHERE c.created_at > purchases.created_at));
