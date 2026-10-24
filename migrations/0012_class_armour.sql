-- The armour of the head and chest belongs to classes now (the author's
-- request, `armor` in data/classes.json): Wojownik and Kleryk wear a helmet
-- and chainmail, Łucznik and Cień a hood and a jacket, Mag a hood and a
-- robe. What a character wears against its class goes back to its bag, as if
-- taken off; the scrapper buys it first when the bag runs over. Gloves,
-- boots and jewellery fit anyone, as before.
UPDATE items SET slot = NULL
WHERE slot IN ('head', 'chest')
  AND (SELECT class_id FROM characters WHERE characters.id = items.character_id) || ':' || json_extract(data, '$.base') NOT IN (
    'warrior:helmet', 'warrior:chainmail',
    'cleric:helmet', 'cleric:chainmail',
    'archer:hood', 'archer:tunic',
    'shadow:hood', 'shadow:tunic',
    'mage:hood', 'mage:robe'
  );
