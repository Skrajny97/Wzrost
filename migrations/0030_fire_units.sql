-- The Ognisko's fire spirit counts the pieces traded on a day, not the
-- trades (the author: "Limit wymian u ducha ognia ustal na jednostki, nie
-- na liczby wymian"). fire_day stays the day they belong to; fire_trades
-- is no longer used. Everyone starts the day of the change with all of it.
ALTER TABLE characters ADD COLUMN fire_units INTEGER NOT NULL DEFAULT 0;
