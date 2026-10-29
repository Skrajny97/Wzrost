-- Class evolutions (DECISIONS.md, "Ewolucje: budowa"): the evolution the
-- character took at class level 50, NULL before it, and on the test version
-- the skills it had before a test evolution, to undo it.
ALTER TABLE characters ADD COLUMN evolution TEXT;
ALTER TABLE characters ADD COLUMN evolution_undo TEXT;
