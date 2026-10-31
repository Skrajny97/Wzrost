-- The camp's Kwatery (data/buildings.json "quarters"): from now on each
-- companion hired in the Karczma needs a bed there. A character who hired
-- companions before the Kwatery stood gets them built, one level for each
-- companion (at most their two levels), so nobody loses a companion.
INSERT INTO buildings (character_id, building_id, level, started_at, ends_at)
SELECT id, 'quarters', MIN(json_array_length(settlement, '$.companions'), 2), 0, 0
FROM characters
WHERE json_valid(settlement)
  AND json_type(settlement, '$.companions') = 'array'
  AND json_array_length(settlement, '$.companions') > 0
  AND NOT EXISTS (SELECT 1 FROM buildings WHERE buildings.character_id = characters.id AND buildings.building_id = 'quarters');
