-- The camp's queue: the builds that wait after the one under way, paid when
-- queued, as JSON like the crafting orders: [{ buildingId, level, startsAt,
-- endsAt }]. Each starts as the one before it ends; the server moves it to
-- the buildings table then (src/server/characters.js: settleBuilds).
ALTER TABLE characters ADD COLUMN build_queue TEXT NOT NULL DEFAULT '[]';
