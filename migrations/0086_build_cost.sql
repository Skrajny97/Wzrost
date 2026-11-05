-- What a build was paid, gold and resources as JSON ({ "gold": 120,
-- "wood": 30 }): set as it starts by hand (src/server/camp.js:
-- beginBuilding) and copied from its entry in the queue, which keeps its own
-- (src/server/characters.js: settleBuilds). "Przerwij budowę" gives back
-- exactly that, as "Anuluj" gives back a waiting build's cost, also when the
-- prices changed since. NULL for a build started before: it gives back the
-- price of its level now.
ALTER TABLE buildings ADD COLUMN cost TEXT;
