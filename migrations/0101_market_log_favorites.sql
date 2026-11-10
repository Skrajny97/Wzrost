-- The author, 10.11.2026: the Targowisko's Rejestr ("Zbudować rejestr na
-- targowisku sprzedanych i odebranych przedmiotów (oraz wygranych w
-- licytacjach)"), its "Licytuję" ("Wywalić aktualne filtry Targowiska i
-- zrobić bardziej przydatne - Licytowane przeze mnie, Do założenia przeze
-- mnie") and the favourite items ("Do tego opcja dodawania do ulubionych,
-- by przypadkiem nie rozebrać czegoś na później"). src/server/market.js and
-- src/server/favorites.js.

-- A character's trades at the Targowisko, from this version on, written in
-- the same batch as the trade itself: `event` sold (its gold, `gold`, after
-- the Targowisko's fee), bought ("Kup teraz", or from the merchant or the
-- wandering trader), won (an auction), expired (back without a buyer) or
-- withdrawn (taken back by its seller). `other` is the other side: a
-- player's character (`other_name`, its name at the time), the merchant,
-- the wandering trader or the test version's own trader. The goods as an
-- offer holds them: an item's data, or a count of a stack. Each character
-- keeps its last entries (data/settlement.json, market.log).
CREATE TABLE market_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  other TEXT NOT NULL DEFAULT 'player',
  other_name TEXT,
  kind TEXT NOT NULL,
  good TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  item TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  gold INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX market_log_character ON market_log (character_id, id);

-- Who bids on which open offer, with their last bid: the offer itself keeps
-- only the one who leads, and "Licytuję" shows the outbid too. An offer's
-- rows go once it is settled. The leading bids of the offers open now come
-- in at once.
CREATE TABLE market_bids (
  offer_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (offer_id, character_id)
);
CREATE INDEX market_bids_character ON market_bids (character_id);
INSERT INTO market_bids (offer_id, character_id, amount, created_at)
  SELECT id, bidder_id, bid, created_at FROM market_offers
  WHERE state = 'open' AND bidder_id IS NOT NULL AND bid IS NOT NULL AND bidder_id IN (SELECT id FROM characters);

-- The ids of the items the character marked with a star: a favourite is not
-- taken apart nor sold to the scrapper, by hand, by the handful or when the
-- bag overflows. The mark is the owner's: an item that leaves the character
-- is no longer its favourite, and an id of an item gone is ignored.
ALTER TABLE characters ADD COLUMN favorites TEXT NOT NULL DEFAULT '[]';
