-- A screenshot sent with a bug report (the author: "daj opcje dołączania
-- screena w zgłoś błąd"): one picture per report, at most 1 MB, its kind
-- read from its first bytes, never from what the phone says
-- (src/server/bugs.js). Apart from the reports, so that the author's list
-- does not carry the pictures; the author's panel asks for each one by
-- itself (src/server/author.js). Deleted with its report.
CREATE TABLE bug_report_images (
  report_id INTEGER PRIMARY KEY REFERENCES bug_reports (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
