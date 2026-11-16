-- The reward for days in a row for each character, not for the account
-- (the author, 16.11.2026: „powinna działać na wszystkich postaciach”; till
-- now one series for the account, 0150): each character its own series.
-- The account's series so far goes on with the character played now, the
-- one that took its rewards; users.streak_* stay unused.
ALTER TABLE characters ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN streak_at TEXT;
ALTER TABLE characters ADD COLUMN streak_done INTEGER NOT NULL DEFAULT 0;

UPDATE characters
SET streak_day = (SELECT u.streak_day FROM users u WHERE u.id = characters.user_id),
    streak_at = (SELECT u.streak_at FROM users u WHERE u.id = characters.user_id),
    streak_done = (SELECT u.streak_done FROM users u WHERE u.id = characters.user_id)
WHERE role = 'player' AND user_id IN (SELECT id FROM users WHERE streak_at IS NOT NULL);
