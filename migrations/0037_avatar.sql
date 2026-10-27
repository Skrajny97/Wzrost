-- Awatar Systemu (DECISIONS.md, "Awatar Systemu"): bought once for good, at
-- avatar_at. It does one profession's work at a time beside the character,
-- kept here as the character's own work is in activities, with the columns
-- a work needs (src/server/avatar.js).
ALTER TABLE characters ADD COLUMN avatar_at INTEGER;

CREATE TABLE avatar_activities (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  region_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  seed TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}'
);
