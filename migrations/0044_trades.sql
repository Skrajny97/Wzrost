-- The Wymiana (src/server/trades.js), the author, 27.10.2026: "Dodaj też
-- opcję Wymiana po kliknięciu na Postać innego gracza lub z z pozycji listy
-- znajomych. Pozwalaj tylko na to, jeśli obaj są online." Each trade between
-- two characters: who proposed it and to whom, its state, each one's offer
-- ({"gold": 0, "items": [ids], "herbs": {id: count}, "potions": {id:
-- count}}), who confirmed it first (then neither offer changes), and a
-- version that every change raises, so a confirmation is for what was seen.
-- The players a player takes no trades from, as with the chat's hidden ones,
-- by account; and on the account, all trades turned off, and when the game
-- last asked the server, which says who is online.
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  from_offer TEXT NOT NULL DEFAULT '{}',
  to_offer TEXT NOT NULL DEFAULT '{}',
  locked_by INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX trades_from ON trades (from_id, id);
CREATE INDEX trades_to ON trades (to_id, id);

CREATE TABLE trade_blocks (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX trade_blocks_blocked ON trade_blocks (blocked_id);

ALTER TABLE users ADD COLUMN trade_off INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN seen_at INTEGER;
