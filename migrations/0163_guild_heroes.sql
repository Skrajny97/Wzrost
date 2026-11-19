-- Bohaterowie tygodnia (1198 A; src/engine/guild-heroes.js,
-- src/server/guild-heroes.js; DECISIONS.md, "Bohaterowie tygodnia").
--
-- Every Monday at midnight in Poland the game names the best members of
-- each guild of the week that ended (`week`: the key of its Monday, as the
-- weekly quests have it): the Filar Gildii (`pillar`, the most Sława), the
-- Pogromca (`slayer`, the most damage dealt to the Bestia and the Wyprawa's
-- guardians) and the Dobroczyńca (`benefactor`, the most pieces given in
-- the Prośby), each with what won it (`value`). Each winner got its reward
-- with the row, in the same batch. guild_hero_weeks says a week was named,
-- with heroes or none, so it is named once (also of two requests at once).
-- A character removed takes its rows along; a guild gone leaves them, so
-- its heroes keep their badges for the week. The rows of the weeks before
-- the last one go as a new week is named.
CREATE TABLE guild_heroes (
  week TEXT NOT NULL,
  guild_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (week, guild_id, kind)
);
CREATE INDEX guild_heroes_character ON guild_heroes (character_id, week);

CREATE TABLE guild_hero_weeks (
  week TEXT PRIMARY KEY,
  named_at INTEGER NOT NULL
);
