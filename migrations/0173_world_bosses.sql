-- The World Bosses (1222–1226 A; src/engine/world-boss.js, src/server/world-boss.js;
-- DECISIONS.md, "Postrach Krainy (1222–1226)").
--
-- The boss of each band of levels and week (`week`: the key of its Monday,
-- as the weekly quests have it; `region`: the band's land in
-- data/regions.json; `boss`: its id in data/world-bosses.json), made by
-- the first look at it or attack on it in that week: the active characters
-- of the band it counted then and their average level, its most HP and the
-- HP left, and when it fell and by whose hit.
CREATE TABLE world_bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  region TEXT NOT NULL,
  boss TEXT NOT NULL,
  players INTEGER NOT NULL,
  level INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  fallen_at INTEGER,
  fallen_by INTEGER,
  UNIQUE (week, region)
);

-- A character's week with a boss, made by its first attack of the week:
-- the boss it fights the whole week (its band then), the damage and
-- attacks it dealt it, the Polish day of its last attack and the attacks
-- of that day, and when it opened its Skrzynia Bossa. A character removed
-- takes its rows along (its damage stays off the boss's bar).
CREATE TABLE world_boss_fighters (
  week TEXT NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  boss_id INTEGER NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  day_hits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY (week, character_id)
);
CREATE INDEX world_boss_fighters_boss ON world_boss_fighters (boss_id, damage DESC);

-- The titles of a fallen boss's best (data/world-bosses.json, title),
-- written by the hit that felled it, each worn until `until`.
CREATE TABLE world_boss_titles (
  boss_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (boss_id, character_id)
);
CREATE INDEX world_boss_titles_character ON world_boss_titles (character_id, until);
