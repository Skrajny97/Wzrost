-- The creatures a character has met in a fight, as a JSON list of monster
-- ids: "Czyhające niebezpieczeństwa" shows the others as shadows with "???".
-- A claimed report adds its creatures (src/server/hunts.js). Characters made
-- before know those in the reports they still keep.
ALTER TABLE characters ADD COLUMN met TEXT NOT NULL DEFAULT '[]';
UPDATE characters
SET met = COALESCE(
  (
    SELECT json_group_array(monster_id)
    FROM (
      SELECT DISTINCT json_extract(enemy.value, '$.monsterId') AS monster_id
      FROM reports, json_each(reports.data, '$.fights') AS fight, json_each(fight.value, '$.enemies') AS enemy
      WHERE reports.character_id = characters.id AND json_extract(enemy.value, '$.monsterId') IS NOT NULL
    )
  ),
  '[]'
);
