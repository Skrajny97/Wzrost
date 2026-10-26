-- An exploration may avoid the elite and the champion of its inner region
-- (the "Unikaj elit i czempionów" box by "Wyrusz"). The report is made at
-- claim time from the seed, so the choice is kept with the activity.
ALTER TABLE activities ADD COLUMN avoid_rare INTEGER NOT NULL DEFAULT 0;
