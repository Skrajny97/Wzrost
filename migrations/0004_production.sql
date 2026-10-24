-- Production buildings (Tartak, Kamieniołom, Kopalnia): the time their store
-- started filling. NULL for the other buildings.
ALTER TABLE buildings ADD COLUMN collected_at INTEGER;
