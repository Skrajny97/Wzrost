-- The players' Gildie (src/server/guilds.js): a guild with its name and
-- tag, each unique whatever the letter case; its members, one guild for a
-- character, each the leader, a deputy or a member, in the order they
-- joined; and the invitations it sent, at most one to a character.
CREATE TABLE guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE guild_members (
  character_id INTEGER PRIMARY KEY,
  guild_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL
);
CREATE INDEX guild_members_guild ON guild_members (guild_id, joined_at);

CREATE TABLE guild_invites (
  guild_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  invited_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, character_id)
);
CREATE INDEX guild_invites_character ON guild_invites (character_id);
