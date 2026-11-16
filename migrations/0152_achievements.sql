-- Osiągnięcia z tytułami (1030, list and window 1036.1–1036.2 accepted,
-- the title only in the profile and the Ranking: 1036.3 B). `feats`: the
-- counts the game kept nowhere before, from this version on (creatures,
-- champions and wanted beaten on explorations, the explorations' gold, duels
-- won on the Arena, fights won in the guild war league, Labirynty cleared,
-- deals on the Targowisko); `achievements`: those whose rewards are given,
-- with when; `title`: the achievement whose title the character wears.
ALTER TABLE characters ADD COLUMN feats TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN achievements TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN title TEXT;
