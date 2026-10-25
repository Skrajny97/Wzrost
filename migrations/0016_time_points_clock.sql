-- Punkty Czasu also come with time alone: one every half an hour
-- (data/balance.json: timePoints.generateMinutes), counted from
-- time_points_at, server time in ms. It moves on by whole intervals as the
-- points are added (src/engine/progression.js: gainedTimePoints). Characters
-- made before start counting now.
ALTER TABLE characters ADD COLUMN time_points_at INTEGER NOT NULL DEFAULT 0;
UPDATE characters SET time_points_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000;
