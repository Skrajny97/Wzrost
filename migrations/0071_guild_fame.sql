-- The Sława of the guilds (src/server/guild-fame.js; the author: "379 A",
-- "380 C", "381 A"): each guild's Sława of a week (`week`: the key of its
-- Monday, as the weekly quests have it), frozen for every guild at once the
-- first time the next week asks for the ranking of the guilds, the Gildia
-- page or the best guild of the week before. The ranking "Od początku"
-- sums them with the week going on, and the best guild of the week before
-- has its tag in gold. A guild that goes takes its weeks along.
CREATE TABLE guild_fame (
  guild_id INTEGER NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (guild_id, week)
);
CREATE INDEX guild_fame_week ON guild_fame (week, points);
