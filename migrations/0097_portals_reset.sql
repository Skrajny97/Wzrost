-- The author (7.11.2026): "Tym co odpalili Portale przed poprawkami
-- wszystkimi zresetuj do 1 poziomu przeprawy". Every character's record of
-- the Portale starts anew with 0.2.7: no stage won, so the next fight is for
-- stage 1 in each portal, and no sweeps counted today. The reports of the
-- fights stay in the Dziennik.
UPDATE characters SET portals = '{}' WHERE portals <> '{}';
