-- 939 (14.11.2026, the author: "przydałoby się dać opcję nazywania swoich
-- talii"): a saved deck's name, as its player gave it; a deck without one
-- shows only its number.
ALTER TABLE card_deck_slots ADD COLUMN name TEXT;
