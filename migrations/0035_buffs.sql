-- Potions drunk from the bag that work for a time (src/engine/potions.js):
-- {"speed": {"until": 1793100000000, "bonus": 0.15}}. An exploration keeps
-- the potions taken along, the healing mark and the speed it starts with in
-- activities.options. The number belongs to the working branch, as 0025
-- and 0033 do: main goes on from 0036.
ALTER TABLE characters ADD COLUMN buffs TEXT NOT NULL DEFAULT '{}';
