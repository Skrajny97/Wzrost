-- The Portale Systemu (src/server/portals.js, 0.2.6): each character's
-- record of them, as JSON: the day and the entries used on it, and the
-- highest stage won in each portal.
ALTER TABLE characters ADD COLUMN portals TEXT NOT NULL DEFAULT '{}';
