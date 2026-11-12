-- Zdarzenia drużynowe (src/server/party-events.js; the author's 844 A,
-- 845 A, 846 A, 847 B and 848, 12.11.2026): at most one event at the end
-- of a Drużyna's trip that ended as planned, the same for everyone who went.
-- One row a trip (trip_key: the trip's seed), made at the first claim of
-- any of its explorations: the trip's leader chooses at its own claim, or
-- the event settles itself with its `auto` option at auto_at, 12 hours
-- after the trip's end. Its result is kept once it is chosen (choice,
-- chosen_by 'leader' or 'auto', result), and every member gets its own
-- report of it; `applied` once all of them have it. `members`: those who
-- went, [{ id, name, hpEnd }], their HP at the trip's end; `level`: the
-- trip leader's, the level of an event's foes.
CREATE TABLE party_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_key TEXT NOT NULL UNIQUE,
  party_id INTEGER NOT NULL,
  leader_id INTEGER NOT NULL,
  leader_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  members TEXT NOT NULL,
  ends_at INTEGER NOT NULL,
  auto_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  choice TEXT,
  chosen_by TEXT,
  result TEXT,
  resolved_at INTEGER,
  applied INTEGER NOT NULL DEFAULT 0
);
-- The cron's looks: the events waiting past their time, the results not
-- given to everyone yet, and the old ones to drop.
CREATE INDEX party_events_auto ON party_events (auto_at) WHERE choice IS NULL;
CREATE INDEX party_events_applied ON party_events (resolved_at) WHERE choice IS NOT NULL AND applied = 0;
CREATE INDEX party_events_ends ON party_events (ends_at);

-- A party's premia for its next trip, from a party event (`boon`): JSON
-- { haste, xp, gold } shares, taken as the party sets out (parties.js).
ALTER TABLE parties ADD COLUMN boon TEXT;
