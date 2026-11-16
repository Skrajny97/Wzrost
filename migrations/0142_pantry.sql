-- Rybołówstwo (src/engine/fishing.js; 999.1, 1057): the Spiżarnia, the fish
-- a character keeps by id ({"roach": 4, "perch": 2}), and later the crops of
-- Rolnictwo and the dishes of Gotowanie. They take no room in the bag, as
-- minerals do, and the innkeeper buys them. Fishing sits in activities and
-- avatar_activities as any other work (kind "fish").
ALTER TABLE characters ADD COLUMN pantry TEXT NOT NULL DEFAULT '{}';
