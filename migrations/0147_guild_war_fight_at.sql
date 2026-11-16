-- The moment of a match's fights when it is not its evening's battleHour
-- (guild_wars.fight_at, null for the usual one): the league fights a match
-- only once it has come (settleWars), and its battles bear it. For the
-- first evening of the league (16.11.2026), fought again at 23:00 (the
-- author: „wprowadź reset wojny i o 23 kolejny reroll”; DECISIONS.md,
-- 0.3.99 and 0.4.0).
ALTER TABLE guild_wars ADD COLUMN fight_at INTEGER;

-- The fights of a match, by its id (the tab's counts and a match's list of
-- all its fights read them by match; till now the whole table).
CREATE INDEX guild_war_battles_war ON guild_war_battles (war_id, number);
