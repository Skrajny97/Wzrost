-- Free stat points beyond those of the levels: the blue mushroom of the
-- events can give one (data/events.json, src/engine/stats.js earnedPoints).
ALTER TABLE characters ADD COLUMN bonus_points INTEGER NOT NULL DEFAULT 0;
