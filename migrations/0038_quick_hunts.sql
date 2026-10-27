-- Szybkie Polowanie (DECISIONS.md, "Szybkie Polowanie"): how many the
-- character has used on which day in Poland, as {"day": "2026-10-27",
-- "used": 1}; another day starts again from none.
ALTER TABLE characters ADD COLUMN quick_hunts TEXT;
