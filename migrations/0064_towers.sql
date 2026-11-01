-- The Wieże Systemu (src/server/towers.js): each character's record of
-- the towers, as JSON: the day and the entries used on it, the highest
-- floor won in each tower and the floors whose chest it has taken.
ALTER TABLE characters ADD COLUMN towers TEXT NOT NULL DEFAULT '{}';
