-- Górnictwo and Jubilerstwo (src/engine/mining.js, src/engine/jewelcraft.js):
-- the gems and ores a character carries, by id ({"quartz": 3,
-- "silver-ore": 12}). They take no room in the bag, as materials do. A gem
-- set in an item stays in the item's data ({"gem": "emerald"}), and the work
-- of both professions sits in activities and avatar_activities as any other
-- (kinds "minerals" and "jewels").
ALTER TABLE characters ADD COLUMN minerals TEXT NOT NULL DEFAULT '{}';
