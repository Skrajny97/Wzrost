-- Pomoc przy budowach i przy pracy (1196 A and B, 19.11.2026;
-- src/server/guild-help.js): each help a member gave another's build in
-- the Obóz or the Warownia, or its work in a profession. `target` names
-- what was helped (a build "build:<building>:<level>", a work "work:<a
-- hash of its seed>"), `cut` how many milliseconds it cut off, `week` the
-- week of the help (the Monday's date, as the Próby's). The rows give the builder
-- the names of those who helped, cap the helps of one build or work and
-- each helper's own, and count the Sława of the guild and of the helper
-- (guild-fame.js, guild-members.js); those of the weeks before the last one
-- go as a new help is saved. A guild gone takes its rows along (guilds.js).
CREATE TABLE guild_helps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  helper_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  target TEXT NOT NULL,
  cut INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_helps_owner ON guild_helps (owner_id, target);
CREATE INDEX guild_helps_helper ON guild_helps (helper_id, week);
CREATE INDEX guild_helps_week ON guild_helps (week, guild_id);

-- The members' Sława of the weeks gone has the helps as a part of its own
-- (guild-members.js).
ALTER TABLE guild_member_fame ADD COLUMN help INTEGER NOT NULL DEFAULT 0;
