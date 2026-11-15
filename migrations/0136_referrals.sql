-- Poleć grę (982 A with the author's note, 15.11.2026; mock-ups 985;
-- src/server/referrals.js): each account's own link to the game,
-- /?p=<referral_code>, a random code made at its first need (unique), and
-- the account that brought an account by its link (`referred_by`, set once,
-- at the account's creation). referral_rewards holds the rewards taken: of
-- the account that came by a link (`referred_id`), at the level of
-- `level`, by its referrer (`side` 'referrer') or by itself ('newcomer'),
-- with the account that took it (`user_id`), its Punkty Systemu and the
-- month it was taken in (Polish time, 'YYYY-MM'), for the limit a month.
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by INTEGER;
CREATE UNIQUE INDEX users_referral_code ON users (referral_code);
CREATE INDEX users_referred_by ON users (referred_by);

CREATE TABLE referral_rewards (
  referred_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  side TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  month TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (referred_id, level, side)
);
CREATE INDEX referral_rewards_by_user ON referral_rewards (user_id, side, month);
