-- Znaki Gildii i Kram (1202 A; src/engine/guild-stall.js,
-- src/server/guild-stall.js; DECISIONS.md, "Znaki Gildii i Kram").
--
-- Each point of Sława a member brings its guild gives it a Znak Gildii, the
-- character's own (as its Sława in the members' ranking), kept after it
-- leaves the guild. `earned`: the Znaki of the weeks whose members' Sława
-- is written (guild_member_fame), credited in the same batch; the week
-- going on is counted from the sources each time, as the ranking counts
-- it. `spent`: what the Kram Gildii took. `version` moves with every
-- credit and purchase, so a purchase lands only on the Znaki as read.
CREATE TABLE guild_marks (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  earned INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0
);

-- What a character bought in the Kram Gildii (`good`: an id of
-- data/guilds.json stall.goods), in a week (`week`: the key of its Monday),
-- for its weekly limits, at its price; `slot`: the slot of an item bought.
CREATE TABLE guild_stall_buys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  good TEXT NOT NULL,
  price INTEGER NOT NULL,
  slot TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_stall_buys_character ON guild_stall_buys (character_id, week, good);
