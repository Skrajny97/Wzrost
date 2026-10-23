-- Characters, their items, the current activity and reports.
-- The player and future companions share the characters table (role).

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  class_level INTEGER NOT NULL DEFAULT 1,
  class_xp INTEGER NOT NULL DEFAULT 0,
  -- Free points spent so far, as JSON: {"strength": 3, ...}
  points TEXT NOT NULL DEFAULT '{}',
  position TEXT NOT NULL,
  -- HP at the time hp_at; regeneration since then is computed on read.
  hp INTEGER NOT NULL,
  hp_at INTEGER NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX characters_one_player ON characters (user_id) WHERE role = 'player';

-- slot is NULL while the item is in the bag.
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  slot TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX items_character ON items (character_id);
CREATE UNIQUE INDEX items_one_per_slot ON items (character_id, slot) WHERE slot IS NOT NULL;

-- A character does exactly one thing at a time.
CREATE TABLE activities (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  region_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  seed TEXT NOT NULL,
  hp_at_start INTEGER NOT NULL
);

-- activity_key is unique, so one activity can never be claimed twice.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  activity_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX reports_character ON reports (character_id, id DESC);
