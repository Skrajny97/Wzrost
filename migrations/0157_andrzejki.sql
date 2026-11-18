-- Andrzejki: Wieczór wróżb (1082 C, 1083 C, 1084 A and B; src/engine/andrzejki.js):
-- each character's fortunes told, by the Polish day,
-- {"2026-11-29": {"omen": "dragon", "kind": "wax", "at": 1795…}}; NULL before the first.
ALTER TABLE characters ADD COLUMN andrzejki TEXT;
