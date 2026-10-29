-- The Encyklopedia (src/engine/encyclopedia.js): the keys of what each
-- character has held, such as "item:sword" with the best rarity got, and
-- the ids of the chests it has opened there.
ALTER TABLE characters ADD COLUMN discovered TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN encyclopedia TEXT NOT NULL DEFAULT '[]';
