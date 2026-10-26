-- Punkty Systemu for an account bound to Google (the author: "Niech
-- rejestracja/podpięcie konta Google też daje ten bonus 10 Punktów
-- Systemu"), once an account, as for a confirmed e-mail (email.js,
-- google.js). Accounts bound before get them now: their character, or the
-- first one they make. 10 is balance.account.emailSystemPoints.
UPDATE characters SET system_points = system_points + 10, version = version + 1
  WHERE role = 'player'
    AND user_id IN (SELECT id FROM users WHERE google_sub IS NOT NULL AND email_rewarded_at IS NULL);

UPDATE users SET
    system_points_waiting = system_points_waiting
      + CASE WHEN NOT EXISTS (SELECT 1 FROM characters WHERE user_id = users.id AND role = 'player') THEN 10 ELSE 0 END,
    email_rewarded_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE google_sub IS NOT NULL AND email_rewarded_at IS NULL;
