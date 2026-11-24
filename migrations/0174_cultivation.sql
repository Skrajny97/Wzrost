-- Kultywacja's own level (1230 A, the author 24.11.2026: „Niech Kultywacja
-- ma swoje poziomy (max 100) i daje +1% do XP postaci podczas wypraw”;
-- src/engine/cultivation.js, src/server/cultivation.js): its level, 0 to
-- balance.json cultivation.maxLevel, and its XP into it, a point a minute
-- of meditation. Each level gives the character a share more XP from
-- explorations.
ALTER TABLE characters ADD COLUMN cultivation_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN cultivation_xp INTEGER NOT NULL DEFAULT 0;
