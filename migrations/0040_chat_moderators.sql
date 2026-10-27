-- The chat's moderators (src/server/chat.js): accounts the author names in
-- the author's panel. They take messages down and silence accounts as the
-- author does, and the chat marks their characters "(moderator)".
ALTER TABLE users ADD COLUMN chat_moderator INTEGER NOT NULL DEFAULT 0;
