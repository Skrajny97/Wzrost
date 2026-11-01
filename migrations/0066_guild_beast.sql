-- The Bestia Gildii (src/server/guild-beast.js, src/engine/guild-beast.js):
-- one beast for each guild and week (the key of its Monday, as the weekly
-- quests have it), made by the first look at it or attack on it in that
-- week: its champion and inner region, its level and the members it was
-- made for, its most HP and the HP left, and when it fell and by whose hit;
-- every attack with its damage and the Polish day it was made on (a
-- character's attacks of a day are counted in whatever guild it is); and
-- the Skrzynie Bestii opened, one for each character and week.
CREATE TABLE guild_beasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  monster_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  members INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  fallen_at INTEGER,
  fallen_by INTEGER,
  UNIQUE (guild_id, week)
);

CREATE TABLE guild_beast_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  beast_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  damage INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_beast_hits_beast ON guild_beast_hits (beast_id, character_id);
CREATE INDEX guild_beast_hits_character ON guild_beast_hits (character_id, day);

CREATE TABLE guild_beast_chests (
  character_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  beast_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, week)
);
