-- The Skrzynia Gildii (src/server/guild-chest.js, DECISIONS.md; the author,
-- 10.11.2026: „Wspólna skrzynia Gildii, w której można równocześnie
-- zostawiać przedmioty bez przypisania do jakiegokolwiek gracza, zeby kazdy
-- mogl wziąć lub z przypisaniem do konkretnego gracza w Gildii.”): the items
-- a guild's members leave for the others, up to guilds.chest.capacity of
-- them. Each keeps its data and when it was made, as the Skrzynia Konta's
-- (0057), with the character that put it in and its name then (put_by
-- turns NULL once that character leaves the guild, so it no longer takes
-- the item back), and the member it waits for (for_id, NULL: for all; it
-- turns NULL once that member leaves the guild). The rows of a guild go
-- with it.
CREATE TABLE guild_chest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  put_by INTEGER,
  put_by_name TEXT NOT NULL,
  for_id INTEGER,
  put_at INTEGER NOT NULL
);
CREATE INDEX guild_chest_guild ON guild_chest (guild_id, id);
CREATE INDEX guild_chest_for ON guild_chest (for_id);

-- The chest's log: the last guilds.chest.log moves of a guild's chest, an
-- item put in ('put', with the name of the member it was left for) or taken
-- out ('take'), with who moved it and the item's data, so its name shows in
-- the language of the page that reads the log.
CREATE TABLE guild_chest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  for_name TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX guild_chest_log_guild ON guild_chest_log (guild_id, id);
