-- The Skrzynia Konta in the camp (src/server/chest.js, DECISIONS.md): the
-- items an account's characters share, a few places of them
-- (balance.account.chestSlots). Each keeps its data and when it was made,
-- with the character that put it in, which takes it back as it was; another
-- character gets it marked as from the chest (data.chest).
CREATE TABLE chest_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  put_at INTEGER NOT NULL
);
CREATE INDEX chest_items_user ON chest_items (user_id, id);

-- The herbs, potions and materials a character holds from a Wymiana, which
-- the Encyklopedia leaves out ("encyclopedia key": count, used up first):
-- the character has to find or make a thing itself for it to count.
ALTER TABLE characters ADD COLUMN foreign_stacks TEXT NOT NULL DEFAULT '{}';
