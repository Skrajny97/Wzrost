-- An item's id is never given again (the code review of 12.11.2026). The
-- items table had `id INTEGER PRIMARY KEY` without AUTOINCREMENT, so once
-- the newest item went (sold, thrown away, put into the Skrzynia Konta,
-- taken apart), the next item made took its id. A request that named the
-- old item by its id then acted on the new one: "Sprzedaj" paid the old
-- item's price and gem for it, "Załóż" put it on in the old item's slot,
-- "Ulepsz" upgraded it at the old item's price, and a setting in the
-- Szlifiernia put its gem into it. Now ids only grow.
--
-- SQLite changes no key of a table in place, so the table is made again,
-- as in 0114: the new one is filled first, then the old one dropped (no
-- table refers to items, so nothing goes with it) and the new one renamed,
-- with its indexes. The ids start above every id an item had or a row
-- still names (the Skrzynia Konta keeps the id an item had before it was
-- put in), with room for those gone since: a sent page may still name
-- one, and a new item must not take it.
PRAGMA defer_foreign_keys = true;

CREATE TABLE items_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  slot TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO items_next (id, character_id, slot, data, created_at)
  SELECT id, character_id, slot, data, created_at FROM items;

-- The first id given from now on: above every id used, with room. A row
-- with that id moves the table's sequence there, and goes at once.
INSERT INTO items_next (id, character_id, slot, data, created_at)
  SELECT MAX(COALESCE((SELECT MAX(id) FROM items), 0), COALESCE((SELECT MAX(item_id) FROM chest_items), 0)) + 1000, id, NULL, '{}', 0
  FROM characters LIMIT 1;
DELETE FROM items_next WHERE data = '{}' AND created_at = 0 AND slot IS NULL
  AND id = (SELECT MAX(id) FROM items_next);

DROP TABLE items;
ALTER TABLE items_next RENAME TO items;

CREATE INDEX items_character ON items (character_id);
CREATE UNIQUE INDEX items_one_per_slot ON items (character_id, slot) WHERE slot IS NOT NULL;
