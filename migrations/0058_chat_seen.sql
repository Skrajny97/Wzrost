-- What a character has read in the chat, kept on the server so its other
-- devices know it too (src/server/chat.js, POST /api/chat/seen): the
-- newest message read in the Globalny and in each private conversation,
-- by the other character's id, as JSON {"global": id, "private": {...}}.
ALTER TABLE characters ADD COLUMN chat_seen TEXT NOT NULL DEFAULT '{}';
