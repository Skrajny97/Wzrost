-- The epic part "Runy" is now "Odłamki" (id shards): runes will come later
-- in the game as something else. The parts a character has and the orders
-- on its Stół rzemieślniczy follow (both JSON, written without spaces).
UPDATE characters
SET parts = json_remove(json_set(parts, '$.shards', json_extract(parts, '$.runes')), '$.runes')
WHERE json_extract(parts, '$.runes') IS NOT NULL;
UPDATE characters
SET crafting = replace(crafting, '"partId":"runes"', '"partId":"shards"')
WHERE instr(crafting, '"partId":"runes"') > 0;
