-- Kronika Gildii (1195 A; src/server/guild-chronicle.js): the System's lines in
-- a guild's channel. A line keeps what it says as {"key", "params"}, so each
-- reader sees it in its own language, and the text column its Polish. Its
-- `chronicle_key` names the event (e.g. "beast:12"): one line an event, as
-- the unique index lets a second INSERT OR IGNORE of it do nothing.
ALTER TABLE chat_messages ADD COLUMN chronicle TEXT;
ALTER TABLE chat_messages ADD COLUMN chronicle_key TEXT;
CREATE UNIQUE INDEX chat_messages_chronicle ON chat_messages (channel, chronicle_key) WHERE chronicle_key IS NOT NULL;

-- Róg zbiórki (1199 A; src/server/guild-rally.js): a guild's rally, its hour
-- set by the leader or a deputy, one a Polish day (`day`, the date of its
-- start), from `starts_at` to `ends_at`; `announced_at` once the Kronika's
-- line of its start is written.
CREATE TABLE guild_rallies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  set_by INTEGER,
  created_at INTEGER NOT NULL,
  announced_at INTEGER,
  UNIQUE (guild_id, day)
);
CREATE INDEX guild_rallies_start ON guild_rallies (starts_at);

-- Podcięcie i cios (1203; src/server/guild-strike.js): the podcięcia waiting
-- on a guild's Bestia or strażnik (`target`: "beast:<id>" or
-- "guardian:<id>"), each with the Cios of other players' members it still
-- strengthens (`uses_left`), the oldest used first.
CREATE TABLE guild_undercuts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  target TEXT NOT NULL,
  week TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  uses_left INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_undercuts_target ON guild_undercuts (target, id);
CREATE INDEX guild_undercuts_week ON guild_undercuts (week);
