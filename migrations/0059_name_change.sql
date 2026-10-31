-- One change of a character's name in the Ustawienia (the author: "Daj
-- też już każdemu w sumie opcję Zmiany nazwy postaci w Zębatce -
-- jednorazowo, po czym opcja się blokuje"), and the System's word for a
-- character whose name broke the rules and got a new one from the System.
ALTER TABLE characters ADD COLUMN name_changed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN name_notice TEXT;
