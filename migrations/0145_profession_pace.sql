-- The professions' levels three times faster (1020.3, 0.3.87): a level
-- takes L × 10 minutes of work instead of L × 30, so the XP each character
-- has towards its next level of a profession is a third of what it was,
-- the bar standing where it stood. Levels already reached stay.
UPDATE characters SET professions = json_set(professions, '$.herbalism.xp', json_extract(professions, '$.herbalism.xp') / 3) WHERE json_type(professions, '$.herbalism.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.alchemy.xp', json_extract(professions, '$.alchemy.xp') / 3) WHERE json_type(professions, '$.alchemy.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.crafting.xp', json_extract(professions, '$.crafting.xp') / 3) WHERE json_type(professions, '$.crafting.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.mining.xp', json_extract(professions, '$.mining.xp') / 3) WHERE json_type(professions, '$.mining.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.jewelcrafting.xp', json_extract(professions, '$.jewelcrafting.xp') / 3) WHERE json_type(professions, '$.jewelcrafting.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.fishing.xp', json_extract(professions, '$.fishing.xp') / 3) WHERE json_type(professions, '$.fishing.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.farming.xp', json_extract(professions, '$.farming.xp') / 3) WHERE json_type(professions, '$.farming.xp') = 'integer';
UPDATE characters SET professions = json_set(professions, '$.cooking.xp', json_extract(professions, '$.cooking.xp') / 3) WHERE json_type(professions, '$.cooking.xp') = 'integer';
