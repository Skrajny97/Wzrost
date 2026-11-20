-- Gold in the Skrzynia Konta (src/server/chest.js; DECISIONS.md, "Złoto w
-- Skrzyni Konta (19.11.2026)"; the author, 19.11.2026: „dorób złoto możliwe
-- do przenoszenia miedzy postaciami w skrzyni konta”): one number for the
-- whole account, which any of its characters at the chest's level puts its
-- gold into ("Włóż złoto") and takes gold out of ("Wyjmij złoto"). Gold has
-- no Encyklopedia, so the chest keeps no record of whose it was. It stays
-- when a character is removed, for the account's others, and goes with the
-- account (its row in users).
ALTER TABLE users ADD COLUMN chest_gold INTEGER NOT NULL DEFAULT 0 CHECK (chest_gold >= 0);
