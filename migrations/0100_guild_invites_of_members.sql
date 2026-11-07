-- The author (7.11.2026), with 0.2.22: "Niech zaproszenia do gildii nie
-- wyswietlaja sie osobom które już w jakiejś są albo niech nie mozna bedzie
-- zaprosic takich osob". The invitations still waiting for characters that
-- are in a guild go; new ones to such characters were refused already.
DELETE FROM guild_invites WHERE character_id IN (SELECT character_id FROM guild_members);
