-- Five characters on one account (DECISIONS.md, "Pięć postaci na koncie"):
-- the one the player plays keeps the role 'player', so characters_one_player
-- still allows one an account, and the others wait with the role 'aside',
-- their explorations and works going on meanwhile. A name stays unique
-- among all of them, played or set aside (0009_unique_names.sql).
DROP INDEX characters_unique_name;
CREATE UNIQUE INDEX characters_unique_name ON characters (name_key) WHERE role IN ('player', 'aside');
