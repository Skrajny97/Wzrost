-- Kulki Profesji over the scene of a work (src/engine/profession-orbs.js,
-- src/server/profession-orbs.js): the orbs a character caught on the day of
-- the narrator's daily quests, {"day": "2026-11-24", "count": 3}, counted
-- apart from the Kulki Systemu (orbs); NULL before the first. The orbs
-- caught on a work are kept with it (activities options.orbs, their numbers).
ALTER TABLE characters ADD COLUMN profession_orbs TEXT;
