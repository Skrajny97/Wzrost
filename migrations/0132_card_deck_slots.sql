-- 938 (14.11.2026, the author: "opcje zapisania kilku różnych talii kart do
-- użytku za jednym kliknieciem w wiekszosci miejsc"): a character's saved
-- decks of Talia Systemu, each in its numbered slot (1 to cards.savedDecks),
-- the twelve card ids as JSON. The deck in play stays in `card_decks`, with
-- the slot it comes from (`slot`); every deck in play so far is its
-- character's first saved deck.
CREATE TABLE card_deck_slots (
  character_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  cards TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, slot)
);
ALTER TABLE card_decks ADD COLUMN slot INTEGER NOT NULL DEFAULT 1;
INSERT INTO card_deck_slots (character_id, slot, cards, updated_at) SELECT character_id, 1, cards, updated_at FROM card_decks;
