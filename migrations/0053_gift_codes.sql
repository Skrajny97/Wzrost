-- Gift codes (data/gift-codes.json; DECISIONS.md, "Kod podarunkowy"): which
-- account took which code, so that each code works once per account. The row
-- stays when the character is removed and goes with the account.
CREATE TABLE gift_codes_used (
  user_id INTEGER NOT NULL,
  gift_id TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, gift_id)
);
