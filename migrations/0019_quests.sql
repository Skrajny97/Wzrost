-- The narrator's daily and weekly quests (src/engine/quests.js): each
-- period's key, its quests with their progress and rewards, and whether its
-- chest is open, as JSON. A period's quests are drawn and saved when it
-- comes (src/server/characters.js: settleQuests).
ALTER TABLE characters ADD COLUMN quests TEXT NOT NULL DEFAULT '{}';
