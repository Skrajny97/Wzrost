-- The goods a Wymiana message shows beside its items (a player's request,
-- 13.11.2026): materials, minerals, herbs, potions and camp resources of the
-- writer, as JSON [{kind, id, count}], or NULL (src/server/chat.js).
ALTER TABLE chat_messages ADD COLUMN stacks TEXT;
