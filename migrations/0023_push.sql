-- Phone notifications (src/server/push.js). A phone or browser that allowed
-- them keeps a push subscription: the address of its push service
-- (endpoint) and the keys that encrypt messages for it. One account may have
-- several; a subscription belongs to the account last signed in with it.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Values the server keeps for itself: the key pair that signs its push
-- messages (vapid) and the time up to which notifications went out
-- (push_checked_at).
CREATE TABLE server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
