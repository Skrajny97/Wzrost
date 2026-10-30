-- The Osada (src/engine/settlement.js): reputation with the brotherhoods,
-- relations with the residents and the Tablica zleceń, as one JSON value.
ALTER TABLE characters ADD COLUMN settlement TEXT NOT NULL DEFAULT '{}';
