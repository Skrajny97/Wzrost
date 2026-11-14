-- Punkty Systemu bought in the app from the Sklep Play, through Google Play
-- Billing (867 A; src/server/google-play.js, payments.js). A purchase made
-- there has Google's token (`provider_token`, one purchase each, so a token
-- credits once whichever order it is given to) and Google's number of the
-- order in `provider_ref` (a refund needs it). `sandbox`: a purchase of a
-- licence tester's, which Google does not charge for: it gives its points,
-- but counts neither to the account's limit nor to the quarter's revenue.
-- `consumed_at`: when Google was told the purchase is used up (which also
-- confirms it); a purchase Google is never told of is refunded by Google
-- after three days, so the server tells it again until it takes it.
ALTER TABLE purchases ADD COLUMN provider_token TEXT;
ALTER TABLE purchases ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN consumed_at INTEGER;
CREATE UNIQUE INDEX purchases_by_token ON purchases (provider_token) WHERE provider_token IS NOT NULL;
