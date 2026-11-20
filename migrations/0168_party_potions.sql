-- Mikstury członków drużyny (20.11.2026; src/server/parties.js): the potions
-- a character takes along on its party's trips while it is a member and not
-- the leader, {"potions": {"healing": 2, "lesser-mana": 1}, "healBelow": 0.5};
-- NULL for none, which takes nothing (as before). Kept for later trips and
-- parties; the leader takes its own in "Opcje wyprawy".
ALTER TABLE characters ADD COLUMN party_potions TEXT;
