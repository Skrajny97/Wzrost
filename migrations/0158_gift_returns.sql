-- An item given back by the author's word (data/gift-codes.json `returns`,
-- src/server/gift-codes.js): each return is written here once, with the
-- character it went to and the item's new id, so it is never given twice.
CREATE TABLE gift_returns_done (
  id TEXT PRIMARY KEY,
  done_at INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  item_id INTEGER
);
