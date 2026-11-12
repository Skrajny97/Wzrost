-- Talia Systemu, the card game of the Salon Gier (src/server/cards.js,
-- src/engine/cards.js; DECISIONS.md, "Talia Systemu: gra karciana w Salonie
-- Gier", 871–877).
--
-- `cards`: a character's collection, a row a card (a creature of the
-- Bestiariusz) with the copies won; the card's level is the copies, up to
-- the data's top (cards.json, stats.maxLevel).
CREATE TABLE cards (
  character_id INTEGER NOT NULL,
  monster_id TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, monster_id)
);
-- `card_decks`: a character's deck, the creatures of its twelve cards as
-- JSON. One deck a character for now; the second stage (other players'
-- decks, the server playing for them as on the Arena, 873 A) plays against
-- this one.
CREATE TABLE card_decks (
  character_id INTEGER PRIMARY KEY,
  cards TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- `card_matches`: a character's matches, the running one with its whole
-- state as JSON (the seed, both decks, the lines and reserves, never sent
-- to the page), a finished one with its result and a small summary in place
-- of the state. `opponent`: "host:<tier>" for Szczęsny's tiers; the second
-- stage adds "player:<character id>". `mode`: "staked" or "training";
-- `stake` the gold paid at the start; `day` the Polish day it started in,
-- for the day's ten staked matches; `version` grows with each turn, so two
-- taps play one turn. At most one running match a character.
CREATE TABLE card_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  opponent TEXT NOT NULL,
  mode TEXT NOT NULL,
  stake INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX card_matches_running ON card_matches (character_id) WHERE result IS NULL;
CREATE INDEX card_matches_finished ON card_matches (character_id, finished_at);
-- The character's game at the table, as JSON: whether it took the starter
-- deck, the day of its counters, its staked matches that day, the tiers
-- whose reward of the day it took, the tiers it has ever beaten (their card
-- given) and the last match's result for the page.
ALTER TABLE characters ADD COLUMN card_game TEXT NOT NULL DEFAULT '{}';
