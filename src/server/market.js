// The Targowisko (the Osada, part III, questions 237–242, all A; the engine's
// market.js has the rules): the players' offers as auctions and the
// residents' offers.
//
// Putting up an offer takes its goods off the character at once; a bid takes
// the bidder's gold at once and gives the one it outbids theirs back at
// once. An offer that ends is settled once, by whoever comes first: a
// request to the Targowisko or the minute's cron. What a trade gives waits
// at the Targowisko as a parcel until its character collects it: goods won
// or bought, goods back from an offer without a buyer, a sale's gold. The
// trade's reputation with the Kompania Kupców comes with the collecting,
// up to the day's limit. Each change runs as one batch whose first
// statement fails it unless everything is still as read, so two taps or two
// buyers never both get through.

import {
  COMPANION_PLACES,
  bagCapacity,
  bidBlock,
  bagStacks,
  brotherhoodPerk,
  browseOffers,
  buyCeiling,
  campBonus,
  campLevels,
  companionPlace,
  createRng,
  equipBlock,
  itemName,
  itemView,
  laterPeriod,
  listBlock,
  materialPrice,
  materialView,
  merchantPrice,
  merchantStock,
  minimumBid,
  offerLimit,
  relationDiscount,
  parseStack,
  potionPrice,
  questPeriod,
  randomItem,
  sellerShare,
  sellPrice,
  stackKey,
  tradePoints,
  tradeView,
  wandererGoods,
  wearersOf,
} from '../engine/index.js';
import { bagItems, bagPlaces, characterView, loadPlayer, requireOffRack, requirePlayer } from './characters.js';
import { content } from './content.js';
import { assertion, atomically as atomicBatch, raced } from './atomic.js';
import { favoriteIds, withoutFavorites } from './favorites.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { herbsOf, mineralsOf, potionsOf } from './professions-view.js';
import { requireOpen, settlementOf } from './settlement.js';
import { weekNow } from './weeks.js';
import { saleFamePoints } from './fame.js';

const COLUMNS = { herb: 'herbs', potion: 'potions', material: 'materials', part: 'parts', mineral: 'minerals' };
const STACKS = Object.keys(COLUMNS);
const tuning = () => content().settlement.market;
const jsonPath = (key) => `$."${key}"`;
const changed = () => new ApiError(409, 'character_changed', 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.');

// A batch that fails as a whole unless its assertion holds (atomic.js).
const atomically = (db, statements) => atomicBatch(db, statements, changed);

// A stack's goods by kind and key, as a parcel or an offer shows them, with
// what its card tells (the author: "bym mogl kliknac przedmiot i go
// sprawdzić u kupca"): its description, what the scrapper pays for a piece
// (`scrap`) and, for a herb, the Zielarstwo level that gathers it, for a
// gem or an ore of Górnictwo, the level that digs it.
function goodsView(kind, key, count, item) {
  if (kind === 'item') {
    const data = JSON.parse(item);
    return { kind, count: 1, name: itemName(data, content()), rarity: data.rarity, level: data.level, item: itemView(data, content()) };
  }
  if (kind === 'material') {
    const material = materialView(key, count, content());
    const { description } = content().materialsById[material.materialId];
    return { kind, key, count, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), rarity: material.rarity, material, description, scrap: materialPrice(material.rarity, content()) };
  }
  if (kind === 'part') {
    const part = content().partsById[key];
    return { kind, key, count, name: part?.name ?? key, rarity: part?.rarity, description: part?.description };
  }
  if (kind === 'herb') {
    const herb = content().herbsById[key];
    return { kind, key, count, name: herb?.name ?? key, description: herb?.description, scrap: herb?.price, gatherLevel: herb?.level };
  }
  if (kind === 'potion') {
    const potion = content().potionsById[key];
    return { kind, key, count, name: potion?.name ?? key, description: potion?.description, scrap: potion && potionPrice(potion, content()) };
  }
  if (kind === 'mineral') {
    const mineral = content().mineralsById[key];
    return { kind, key, count, name: mineral?.name ?? key, rarity: mineral && (mineral.rarity ?? mineral.for[0]), description: mineral?.description, scrap: mineral?.price, mineLevel: mineral?.level };
  }
  return { kind: 'gold', count };
}

const offerOf = (row) => ({
  id: row.id,
  sellerId: row.seller_id,
  sellerUserId: row.seller_user_id,
  startPrice: row.start_price,
  buyNow: row.buy_now,
  bid: row.bid,
  bidderId: row.bidder_id,
  state: row.state,
  endsAt: row.ends_at,
});

// An offer for the page. The test version's own trader (no seller) is
// named in the page's language, as its offers keep the name they were put
// up with. For the filters over the offers (the author, 10.11.2026:
// "Wywalić aktualne filtry Targowiska i zrobić bardziej przydatne -
// Licytowane przeze mnie, Do założenia przeze mnie (czy tam moją klasę)"):
// `myBid`, the character's own last bid on it (market_bids), or null, so
// "Licytuję" shows whether it leads or was outbid; and for an item,
// `equipBlock`, why `wearer` cannot wear it now, or null, as "Załóż" asks
// (equipBlock in the engine), for "Dla mnie"; and `wearers`, who of the
// character's own can put it on now ('me' and its companions' ids,
// wearersOf), so its card compares it with what each of them wears (a
// player's remark, 11.11.2026: compared with what a companion wears, as
// with what the character wears).
function offerView(row, wearer, team = teamOf(wearer)) {
  const offer = offerOf(row);
  const item = row.kind === 'item' ? JSON.parse(row.item) : null;
  return {
    id: row.id,
    seller: row.seller_id === null ? tuning().testSeller : row.seller_name,
    goods: goodsView(row.kind, row.good, row.count, row.item),
    startPrice: row.start_price,
    buyNow: row.buy_now,
    bid: row.bid,
    bids: row.bids,
    endsAt: row.ends_at,
    minBid: minimumBid(offer, content()),
    leading: row.bidder_id === wearer.id,
    own: row.seller_id === wearer.id,
    myBid: row.my_bid ?? null,
    ...(item && { equipBlock: equipBlock(item, wearer.class_id, wearer.class_level, content()), wearers: wearersOf(item, team, content()) }),
  };
}

// The character and its hired companions, for who can put an item on.
function teamOf(row) {
  return { classId: row.class_id, classLevel: row.class_level, companions: settlementOf(row).companions ?? [] };
}

// The companions for the cards' comparisons: each with its class and level
// and what it wears in its places (a weapon, armour and one piece of
// jewellery, an amulet, a ring or a talisman), as the Kwatery show it.
function teamView(team) {
  return team.companions.map((companion) => ({
    id: companion.id,
    name: companion.name,
    appearance: companion.appearance,
    className: content().classesById[companion.classId]?.name ?? companion.classId,
    level: companion.level,
    wear: COMPANION_PLACES.map((place) => {
      const worn = companion.gear.find((item) => companionPlace(item.slot) === place);
      return { slot: place, slotName: content().slotsById[place]?.name ?? content().settlement.companions.texts.jewelry, item: worn ? itemView(worn, content()) : null };
    }),
  }));
}

// The search the page asks for (GET /api/market's query, or `view` in an
// action's body, so its answer shows the same list): which offers, the
// kind of goods, the class, who of the character's own, the Tier, the
// rarity, the category, the order and how many (browseOffers in the engine
// checks each).
function askedView(source) {
  const read = source instanceof URLSearchParams ? (key) => source.get(key) : (key) => source?.[key];
  const text = (key) => (typeof read(key) === 'string' && read(key) !== '' ? read(key) : null);
  const limit = Number(read('limit'));
  return { show: text('show'), kind: text('kind'), classId: text('classId'), who: text('who'), tier: text('tier'), rarity: text('rarity'), category: text('category'), sort: text('sort'), limit: Number.isInteger(limit) && limit > 0 ? limit : null };
}

// A parcel for `characterId` of an offer's goods.
const goodsParcel = (db, offer, characterId, reason, price, now) =>
  db
    .prepare('INSERT INTO market_parcels (character_id, offer_id, kind, good, count, item, reason, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(characterId, offer.id, offer.kind, offer.good, offer.count, offer.item, reason, price, now);

// The seller's parcel of a sale's gold, without the Targowisko's fee, the
// one the offer was put up with (lower with the Kompania Kupców, 592); the
// test version's own offers have no seller to get it. With the seller's
// Punkty Sławy for the sale (saleFamePoints in fame.js: at most `weekly`
// sales a week, 839 A).
const goldParcel = (db, offer, price, now) =>
  offer.seller_id === null
    ? []
    : [
        db
          .prepare("INSERT INTO market_parcels (character_id, offer_id, kind, count, reason, price, created_at) VALUES (?, ?, 'gold', ?, 'sold', ?, ?)")
          .bind(offer.seller_id, offer.id, sellerShare(price, content(), offer.fee ?? tuning().fee), price, now),
        ...saleFamePoints(db, offer.seller_id, offer.id, now),
      ];

// The Rejestr (the author, 10.11.2026: "Zbudować rejestr na targowisku
// sprzedanych i odebranych przedmiotów (oraz wygranych w licytacjach)"): a
// line of a character's trade, written in the batch of the trade itself,
// and its oldest lines past the data's number (market.log.entries) gone,
// as the design lets nothing run out with time. `event`: sold, bought,
// won, expired or withdrawn; `other` the other side, a player's character
// (`name`, as it is called then) or 'merchant', 'wanderer' or 'test' (the
// test version's own trader), named in the page's language when the
// Rejestr is shown.
function logLine(db, characterId, { event, other = 'player', name = null, kind, good = null, count = 1, item = null, price = 0, gold = null }, now) {
  return [
    db
      .prepare('INSERT INTO market_log (character_id, event, other, other_name, kind, good, count, item, price, gold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(characterId, event, other, name, kind, good, count, item, price, gold, now),
    db.prepare('DELETE FROM market_log WHERE character_id = ? AND id NOT IN (SELECT id FROM market_log WHERE character_id = ? ORDER BY id DESC LIMIT ?)').bind(characterId, characterId, tuning().log.entries),
  ];
}

// The Rejestr's line of an offer's goods for `characterId`.
const offerLine = (db, offer, characterId, line, now) => logLine(db, characterId, { kind: offer.kind, good: offer.good, count: offer.count, item: offer.item, ...line }, now);

// The seller's side of an offer, for the buyer's line: a player's
// character, or the test version's own trader.
const sellerSide = (offer) => (offer.seller_id === null ? { other: 'test' } : { name: offer.seller_name });

// The lines of an offer sold for `price` to `buyerId`, named `buyerName`:
// the buyer's (`event`: won or bought) and the seller's, with the gold it
// gets after the fee (none for the test version's own trader).
const soldLines = (db, offer, event, buyerId, buyerName, price, now) => [
  ...offerLine(db, offer, buyerId, { event, price, ...sellerSide(offer) }, now),
  ...(offer.seller_id === null
    ? []
    : offerLine(db, offer, offer.seller_id, { event: 'sold', price, name: buyerName, gold: sellerShare(price, content(), offer.fee ?? tuning().fee) }, now)),
];

// The bids kept for "Licytuję" go once their offer is settled.
const bidsGone = (db, offer) => db.prepare('DELETE FROM market_bids WHERE offer_id = ?').bind(offer.id);

// The offers whose time ran out (questions 238 A, 239 A): a sold one gives
// its bidder the goods and its seller the gold, and one without a bid goes
// back to its seller (the test version's own trader just takes it away).
// Each settles once, in a batch of its own; one that fails waits for the
// next time and keeps the others from nothing. The Rejestr writes it down
// for both sides.
export async function settleMarket(db, now) {
  const ended = await db
    .prepare("SELECT *, (SELECT name FROM characters WHERE id = market_offers.bidder_id) AS bidder_name FROM market_offers WHERE state = 'open' AND ends_at <= ? ORDER BY ends_at LIMIT 100")
    .bind(now)
    .all();
  for (const offer of ended.results) {
    const sold = offer.bidder_id !== null;
    const goods = sold
      ? [goodsParcel(db, offer, offer.bidder_id, 'won', offer.bid, now)]
      : offer.seller_id === null
        ? []
        : [goodsParcel(db, offer, offer.seller_id, 'returned', 0, now)];
    const lines = sold
      ? soldLines(db, offer, 'won', offer.bidder_id, offer.bidder_name, offer.bid, now)
      : offer.seller_id === null
        ? []
        : offerLine(db, offer, offer.seller_id, { event: 'expired' }, now);
    try {
      await db.batch([
        assertion(db, "EXISTS (SELECT 1 FROM market_offers WHERE id = ? AND state = 'open' AND version = ?)", [offer.id, offer.version]),
        db.prepare('UPDATE market_offers SET state = ?, settled_at = ?, version = version + 1 WHERE id = ?').bind(sold ? 'sold' : 'expired', now, offer.id),
        ...goods,
        ...(sold ? goldParcel(db, offer, offer.bid, now) : []),
        ...lines,
        bidsGone(db, offer),
      ]);
    } catch (error) {
      if (!raced(error)) console.error(error);
    }
  }
}

// A stack the game still knows; one it no longer has is not put up.
function knownGood(kind, key) {
  if (kind === 'herb') return Boolean(content().herbsById[key]);
  if (kind === 'potion') return Boolean(content().potionsById[key]);
  if (kind === 'part') return Boolean(content().partsById[key]);
  if (kind === 'mineral') return Object.hasOwn(content().mineralsById, key);
  if (kind !== 'material') return false;
  const { materialId, rarityId } = parseStack(key);
  return Boolean(content().materialsById[materialId] && content().raritiesById[rarityId]);
}

// What the character can put up: the items in its bag and its stacks, each
// with what the scrapper pays this character for it (`price` of an item,
// `scrap` of one piece), with the Skup złomu's bonus, as in the bag (the
// author: "Niech przy wyborze czegoś do wystawienia na licytacji pokazuje za
// ile dany przedmiot idzie u złomiarza").
function sellable(player, now) {
  const { row } = player;
  const sellBonus = campBonus(campLevels(player.buildings, now, content()), 'sellPrice', content());
  const stacks = { herb: herbsOf(row), potion: potionsOf(row), material: JSON.parse(row.materials ?? '{}'), part: JSON.parse(row.parts ?? '{}'), mineral: mineralsOf(row) };
  const withBonus = (goods) => (typeof goods.scrap === 'number' ? { ...goods, scrap: goods.scrap * (1 + sellBonus) } : goods);
  // A favourite may go up too, and is no favourite after it (favorites.js);
  // its star shows on the list.
  const favorites = favoriteIds(row);
  return {
    items: bagItems(player).map((item) => ({ id: item.id, ...itemView(item, content(), { sellBonus }), ...(favorites.has(item.id) && { favorite: true }) })),
    stacks: STACKS.flatMap((kind) =>
      Object.entries(stacks[kind])
        .filter(([key, count]) => count > 0 && knownGood(kind, key))
        .map(([key, count]) => withBonus(goodsView(kind, key, count))),
    ),
  };
}

// The wandering trader for the character: on his day of the week, or today
// when "Testuj Osadę" called him on the test version.
function wandererFor(row, stored, now) {
  const today = questPeriod('daily', now, content());
  const called = stored.market?.wandererCalled === today.key ? today : undefined;
  return wandererGoods({ level: row.level, classId: row.class_id, classLevel: row.class_level, seed: row.id }, now, content(), called, brotherhoodPerk('wandererItems', stored.reputation, content()));
}

// The residents' offers (242 A): the merchant's goods of the day with what
// the character may still buy of each, at its relation with him (287 A),
// and the wandering trader's items on his day.
function residentsView(player, stored, now) {
  const stock = merchantStock(now, content());
  const bought = stored.market?.day === stock.day ? (stored.market.bought ?? {}) : {};
  const { row } = player;
  const wanderer = wandererFor(row, stored, now);
  const taken = stored.market?.wandererDay === wanderer.comes.key ? (stored.market.wanderer ?? []) : [];
  const points = merchantPoints(stored);
  return {
    merchant: {
      endsAt: stock.endsAt,
      discount: relationDiscount(points, content()),
      goods: stock.goods.map((good) => ({ ...goodsView(good.kind, good.key, 1), id: good.id, price: merchantPrice(good, points, content()), left: Math.max(0, good.stock - (bought[good.id] ?? 0)) })),
    },
    wanderer: {
      startsAt: wanderer.comes.startsAt,
      endsAt: wanderer.comes.endsAt,
      goods:
        wanderer.goods?.map((good) => ({
          id: good.id,
          name: itemName(good.item, content()),
          rarity: good.item.rarity,
          level: good.item.level,
          item: itemView(good.item, content()),
          price: good.price,
          bought: taken.includes(good.id),
          wearers: wearersOf(good.item, teamOf(row), content()),
        })) ?? null,
    },
  };
}

// The other players' open offers in a light form, with the character's own
// last bid on each (market_bids), for the search's filters and counts.
const lightOffers = (db, row, now) =>
  db
    .prepare(
      // `IS NOT`: the test version's own offers have no seller.
      `SELECT market_offers.id, kind, good, count, start_price, bid, ends_at, json_extract(item, '$.base') AS base, json_extract(item, '$.slot') AS slot,
         json_extract(item, '$.rarity') AS rarity, market_bids.amount AS my_bid
       FROM market_offers LEFT JOIN market_bids ON market_bids.offer_id = market_offers.id AND market_bids.character_id = ?
       WHERE state = 'open' AND ends_at > ? AND seller_id IS NOT ?`,
    )
    .bind(row.id, now, row.id);

// The offers the search `asked` shows (browseOffers in the engine) among
// the `light` ones, and the views of the page's offers only, in the page's
// order.
async function browsed(db, row, team, asked, light) {
  const found = browseOffers(
    light.map((offer) => ({
      id: offer.id,
      kind: offer.kind,
      key: offer.good,
      count: offer.count,
      item: offer.kind === 'item' ? { base: offer.base, slot: offer.slot, rarity: offer.rarity } : null,
      startPrice: offer.start_price,
      bid: offer.bid,
      endsAt: offer.ends_at,
      myBid: offer.my_bid,
    })),
    asked,
    team,
    content(),
  );
  const rows =
    found.ids.length === 0
      ? []
      : (
          await db
            .prepare(
              `SELECT market_offers.*, market_bids.amount AS my_bid FROM market_offers
               LEFT JOIN market_bids ON market_bids.offer_id = market_offers.id AND market_bids.character_id = ?
               WHERE market_offers.id IN (SELECT value FROM json_each(?)) AND state = 'open'`,
            )
            .bind(row.id, JSON.stringify(found.ids))
            .all()
        ).results;
  const byId = new Map(rows.map((offer) => [offer.id, offer]));
  return { ...found, offers: found.ids.map((id) => byId.get(id)).filter(Boolean) };
}

async function marketView(db, player, now, asked = {}) {
  const { row } = player;
  const stored = settlementOf(row);
  const team = teamOf(row);
  const [light, mine, parcels] = await db.batch([
    lightOffers(db, row, now),
    db.prepare("SELECT * FROM market_offers WHERE state = 'open' AND seller_id = ? ORDER BY ends_at").bind(row.id),
    db.prepare('SELECT * FROM market_parcels WHERE character_id = ? ORDER BY id').bind(row.id),
  ]);
  const found = await browsed(db, row, team, asked, light.results);
  const day = questPeriod('daily', now, content()).key;
  const { minHours, reputation, maxPrice, browse } = tuning();
  return {
    // The character's own fee and longest auction, by the Kompania Kupców
    // (592), and the longest without it, which the hours start at.
    fee: brotherhoodPerk('marketFee', stored.reputation, content()),
    hours: brotherhoodPerk('auctionHours', stored.reputation, content()),
    usualHours: tuning().hours,
    minHours,
    maxPrice,
    limit: offerLimit(stored.reputation, content()),
    // The page of the search (browseOffers): the offers in its order, how
    // many it found in all, how many each choice holds, the search as made,
    // and how many more "Pokaż kolejne" adds, up to the most.
    offers: found.offers.map((offer) => offerView(offer, row, team)),
    found: found.found,
    counts: found.counts,
    view: found.view,
    page: browse.page,
    most: browse.most,
    // The companions, for the comparison with what each wears.
    team: teamView(team),
    // The Tiers the search's Tier choice names (counts.tiers by their
    // number), from the class level each asks for.
    tiers: content().encyclopedia.tiers.map((/** @type {{ name: string, classLevel: number }} */ tier, index) => ({ id: String(index + 1), name: tier.name, classLevel: tier.classLevel })),
    mine: mine.results.map((offer) => offerView(offer, row, team)),
    parcels: parcels.results.map((parcel) => ({ id: parcel.id, reason: parcel.reason, goods: goodsView(parcel.kind, parcel.good, parcel.count, parcel.item) })),
    sellable: sellable(player, now),
    trade: tradeView(stored.marketTrade, row.level, now, content(), reputation),
    ...residentsView(player, stored, now),
  };
}

// The answer: the Targowisko after the request, with the search the page
// asked for (askedView).
async function respond(db, session, now, extra = {}, asked = {}) {
  const player = await loadPlayer(db, session.userId);
  return json({ ...extra, market: await marketView(db, player, now, asked), character: characterView(player, now) });
}

async function requireMarket(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  await settleMarket(context.env.DB, context.now);
  return { session, player, db: context.env.DB };
}

// GET /api/market?show=&kind=&classId=&who=&tier=&rarity=&category=&sort=&limit=:
// the Targowisko for the page, the players' offers as the search asks.
export async function getMarket(context) {
  const { session, db } = await requireMarket(context);
  return respond(db, session, context.now, {}, askedView(new URL(context.request.url).searchParams));
}

// The other side of a line of the Rejestr, named in the page's language.
function otherName(line) {
  if (line.other === 'merchant') return content().residentsById[tuning().resident]?.name ?? null;
  if (line.other === 'wanderer') return t('Wędrowny handlarz');
  if (line.other === 'test') return tuning().testSeller;
  return line.other_name;
}

// The goods of a line as an offer shows them; ones the game no longer
// knows by their name alone, as the line may be older than a change of the
// data.
function lineGoods(line) {
  try {
    return goodsView(line.kind, line.good, line.count, line.item);
  } catch {
    return { kind: line.kind, key: line.good, count: line.count, name: line.good ?? '?' };
  }
}

// GET /api/market/log: the character's Rejestr, the newest first (the
// author, 10.11.2026: "Zbudować rejestr na targowisku sprzedanych i
// odebranych przedmiotów (oraz wygranych w licytacjach)"): what it sold, to
// whom and for how much (with the gold it got after the fee), what it
// bought or won and from whom, and what came back without a buyer or was
// taken back; `since`, the version of the game it is kept from, and
// `limit`, how many lines it keeps. The offers that ended are settled
// first, so their lines are there.
export async function getMarketLog(context) {
  const { player, db } = await requireMarket(context);
  const { log } = tuning();
  const lines = await db.prepare('SELECT * FROM market_log WHERE character_id = ? ORDER BY id DESC LIMIT ?').bind(player.row.id, log.entries).all();
  return json({
    since: log.since,
    limit: log.entries,
    log: lines.results.map((line) => ({
      id: line.id,
      event: line.event,
      at: line.created_at,
      goods: lineGoods(line),
      price: line.price,
      gold: line.gold,
      with: otherName(line),
    })),
  });
}

// POST /api/market/list { kind, key or itemId, count, startPrice, buyNow, hours }:
// the goods leave the character and the offer opens for the hours chosen
// (from minHours to hours, the longest without a choice).
export async function listOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const kind = body.kind;
  const item = kind === 'item' ? player.items.find((one) => one.id === Number(body.itemId) && !one.equippedSlot) : null;
  requireOffRack(player, item);
  const column = COLUMNS[kind];
  const key = typeof body.key === 'string' ? body.key : null;
  const held = kind === 'item' ? (item ? 1 : 0) : column && key && knownGood(kind, key) ? (JSON.parse(row[column] ?? '{}')[key] ?? 0) : 0;
  const open = (await db.prepare("SELECT COUNT(*) AS open FROM market_offers WHERE seller_id = ? AND state = 'open'").bind(row.id).first()).open;
  const { reputation } = settlementOf(row);
  const limit = offerLimit(reputation, content());
  const count = kind === 'item' ? 1 : body.count;
  const buyNow = body.buyNow === null || body.buyNow === undefined || body.buyNow === '' ? null : body.buyNow;
  const hours = body.hours === null || body.hours === undefined ? tuning().hours : body.hours;
  // Longer auctions and a lower fee with the Kompania Kupców (592); the fee
  // stays with the offer as it was put up.
  const block = listBlock({ kind, count, startPrice: body.startPrice, buyNow, hours }, held, open, limit, content(), brotherhoodPerk('auctionHours', reputation, content()));
  const fee = brotherhoodPerk('marketFee', reputation, content());
  if (block) throw new ApiError(block.code === 'too_many' || block.code === 'not_enough' ? 409 : 400, block.code, block.message);
  const now = context.now;
  const endsAt = now + hours * 3600000;
  const data = item ? JSON.stringify(Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'id' && field !== 'equippedSlot'))) : null;
  const still = item
    ? ['(SELECT COUNT(*) FROM items WHERE id = ? AND character_id = ? AND slot IS NULL) = 1', [item.id, row.id]]
    : [`COALESCE((SELECT json_extract(${column}, ?) FROM characters WHERE id = ?), 0) >= ?`, [jsonPath(key), row.id, count]];
  await atomically(db, [
    assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT COUNT(*) FROM market_offers WHERE seller_id = ? AND state = 'open') < ? AND ${still[0]}`, [
      row.id,
      row.version,
      row.id,
      limit,
      ...still[1],
    ]),
    item
      ? db.prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND slot IS NULL').bind(item.id, row.id)
      : db
          .prepare(
            `UPDATE characters SET ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END WHERE id = ?`,
          )
          .bind(jsonPath(key), count, jsonPath(key), jsonPath(key), count, jsonPath(key), row.id),
    // An item put up is no favourite any more (favorites.js).
    db.prepare(`UPDATE characters SET favorites = ${withoutFavorites}, version = version + 1 WHERE id = ?`).bind(JSON.stringify(item ? [item.id] : []), row.id),
    db
      .prepare(
        `INSERT INTO market_offers (seller_id, seller_user_id, seller_name, kind, good, count, item, start_price, buy_now, created_at, ends_at, fee)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, row.user_id, row.name, kind, item ? null : key, count, data, body.startPrice, buyNow, now, endsAt, fee),
  ]);
  return respond(db, session, now, {}, askedView(body.view));
}

async function offerRow(db, id) {
  const offer = await db.prepare('SELECT * FROM market_offers WHERE id = ?').bind(Number(id)).first();
  if (!offer) throw new ApiError(404, 'no_offer', 'Tej oferty już nie ma.');
  return offer;
}

// The outbid gets the gold of their bid back at once (238 A).
const refund = (db, offer) => (offer.bidder_id === null ? [] : [db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').bind(offer.bid, offer.bidder_id)]);

// POST /api/market/bid { offerId, amount }: the bid takes the gold at once.
export async function bidOnOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const offer = await offerRow(db, body.offerId);
  const now = context.now;
  const block = bidBlock(offerOf(offer), { amount: body.amount, characterId: row.id, userId: row.user_id, gold: row.gold, now }, content());
  if (block) throw new ApiError(409, block.code, block.message);
  await atomically(db, [
    assertion(db, "EXISTS (SELECT 1 FROM market_offers WHERE id = ? AND state = 'open' AND version = ? AND ends_at > ?) AND (SELECT gold FROM characters WHERE id = ?) >= ?", [
      offer.id,
      offer.version,
      now,
      row.id,
      body.amount,
    ]),
    db.prepare('UPDATE market_offers SET bid = ?, bidder_id = ?, bidder_user_id = ?, bids = bids + 1, version = version + 1 WHERE id = ?').bind(body.amount, row.id, row.user_id, offer.id),
    db.prepare('UPDATE characters SET gold = gold - ?, version = version + 1 WHERE id = ?').bind(body.amount, row.id),
    ...refund(db, offer),
    // The bid kept for "Licytuję", which shows it also once outbid.
    db
      .prepare(
        'INSERT INTO market_bids (offer_id, character_id, amount, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (offer_id, character_id) DO UPDATE SET amount = excluded.amount, created_at = excluded.created_at',
      )
      .bind(offer.id, row.id, body.amount, now),
  ]);
  return respond(db, session, now, { bid: { amount: body.amount } }, askedView(body.view));
}

// POST /api/market/buy { offerId }: "Kup teraz": the offer is sold at once,
// its goods wait for the buyer and its gold for the seller.
export async function buyOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const offer = await offerRow(db, body.offerId);
  const now = context.now;
  const block = bidBlock(offerOf(offer), { buyNow: true, characterId: row.id, userId: row.user_id, gold: row.gold, now }, content());
  if (block) throw new ApiError(409, block.code, block.message);
  const price = offer.buy_now;
  await atomically(db, [
    assertion(db, "EXISTS (SELECT 1 FROM market_offers WHERE id = ? AND state = 'open' AND version = ? AND ends_at > ?) AND (SELECT gold FROM characters WHERE id = ?) >= ?", [
      offer.id,
      offer.version,
      now,
      row.id,
      price,
    ]),
    db
      .prepare("UPDATE market_offers SET state = 'sold', bid = ?, bidder_id = ?, bidder_user_id = ?, bids = bids + 1, settled_at = ?, version = version + 1 WHERE id = ?")
      .bind(price, row.id, row.user_id, now, offer.id),
    db.prepare('UPDATE characters SET gold = gold - ?, version = version + 1 WHERE id = ?').bind(price, row.id),
    ...refund(db, offer),
    goodsParcel(db, offer, row.id, 'bought', price, now),
    ...goldParcel(db, offer, price, now),
    ...soldLines(db, offer, 'bought', row.id, row.name, price, now),
    bidsGone(db, offer),
  ]);
  return respond(db, session, now, { bought: { price } }, askedView(body.view));
}

// POST /api/market/cancel { offerId }: the seller takes back an offer no one
// has bid on; its goods wait at the Targowisko.
export async function cancelOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const offer = await offerRow(db, body.offerId);
  if (offer.seller_id !== row.id || offer.state !== 'open') throw new ApiError(404, 'no_offer', 'Tej oferty już nie ma.');
  if (offer.bidder_id !== null) throw new ApiError(409, 'has_bids', 'Ktoś już licytuje: oferta zostaje do końca.');
  const now = context.now;
  await atomically(db, [
    assertion(db, "EXISTS (SELECT 1 FROM market_offers WHERE id = ? AND state = 'open' AND version = ? AND bidder_id IS NULL)", [offer.id, offer.version]),
    db.prepare("UPDATE market_offers SET state = 'cancelled', settled_at = ?, version = version + 1 WHERE id = ?").bind(now, offer.id),
    goodsParcel(db, offer, row.id, 'returned', 0, now),
    ...offerLine(db, offer, row.id, { event: 'withdrawn' }, now),
    bidsGone(db, offer),
  ]);
  return respond(db, session, now, {}, askedView(body.view));
}

// One change of a JSON column of counts: `adds` by key, each its own
// json_set, with what the SQL needs bound in order.
export function counted(column, adds) {
  let sql = column;
  const binds = [];
  for (const [key, count] of Object.entries(adds)) {
    sql = `json_set(${sql}, ?, COALESCE(json_extract(${column}, ?), 0) + ?)`;
    binds.push(jsonPath(key), jsonPath(key), count);
  }
  return { sql, binds };
}

// Pieces taken off a JSON column of counts of the characters row, `taken`
// by key (e.g. piecesOfRarity in the engine, from several stacks): `sql`
// is the column after it, each stack less by its pieces and one left at 0
// gone, and `enough` the condition that each stack still holds its
// pieces, each with what its SQL needs bound in order. Nothing taken leaves
// the column as it is.
export function takenOff(column, taken) {
  const entries = Object.entries(taken ?? {});
  if (entries.length === 0) return { sql: column, binds: [], enough: '1', enoughBinds: [] };
  const less = counted(`characters.${column}`, Object.fromEntries(entries.map(([key, count]) => [key, -count])));
  return {
    sql: `(SELECT COALESCE(json_group_object(key, value), '{}') FROM json_each(${less.sql}) WHERE value > 0)`,
    binds: less.binds,
    enough: entries.map(() => `COALESCE(json_extract(${column}, ?), 0) >= ?`).join(' AND '),
    enoughBinds: entries.flatMap(([key, count]) => [jsonPath(key), count]),
  };
}

// The goods got from other players count as a trade's for the Encyklopedia
// (ownDiscoveries in the engine), as those of the Wymiana do: the parts too,
// which it has a tab of (the code review, 12.11.2026: a part bought from
// another player was a discovery).
export function foreign(adds) {
  const keyed = {};
  for (const kind of ['herb', 'potion', 'material', 'part', 'mineral']) for (const [key, count] of Object.entries(adds[kind] ?? {})) keyed[`${kind}:${key}`] = count;
  return counted('foreign_stacks', keyed);
}

// The day's reputation with the Kompania Kupców for trade worth `value`;
// buying at the merchant's stall (`relation`) brings as many points of the
// relation with him (question 278 A).
function marketReputation(row, stored, value, now, { relation = false } = {}) {
  // The reputation with the week's share (weeks.js).
  const { points, reputation: gained, trade } = tradePoints(value, row.level, stored.marketTrade, now, content(), tuning().reputation, weekNow(now));
  const { brotherhood, resident } = tuning();
  return {
    ...stored,
    reputation: { ...stored.reputation, [brotherhood]: (stored.reputation[brotherhood] ?? 0) + gained },
    ...(relation && { relations: { ...stored.relations, [resident]: (stored.relations[resident] ?? 0) + points } }),
    marketTrade: trade,
  };
}

// The character's relation points with the merchant, which lower his
// prices (287 A).
const merchantPoints = (stored) => stored.relations[tuning().resident] ?? 0;

// The bag's free places, and the places stacks of herbs or potions take
// after adding `adds`.
const stackPlaces = (counts, adds) => {
  const merged = { ...counts };
  for (const [key, count] of Object.entries(adds)) merged[key] = (merged[key] ?? 0) + count;
  return bagStacks(merged, content());
};

// POST /api/market/collect: everything waiting that fits: gold, materials,
// parts and minerals always, items and herbs or potions while the bag has
// places.
// The trade's reputation comes with it.
export async function collectParcels(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const now = context.now;
  // Its body carries only the page's search, so it may come without one.
  const body = (context.request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json') ? await readJson(context.request) : {};
  const parcels = (await db.prepare('SELECT * FROM market_parcels WHERE character_id = ? ORDER BY id').bind(row.id).all()).results;
  if (parcels.length === 0) throw new ApiError(409, 'nothing', 'Nic tu na Ciebie nie czeka.');
  const free = bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player);
  const held = { herb: herbsOf(row), potion: potionsOf(row) };
  const adds = { herb: {}, potion: {}, material: {}, part: {}, mineral: {} };
  const items = [];
  const taken = [];
  let gold = 0;
  let value = 0;
  let used = 0;
  for (const parcel of parcels) {
    if (parcel.kind === 'item') {
      if (used + 1 > free) continue;
      used += 1;
      items.push({ ...JSON.parse(parcel.item), traded: 1 });
    } else if (parcel.kind === 'herb' || parcel.kind === 'potion') {
      const before = stackPlaces(held[parcel.kind], adds[parcel.kind]);
      const after = stackPlaces(held[parcel.kind], { ...adds[parcel.kind], [parcel.good]: (adds[parcel.kind][parcel.good] ?? 0) + parcel.count });
      if (used + after - before > free) continue;
      used += after - before;
      adds[parcel.kind][parcel.good] = (adds[parcel.kind][parcel.good] ?? 0) + parcel.count;
    } else if (parcel.kind === 'gold') {
      gold += parcel.count;
    } else {
      adds[parcel.kind][parcel.good] = (adds[parcel.kind][parcel.good] ?? 0) + parcel.count;
    }
    // A purchase or a sale counts for the reputation, goods back do not.
    if (parcel.reason !== 'returned') value += parcel.price;
    taken.push(parcel.id);
  }
  if (taken.length === 0) throw new ApiError(409, 'bag_full', 'Plecak jest pełny. Zrób w nim miejsce, żeby odebrać towar.');
  const next = marketReputation(row, settlementOf(row), value, now);
  const changes = Object.fromEntries(STACKS.map((kind) => [kind, counted(COLUMNS[kind], adds[kind])]));
  const others = foreign(adds);
  const list = taken.map(() => '?').join(', ');
  await atomically(db, [
    assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT COUNT(*) FROM market_parcels WHERE character_id = ? AND id IN (${list})) = ?`, [
      row.id,
      row.version,
      row.id,
      ...taken,
      taken.length,
    ]),
    db
      .prepare(
        `UPDATE characters SET gold = gold + ?, herbs = ${changes.herb.sql}, potions = ${changes.potion.sql}, materials = ${changes.material.sql}, parts = ${changes.part.sql},
           minerals = ${changes.mineral.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1 WHERE id = ?`,
      )
      .bind(
        gold,
        ...changes.herb.binds,
        ...changes.potion.binds,
        ...changes.material.binds,
        ...changes.part.binds,
        ...changes.mineral.binds,
        ...others.binds,
        JSON.stringify(next),
        row.id,
      ),
    ...items.map((item) => db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify(item), now)),
    db.prepare(`DELETE FROM market_parcels WHERE character_id = ? AND id IN (${list})`).bind(row.id, ...taken),
  ]);
  return respond(db, session, now, { collected: { count: taken.length, left: parcels.length - taken.length, gold } }, askedView(body?.view));
}

// POST /api/market/resident { from: merchant, id, count } or { from:
// wanderer, id }: buying from the residents (242 A). The merchant's goods go
// straight to the character, up to the day's stock of each; the wandering
// trader's item to the bag, once each.
export async function buyFromResident(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const now = context.now;
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const free = bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player);
  if (body.from === 'wanderer') {
    const wanderer = wandererFor(row, stored, now);
    const good = wanderer.goods?.find((one) => one.id === body.id);
    // A purchase of a later day leaves the day gone none (laterPeriod in
    // quests.js): a request still of that day buys no more and writes no
    // day back (the code review, 12.11.2026).
    if (!good || laterPeriod(stored.market?.wandererDay, wanderer.comes.key)) throw new ApiError(404, 'no_goods', 'Wędrownego handlarza dziś nie ma.');
    const taken = stored.market?.wandererDay === wanderer.comes.key ? (stored.market.wanderer ?? []) : [];
    if (taken.includes(good.id)) throw new ApiError(409, 'sold_out', 'Ten przedmiot już kupiono.');
    if (row.gold < good.price) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
    if (free < 1) throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
    const next = marketReputation(row, { ...stored, market: { ...stored.market, wandererDay: wanderer.comes.key, wanderer: [...taken, good.id] } }, good.price, now);
    await atomically(db, [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, good.price]),
      db.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ?').bind(good.price, JSON.stringify(next), row.id),
      db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify({ ...good.item, traded: 1 }), now),
      ...logLine(db, row.id, { event: 'bought', other: 'wanderer', kind: 'item', item: JSON.stringify({ ...good.item, traded: 1 }), price: good.price }, now),
    ]);
    return respond(db, session, now, { bought: { name: itemName(good.item, content()), price: good.price } }, askedView(body.view));
  }
  const stock = merchantStock(now, content());
  const good = stock.goods.find((one) => one.id === body.id);
  // As the wandering trader's: the merchant's stock of a later day leaves
  // the day gone none.
  if (!good || laterPeriod(stored.market?.day, stock.day)) throw new ApiError(404, 'no_goods', 'Kupiec ma już inny towar.');
  const bought = stored.market?.day === stock.day ? (stored.market.bought ?? {}) : {};
  const count = body.count;
  if (!Number.isInteger(count) || count < 1 || count > good.stock - (bought[good.id] ?? 0)) throw new ApiError(409, 'sold_out', 'Kupiec nie ma już tyle.');
  const price = merchantPrice(good, merchantPoints(stored), content()) * count;
  if (row.gold < price) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  if (good.kind === 'herb' && stackPlaces(herbsOf(row), { [good.key]: count }) - bagStacks(herbsOf(row), content()) > free) {
    throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
  }
  const market = { ...stored.market, day: stock.day, bought: { ...bought, [good.id]: (bought[good.id] ?? 0) + count } };
  const next = marketReputation(row, { ...stored, market }, price, now, { relation: true });
  const column = COLUMNS[good.kind];
  const change = counted(column, { [good.key]: count });
  // Bought, not found: the Encyklopedia leaves it out, as a trade's.
  const others = foreign({ [good.kind]: { [good.key]: count } });
  await atomically(db, [
    assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, price]),
    db
      .prepare(`UPDATE characters SET gold = gold - ?, ${column} = ${change.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1 WHERE id = ?`)
      .bind(price, ...change.binds, ...others.binds, JSON.stringify(next), row.id),
    ...logLine(db, row.id, { event: 'bought', other: 'merchant', kind: good.kind, good: good.key, count, price }, now),
  ]);
  return respond(db, session, now, { bought: { name: goodsView(good.kind, good.key, count).name, count, price } }, askedView(body.view));
}

// "Testuj Osadę" on the test version, where one account has no one to trade
// with. "market": the wandering trader comes today, and a trader of the
// test version's own puts up an item, herbs and a material for `testMinutes`
// minutes, two of them with "Kup teraz". "marketEnd": every open offer of the
// character's, and of that trader's, ends now and settles at once.
export async function testMarket(db, player, stored, action, now) {
  const { row } = player;
  if (action === 'marketEnd') {
    await db.prepare("UPDATE market_offers SET ends_at = ? WHERE state = 'open' AND (seller_id = ? OR seller_id IS NULL)").bind(now, row.id).run();
    await settleMarket(db, now);
    return stored;
  }
  const rng = createRng(`market:test:${row.id}:${now}`);
  const item = randomItem(row.level, rng, content(), { classId: row.class_id, maxClassLevel: row.class_level ?? 1, rarityId: 'rare' });
  const herb = rng.pick(content().herbs);
  const material = rng.pick(content().materials.filter((one) => one.rarity === 'rare'));
  const herbs = 5;
  const materials = 3;
  const offers = [
    { kind: 'item', good: null, count: 1, item: JSON.stringify(item), start: sellPrice(item, content()) * 2, buyNow: sellPrice(item, content()) * 4 },
    { kind: 'herb', good: herb.id, count: herbs, item: null, start: Math.ceil(buyCeiling({ kind: 'herb', key: herb.id }, content()) * herbs), buyNow: null },
    (() => {
      const key = stackKey(material.id, material.rarity);
      const start = Math.ceil(buyCeiling({ kind: 'material', key }, content()) * materials);
      return { kind: 'material', good: key, count: materials, item: null, start, buyNow: start * 2 };
    })(),
  ];
  const endsAt = now + tuning().testMinutes * 60000;
  await db.batch(
    offers.map((offer) =>
      db
        .prepare(
          `INSERT INTO market_offers (seller_id, seller_user_id, seller_name, kind, good, count, item, start_price, buy_now, created_at, ends_at)
           VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(tuning().testSeller, offer.kind, offer.good, offer.count, offer.item, offer.start, offer.buyNow, now, endsAt),
    ),
  );
  return { ...stored, market: { ...stored.market, wandererCalled: questPeriod('daily', now, content()).key } };
}

// What removing characters does at the Targowisko: the leading bidders on
// their open offers get their gold back, their own leading bids are void
// (the gold went with them, and the offer goes on without a bid), and their
// offers and parcels go. `who` is SQL that names the characters' ids, with
// `binds` for it.
export function marketRemoval(db, who, binds) {
  return [
    db
      .prepare(
        `UPDATE characters SET gold = gold + (SELECT SUM(bid) FROM market_offers WHERE state = 'open' AND seller_id IN (${who}) AND bidder_id = characters.id)
         WHERE id IN (SELECT bidder_id FROM market_offers WHERE state = 'open' AND seller_id IN (${who}))`,
      )
      .bind(...binds, ...binds),
    db.prepare(`UPDATE market_offers SET bid = NULL, bidder_id = NULL, bidder_user_id = NULL, version = version + 1 WHERE state = 'open' AND bidder_id IN (${who})`).bind(...binds),
    db.prepare(`DELETE FROM market_parcels WHERE character_id IN (${who})`).bind(...binds),
    // Their Rejestr and bids, and the bids on their offers.
    db.prepare(`DELETE FROM market_log WHERE character_id IN (${who})`).bind(...binds),
    db.prepare(`DELETE FROM market_bids WHERE character_id IN (${who}) OR offer_id IN (SELECT id FROM market_offers WHERE seller_id IN (${who}))`).bind(...binds, ...binds),
    db.prepare(`DELETE FROM market_offers WHERE seller_id IN (${who})`).bind(...binds),
  ];
}
