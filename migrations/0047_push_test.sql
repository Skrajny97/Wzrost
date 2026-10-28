-- When the phone last asked for a test notification (push.js, testPush):
-- one a half minute at most.
ALTER TABLE push_subscriptions ADD COLUMN tested_at INTEGER;
