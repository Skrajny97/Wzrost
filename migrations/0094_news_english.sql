-- "Co nowego?" in English (0.2.2): each entry's English, made once when the
-- entry is published or corrected, or when a player in English first lists
-- it (src/server/news.js): the draft's own English (data/en/news.json) for
-- an entry published from its draft unchanged, else a machine translation.
-- NULL until made; a player in English reads the Polish meanwhile.
ALTER TABLE news ADD COLUMN title_en TEXT;
ALTER TABLE news ADD COLUMN body_en TEXT;
