-- The author (10.11.2026), after 0.2.37, where the levels of the Shadow, the
-- Assassin and the Kingslayer grow Vitality instead of Strength: "Cienia
-- popraw statystyki tym ktorzy rozdawali wedlug klasy zatem". "Rozdaj według
-- klasy" never put a Shadow's points into Strength (autoPoints in
-- data/classes.json), and the Strength of its class levels turned into
-- Vitality by itself (computeStats), but points a player put into Strength by
-- hand do nothing for a class that fights only with daggers, and no event
-- tests a stat. So every Shadow's points spent on Strength go back to its
-- free points, to be spent again; its other points stay as they are. The
-- test version's copy for "Cofnij ewolucję" (points_undo) loses them too, so
-- an undo cannot bring them back.
UPDATE characters
SET points = json_remove(points, '$.strength'),
    points_undo = CASE WHEN points_undo IS NULL THEN NULL ELSE json_remove(points_undo, '$.strength') END,
    version = version + 1
WHERE class_id = 'shadow'
  AND COALESCE(json_extract(points, '$.strength'), 0) > 0;
