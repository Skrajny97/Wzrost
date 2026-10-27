-- Znajomi of the Społeczność tab (src/server/community.js): an invitation
-- from one character to another, a friendship once accepted.
CREATE TABLE friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  UNIQUE (character_id, friend_id)
);
CREATE INDEX friends_friend ON friends (friend_id);

-- Upominki: one from a friend to a friend each Warsaw day, with what it
-- gives rolled when sent; claim_token marks the ones one collection took.
CREATE TABLE gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reward TEXT NOT NULL,
  claimed_at INTEGER,
  claimed_day TEXT,
  claim_token TEXT,
  UNIQUE (sender_id, receiver_id, day)
);
CREATE INDEX gifts_receiver ON gifts (receiver_id, claimed_at, day);
CREATE INDEX gifts_claimed ON gifts (receiver_id, claimed_day);
CREATE INDEX gifts_token ON gifts (claim_token);
