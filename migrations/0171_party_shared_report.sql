-- Wspólny raport drużyny (24.11.2026; src/server/hunts.js, claimTrip): the
-- shared report of a Drużyna's trip that another claimed for the whole party
-- and the character has not opened yet, {"id": 123, "by": "Radomir"}: its
-- id in the character's own Dziennik and the name of the one who claimed it,
-- for the line on its Walka screen; NULL once opened, or for none.
ALTER TABLE characters ADD COLUMN party_report TEXT;
