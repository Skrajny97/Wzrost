-- The Sklep Systemu (src/server/cosmetics.js, src/engine/cosmetics.js): the
-- cosmetics the character bought for its Punkty Systemu and what it wears,
-- as one JSON value: {"owned": [ids], "frame": id, "background": id,
-- "mountSkin": id, "nameFromFrame": true}. A cosmetic belongs to the
-- character, as its Punkty Systemu do. Numbers 0067 and 0068 are left to
-- the Gildia's migrations on their way.
ALTER TABLE characters ADD COLUMN cosmetics TEXT NOT NULL DEFAULT '{}';
