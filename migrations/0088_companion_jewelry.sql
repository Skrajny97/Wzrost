-- A companion wears one piece of jewellery, an amulet, a ring or a talisman
-- (the author on 5.11.2026: „Towarzysz ma móc zakładać albo Amulet albo
-- Pierścień albo Talizman a nie wszystko na raz”; src/engine/companions.js:
-- COMPANION_PLACES). Since 0.1.71 one could wear all three: the piece put on
-- last (the last of them in its gear) stays, and the others go back to the
-- character's bag as they were, without the mark of a gift.

INSERT INTO items (character_id, slot, data, created_at)
SELECT c.id, NULL, json_remove(g.value, '$.given'), CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM characters AS c, json_each(c.settlement, '$.companions') AS comp, json_each(comp.value, '$.gear') AS g
WHERE json_valid(c.settlement)
  AND json_extract(g.value, '$.slot') IN ('amulet', 'ring', 'talisman')
  AND EXISTS (
    SELECT 1 FROM json_each(comp.value, '$.gear') AS later
    WHERE later.key > g.key AND json_extract(later.value, '$.slot') IN ('amulet', 'ring', 'talisman')
  );

UPDATE characters
SET settlement = json_set(settlement, '$.companions', json((
      SELECT json_group_array(json(json_set(comp.value, '$.gear', json((
        SELECT json_group_array(json(g.value))
        FROM json_each(comp.value, '$.gear') AS g
        WHERE NOT (
          json_extract(g.value, '$.slot') IN ('amulet', 'ring', 'talisman')
          AND EXISTS (
            SELECT 1 FROM json_each(comp.value, '$.gear') AS later
            WHERE later.key > g.key AND json_extract(later.value, '$.slot') IN ('amulet', 'ring', 'talisman')
          )
        )
      )))))
      FROM json_each(characters.settlement, '$.companions') AS comp
    ))),
    version = version + 1
WHERE json_valid(settlement)
  AND EXISTS (
    SELECT 1
    FROM json_each(characters.settlement, '$.companions') AS comp, json_each(comp.value, '$.gear') AS g, json_each(comp.value, '$.gear') AS later
    WHERE later.key > g.key
      AND json_extract(g.value, '$.slot') IN ('amulet', 'ring', 'talisman')
      AND json_extract(later.value, '$.slot') IN ('amulet', 'ring', 'talisman')
  );
