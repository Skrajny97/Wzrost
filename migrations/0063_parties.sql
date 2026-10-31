-- Drużyny (src/server/parties.js): up to three characters, one of them the
-- leader, who sends the others on an exploration with it. A character is in
-- one party at most (party_members' key), and invitations wait until
-- accepted, declined or the party is gone.
CREATE TABLE parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE party_members (
  character_id INTEGER PRIMARY KEY,
  party_id INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);

CREATE INDEX party_members_party ON party_members (party_id);

CREATE TABLE party_invites (
  party_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  invited_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (party_id, character_id)
);

CREATE INDEX party_invites_character ON party_invites (character_id);
