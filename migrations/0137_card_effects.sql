-- Talia Systemu's effect cards (976–979; src/server/cards.js,
-- src/engine/cards.js; DECISIONS.md, "Karty efektów w Talii Systemu"):
-- `card_effects`, a character's effect cards with the copies won (the
-- card's level is the copies, up to the data's top, as for the creatures'
-- cards); `effects` of a deck in play and of a saved deck: the ids of its
-- effect cards as JSON, at most cards.json effects.slots of them.
CREATE TABLE card_effects (
  character_id INTEGER NOT NULL,
  effect_id TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, effect_id)
);
ALTER TABLE card_decks ADD COLUMN effects TEXT NOT NULL DEFAULT '[]';
ALTER TABLE card_deck_slots ADD COLUMN effects TEXT NOT NULL DEFAULT '[]';
