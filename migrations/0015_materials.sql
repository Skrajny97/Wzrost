-- Materials from beaten creatures ({"wolf-pelt:common": 3}), parts made on
-- the camp's Stół rzemieślniczy ({"scraps": 5}) and the table's queue of
-- orders, as JSON like the resources (src/engine/crafting.js).
ALTER TABLE characters ADD COLUMN materials TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN parts TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN crafting TEXT NOT NULL DEFAULT '[]';
