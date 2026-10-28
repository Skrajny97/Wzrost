-- "Testuj zdarzenia" on the test version: the event (data/events.json) the
-- character's next exploration brings at its end, without the draw
-- (src/engine/events.js). Cleared once the event is played.
ALTER TABLE characters ADD COLUMN event_test TEXT;
