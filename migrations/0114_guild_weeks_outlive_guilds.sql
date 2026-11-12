-- A guild that ends no longer takes its weeks along (the code review of
-- 12.11.2026): the Próby Gildii's boards and trials and the Wyprawa
-- Gildii's routes, guardians, hits and minutes stay after the last member
-- leaves, so the chests its former members earned there this week and the
-- last one still open, as DECISIONS.md says ("Próby i Prośby Gildii" 7,
-- "Wyprawa Gildii (621 A)" 9). Guild ids are AUTOINCREMENT, so the rows of
-- a guild gone never pass to another, and they go with the weeks before
-- the last one, as every guild's do (boardOf, routeOf).
--
-- SQLite drops no foreign key, so each table is made again without its
-- guild's. The new tables are filled first and the old ones dropped from
-- the leaves (hits before guardians before routes), so no ON DELETE
-- CASCADE of an old table takes a copied row along; renaming a new table
-- points the keys of its children at the new name. A new trial's id
-- stays above every id the Sława counted (fame_trials), so no trial takes
-- the id of one counted before.
--
-- The Bestia Gildii counts the members who join after it came (`counted`,
-- as the boards and routes, 0085): each such member adds its share of the
-- week's HP, as for the Próby and the Wyprawa. A beast of this week counts
-- the members the guild has now.
PRAGMA defer_foreign_keys = true;

CREATE TABLE guild_trial_boards_next (
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  trials TEXT NOT NULL,
  active INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  joined REAL NOT NULL DEFAULT 0,
  opened INTEGER NOT NULL DEFAULT 0,
  counted TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (guild_id, week)
);
INSERT INTO guild_trial_boards_next (guild_id, week, trials, active, created_at, joined, opened, counted)
  SELECT guild_id, week, trials, active, created_at, joined, opened, counted FROM guild_trial_boards;

CREATE TABLE guild_trials_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  character_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  trial INTEGER NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active',
  taken_at INTEGER NOT NULL,
  done_at INTEGER,
  extra INTEGER NOT NULL DEFAULT 0
);
INSERT INTO guild_trials_next (id, guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at, extra)
  SELECT id, guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at, extra FROM guild_trials;
INSERT INTO guild_trials_next (id, guild_id, week, trial, kind, count, state, taken_at)
  SELECT (SELECT MAX(trial_id) FROM fame_trials), 0, '', 0, '', 0, 'gone', 0
  WHERE (SELECT MAX(trial_id) FROM fame_trials) > COALESCE((SELECT MAX(id) FROM guild_trials), 0);
DELETE FROM guild_trials_next WHERE state = 'gone' AND week = '';

CREATE TABLE guild_expeditions_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  land_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  guardians TEXT NOT NULL,
  active INTEGER NOT NULL,
  joined REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  counted TEXT NOT NULL DEFAULT '[]',
  UNIQUE (guild_id, week)
);
INSERT INTO guild_expeditions_next (id, guild_id, week, land_id, level, guardians, active, joined, created_at, counted)
  SELECT id, guild_id, week, land_id, level, guardians, active, joined, created_at, counted FROM guild_expeditions;

CREATE TABLE guild_expedition_guardians_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expedition_id INTEGER NOT NULL REFERENCES guild_expeditions_next (id) ON DELETE CASCADE,
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
INSERT INTO guild_expedition_guardians_next (id, expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by)
  SELECT id, expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by FROM guild_expedition_guardians;

CREATE TABLE guild_expedition_hits_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guardian_id INTEGER NOT NULL REFERENCES guild_expedition_guardians_next (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  damage INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO guild_expedition_hits_next (id, guardian_id, character_id, day, damage, created_at)
  SELECT id, guardian_id, character_id, day, damage, created_at FROM guild_expedition_hits;

CREATE TABLE guild_expedition_minutes_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  character_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, week, character_id)
);
INSERT INTO guild_expedition_minutes_next (id, guild_id, week, character_id, minutes, updated_at)
  SELECT id, guild_id, week, character_id, minutes, updated_at FROM guild_expedition_minutes;

DROP TABLE guild_expedition_hits;
DROP TABLE guild_expedition_guardians;
DROP TABLE guild_expeditions;
DROP TABLE guild_expedition_minutes;
DROP TABLE guild_trials;
DROP TABLE guild_trial_boards;

ALTER TABLE guild_trial_boards_next RENAME TO guild_trial_boards;
ALTER TABLE guild_trials_next RENAME TO guild_trials;
ALTER TABLE guild_expeditions_next RENAME TO guild_expeditions;
ALTER TABLE guild_expedition_guardians_next RENAME TO guild_expedition_guardians;
ALTER TABLE guild_expedition_hits_next RENAME TO guild_expedition_hits;
ALTER TABLE guild_expedition_minutes_next RENAME TO guild_expedition_minutes;

CREATE INDEX guild_trials_week ON guild_trials (guild_id, week, state);
CREATE INDEX guild_trials_character ON guild_trials (character_id);
CREATE UNIQUE INDEX guild_trials_member ON guild_trials (guild_id, week, character_id, trial);
CREATE INDEX guild_expeditions_week ON guild_expeditions (week);
CREATE INDEX guild_expedition_hits_guardian ON guild_expedition_hits (guardian_id, character_id);
CREATE INDEX guild_expedition_hits_character ON guild_expedition_hits (character_id, day);
CREATE INDEX guild_expedition_minutes_character ON guild_expedition_minutes (character_id, week);

ALTER TABLE guild_beasts ADD COLUMN counted TEXT NOT NULL DEFAULT '[]';
UPDATE guild_beasts SET counted = (SELECT json_group_array(m.character_id) FROM guild_members m WHERE m.guild_id = guild_beasts.guild_id);
