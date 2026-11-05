-- The Sala prób in the Osada (DECISIONS.md, "Sala prób"; the author's 620 B):
-- the day of the character's last trial there and the place it opened early.
ALTER TABLE characters ADD COLUMN trial_hall TEXT NOT NULL DEFAULT '{}';
