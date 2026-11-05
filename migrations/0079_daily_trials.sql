-- The Próby Gildii day by day and all at once (the author's 615 A and 617):
-- every trial open on a guild's board runs for each member from the moment
-- it opens, with nothing to take, so a member has a row for each open trial
-- (one for a guild, a week, a character and a trial) and the one-trial-at-a-
-- time index goes, as do the rows of the trials dropped before. The board
-- keeps how many of its trials have their members' rows (opened) and the
-- shares of the members who joined after it was drawn (joined; joinShare in
-- src/engine/guild-trials.js), which raise the week's thresholds in part.
ALTER TABLE guild_trial_boards ADD COLUMN joined REAL NOT NULL DEFAULT 0;
ALTER TABLE guild_trial_boards ADD COLUMN opened INTEGER NOT NULL DEFAULT 0;
DELETE FROM guild_trials WHERE state = 'dropped';
DROP INDEX IF EXISTS guild_trials_active;
CREATE UNIQUE INDEX guild_trials_member ON guild_trials (guild_id, week, character_id, trial);
