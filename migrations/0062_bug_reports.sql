-- "Zgłoś błąd" (the author: "Trzeba dodac przycisk Zgłoś błąd i zeby
-- przychodzil mi w Panel Autora"): what a player wrote, with what the game
-- added itself (the screen, the game's version, the phone and the
-- character as it was then), waiting in the author's panel until done.
CREATE TABLE bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  character_id INTEGER,
  character TEXT,
  text TEXT NOT NULL,
  screen TEXT,
  version TEXT,
  device TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX bug_reports_open ON bug_reports (resolved_at, created_at);
CREATE INDEX bug_reports_user ON bug_reports (user_id, created_at);
