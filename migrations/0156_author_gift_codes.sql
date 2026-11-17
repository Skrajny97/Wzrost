-- Gift codes made in the Panel autora (the author, 17.11.2026: „Musisz mi
-- dodac opcję w Panel Autora generowania takich kodów z pozycji gry, które
-- działają od razu”): they work the moment they are made, beside those of
-- data/gift-codes.json, and are taken the same way (gift_codes_used, by the
-- id). `code`: as players type it, capitals and digits (normalCode in the
-- engine); `rewards`: JSON as in the data; `for_key`: the key of the one
-- character's name (characterKey in src/server/gift-codes.js), and
-- `for_name` that name as the game has it, for the panel only; `until_at`:
-- the end of its last day in Warsaw; `ended_at`: when the author ended it
-- early.
CREATE TABLE author_gift_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  rewards TEXT NOT NULL,
  for_key TEXT,
  for_name TEXT,
  until_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX author_gift_codes_by_code ON author_gift_codes (code);
