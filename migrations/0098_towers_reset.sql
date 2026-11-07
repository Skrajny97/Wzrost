-- The author (7.11.2026), with 0.2.11, where floor 1 of the Wieże is of
-- level 50 and the System makes their creatures twice as strong:
-- "wyzeruj też wszystkim co odblokowali Wieże je, nie zabieraj nagród".
-- Every character's record of the towers starts anew: no floor won, no
-- chest or champion's trophy taken (each comes once more on its new floor),
-- and today's entries all free again. What the towers gave stays with the
-- characters, and the reports of the fights stay in the Dziennik.
UPDATE characters SET towers = '{}' WHERE towers IS NOT NULL AND towers <> '{}';
