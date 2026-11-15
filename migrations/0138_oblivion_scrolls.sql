-- The Zwoje Niepamięci a character holds (989, DECISIONS.md, "Zwój
-- Niepamięci"): each resets its stat points once, free, in the Statystyki.
ALTER TABLE characters ADD COLUMN oblivion_scrolls INTEGER NOT NULL DEFAULT 0;

-- One for every character there is now (the author, 15.11.2026: „daj
-- każdemu graczowi jednorazowy przedmiot zerujący statystyki”), with the
-- evolutions that change their weapon (988).
UPDATE characters SET oblivion_scrolls = 1 WHERE role IN ('player', 'aside');
