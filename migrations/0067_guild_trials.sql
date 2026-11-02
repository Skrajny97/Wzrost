-- The Próby Gildii (src/server/guild-trials.js, src/engine/guild-trials.js;
-- the author's 345 A).
--
-- Each guild's board of a week (`week`: the key of its Monday, as the
-- weekly quests have it), drawn the first time a member looks at it that
-- week: its trials as JSON and the members active then, which set its
-- thresholds.
--
-- The trials its members take: one active at a time for a character in a
-- week, each board trial (`trial`, its place on the board) done once a week;
-- `count` is what it asked of the character when taken. A dropped trial
-- keeps its row as 'dropped'. A character that goes leaves its finished
-- trials counted, without its id (SET NULL), so a threshold reached stays
-- reached and a character given that id later inherits nothing.
--
-- The chests of the thresholds: once a week and threshold for a character,
-- whatever its guild.
--
-- A guild that goes takes its boards and trials along. The boards, trials
-- and chests of the weeks before the last one go when a new board comes.
CREATE TABLE guild_trial_boards (
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  trials TEXT NOT NULL,
  active INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, week)
);

CREATE TABLE guild_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  character_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  trial INTEGER NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active',
  taken_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE UNIQUE INDEX guild_trials_active ON guild_trials (character_id, week) WHERE state = 'active';
CREATE INDEX guild_trials_week ON guild_trials (guild_id, week, state);
CREATE INDEX guild_trials_character ON guild_trials (character_id);

CREATE TABLE guild_trial_chests (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  guild_id INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, week, threshold)
);
