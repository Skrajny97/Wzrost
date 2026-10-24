-- Punkty Czasu (Time Points): 1 point skips 1 minute of an exploration, of
-- resting or of a camp upgrade. They belong to the character, like gold, and
-- come only from playing.
ALTER TABLE characters ADD COLUMN time_points INTEGER NOT NULL DEFAULT 0;
-- The narrator's introduction: the cards a new character has seen, as a JSON
-- list. NULL for characters made before it, who never see it.
ALTER TABLE characters ADD COLUMN tutorial TEXT;
