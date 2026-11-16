-- The reward for days in a row (1029, mock-ups 1034 accepted on 16.11.2026),
-- one series for the account: `streak_day` the day of the series last taken
-- (1–7, 0 before the first), `streak_at` the date it was taken on (the
-- daily quests' key, Polish time), `streak_done` the series taken to their
-- 7th day (the achievement Wytrwałość, 1036).
ALTER TABLE users ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_at TEXT;
ALTER TABLE users ADD COLUMN streak_done INTEGER NOT NULL DEFAULT 0;
