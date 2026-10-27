-- The skin tone of the character's portrait (data/skins.json), chosen when
-- the character is made and later in Ustawienia. NULL for a character made
-- before: the portrait as drawn.
ALTER TABLE characters ADD COLUMN skin TEXT;
