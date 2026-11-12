-- The Przechowalnia of the Warsztat and the Szlifiernia (842, the author,
-- 12.11.2026: "Niech w warsztacie będzie przechowalnia niech to nie trafia
-- od razu do plecaka"): the items the orders of a character and of its
-- Awatar make wait here, out of the bag and with no limit, until it puts
-- them in the bag, sells them to the scrapper or takes them apart on the
-- Stół rozbiórki (src/server/storage.js). Each keeps its data as an item's
-- row does, and when it was made. An id is never given again, so a mark of
-- the page always means the same item.
CREATE TABLE storage_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX storage_items_character ON storage_items (character_id, id);
