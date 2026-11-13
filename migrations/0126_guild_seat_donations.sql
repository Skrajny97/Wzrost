-- Who gave what to the Siedziba Gildii (the author, 13.11.2026: „Powinno być
-- gdzieś wyszczególnione kto ile i czego wpłacił w Siedzibie Gildii”; the
-- members' ranking of 897): a row for a character's donations to one
-- building of its guild in one week (the Polish week from Monday's midnight,
-- as the weekly quests'), its gold and its pieces of the building's resource
-- summed (guild-seat.js). Donations count from this table on: those of
-- before are only in the buildings' sums (guild_seat). A member who leaves
-- leaves its rows with the guild, as its donations stay with the buildings;
-- a guild that goes takes its rows along (guildRemoval, guilds.js); a
-- character removed leaves them with its id made negative (detachedRows,
-- characters.js), as its id may be given again.
CREATE TABLE guild_seat_donations (
  guild_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  building_id TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  resource INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, character_id, week, building_id)
);

CREATE INDEX guild_seat_donations_week ON guild_seat_donations (guild_id, week);
