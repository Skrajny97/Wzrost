-- "Co nowego?": the drafts of data/news.json the author deleted in the Panel
-- autora ("Usuń" by a draft, the author, 6.11.2026). A draft is written in
-- the game's data, so deleting it hides it from the drafts for good; an
-- entry already published from it stays.
CREATE TABLE news_dismissed (
  draft TEXT PRIMARY KEY,
  dismissed_at INTEGER NOT NULL
);
