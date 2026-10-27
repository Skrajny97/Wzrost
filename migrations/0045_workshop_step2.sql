-- Rzemieślnictwo, step 2 (DECISIONS.md, the author's answers R14, R16, R17):
-- the Zwoje ochronne the character has made for the Kowadło, the patterns
-- it has learned by taking items apart ("Rozebranie przedmiotu odsłania
-- jego wzór od razu"), as a JSON list of base ids, and the parts bought
-- from the Skup złomu today, by part id, with the Warsaw day they count
-- for, as the fire spirit's trade keeps its pieces.
ALTER TABLE characters ADD COLUMN scrolls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN patterns TEXT NOT NULL DEFAULT '[]';
ALTER TABLE characters ADD COLUMN shop_day TEXT;
ALTER TABLE characters ADD COLUMN shop_parts TEXT NOT NULL DEFAULT '{}';
