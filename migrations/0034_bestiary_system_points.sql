-- The Bestiariusz chest gives +20 Punktów Systemu too (balance.json,
-- bestiary.systemPoints). A character that opened chests before gets them
-- now, at the author's wish: 20 for each inner region in its bestiary.
-- Number 0033 is taken by the working branch (potions).
UPDATE characters SET system_points = system_points + 20 * json_array_length(bestiary) WHERE json_array_length(bestiary) > 0;
