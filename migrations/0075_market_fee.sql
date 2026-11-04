-- The Targowisko's fee of an offer, set when it is put up: lower with a
-- higher standing with the Kompania Kupców (the author's 592, 4.11.2026).
-- An offer from before keeps the fee of the data (NULL).
ALTER TABLE market_offers ADD COLUMN fee REAL;
