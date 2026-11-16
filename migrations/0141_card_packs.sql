-- Packs of cards found on explorations and at the other activities
-- (data/cards.json drops.packShare; the author, 16.11.2026: „Niech z wypraw
-- i wszystkich innych aktywności będzie opcja dropienia boosterów kart
-- zamiast samych kart”), each opened in the Salon's tab as Szczęsny's pack.
ALTER TABLE characters ADD COLUMN card_packs INTEGER NOT NULL DEFAULT 0;
