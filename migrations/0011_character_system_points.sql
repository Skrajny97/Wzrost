-- Punkty Systemu belong to the character, not the account (the author's
-- decision, 24.10.2026), so "Zacznij od nowa" takes them along. A player
-- character keeps what its account had; after the fresh start of 0010 there
-- is none, so everyone starts from nothing.
ALTER TABLE characters ADD COLUMN system_points INTEGER NOT NULL DEFAULT 0;

UPDATE characters
SET system_points = (SELECT system_points FROM users WHERE users.id = characters.user_id)
WHERE role = 'player';

ALTER TABLE users DROP COLUMN system_points;
