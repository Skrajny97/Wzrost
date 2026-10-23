-- The camp: resources found on explorations and buildings with upgrade timers.

-- Resources as JSON: {"wood": 12, "stone": 3, ...}. Gold keeps its own column.
ALTER TABLE characters ADD COLUMN resources TEXT NOT NULL DEFAULT '{}';

-- A row for every building built at least once. level is the level the
-- building has once ends_at has passed; until then it still has level - 1.
CREATE TABLE buildings (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  building_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, building_id)
);
