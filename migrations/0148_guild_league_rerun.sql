-- The first evening of the league (Monday 16.11.2026, 20:00, the week of
-- 2026-11-16) fought again at 23:00 (the author: „Po wprowadzeniu poprawek
-- i nowości wprowadź reset wojny i o 23 kolejny reroll”; DECISIONS.md,
-- 0.4.0). At 20:00 the characters of an account with characters on both
-- sides of a match fought on neither, and their trios lost by walkover
-- (the rule till 0.3.98). What that evening's fights gave goes back (down
-- to nothing at most, for what was spent since), its fights go, and its
-- matches wait for 23:00 (guild_wars.fight_at, 0147, which 0.3.99 keeps)
-- with new draws: the league's seed for the trios of its evenings and each
-- match's seed for its fights.

-- What each character got (as made then: `since`): the gold of each fight
-- won (on the side that won it, fighterRecord's `gold`) and the Punkty
-- Systemu of each match won (2, reward.systemPoints then) in which it
-- fought.
CREATE TABLE guild_war_rerun (character_id INTEGER NOT NULL, since INTEGER, gold INTEGER NOT NULL, points INTEGER NOT NULL);

INSERT INTO guild_war_rerun (character_id, since, gold, points)
SELECT id, since, SUM(gold), SUM(points)
FROM (
  SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.since') AS since, COALESCE(json_extract(j.value, '$.gold'), 0) AS gold, 0 AS points
  FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id, json_each(b.fighters, '$.' || b.result) j
  WHERE w.week = '2026-11-16' AND w.day = 0 AND b.result IN ('a', 'b')
  UNION ALL
  SELECT id, since, 0 AS gold, 2 AS points
  FROM (
    SELECT DISTINCT w.id AS war, json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.since') AS since
    FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id, json_each(b.fighters, '$.' || w.result) j
    WHERE w.week = '2026-11-16' AND w.day = 0 AND w.result IN ('a', 'b')
  )
)
WHERE id IS NOT NULL
GROUP BY id, since;

CREATE INDEX guild_war_rerun_character ON guild_war_rerun (character_id);

UPDATE characters SET
  gold = MAX(0, gold - (SELECT COALESCE(SUM(r.gold), 0) FROM guild_war_rerun r WHERE r.character_id = characters.id AND COALESCE(r.since, characters.created_at) = characters.created_at)),
  system_points = MAX(0, system_points - (SELECT COALESCE(SUM(r.points), 0) FROM guild_war_rerun r WHERE r.character_id = characters.id AND COALESCE(r.since, characters.created_at) = characters.created_at))
WHERE id IN (SELECT character_id FROM guild_war_rerun);

DROP TABLE guild_war_rerun;

-- The evening's fights gone, its matches unfought, at 23:00 Polish time
-- (22:00 UTC), with new seeds.
DELETE FROM guild_war_battles WHERE war_id IN (SELECT id FROM guild_wars WHERE week = '2026-11-16' AND day = 0);

UPDATE guild_wars
SET days_done = 0, wins_a = 0, wins_b = 0, losses_a = 0, losses_b = 0, walkovers_a = 0, walkovers_b = 0, draws = 0,
    result = NULL, ended_at = NULL, seed = seed || ':23', fight_at = 1794866400000
WHERE week = '2026-11-16' AND day = 0;

UPDATE guild_war_weeks SET seed = seed || ':23' WHERE week = '2026-11-16';
