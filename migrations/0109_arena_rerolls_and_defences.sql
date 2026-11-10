-- The Arena (src/server/pvp-arena.js; 0107_pvp_arena.sql), after two wishes
-- of the players in the chat the author took (874, 875).
--
-- "Losuj innych" (874): the rivals offered drawn anew, a few times a Polish
-- day. A character's record keeps the day of its last draw and how many fell
-- on it, apart from `day` and `fights`, which count only its fights.
ALTER TABLE arena_ratings ADD COLUMN reroll_day TEXT;
ALTER TABLE arena_ratings ADD COLUMN rerolls INTEGER NOT NULL DEFAULT 0;

-- The playback of a defence (875): each fight keeps its log (the duel's
-- `fight` as JSON, from the attacker's side, as the attacker's last fight
-- keeps it), so that its defender can watch it while the fight is kept. The
-- fights before this have none.
ALTER TABLE arena_fights ADD COLUMN fight TEXT;
