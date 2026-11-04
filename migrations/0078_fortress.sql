-- The Warownia (src/engine/fortress.js, src/server/fortress.js): what its
-- buildings keep for a character, as JSON. The Plac treningowy's training of
-- the day ({"training": {"day": "2026-11-04", "startedAt": …, "endsAt": …,
-- "hours": 4, "xp": 1200, "claimed": false}}); the other buildings add their
-- own keys. The transformation and the buildings' levels sit in buildings,
-- as the camp's do.
ALTER TABLE characters ADD COLUMN fortress TEXT NOT NULL DEFAULT '{}';
