-- The game is for people aged 16 or over (725 A, 0.2.3, for Google Play).
-- An account made with the form confirms it there ("Mam co najmniej 16
-- lat"); a new account made by signing in with Google confirms it once
-- before it plays (age_required). Accounts made before 0.2.3 are not asked.
ALTER TABLE users ADD COLUMN age_confirmed_at INTEGER;
ALTER TABLE users ADD COLUMN age_required INTEGER NOT NULL DEFAULT 0;
