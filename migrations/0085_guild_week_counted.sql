-- Who a guild's week counts already (src/server/guilds.js,
-- acceptGuildInvite; boardOf in src/server/guild-trials.js and routeOf in
-- src/server/guild-expedition.js): the ids of the characters the Próby
-- Gildii's board and the Wyprawa Gildii's route of a week count as members,
-- those active when it came (`active`) and each who joined since (`joined`,
-- a share of the week each), as JSON. A member who leaves and joins the
-- same guild again that week is counted once, so its share does not raise
-- the week's thresholds, stages and guardians a second time. The boards and
-- routes made before count every member their guild has now, as who was
-- active when they came is not known.
ALTER TABLE guild_trial_boards ADD COLUMN counted TEXT NOT NULL DEFAULT '[]';
ALTER TABLE guild_expeditions ADD COLUMN counted TEXT NOT NULL DEFAULT '[]';
UPDATE guild_trial_boards SET counted = (SELECT json_group_array(m.character_id) FROM guild_members m WHERE m.guild_id = guild_trial_boards.guild_id);
UPDATE guild_expeditions SET counted = (SELECT json_group_array(m.character_id) FROM guild_members m WHERE m.guild_id = guild_expeditions.guild_id);
