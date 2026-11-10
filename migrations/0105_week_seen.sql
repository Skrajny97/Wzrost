-- The weeks of the year (src/server/weeks.js; the author, 10.11.2026: „tylko
-- musi być jakaś informacja o takich obszarówkach dla gracza”): the start of
-- the week the character was last told of, so the game names a new week and
-- its bonus once, on the character's first visit in it. NULL: none yet.
ALTER TABLE characters ADD COLUMN week_seen INTEGER;
