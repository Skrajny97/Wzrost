-- The Targowisko (src/server/market.js, questions 237–242): the players'
-- offers as auctions, and the parcels waiting to be collected there.
--
-- An offer holds what it sells: an item's data (`item`, the item leaves the
-- bag) or a count of a stack (`good`: a herb's, potion's or part's id, or a
-- material's "materialId:rarityId"). `bid` is the highest bid so far, the
-- bidder's gold held by the Targowisko. State: open, sold, expired (no bid
-- by its end) or cancelled (taken back before any bid). An offer without a
-- seller is the test version's own ("Testuj Osadę"): its gold goes nowhere.
CREATE TABLE market_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER REFERENCES characters (id) ON DELETE CASCADE,
  seller_user_id INTEGER,
  seller_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  good TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  item TEXT,
  start_price INTEGER NOT NULL,
  buy_now INTEGER,
  bid INTEGER,
  bidder_id INTEGER,
  bidder_user_id INTEGER,
  bids INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  settled_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX market_offers_open ON market_offers (state, ends_at);
CREATE INDEX market_offers_seller ON market_offers (seller_id, state);

-- What waits for a character at the Targowisko: goods won or bought, goods
-- back from an offer that ended without a buyer or was taken back, and the
-- gold of a sale.
-- `kind`: item, herb, potion, material, part or gold (`count` gold).
CREATE TABLE market_parcels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  offer_id INTEGER,
  kind TEXT NOT NULL,
  good TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  item TEXT,
  reason TEXT NOT NULL,
  -- What the trade was worth, for the Kompania Kupców's reputation.
  price INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX market_parcels_character ON market_parcels (character_id);
