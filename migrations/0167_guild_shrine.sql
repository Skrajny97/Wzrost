-- The Kącina: opiekun tygodnia (1201 A, 19.11.2026; src/server/guild-shrine.js).
-- Each member's vote of a week (`week`: the Monday's date, as the Próby's)
-- for one of the gods offered then, once a week in a guild.
CREATE TABLE guild_shrine_votes (
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  god_id TEXT NOT NULL,
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, week, character_id)
);

-- The patron of a guild's week (`week`: the week it reigns, the one after
-- the vote), counted once as the week starts; `god_id` null when nobody
-- voted. The rows and votes of the weeks before the last one go as a new
-- week is counted; a guild gone takes its own along (guilds.js).
CREATE TABLE guild_patrons (
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  god_id TEXT,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, week)
);
