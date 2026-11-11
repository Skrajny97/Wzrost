-- Rows that outlive a removed character keep its id made negative
-- (characters.js: detachedRows), as the purchases do (0112): the database
-- gives the highest id of a removed character again, and a new character
-- given it would take them as its own. The items a removed character put in
-- the Skrzynia Konta, the Loteria draws it won and the gift codes it took,
-- of characters removed before (no character of the id, or one created
-- after the row), are detached here once.
UPDATE chest_items SET character_id = -character_id
  WHERE character_id > 0
    AND (character_id NOT IN (SELECT id FROM characters)
      OR character_id IN (SELECT c.id FROM characters c WHERE c.created_at > chest_items.put_at));
UPDATE lottery_draws SET character_id = -character_id
  WHERE character_id > 0
    AND (character_id NOT IN (SELECT id FROM characters)
      OR character_id IN (SELECT c.id FROM characters c WHERE c.created_at > lottery_draws.drawn_at));
UPDATE gift_codes_used SET character_id = -character_id
  WHERE character_id > 0
    AND (character_id NOT IN (SELECT id FROM characters)
      OR character_id IN (SELECT c.id FROM characters c WHERE c.created_at > gift_codes_used.used_at));
