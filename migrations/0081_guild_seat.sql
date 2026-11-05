-- The Siedziba Gildii (src/server/guild-seat.js, src/engine/guild-seat.js;
-- the author's 616 A): a row for a guild's building once a member donates
-- to it or the leader or a deputy marks it, holding all the gold and the
-- pieces of its camp resource ever donated to it (the building's level
-- follows from them and the costs in data/guilds.json, each level's surplus
-- carried over to the next) and whether it is marked as preferred. A guild
-- that goes takes its rows with it (guildRemoval, guilds.js).
CREATE TABLE guild_seat (
  guild_id INTEGER NOT NULL,
  building_id TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  resource INTEGER NOT NULL DEFAULT 0,
  preferred INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, building_id)
);
