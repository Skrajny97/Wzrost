-- The Ognisko's fire spirit: the trades of gold for resources made on one
-- day (src/engine/fire.js). fire_day is that day on the quests' clock
-- ("2026-10-26"); a count kept for an earlier day counts as none.
ALTER TABLE characters ADD COLUMN fire_day TEXT;
ALTER TABLE characters ADD COLUMN fire_trades INTEGER NOT NULL DEFAULT 0;
