-- The time in the game (993 A, DECISIONS.md, "Czas w grze"): the narrator's
-- day it was counted on, its minutes and the moment of the last one, as JSON
-- ({ day, minutes, at }); NULL before the first.
ALTER TABLE characters ADD COLUMN play_time TEXT;
