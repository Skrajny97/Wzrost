-- Professions (src/engine/professions.js). Each character keeps its
-- professions' levels and XP ({"herbalism": {"level": 3, "xp": 40}}) and the
-- herbs it carries by id ({"comfrey": 37}); herbs stack in the bag, so they
-- take its places by the stack. A gathering keeps the herbs chosen at its
-- start with the activity ({"herbs": ["comfrey"]}), as its report is made
-- at claim time from the seed.
ALTER TABLE characters ADD COLUMN professions TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN herbs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE activities ADD COLUMN options TEXT NOT NULL DEFAULT '{}';
