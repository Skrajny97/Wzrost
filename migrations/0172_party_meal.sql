-- Posiłek członka drużyny z autouzupełnianiem (24.11.2026, gracz (poz. 95);
-- src/server/parties.js): the dish a character eats from its own Spiżarnia
-- as its party's trip sets out once its meal has run out, while it is a
-- member and not the leader, {"dish": "zurek", "auto": true}; NULL for none.
-- Kept for later trips and parties, as party_potions (0168).
ALTER TABLE characters ADD COLUMN party_meal TEXT;
