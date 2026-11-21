-- The Pradruid's second skill: „Pradawne stado” (ancient-herd) in place of
-- „Odrodzenie puszczy” (forest-rebirth; 1221 A, 21.11.2026). Its level moves
-- to the new skill, so no Skill Point is lost: the Pradruid holds Gaj wieków
-- and Pradawne stado at the levels it had in Gaj wieków and Odrodzenie
-- puszczy. json_set adds the new key at the end and json_remove takes the old
-- one, so Gaj wieków stays first. The test version's copy of the skills from
-- before a test evolution (evolution_undo, for "Cofnij ewolucję") follows.
UPDATE characters
SET skills = json_remove(json_set(skills, '$."ancient-herd"', json_extract(skills, '$."forest-rebirth"')), '$."forest-rebirth"'),
    version = version + 1
WHERE json_extract(skills, '$."forest-rebirth"') IS NOT NULL;
UPDATE characters
SET evolution_undo = json_remove(json_set(evolution_undo, '$."ancient-herd"', json_extract(evolution_undo, '$."forest-rebirth"')), '$."forest-rebirth"')
WHERE evolution_undo IS NOT NULL
  AND json_extract(evolution_undo, '$."forest-rebirth"') IS NOT NULL;
