-- The Prośby Gildii (src/server/guild-requests.js; the author's 346 A).
--
-- A member's request to its guild for pieces of one material, herb or
-- potion (`kind`; `good`: a material's "materialId:rarityId", a herb's or
-- a potion's id): `count` asked, `given` so far. State: open, filled,
-- cancelled or expired; an open one whose time is up (ends_at) has expired.
-- One open request for a character at a time.
--
-- The gifts: who gave how many to which request and when, and when its
-- requester thanked for it, once.
--
-- A guild or a character that goes takes its requests and gifts along, and
-- a request that goes takes its gifts. The requests closed before the week
-- began go with their gifts when a new request is made.
CREATE TABLE guild_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  good TEXT NOT NULL,
  count INTEGER NOT NULL,
  given INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE UNIQUE INDEX guild_requests_open ON guild_requests (character_id) WHERE state = 'open';
CREATE INDEX guild_requests_guild ON guild_requests (guild_id, state, ends_at);
CREATE INDEX guild_requests_character ON guild_requests (character_id, created_at);

CREATE TABLE guild_gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES guild_requests (id) ON DELETE CASCADE,
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  giver_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  thanked_at INTEGER
);
CREATE INDEX guild_gifts_request ON guild_gifts (request_id);
CREATE INDEX guild_gifts_guild ON guild_gifts (guild_id, created_at);
CREATE INDEX guild_gifts_giver ON guild_gifts (giver_id);
