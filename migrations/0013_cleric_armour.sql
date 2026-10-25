-- The Kleryk wears what the Mag wears (the author's decision, 25.10.2026): a
-- hood and a robe instead of a helmet and chainmail. A cleric's worn helmet
-- or chainmail goes back to its bag, as if taken off; the scrapper buys it
-- first when the bag runs over.
UPDATE items SET slot = NULL
WHERE slot IN ('head', 'chest')
  AND json_extract(data, '$.base') IN ('helmet', 'chainmail')
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) = 'cleric';
