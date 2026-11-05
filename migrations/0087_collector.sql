-- The Zbieracz Systemu (DECISIONS.md, „Zbieracz Systemu”): bought once for
-- good, at collector_at. From then on the game collects every whole fill of
-- the camp's stores whenever it loads the player's character
-- (src/server/characters.js: settleCollector).
ALTER TABLE characters ADD COLUMN collector_at INTEGER;
