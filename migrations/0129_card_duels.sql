-- Partie kart na żywo (901 B; src/server/card-duel.js, src/engine/card-duel.js;
-- DECISIONS.md, „Partie kart na żywo: zbudowane”): a challenge from one
-- character (`from_id`) to another (`to_id`) and then its match.
-- `state`: 'proposed' (waiting for its answer), 'declined', 'expired',
-- 'playing' (the match going on) or 'done'. `stake`: the gold each side
-- pays at the start (0 for none). `game`: the match's whole state as JSON
-- (the seed, both decks and reserves, never sent to a page), kept once it is
-- over for its last view. `day`: the Salon's day the match began in, for the
-- day's matches for gold. `winner`: the character who won (NULL for a draw
-- or before the end). `version` grows with every change, so two requests
-- at once never apply a move twice nor pay twice. A removed character's
-- rows keep it by a negative id.
CREATE TABLE card_duels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  stake INTEGER NOT NULL DEFAULT 0 CHECK (stake >= 0),
  state TEXT NOT NULL,
  game TEXT,
  day TEXT,
  winner INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX card_duels_from ON card_duels (from_id, state);
CREATE INDEX card_duels_to ON card_duels (to_id, state);
