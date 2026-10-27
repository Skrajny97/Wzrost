-- Alchemia (src/engine/brewing.js): the potions a character carries, by id
-- ({"lesser-healing": 12}). They stack in the bag as herbs do, so they take
-- its places by the stack. A brewing keeps its recipe, the count and the
-- herbs it took with the activity, in activities.options from 0025
-- ({"recipe": "lesser-healing", "count": 12, "herbs": {"comfrey": 36}}).
-- The number belongs to the working branch, as 0025 does: main goes on
-- from 0034.
ALTER TABLE characters ADD COLUMN potions TEXT NOT NULL DEFAULT '{}';
