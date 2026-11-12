-- The Labirynt Systemu and the Rdzeń (src/server/labyrinth.js,
-- src/server/core.js; DECISIONS.md, "Labirynt Systemu i Rdzeń", 850–866).
-- `labyrinth`: the character's Labirynt of the day, as JSON (the level, the
-- room it stands in, its fighters' HP, its blessings, a choice waiting and
-- the day's rewards), gone with the day. `core`: its Rdzeń, as JSON: whether
-- it is open, the Odłamki Rdzenia, the gem set in it and the Artefakty
-- absorbed (at most as many as its sockets, so the row stays small).
ALTER TABLE characters ADD COLUMN labyrinth TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN core TEXT NOT NULL DEFAULT '{}';
-- The Skrytka Rdzenia: the Artefakty the character has and has not absorbed,
-- with no limit and out of the bag, each as JSON (its element, size, rarity,
-- traits, ability and upgrade). An id is never given again, so a page's
-- button always means the same Artefakt, also once it is absorbed (it keeps
-- its id in `core`).
CREATE TABLE core_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX core_artifacts_character ON core_artifacts (character_id, id);
