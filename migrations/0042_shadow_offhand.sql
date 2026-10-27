-- The Cień does not shoot (the author, 27.10.2026: "to bez sensu że Cień,
-- nieużywający łuku może zakładać kołczan a nie tylko Łucznik"): its
-- off-hand is the Mizerykordia and, from class level 10, the Kordzik, with
-- the numbers of the Kołczan and the Sajdak. A Shadow's Kołczan and Sajdak,
-- worn or in the bag, become a Mizerykordia and a Kordzik with the same
-- numbers and affixes.
UPDATE items SET data = json_set(data, '$.base', 'misericorde')
WHERE json_extract(data, '$.base') = 'quiver'
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) = 'shadow';
UPDATE items SET data = json_set(data, '$.base', 'dirk')
WHERE json_extract(data, '$.base') = 'bow-case'
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) = 'shadow';
