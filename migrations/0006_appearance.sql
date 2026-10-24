-- The look of the character (data/appearances.json): its portrait and its
-- voice in fights. Characters made before the choice look male until the
-- player picks another look in the settings.
ALTER TABLE characters ADD COLUMN appearance TEXT NOT NULL DEFAULT 'male';
