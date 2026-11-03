-- The Salon Gier in the Osada (src/server/casino.js, answers 523–526).
--
-- The Loteria's tickets: one a character a day (`day`: the date of the
-- narrator's daily quests, as "2026-11-03", from Polish midnight to the
-- next). A day's tickets wait for its draw and go with it.
CREATE TABLE lottery_tickets (
  day TEXT NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, character_id)
);
CREATE INDEX lottery_tickets_character ON lottery_tickets (character_id);

-- The draws, one a day with tickets, written once (the cron at midnight,
-- src/server/index.js): how many tickets there were, the pot, the winner as
-- it was then (its id, name and look for the forms of the words; no link to
-- the character, which may go later) and the draw's own seed.
CREATE TABLE lottery_draws (
  day TEXT PRIMARY KEY,
  tickets INTEGER NOT NULL,
  pot INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  appearance TEXT NOT NULL,
  seed TEXT NOT NULL,
  drawn_at INTEGER NOT NULL
);

-- A message of the System in the chat (the Loteria's result in the
-- Globalny): kept under the winner's account and character, as every
-- message has one, but shown as the System's, which nobody reports or
-- hides, and which keeps nobody from writing.
ALTER TABLE chat_messages ADD COLUMN system INTEGER NOT NULL DEFAULT 0;
