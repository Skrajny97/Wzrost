-- The goods of the Skrzynia Konta (src/server/chest.js; mock-ups 843, the
-- author, 12.11.2026: „Skrzynia Konta powinna pozwalać przekładać też
-- mikstury, rośliny, wszystko, nawet zasoby, ale miec kłódkę i być
-- zablokowana do 20 poziomu postaci”): potions, herbs, materials, minerals
-- and the camp's resources, any number of them, beside the few items of
-- chest_items. A row holds the pieces of one good (`kind`: resource,
-- potion, herb, material or mineral; `good`: its id, a material's stack key
-- as "wolf-pelt:rare") that one character of the account put in, so the
-- chest tells each character which pieces are its own; `traded` of them
-- that character had got from others (a Wymiana, the Targowisko, another
-- character through this chest), which the Encyklopedia leaves out also
-- once they come back to it (ownDiscoveries, foreign_stacks).
--
-- The pieces of a removed character stay for the account's other
-- characters as no one's: they join the account's row of the good with
-- character_id 0 (characters.js: detachedRows), so a good has at most a row
-- for each character of the account and one of no one's.
CREATE TABLE chest_goods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  good TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  traded INTEGER NOT NULL DEFAULT 0 CHECK (traded >= 0 AND traded <= count)
);
CREATE UNIQUE INDEX chest_goods_one ON chest_goods (user_id, character_id, kind, good);
CREATE INDEX chest_goods_good ON chest_goods (user_id, kind, good, id);
