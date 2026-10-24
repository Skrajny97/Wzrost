-- Punkty Systemu: the premium currency for cosmetics. They belong to the
-- account, not the character, so "Zacznij od nowa" keeps them.
ALTER TABLE users ADD COLUMN system_points INTEGER NOT NULL DEFAULT 0;
