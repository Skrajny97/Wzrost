-- The guild wars (src/server/guild-wars.js, src/engine/guild-wars.js;
-- DECISIONS.md, "Wojny gildii: odpowiedzi autora 792–800" and "Wojny gildii
-- na wersji testowej"): a week's war of two guilds of a similar size, with
-- battles of teams of five every evening at 20:00 Polish time.
--
-- The place a member took in its guild's war team (796 A: each takes a free
-- place itself, the leader and the deputies move anyone): its team (from 1)
-- and its place in it (from 0), one place for a character, a place for one.
-- A member in none is in the reserve. A team the guild no longer has (fewer
-- members) leaves its members in the reserve. The row goes with the
-- character's membership (guildRemoval, guilds.js).
CREATE TABLE guild_war_slots (
  character_id INTEGER PRIMARY KEY,
  guild_id INTEGER NOT NULL,
  team INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  placed_at INTEGER NOT NULL,
  UNIQUE (guild_id, team, slot)
);

-- The weeks whose rivals were drawn (797 B), once each, with the seed of the
-- draw: the guilds paired that week have their war, the others none.
CREATE TABLE guild_war_weeks (
  week TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  drawn_at INTEGER NOT NULL
);

-- A war of a week (its Monday's date, as the weekly quests') between guild
-- A and guild B, their names, tags and members as at the draw; guild_b NULL
-- for the test version's mirror guild, whose teams (mirror_teams) fight as
-- guild A's own. `first_day`: the first day (0 Monday … 6 Sunday) with
-- battles (a test war starts on the day it is begun); `days_done`: the days
-- whose battles are fought, from Monday; the battles each guild won; at the
-- end, after Sunday's battles, `result` ('a', 'b' or 'draw'), when, and how
-- many items the war chest of the guild that won holds.
CREATE TABLE guild_wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  guild_a INTEGER NOT NULL,
  guild_b INTEGER,
  name_a TEXT NOT NULL,
  tag_a TEXT NOT NULL,
  members_a INTEGER NOT NULL,
  name_b TEXT,
  tag_b TEXT,
  members_b INTEGER NOT NULL,
  mirror_teams INTEGER,
  seed TEXT NOT NULL,
  first_day INTEGER NOT NULL DEFAULT 0,
  days_done INTEGER NOT NULL DEFAULT 0,
  wins_a INTEGER NOT NULL DEFAULT 0,
  wins_b INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  ended_at INTEGER,
  chest_items INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX guild_wars_a ON guild_wars (week, guild_a);
CREATE UNIQUE INDEX guild_wars_b ON guild_wars (week, guild_b);
CREATE INDEX guild_wars_due ON guild_wars (week, days_done);

-- A battle of a war (798 A): its day (0 Monday … 6 Sunday) and number that
-- evening, the teams of guild A and B in it (795 B), its result ('a', 'b'
-- or 'draw'), at what time it was, its fighters as they fought (JSON: each
-- side's characters with their looks, levels and the reward each got, and
-- who stayed on their feet), and its log for the playback, in Polish and in
-- English (`log`, `log_en`: JSON, gzip, base64), kept for the current and
-- the previous week.
CREATE TABLE guild_war_battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  war_id INTEGER NOT NULL,
  day INTEGER NOT NULL,
  number INTEGER NOT NULL,
  team_a INTEGER NOT NULL,
  team_b INTEGER NOT NULL,
  result TEXT NOT NULL,
  at INTEGER NOT NULL,
  fighters TEXT NOT NULL,
  log TEXT,
  log_en TEXT,
  UNIQUE (war_id, day, number)
);

-- The war chest's items in the Skrzynia Gildii (799 A) say where they came
-- from ('war'), in the page's language, instead of who put them in.
ALTER TABLE guild_chest ADD COLUMN source TEXT;
