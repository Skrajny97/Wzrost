-- The Kleryk has a set of its own (the author's choice, 25.10.2026): the
-- Kapuza and the Komża, as light as the Mag's hood and robe. A cleric's hood
-- and robe, worn or in the bag, become a Kapuza and a Komża with the same
-- numbers and affixes.
UPDATE items SET data = json_set(data, '$.base', 'cowl')
WHERE json_extract(data, '$.base') = 'hood'
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) = 'cleric';
UPDATE items SET data = json_set(data, '$.base', 'surplice')
WHERE json_extract(data, '$.base') = 'robe'
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) = 'cleric';
