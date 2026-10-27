-- Private messages (the author, 27.10.2026: "Niech kliknięcie w nazwe
-- drugiego gracza pozwoli też wybrać opcję Prywatna wiadomość, a w czacie niech
-- pojawiają się zakładki poza Globalną to z konkretnym graczem (tylko oni
-- widzą te rozmowę)"): a message of the "private" channel is for one
-- character, its recipient. Only the two read their conversation, and the
-- moderation a message of it once it is reported (src/server/chat.js).
ALTER TABLE chat_messages ADD COLUMN recipient_id INTEGER REFERENCES characters (id) ON DELETE CASCADE;
CREATE INDEX chat_messages_private ON chat_messages (recipient_id, character_id, id) WHERE recipient_id IS NOT NULL;
