-- The Arena's "Karty" (src/server/card-arena.js, src/engine/card-arena.js;
-- DECISIONS.md, 900 A): matches of Talia Systemu with the decks other
-- players saved (card_decks, 0124_cards.sql), the rival's deck played by
-- the server, five a day; a card rating of its own and its week's table,
-- as the duels' (0107_pvp_arena.sql).
--
-- A character's place in the Karty, from its first look at them or the
-- first match played against its deck: its card rating (`season`: the
-- month it was last moved toward the start, year * 12 + month - 1 in Polish
-- time), the day of its last matches started and how many started on it,
-- the week (its Monday) of its last match finished, which puts it on that
-- week's table, the rivals it is offered (their ids, as JSON), its last
-- match finished for the page (the ratings before and after it), the
-- newest of its deck's defences it was shown (an id in card_arena_results),
-- and the day of its last draw of other rivals and how many fell on it.
CREATE TABLE card_arena_ratings (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  season INTEGER NOT NULL,
  day TEXT,
  matches INTEGER NOT NULL DEFAULT 0,
  week TEXT,
  rivals TEXT NOT NULL DEFAULT '[]',
  last_match TEXT,
  seen_id INTEGER NOT NULL DEFAULT 0,
  reroll_day TEXT,
  rerolls INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX card_arena_ratings_week ON card_arena_ratings (week, rating);
CREATE INDEX card_arena_ratings_rating ON card_arena_ratings (rating);

-- A character's running match in the Karty, one at most (apart from its
-- match with Szczęsny, card_matches): its whole state as JSON (the seed,
-- both decks, the lines and reserves, never sent to the page), the rival
-- as the table shows it and what the match puts at stake for both ratings,
-- fixed at its start. `rival_id` turns NULL when the rival's character is
-- removed meanwhile: the match still ends, and moves no rating of its.
-- `version` grows with each turn, so two taps play one turn. The row goes
-- when the match ends.
CREATE TABLE card_arena_matches (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  rival_id INTEGER REFERENCES characters (id) ON DELETE SET NULL,
  rival TEXT NOT NULL,
  stakes TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Each match finished, for its defender's notice (who played against its
-- deck, the result, how its rating moved), kept for the days the data
-- says. `result` is the attacker's: 'win', 'loss' or 'draw'; the changes
-- and the ratings after it of both sides. Its ids only grow, in the order
-- the matches end, as a character's defences seen are those up to an id.
CREATE TABLE card_arena_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  defender_id INTEGER REFERENCES characters (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  result TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  attacker_change INTEGER NOT NULL,
  defender_change INTEGER NOT NULL,
  attacker_rating INTEGER NOT NULL,
  defender_rating INTEGER
);
CREATE INDEX card_arena_results_defender ON card_arena_results (defender_id, id);
CREATE INDEX card_arena_results_created ON card_arena_results (created_at);

-- A week's card table, frozen once for everyone the first time the next
-- week asks for the Karty (as arena_weeks): the place and card rating of
-- each character that finished a match that week, and when its reward was
-- claimed ("Odbierz"), once.
CREATE TABLE card_arena_weeks (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  place INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY (character_id, week)
);
CREATE INDEX card_arena_weeks_week ON card_arena_weeks (week, place);
