-- An exploration may track the creatures of the narrator's quests (the
-- "Trop przede wszystkim stwory z zadań" box under the dangers of an inner
-- region): their ids, those the quests asked for when it set out, as JSON, or
-- NULL. The report is made at claim time from the seed, so they are kept
-- with the activity. (0025 belongs to the professions of the working branch.)
ALTER TABLE activities ADD COLUMN tracked TEXT;
