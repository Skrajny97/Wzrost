-- When each character was last in play (chat.js requireChatter, with the
-- account's seen_at): a guild's leader away for days hands the guild to a
-- deputy (guilds.js, the author 14.11.2026). The character in play takes
-- its account's time; the others start from now, so nobody counts as away
-- for the days before it was written down.
ALTER TABLE characters ADD COLUMN seen_at INTEGER;
UPDATE characters SET seen_at = (SELECT u.seen_at FROM users u WHERE u.id = characters.user_id) WHERE role = 'player';
UPDATE characters SET seen_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE seen_at IS NULL;
