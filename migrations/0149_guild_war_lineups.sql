-- The trios of a guild for an evening of the league, fixed at the first
-- run of its day, from midnight (the author's 1037.1 A, 16.11.2026: trios
-- drawn once, at midnight, and kept; one who leaves leaves its place empty,
-- one who joins during the day fights only the 1v1): `lineups` the ids of
-- the characters of each trio as drawn (JSON), `drawn_at` when.
CREATE TABLE guild_war_lineups (
  week TEXT NOT NULL,
  day INTEGER NOT NULL,
  guild_id INTEGER NOT NULL,
  lineups TEXT NOT NULL,
  drawn_at INTEGER NOT NULL,
  PRIMARY KEY (week, day, guild_id)
);
