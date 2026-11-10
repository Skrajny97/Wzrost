-- Punkty Sławy of the characters (src/server/fame.js, data/fame.json; the
-- author: "760 A"), apart from the guilds' Sława (guild_fame, 0071).
--
-- fame_points: each character's points of a week (`week`: the key of its
-- Monday, as the weekly quests have it), added in the batch of the action
-- that brings them, so they land only with it.
CREATE TABLE fame_points (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, week)
);
CREATE INDEX fame_points_week ON fame_points (week, points);

-- fame_trials: the Próby Gildii (guild_trials) whose points are counted
-- already, by the trial's id, so each brings them once, also when it opens
-- again or its guild goes. The weeks before the last one are cleared when
-- a week closes.
CREATE TABLE fame_trials (
  trial_id INTEGER PRIMARY KEY,
  week TEXT NOT NULL
);
CREATE INDEX fame_trials_week ON fame_trials (week);

-- fame_weeks: the weeks closed, each once (the first request of the next
-- week closes it), with or without winners.
CREATE TABLE fame_weeks (
  week TEXT PRIMARY KEY,
  closed_at INTEGER NOT NULL
);

-- fame_rewards: the best characters of a closed week, each of another
-- account, by place, with their points and their share of the pool of
-- Punkty Systemu, until the character claims it ("Odbierz" in the Sława
-- tab). The first one's name is in gold the whole next week. A character
-- that goes takes its rewards along.
CREATE TABLE fame_rewards (
  week TEXT NOT NULL,
  place INTEGER NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  share INTEGER NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY (week, place)
);
CREATE INDEX fame_rewards_character ON fame_rewards (character_id, claimed_at);
