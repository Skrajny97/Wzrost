-- "Co nowego?" (the author's answers 594 A + C and 595 A): the entries the
-- author published in the Panel autora, from a draft of data/news.json
-- (`draft`, the draft's id, once) or written there from scratch, and the
-- newest entry each account has seen in the window after entering the game.
-- AUTOINCREMENT: an entry taken down never gives its number to a later one,
-- which an account that saw it would then miss.
CREATE TABLE news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft TEXT UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  edited_at INTEGER
);

ALTER TABLE users ADD COLUMN news_seen INTEGER NOT NULL DEFAULT 0;
