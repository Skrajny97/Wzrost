-- The guild wars as a league (16.11.2026; src/server/guild-wars.js,
-- src/engine/guild-wars.js; DECISIONS.md, "Liga wojen gildii"). The author:
-- „niech każda gildia walczy z każdą”, „rozlosujesz od zera i zresetujesz
-- wojny gildii”, „drużyny niech losuje samo”.
--
-- The wars drawn so far go: the week's league is drawn again from zero.
DELETE FROM guild_war_battles;
DELETE FROM guild_wars;
DELETE FROM guild_war_weeks;

-- The game draws the teams before every evening: no places to take.
DROP TABLE guild_war_slots;

-- A week's league (guild_war_weeks): its guilds in the drawn order, with
-- their names and tags then (JSON: [{ id, name, tag }]), its first evening
-- (0 Monday … 6 Sunday; 7 for a week drawn after its Sunday's battles, with
-- no matches), and when it ended, its places written.
ALTER TABLE guild_war_weeks ADD COLUMN guilds TEXT;
ALTER TABLE guild_war_weeks ADD COLUMN first_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_war_weeks ADD COLUMN ended_at INTEGER;

-- A match of a league (a row of guild_wars): guild A and guild B (NULL for
-- the mirror guild, the rival of a guild with none in a round of an odd
-- league) on an evening (`day`), in a round of the week (`round`, from 0);
-- `days_done` 1 once fought, with the fights (1v1 and 3v3) each guild won
-- (`wins_a`, `wins_b`) and lost (`losses_a`, `losses_b`), walkovers in
-- them, how many of the losses were walkovers, the fights drawn, and
-- `result` ('a', 'b', 'draw', or 'void' for a match where one side had
-- nobody to fight for it). A guild meets several rivals a week, each at
-- most once a round.
DROP INDEX guild_wars_a;
DROP INDEX guild_wars_b;
ALTER TABLE guild_wars ADD COLUMN day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN losses_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN losses_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN walkovers_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN walkovers_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guild_wars ADD COLUMN draws INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX guild_wars_round_a ON guild_wars (week, round, guild_a);
CREATE UNIQUE INDEX guild_wars_round_b ON guild_wars (week, round, guild_b);

-- The places of a finished league: each guild's place in the table, the
-- Sława and the war chest's items it got (none below the prizes).
CREATE TABLE guild_league_places (
  week TEXT NOT NULL,
  guild_id INTEGER NOT NULL,
  place INTEGER NOT NULL,
  fame INTEGER NOT NULL,
  chest_items INTEGER NOT NULL,
  PRIMARY KEY (week, guild_id)
);

-- A fight of a match (a row of guild_war_battles): its format, '1v1' or
-- '3v3'; `team_a` and `team_b` the places of its sides (from 1: the
-- duelist or the trio). Walkovers have no row.
ALTER TABLE guild_war_battles ADD COLUMN format TEXT NOT NULL DEFAULT '3v3';
