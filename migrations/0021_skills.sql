-- The skills a character learned and their levels, as JSON: { "power-strike":
-- 3 }. A skill is learned at a class level milestone (one of the three of its
-- class) and raised with Skill Points from later class levels (skills.js).
ALTER TABLE characters ADD COLUMN skills TEXT NOT NULL DEFAULT '{}';
