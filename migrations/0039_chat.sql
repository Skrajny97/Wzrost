-- The chat of the Społeczność tab (src/server/chat.js): the messages of each
-- channel, with the character's name, level and class as they were, and the
-- time the author or the players' reports took one down; the reports, one
-- per player and message, open until the author decides; the players whose
-- messages a player hides, with the name they had then; and on the account,
-- when it accepted the chat's rules and until when the author silenced it.
-- AUTOINCREMENT keeps the ids of removed messages from coming back, as the
-- page asks for the messages after the last one it has.
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  class_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hidden_at INTEGER
);
CREATE INDEX chat_messages_channel ON chat_messages (channel, id);
CREATE INDEX chat_messages_user ON chat_messages (user_id, created_at);
CREATE INDEX chat_messages_character ON chat_messages (character_id);

CREATE TABLE chat_reports (
  message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX chat_reports_open ON chat_reports (closed_at, message_id);
CREATE INDEX chat_reports_user ON chat_reports (user_id);

CREATE TABLE chat_blocks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, blocked_id)
);
CREATE INDEX chat_blocks_blocked ON chat_blocks (blocked_id);

ALTER TABLE users ADD COLUMN chat_rules_at INTEGER;
ALTER TABLE users ADD COLUMN chat_muted_until INTEGER;
