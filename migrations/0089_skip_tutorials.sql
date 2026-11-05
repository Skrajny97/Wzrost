-- "Pomijaj objaśnienia narratora" in the Ustawienia (DECISIONS.md,
-- „Pomijanie objaśnień narratora w Ustawieniach”): 1 on an account whose
-- characters, all of them, hear none of the narrator's explanations. Each
-- chapter is passed as its "Pomiń objaśnienie" passes it, and a new
-- character starts as after "Pomiń wprowadzenie" (src/server/tutorial.js,
-- src/client/narrator.js). On the account, so it holds on every device.
ALTER TABLE users ADD COLUMN skip_tutorials INTEGER NOT NULL DEFAULT 0;
