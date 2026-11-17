-- Szczodre Gody (1044): each character's calendar of 1–24 December,
-- {"period": "2026-12", "taken": [days]} (src/engine/winter.js), the days
-- of that period whose reward it took; NULL before the first.
ALTER TABLE characters ADD COLUMN winter TEXT;
