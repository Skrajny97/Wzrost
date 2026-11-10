-- The Arena in the Osada (src/server/pvp-arena.js, src/engine/pvp-arena.js;
-- the author's 762 A): fights with other players' characters, as they are
-- saved, five a day, the rival's character defending itself.
--
-- A character's place in the Arena, from its first look at it or the first
-- fight it is challenged to: its rating (`season`: the month it was last
-- moved toward the start, year * 12 + month - 1 in Polish time; the first
-- request of a new month moves every rating of the months before), the
-- day of its last own fights and how many fell on it, the week (its Monday)
-- of its last own fight, which puts it on that week's table, the rivals it
-- is offered (their ids, as JSON), its last own fight for the playback, and
-- the newest of its defences it was shown (their id in arena_fights).
CREATE TABLE arena_ratings (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  season INTEGER NOT NULL,
  day TEXT,
  fights INTEGER NOT NULL DEFAULT 0,
  week TEXT,
  rivals TEXT NOT NULL DEFAULT '[]',
  last_fight TEXT,
  seen_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX arena_ratings_week ON arena_ratings (week, rating);
CREATE INDEX arena_ratings_rating ON arena_ratings (rating);

-- Each fight, for the defender's notice at its next visit (who, the result,
-- how its rating moved), kept for the days the data says. `result` is the
-- attacker's: 'win', 'loss' or 'draw'; the changes and ratings after it of
-- both sides; the seed the fight was drawn with. Its ids only grow
-- (AUTOINCREMENT), also once the old fights are gone, as a character's
-- defences seen are those up to an id.
CREATE TABLE arena_fights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  defender_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  result TEXT NOT NULL,
  attacker_change INTEGER NOT NULL,
  defender_change INTEGER NOT NULL,
  attacker_rating INTEGER NOT NULL,
  defender_rating INTEGER NOT NULL,
  seed TEXT NOT NULL
);
CREATE INDEX arena_fights_defender ON arena_fights (defender_id, id);
CREATE INDEX arena_fights_created ON arena_fights (created_at);

-- A week's table, frozen once for everyone the first time the next week
-- asks for the Arena (as the guilds' Sława, guild-fame.js): the place and
-- rating of each character that fought that week, and when its reward was
-- claimed ("Odbierz"), once.
CREATE TABLE arena_weeks (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  place INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY (character_id, week)
);
CREATE INDEX arena_weeks_week ON arena_weeks (week, place);
