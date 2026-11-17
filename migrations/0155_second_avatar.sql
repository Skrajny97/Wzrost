-- The second Awatar Systemu (1066; the author: „A czy jest szansa by można
-- było mieć dwa Awatary Systemu przy czym drugi bardzo drogi - za 200000
-- złota?”): bought once for good at avatar2_at, once the first is, it does
-- one profession's work at a time beside the character and the first
-- Awatar, kept here as the first one's is in avatar_activities
-- (src/server/avatar.js).
ALTER TABLE characters ADD COLUMN avatar2_at INTEGER;

CREATE TABLE avatar2_activities (
  character_id INTEGER PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  region_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  seed TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}'
);
