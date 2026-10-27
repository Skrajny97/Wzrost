-- The Bestiariusz of an inner region, its list of creatures, has a chest
-- that opens once the character has met every creature on it: the ids of
-- the inner regions whose chest the character has opened, as a JSON list
-- (src/server/bestiary.js).
ALTER TABLE characters ADD COLUMN bestiary TEXT NOT NULL DEFAULT '[]';
