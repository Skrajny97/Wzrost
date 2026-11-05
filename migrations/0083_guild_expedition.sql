-- The Wyprawa Gildii (the author's 621 A; src/server/guild-expedition.js,
-- src/engine/guild-expedition.js).
--
-- A guild's route of a week (`week`: the key of its Monday, as the weekly
-- quests have it), made by the first look at it that week: its land, the
-- members' average level then, its seven guardians as JSON (so a route
-- keeps them whatever the data says later), the members active then and
-- the shares of the week of those who joined since (`joined`, as the Próby
-- Gildii's boards), which set the minutes of a stage and a guardian's HP.
--
-- The minutes of exploration each character brought into a guild in a week,
-- added as it claims a report. A character that goes leaves its minutes on
-- the route, without its id (SET NULL), and one given that id later
-- inherits nothing.
--
-- Each guardian once the route reaches it: its stage, creature and place,
-- level, the members it came for, the minutes its stage took then (`need`),
-- its most HP and the HP left, and when it fell and by whose hit; every
-- attack with its damage and the Polish day it was made on (a character's
-- attacks of a day are counted in whatever guild it is); and the chests
-- opened, once a character, week and stage, whatever the guild.
--
-- A guild that goes takes its routes, guardians, attacks and minutes along.
-- The rows of the weeks before the last one go when a new route comes.
CREATE TABLE guild_expeditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  land_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  guardians TEXT NOT NULL,
  active INTEGER NOT NULL,
  joined REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, week)
);
CREATE INDEX guild_expeditions_week ON guild_expeditions (week);

CREATE TABLE guild_expedition_minutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  character_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, week, character_id)
);
CREATE INDEX guild_expedition_minutes_character ON guild_expedition_minutes (character_id, week);

CREATE TABLE guild_expedition_guardians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expedition_id INTEGER NOT NULL REFERENCES guild_expeditions (id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  monster_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  members REAL NOT NULL,
  need INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  fallen_at INTEGER,
  fallen_by INTEGER,
  UNIQUE (expedition_id, stage)
);

CREATE TABLE guild_expedition_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardian_id INTEGER NOT NULL REFERENCES guild_expedition_guardians (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  damage INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_expedition_hits_guardian ON guild_expedition_hits (guardian_id, character_id);
CREATE INDEX guild_expedition_hits_character ON guild_expedition_hits (character_id, day);

CREATE TABLE guild_expedition_chests (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  stage INTEGER NOT NULL,
  guardian_id INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, week, stage)
);
