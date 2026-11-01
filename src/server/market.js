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
  bagCapacity,
  bidBlock,
  bagStacks,
  buyCeiling,
  campLevels,
  createRng,
  itemName,
  itemView,
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
  wandererGoods,
} from '../engine/index.js';
import { bagPlaces, characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { assertion, atomically as atomicBatch, raced } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { herbsOf, potionsOf } from './professions-view.js';
import { requireOpen, settlementOf } from './settlement.js';

const COLUMNS = { herb: 'herbs', potion: 'potions', material: 'materials', part: 'parts' };
const STACKS = Object.keys(COLUMNS);
const tuning = () => content.settlement.market;
const jsonPath = (key) => `$."${key}"`;
const changed = () => new ApiError(409, 'character_changed', 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.');

// A batch that fails as a whole unless its assertion holds (atomic.js).
const atomically = (db, statements) => atomicBatch(db, statements, changed);

// A stack's goods by kind and key, as a parcel or an offer shows them, with
// what its card tells (the author: "bym mogl kliknac przedmiot i go
// sprawdzić u kupca"): its description, what the scrapper pays for a piece
// (`scrap`) and, for a herb, the Zielarstwo level that gathers it.
function goodsView(kind, key, count, item) {
  if (kind === 'item') {
    const data = JSON.parse(item);
    return { kind, count: 1, name: itemName(data, content), rarity: data.rarity, level: data.level, item: itemView(data, content) };
  }
  if (kind === 'material') {
    const material = materialView(key, count, content);
    const { description } = content.materialsById[material.materialId];
    return { kind, key, count, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), rarity: material.rarity, material, description, scrap: materialPrice(material.rarity, content) };
  }
  if (kind === 'part') {
    const part = content.partsById[key];
    return { kind, key, count, name: part?.name ?? key, rarity: part?.rarity, description: part?.description };
  }
  if (kind === 'herb') {
    const herb = content.herbsById[key];
    return { kind, key, count, name: herb?.name ?? key, description: herb?.description, scrap: herb?.price, gatherLevel: herb?.level };
  }
  if (kind === 'potion') {
    const potion = content.potionsById[key];
    return { kind, key, count, name: potion?.name ?? key, description: potion?.description, scrap: potion && potionPrice(potion, content) };
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

function offerView(row, characterId) {
  const offer = offerOf(row);
  return {
    id: row.id,
    seller: row.seller_name,
    goods: goodsView(row.kind, row.good, row.count, row.item),
    startPrice: row.start_price,
    buyNow: row.buy_now,
    bid: row.bid,
    bids: row.bids,
    endsAt: row.ends_at,
    minBid: minimumBid(offer, content),
    leading: row.bidder_id === characterId,
    own: row.seller_id === characterId,
  };
}

// A parcel for `characterId` of an offer's goods.
const goodsParcel = (db, offer, characterId, reason, price, now) =>
  db
    .prepare('INSERT INTO market_parcels (character_id, offer_id, kind, good, count, item, reason, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(characterId, offer.id, offer.kind, offer.good, offer.count, offer.item, reason, price, now);

// The seller's parcel of a sale's gold, without the Targowisko's fee; the
// test version's own offers have no seller to get it.
const goldParcel = (db, offer, price, now) =>
  offer.seller_id === null
    ? []
    : [
        db
          .prepare("INSERT INTO market_parcels (character_id, offer_id, kind, count, reason, price, created_at) VALUES (?, ?, 'gold', ?, 'sold', ?, ?)")
          .bind(offer.seller_id, offer.id, sellerShare(price, content), price, now),
      ];

// The offers whose time ran out (questions 238 A, 239 A): a sold one gives
// its bidder the goods and its seller the gold, and one without a bid goes
// back to its seller (the test version's own trader just takes it away).
// Each settles once, in a batch of its own; one that fails waits for the
// next time and keeps the others from nothing.
export async function settleMarket(db, now) {
  const ended = await db.prepare("SELECT * FROM market_offers WHERE state = 'open' AND ends_at <= ? ORDER BY ends_at LIMIT 100").bind(now).all();
  for (const offer of ended.results) {
    const sold = offer.bidder_id !== null;
    const goods = sold
      ? [goodsParcel(db, offer, offer.bidder_id, 'won', offer.bid, now)]
      : offer.seller_id === null
        ? []
        : [goodsParcel(db, offer, offer.seller_id, 'returned', 0, now)];
    try {
      await db.batch([
        assertion(db, "EXISTS (SELECT 1 FROM market_offers WHERE id = ? AND state = 'open' AND version = ?)", [offer.id, offer.version]),
        db.prepare('UPDATE market_offers SET state = ?, settled_at = ?, version = version + 1 WHERE id = ?').bind(sold ? 'sold' : 'expired', now, offer.id),
        ...goods,
        ...(sold ? goldParcel(db, offer, offer.bid, now) : []),
      ]);
    } catch (error) {
      if (!raced(error)) console.error(error);
    }
  }
}

// A stack the game still knows; one it no longer has is not put up.
function knownGood(kind, key) {
  if (kind === 'herb') return Boolean(content.herbsById[key]);
  if (kind === 'potion') return Boolean(content.potionsById[key]);
  if (kind === 'part') return Boolean(content.partsById[key]);
  if (kind !== 'material') return false;
  const { materialId, rarityId } = parseStack(key);
  return Boolean(content.materialsById[materialId] && content.raritiesById[rarityId]);
}

// What the character can put up: the items in its bag and its stacks.
function sellable(player) {
  const { row } = player;
  const stacks = { herb: herbsOf(row), potion: potionsOf(row), material: JSON.parse(row.materials ?? '{}'), part: JSON.parse(row.parts ?? '{}') };
  return {
    items: player.items.filter((item) => !item.equippedSlot).map((item) => ({ id: item.id, ...itemView(item, content) })),
    stacks: STACKS.flatMap((kind) =>
      Object.entries(stacks[kind])
        .filter(([key, count]) => count > 0 && knownGood(kind, key))
        .map(([key, count]) => goodsView(kind, key, count)),
    ),
  };
}

// The wandering trader for the character: on his day of the week, or today
// when "Testuj Osadę" called him on the test version.
function wandererFor(row, stored, now) {
  const today = questPeriod('daily', now, content);
  const called = stored.market?.wandererCalled === today.key ? today : undefined;
  return wandererGoods({ level: row.level, classId: row.class_id, classLevel: row.class_level, seed: row.id }, now, content, called);
}

// The residents' offers (242 A): the merchant's goods of the day with what
// the character may still buy of each, at its relation with him (287 A),
// and the wandering trader's items on his day.
function residentsView(player, stored, now) {
  const stock = merchantStock(now, content);
  const bought = stored.market?.day === stock.day ? (stored.market.bought ?? {}) : {};
  const { row } = player;
  const wanderer = wandererFor(row, stored, now);
  const taken = stored.market?.wandererDay === wanderer.comes.key ? (stored.market.wanderer ?? []) : [];
  const points = merchantPoints(stored);
  return {
    merchant: {
      endsAt: stock.endsAt,
      discount: relationDiscount(points, content),
      goods: stock.goods.map((good) => ({ ...goodsView(good.kind, good.key, 1), id: good.id, price: merchantPrice(good, points, content), left: Math.max(0, good.stock - (bought[good.id] ?? 0)) })),
    },
    wanderer: {
      startsAt: wanderer.comes.startsAt,
      endsAt: wanderer.comes.endsAt,
      goods: wanderer.goods?.map((good) => ({ id: good.id, name: itemName(good.item, content), rarity: good.item.rarity, level: good.item.level, item: itemView(good.item, content), price: good.price, bought: taken.includes(good.id) })) ?? null,
    },
  };
}

async function marketView(db, player, now) {
  const { row } = player;
  const stored = settlementOf(row);
  const [others, mine, parcels] = await db.batch([
    // `IS NOT`: the test version's own offers have no seller.
    db.prepare("SELECT * FROM market_offers WHERE state = 'open' AND ends_at > ? AND seller_id IS NOT ? ORDER BY ends_at LIMIT 100").bind(now, row.id),
    db.prepare("SELECT * FROM market_offers WHERE state = 'open' AND seller_id = ? ORDER BY ends_at").bind(row.id),
    db.prepare('SELECT * FROM market_parcels WHERE character_id = ? ORDER BY id').bind(row.id),
  ]);
  const day = questPeriod('daily', now, content).key;
  const { fee, hours, reputation, maxPrice } = tuning();
  return {
    fee,
    hours,
    maxPrice,
    limit: offerLimit(stored.reputation, content),
    offers: others.results.map((offer) => offerView(offer, row.id)),
    mine: mine.results.map((offer) => offerView(offer, row.id)),
    parcels: parcels.results.map((parcel) => ({ id: parcel.id, reason: parcel.reason, goods: goodsView(parcel.kind, parcel.good, parcel.count, parcel.item) })),
    sellable: sellable(player),
    trade: { today: stored.marketTrade?.day === day ? stored.marketTrade.points : 0, daily: reputation.daily },
    ...residentsView(player, stored, now),
  };
}

async function respond(db, session, now, extra = {}) {
  const player = await loadPlayer(db, session.userId);
  return json({ ...extra, market: await marketView(db, player, now), character: characterView(player, now) });
}

async function requireMarket(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  await settleMarket(context.env.DB, context.now);
  return { session, player, db: context.env.DB };
}

// GET /api/market: the Targowisko for the page.
export async function getMarket(context) {
  const { session, db } = await requireMarket(context);
  return respond(db, session, context.now);
}

// POST /api/market/list { kind, key or itemId, count, startPrice, buyNow }:
// the goods leave the character and the offer opens for `hours`.
export async function listOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const kind = body.kind;
  const item = kind === 'item' ? player.items.find((one) => one.id === Number(body.itemId) && !one.equippedSlot) : null;
  const column = COLUMNS[kind];
  const key = typeof body.key === 'string' ? body.key : null;
  const held = kind === 'item' ? (item ? 1 : 0) : column && key && knownGood(kind, key) ? (JSON.parse(row[column] ?? '{}')[key] ?? 0) : 0;
  const open = (await db.prepare("SELECT COUNT(*) AS open FROM market_offers WHERE seller_id = ? AND state = 'open'").bind(row.id).first()).open;
  const limit = offerLimit(settlementOf(row).reputation, content);
  const count = kind === 'item' ? 1 : body.count;
  const buyNow = body.buyNow === null || body.buyNow === undefined || body.buyNow === '' ? null : body.buyNow;
  const block = listBlock({ kind, count, startPrice: body.startPrice, buyNow }, held, open, limit, content);
  if (block) throw new ApiError(block.code === 'too_many' || block.code === 'not_enough' ? 409 : 400, block.code, block.message);
  const now = context.now;
  const endsAt = now + tuning().hours * 3600000;
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
    db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
    db
      .prepare(
        `INSERT INTO market_offers (seller_id, seller_user_id, seller_name, kind, good, count, item, start_price, buy_now, created_at, ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, row.user_id, row.name, kind, item ? null : key, count, data, body.startPrice, buyNow, now, endsAt),
  ]);
  return respond(db, session, now);
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
  const block = bidBlock(offerOf(offer), { amount: body.amount, characterId: row.id, userId: row.user_id, gold: row.gold, now }, content);
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
  ]);
  return respond(db, session, now, { bid: { amount: body.amount } });
}

// POST /api/market/buy { offerId }: "Kup teraz": the offer is sold at once,
// its goods wait for the buyer and its gold for the seller.
export async function buyOffer(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const body = await readJson(context.request);
  const offer = await offerRow(db, body.offerId);
  const now = context.now;
  const block = bidBlock(offerOf(offer), { buyNow: true, characterId: row.id, userId: row.user_id, gold: row.gold, now }, content);
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
  ]);
  return respond(db, session, now, { bought: { price } });
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
  ]);
  return respond(db, session, now);
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

// The goods got from other players count as a trade's for the Encyklopedia
// (ownDiscoveries in the engine), as those of the Wymiana do.
export function foreign(adds) {
  const keyed = {};
  for (const kind of ['herb', 'potion', 'material']) for (const [key, count] of Object.entries(adds[kind] ?? {})) keyed[`${kind}:${key}`] = count;
  return counted('foreign_stacks', keyed);
}

// The day's reputation with the Kompania Kupców for trade worth `value`;
// buying at the merchant's stall (`relation`) brings as many points of the
// relation with him (question 278 A).
function marketReputation(row, stored, value, now, { relation = false } = {}) {
  const { points, trade } = tradePoints(value, row.level, stored.marketTrade, now, content, tuning().reputation);
  const { brotherhood, resident } = tuning();
  return {
    ...stored,
    reputation: { ...stored.reputation, [brotherhood]: (stored.reputation[brotherhood] ?? 0) + points },
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
  return bagStacks(merged, content);
};

// POST /api/market/collect: everything waiting that fits: gold, materials
// and parts always, items and herbs or potions while the bag has places.
// The trade's reputation comes with it.
export async function collectParcels(context) {
  const { session, player, db } = await requireMarket(context);
  const { row } = player;
  const now = context.now;
  const parcels = (await db.prepare('SELECT * FROM market_parcels WHERE character_id = ? ORDER BY id').bind(row.id).all()).results;
  if (parcels.length === 0) throw new ApiError(409, 'nothing', 'Nic tu na Ciebie nie czeka.');
  const free = bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player);
  const held = { herb: herbsOf(row), potion: potionsOf(row) };
  const adds = { herb: {}, potion: {}, material: {}, part: {} };
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
           foreign_stacks = ${others.sql}, settlement = ?, version = version + 1 WHERE id = ?`,
      )
      .bind(gold, ...changes.herb.binds, ...changes.potion.binds, ...changes.material.binds, ...changes.part.binds, ...others.binds, JSON.stringify(next), row.id),
    ...items.map((item) => db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify(item), now)),
    db.prepare(`DELETE FROM market_parcels WHERE character_id = ? AND id IN (${list})`).bind(row.id, ...taken),
  ]);
  return respond(db, session, now, { collected: { count: taken.length, left: parcels.length - taken.length, gold } });
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
  const free = bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player);
  if (body.from === 'wanderer') {
    const wanderer = wandererFor(row, stored, now);
    const good = wanderer.goods?.find((one) => one.id === body.id);
    if (!good) throw new ApiError(404, 'no_goods', 'Wędrownego handlarza dziś nie ma.');
    const taken = stored.market?.wandererDay === wanderer.comes.key ? (stored.market.wanderer ?? []) : [];
    if (taken.includes(good.id)) throw new ApiError(409, 'sold_out', 'Ten przedmiot już kupiono.');
    if (row.gold < good.price) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
    if (free < 1) throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
    const next = marketReputation(row, { ...stored, market: { ...stored.market, wandererDay: wanderer.comes.key, wanderer: [...taken, good.id] } }, good.price, now);
    await atomically(db, [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, good.price]),
      db.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ?').bind(good.price, JSON.stringify(next), row.id),
      db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify({ ...good.item, traded: 1 }), now),
    ]);
    return respond(db, session, now, { bought: { name: itemName(good.item, content), price: good.price } });
  }
  const stock = merchantStock(now, content);
  const good = stock.goods.find((one) => one.id === body.id);
  if (!good) throw new ApiError(404, 'no_goods', 'Kupiec ma już inny towar.');
  const bought = stored.market?.day === stock.day ? (stored.market.bought ?? {}) : {};
  const count = body.count;
  if (!Number.isInteger(count) || count < 1 || count > good.stock - (bought[good.id] ?? 0)) throw new ApiError(409, 'sold_out', 'Kupiec nie ma już tyle.');
  const price = merchantPrice(good, merchantPoints(stored), content) * count;
  if (row.gold < price) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  if (good.kind === 'herb' && stackPlaces(herbsOf(row), { [good.key]: count }) - bagStacks(herbsOf(row), content) > free) {
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
  ]);
  return respond(db, session, now, { bought: { name: goodsView(good.kind, good.key, count).name, count, price } });
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
  const item = randomItem(row.level, rng, content, { classId: row.class_id, maxClassLevel: row.class_level ?? 1, rarityId: 'rare' });
  const herb = rng.pick(content.herbs);
  const material = rng.pick(content.materials.filter((one) => one.rarity === 'rare'));
  const herbs = 5;
  const materials = 3;
  const offers = [
    { kind: 'item', good: null, count: 1, item: JSON.stringify(item), start: sellPrice(item, content) * 2, buyNow: sellPrice(item, content) * 4 },
    { kind: 'herb', good: herb.id, count: herbs, item: null, start: Math.ceil(buyCeiling({ kind: 'herb', key: herb.id }, content) * herbs), buyNow: null },
    (() => {
      const key = stackKey(material.id, material.rarity);
      const start = Math.ceil(buyCeiling({ kind: 'material', key }, content) * materials);
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
  return { ...stored, market: { ...stored.market, wandererCalled: questPeriod('daily', now, content).key } };
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
    db.prepare(`DELETE FROM market_offers WHERE seller_id IN (${who})`).bind(...binds),
  ];
}
