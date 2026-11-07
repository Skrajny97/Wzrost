-- The author (7.11.2026), with 0.2.18, where the System's strength in the
-- Wieża Drużyn goes as many times over as there are fighters on the party's
-- side: "drużynowych chyba nie ruszałeś bo dalej są banalnie łatwe". As with
-- 0.2.11 ("wyzeruj też wszystkim co odblokowali Wieże je, nie zabieraj
-- nagród"), every character's record of the Wieża Drużyn starts anew: no
-- floor won, no chest or champion's trophy taken there. The Wieża Solo's
-- record and today's entries stay; what the tower gave stays with the
-- characters, and the reports of the fights stay in the Dziennik.
UPDATE characters
SET towers = json_remove(towers, '$.best.party', '$.chests.party', '$.champions.party')
WHERE towers IS NOT NULL
  AND towers <> '{}'
  AND (json_extract(towers, '$.best.party') IS NOT NULL OR json_extract(towers, '$.chests.party') IS NOT NULL OR json_extract(towers, '$.champions.party') IS NOT NULL);
