-- "A→ Przetłumacz" on the chat (714 A, DECISIONS.md, „Tłumaczenie na
-- czacie”): a message's machine translation into a language, made once and
-- then read by everyone who asks for it in that language, and how many
-- translations an account has asked the translator for on the day it
-- names (Polish time, as the quests' days).
CREATE TABLE chat_translations (
  message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, language)
);

ALTER TABLE users ADD COLUMN translations_day TEXT;
ALTER TABLE users ADD COLUMN translations_used INTEGER NOT NULL DEFAULT 0;
