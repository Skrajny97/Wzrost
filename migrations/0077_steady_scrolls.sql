-- The Zwój utrwalenia (the author's of 4.11.2026, 598 C, 599 B): the ones a
-- character holds for the Kowadło, as `scrolls` holds the Zwoje ochronne.
ALTER TABLE characters ADD COLUMN steady_scrolls INTEGER NOT NULL DEFAULT 0;
