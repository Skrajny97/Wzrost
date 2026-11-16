-- Indexes for the queries a growing game asks most (1031, the load test of
-- 16.11.2026, rows read as the local D1 counts them):
-- * the players online, asked by every page each minute (online.js): it
--   read every account (725 rows on average of 813 here);
-- * the account's characters, played or set aside (OWN_CHARACTERS): the list
--   on the Postać tab, the count before a new character, the Panel autora;
--   the only index on characters' user_id held the played one alone, so
--   these read every character (the list 5950 rows of 1401 here, the panel
--   over 2 million).
CREATE INDEX users_seen ON users (seen_at);
CREATE INDEX characters_user ON characters (user_id, role);
