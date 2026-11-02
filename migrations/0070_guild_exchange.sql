-- The Wymiana in the Gildia (src/server/guild-exchange.js; the author:
-- "Dodatkowa funkcja w Gildii -> wymiana zasobów").
--
-- A member's offer of `give_count` pieces of one camp resource (`give`, an
-- id from data/resources.json) for `want_count` pieces of another (`want`).
-- The pieces given leave the poster's resources when the offer is made and
-- wait in it. State: open, taken, withdrawn or expired; an open one whose
-- time is up (ends_at) has expired, and its pieces go back to its poster
-- the next time it opens or uses the Wymiana or the Gildia page. A taken
-- one keeps its taker and when it was taken (closed_at); a taker that goes
-- leaves the exchange counted, without its id (SET NULL). A member who
-- leaves its guild or is removed gets the pieces of its open offers back in
-- the same batch (guildRemoval, guilds.js), so a guild never ends with an
-- open offer. A character that goes takes its offers along. The offers
-- closed before last week began go when a new offer is made.
CREATE TABLE guild_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  give TEXT NOT NULL,
  give_count INTEGER NOT NULL,
  want TEXT NOT NULL,
  want_count INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER,
  taker_id INTEGER REFERENCES characters (id) ON DELETE SET NULL
);
CREATE INDEX guild_offers_guild ON guild_offers (guild_id, state, ends_at);
CREATE INDEX guild_offers_character ON guild_offers (character_id, state);
CREATE INDEX guild_offers_closed ON guild_offers (closed_at);
