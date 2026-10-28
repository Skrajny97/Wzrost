-- The chat's Wymiana (DECISIONS.md): the items a message offers, as they
-- were when it was sent (a JSON list of their views), and the private
-- conversations a character closed: hidden until a message newer than the
-- last one it had then.
ALTER TABLE chat_messages ADD COLUMN items TEXT;

CREATE TABLE chat_closed (
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  other_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  last_id INTEGER NOT NULL,
  PRIMARY KEY (character_id, other_id)
);
CREATE INDEX chat_closed_other ON chat_closed (other_id);
