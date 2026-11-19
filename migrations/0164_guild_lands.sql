-- Krainy pod sztandarem (1200 A; src/engine/guild-lands.js,
-- src/server/guild-lands.js; DECISIONS.md, "Krainy pod sztandarem").
--
-- The minutes of exploration each character brought its guild in a land
-- (`land_id`: a region of data/regions.json, from Wiatrołomy to Kraina bez
-- Słońca) in a week (`week`: the key of its Monday), added as it claims a
-- report, as the Wyprawa Gildii's minutes are. A character removed leaves
-- its minutes to the guild, without its id; a guild gone takes its rows.
--
-- The banners: as a week ends, each land goes to the guild with the most
-- minutes there that week, for the whole week after it (`week`: the key of
-- the Monday of the week the banner stands; `minutes`: what won it). Its
-- Sława (data/guilds.json, lands.fame) is the guild's in that week, and the
-- members' shares of it, by their minutes in the land, are in
-- guild_land_fame, for the members' ranking and the Znaki Gildii.
-- guild_land_weeks says the banners of a week were raised, any or none.
CREATE TABLE guild_land_minutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  land_id TEXT NOT NULL,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (week, land_id, guild_id, character_id)
);
CREATE INDEX guild_land_minutes_guild ON guild_land_minutes (guild_id, week);

CREATE TABLE guild_land_banners (
  week TEXT NOT NULL,
  land_id TEXT NOT NULL,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (week, land_id)
);
CREATE INDEX guild_land_banners_guild ON guild_land_banners (guild_id, week);

CREATE TABLE guild_land_fame (
  week TEXT NOT NULL,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  PRIMARY KEY (week, guild_id, character_id)
);

CREATE TABLE guild_land_weeks (
  week TEXT PRIMARY KEY,
  raised_at INTEGER NOT NULL
);

-- The members' Sława of the weeks gone (0127) gets the lands' part.
ALTER TABLE guild_member_fame ADD COLUMN lands INTEGER NOT NULL DEFAULT 0;
