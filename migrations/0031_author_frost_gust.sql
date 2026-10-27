-- The author's Mag keeps the level the free main path used to give: at class
-- level 14 it has 5 Skill Points, and Osłona many 1 with Mroźny podmuch 5
-- took 6. Mroźny podmuch goes down to 4 (the author: "odbierz odpowiednią
-- liczbę punktów z umiejętności Mroźny podmuch"), on the author's account
-- only (AUTHOR_LOGINS) and only at exactly these levels. json_set keeps the
-- key order, so Osłona many stays the main path.
UPDATE characters
SET skills = json_set(skills, '$."frost-gust"', 4)
WHERE role = 'player'
  AND class_id = 'mage'
  AND user_id IN (SELECT id FROM users WHERE login = 'Skrajny')
  AND json_extract(skills, '$."mana-shield"') = 1
  AND json_extract(skills, '$."frost-gust"') = 5;
