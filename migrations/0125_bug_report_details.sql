-- "Zgłoś błąd": what the game itself adds to a report besides the screen,
-- the version and the phone (src/server/bugs.js): the state of the game's
-- notifications on the phone (pushDiagnosis in src/client/push.js), after a
-- report that they would not switch on could not say why (12.11.2026).
ALTER TABLE bug_reports ADD COLUMN details TEXT;
