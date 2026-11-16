-- Chowaniec: Błędny ognik for 600 Punkty Systemu, as the other familiars (the
-- author, 16.11.2026: „Błędny ognik również powinien kosztować 600 Punktów
-- Systemu jak reszta Chowańców”; till 0.4.6 it cost 800). Each character that
-- bought it gets the 200 back (it was never given otherwise: only bought in
-- the Sklep Systemu, src/server/cosmetics.js).
UPDATE characters SET system_points = system_points + 200
WHERE EXISTS (SELECT 1 FROM json_each(characters.cosmetics, '$.owned') WHERE value = 'wisp');
