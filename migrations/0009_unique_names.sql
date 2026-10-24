-- A player's name is unique across all accounts, whatever the letter case:
-- name_key holds the name in lower case (nameKey in src/server/characters.js).
-- SQLite's lower() changes only A-Z, so the Polish capitals go first.
-- Characters made before the rule keep their names. When two of them share
-- one, the older keeps the key and the younger gets its id added, which no
-- name can contain, so nobody new can take the name.
ALTER TABLE characters ADD COLUMN name_key TEXT;

UPDATE characters
SET name_key = lower(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(name,
    'Ą', 'ą'), 'Ć', 'ć'), 'Ę', 'ę'), 'Ł', 'ł'), 'Ń', 'ń'), 'Ó', 'ó'), 'Ś', 'ś'), 'Ź', 'ź'), 'Ż', 'ż')
)
WHERE role = 'player';

UPDATE characters
SET name_key = name_key || '#' || id
WHERE role = 'player'
  AND EXISTS (
    SELECT 1 FROM characters AS older
    WHERE older.role = 'player' AND older.name_key = characters.name_key AND older.id < characters.id
  );

CREATE UNIQUE INDEX characters_unique_name ON characters (name_key) WHERE role = 'player';
