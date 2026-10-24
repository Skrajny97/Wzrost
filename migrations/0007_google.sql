-- Google sign-in: the Google user id ("sub" in its ID token) of an account
-- made with Google or linked to it in the settings. Accounts made with Google
-- have no password: their password_hash matches no password.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX users_google_sub ON users (google_sub);
