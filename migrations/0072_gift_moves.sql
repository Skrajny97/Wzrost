-- A code's rewards moved by the author's word from one character of an
-- account to another (data/gift-codes.json `moves`, src/server/gift-codes.js):
-- each move is written here once, with the two characters, so it is never
-- made twice.
CREATE TABLE gift_moves_done (
  id TEXT PRIMARY KEY,
  done_at INTEGER NOT NULL,
  from_character INTEGER NOT NULL,
  to_character INTEGER NOT NULL
);
