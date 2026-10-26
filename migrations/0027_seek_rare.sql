-- An exploration may seek the elite and the champion of its inner region
-- (the "Trop elity i czempiony" box by "Wyrusz"), meeting them twice as
-- often (balance.hunt.rareSeekFactor). Like avoid_rare, the choice is kept
-- with the activity, since the report is made at claim time from the seed.
ALTER TABLE activities ADD COLUMN seek_rare INTEGER NOT NULL DEFAULT 0;
