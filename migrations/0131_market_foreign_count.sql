-- 923 A (13.11.2026): goods put up at the Targowisko that find no buyer, or
-- that the seller takes back, come back as they were before. An offer keeps
-- how many of its stack's pieces came from other players (foreign_stacks),
-- and so does the parcel that brings them back; an item keeps its own mark
-- in its data.
ALTER TABLE market_offers ADD COLUMN foreign_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE market_parcels ADD COLUMN foreign_count INTEGER NOT NULL DEFAULT 0;
