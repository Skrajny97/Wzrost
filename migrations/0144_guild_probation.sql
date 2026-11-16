-- The Nowicjusz (R1) of a guild (1062): a character that joins a guild is
-- one until this time (ms), or until the leader or a deputy makes it a
-- member; NULL for every other, so the members of before stay members.
ALTER TABLE guild_members ADD COLUMN probation_until INTEGER;
