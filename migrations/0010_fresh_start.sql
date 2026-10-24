-- A fresh start for everyone testing the game (the author's request,
-- 24.10.2026): every character goes, as with "Zacznij od nowa" on each
-- account, so everyone creates a character again and meets the narrator's
-- introduction. Accounts and sign-ins stay. Like every migration it runs
-- once; the tables that hang on a character go first.
DELETE FROM reports;
DELETE FROM activities;
DELETE FROM items;
DELETE FROM buildings;
DELETE FROM characters;
