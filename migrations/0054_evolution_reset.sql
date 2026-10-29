-- After a class evolution the stat points can be reset once, for free
-- (DECISIONS.md, "Uwagi autora: kod podarunkowy i zakładka Ewolucja",
-- point 4): 1 while the player has
-- not decided yet. On the test version, the points before that reset, given
-- back with "Cofnij ewolucję".
ALTER TABLE characters ADD COLUMN evolution_reset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN points_undo TEXT;
