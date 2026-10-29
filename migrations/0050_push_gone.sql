-- When the push service said it no longer knows the subscription (404 or
-- 410, push.js). The subscription stays so that the phone, which still
-- hands it in on every start, learns it is dead and makes a new one, and
-- nothing is sent to it any more.
ALTER TABLE push_subscriptions ADD COLUMN gone_at INTEGER;
