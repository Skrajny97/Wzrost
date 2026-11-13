-- The Sława each member brought to the guild in a week (897 A, 13.11.2026:
-- the "Ranking członków" of the Gildia tab, src/server/guild-members.js),
-- by its parts as in the guild's own (guild-fame.js): the Bestia, the
-- Wyprawa Gildii, the Próby, the Prośby, the Wymiana and the Wojna. Each
-- week is written once, for every guild at once, when the week after it
-- asks first (the week's sources keep their rows until then); its row in
-- guild_member_fame_weeks says it was written, rows of no Sława or not.
-- The week going on is counted from the sources each time. The member
-- removed leaves its rows as no one's (a negative id, characters.js), as
-- its donations; a guild gone takes its rows with it (guilds.js).
CREATE TABLE guild_member_fame (
  guild_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  beast INTEGER NOT NULL DEFAULT 0,
  expedition INTEGER NOT NULL DEFAULT 0,
  trials INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  exchange INTEGER NOT NULL DEFAULT 0,
  war INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, character_id, week)
);

CREATE TABLE guild_member_fame_weeks (
  week TEXT PRIMARY KEY,
  frozen_at INTEGER NOT NULL
);
