-- Kulki Systemu on the exploration board (src/engine/orbs.js,
-- src/server/orbs.js): the orbs a character caught on the day of the
-- narrator's daily quests, {"day": "2026-11-19", "count": 3}; NULL before the
-- first. The orbs caught on an exploration are kept with it (activities
-- options.orbs, their numbers).
ALTER TABLE characters ADD COLUMN orbs TEXT;
