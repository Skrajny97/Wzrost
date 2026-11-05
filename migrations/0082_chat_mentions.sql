-- Mentions in the chat (src/server/mentions.js; the author's 634 A:
-- "Potrzebujemy tez funkcji oznaczania na czacie"): a row for each character
-- a message tags with "@" and its whole name, among those who read the
-- message's channel, with the name as the writer typed it and whether a
-- phone notification goes for it (`push`: at most one from the same writer
-- to the same character within data/chat.json's mentions.pushEveryMinutes).
-- A tag lives as long as its message and its character: the channel trims
-- its oldest messages and a character or an account goes with its rows
-- (ON DELETE CASCADE, and the removals in characters.js, accounts.js and
-- guilds.js). Whether the tagged character has read it is the chat's own
-- mark of its channel (characters.chat_seen).
CREATE TABLE chat_mentions (
  message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  written TEXT NOT NULL,
  push INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, character_id)
);
CREATE INDEX chat_mentions_character ON chat_mentions (character_id, message_id);
CREATE INDEX chat_mentions_push ON chat_mentions (created_at) WHERE push = 1;
