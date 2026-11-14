// @ts-check
// The Targowisko (the Osada, part III, questions 237–242, all A): the
// players' offers as auctions and the residents' offers.
//
// Players put up items, herbs, potions, materials and parts (237 A). An
// offer lasts `hours`, with a starting price and, if its seller wants, a
// "Kup teraz" price (238 A). A bid holds the bidder's gold, and whoever it
// outbids gets theirs back at once. The Targowisko keeps `fee` of the price
// (239 A). A character keeps up to `offers` offers at once, and one more for
// each standing with the Kompania Kupców past the first (240 A). What comes
// from the Targowisko is worn as what comes from the Wymiana, from the
// item's level, and the characters of one account do not buy from one
// another (241). The residents (242 A): a merchant sells parts, herbs and
// rarer materials each day at the day's prices, and once a week, for a day,
// a wandering trader brings rare or epic items at the character's level.
// The server passes the time and the seeds.

import { potionPrice } from './brewing.js';
import { companionWearBlock } from './companions.js';
import { materialPrice, ordinaryMaterial, parseStack, stackKey } from './crafting.js';
import { baseClassLevel, canUse, equipBlock, randomItem, sellPrice } from './items.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { relationDiscount, standingOf } from './settlement.js';
import { partPrice } from './shop.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Offer An offer of the Targowisko, as the server reads it. */
/** @typedef {{ code: string, message: string }} Block Why something cannot be done. */
/** @typedef {{ key: string, startsAt: number, endsAt: number }} Period A day or a week (questPeriod, quests.js). */
/** @typedef {{ classId: string, classLevel: number, companions?: Record<string, any>[] | null }} Team The character and its hired companions. */

const DAY = 86400000;
/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
const tuning = (content) => content.settlement.market;

// How many offers a character keeps at once (240 A).
/**
 * @param {Record<string, number> | null | undefined} reputation
 * @param {Content} content
 * @returns {number}
 */
export function offerLimit(reputation, content) {
  const { offers, brotherhood } = tuning(content);
  return offers + standingOf(reputation?.[brotherhood] ?? 0, content).index;
}

// The least the next bid may be: the starting price, or the bid so far and
// `minRaise` of it more, at least a gold more.
/**
 * @param {Offer} offer
 * @param {Content} content
 * @returns {number}
 */
export function minimumBid(offer, content) {
  if (!offer.bid) return offer.startPrice;
  return Math.max(offer.bid + 1, Math.ceil(offer.bid * (1 + tuning(content).minRaise)));
}

// What the seller gets of a price: all but the Targowisko's fee (239 A), the
// one kept with the offer when it was put up (lower with the Kompania Kupców,
// 592) or the data's.
/**
 * @param {number} price
 * @param {Content} content
 * @param {number} [fee]
 * @returns {number}
 */
export const sellerShare = (price, content, fee = tuning(content).fee) => price - Math.ceil(price * fee);

// Why an offer cannot be put up, or null: a kind the Targowisko takes, a
// whole count the character holds, prices in whole gold, "Kup teraz" not
// below the starting price, and a free place among the character's offers.
/**
 * @param {{ kind: string, count: number, startPrice: number, buyNow?: number | null, hours?: number | null }} listing
 * @param {number} held
 * @param {number} open
 * @param {number} limit
 * @param {Content} content
 * @param {number} [maxHours]
 * @returns {Block | null}
 */
export function listBlock({ kind, count, startPrice, buyNow, hours = null }, held, open, limit, content, maxHours = tuning(content).hours) {
  const { kinds, maxPrice, minHours } = tuning(content);
  if (!kinds.includes(kind)) return { code: 'invalid_kind', message: 'Tego nie wystawisz na Targowisku.' };
  if (!Number.isInteger(count) || count < 1 || count > held) return { code: 'not_enough', message: 'Nie masz tylu.' };
  if (kind === 'item' && count !== 1) return { code: 'not_enough', message: 'Przedmiot wystawia się pojedynczo.' };
  /** @param {number} value */
  const price = (value) => Number.isInteger(value) && value >= 1 && value <= maxPrice;
  if (!price(startPrice)) return { code: 'invalid_price', message: 'Podaj cenę wywoławczą w złocie.' };
  if (buyNow !== null && buyNow !== undefined && (!price(buyNow) || buyNow < startPrice)) {
    return { code: 'invalid_price', message: 'Cena „Kup teraz” nie może być niższa od wywoławczej.' };
  }
  // The seller chooses the auction's length, a whole number of hours (the
  // author: "Czas licytacji powinien moc byc do wyboru od 1h do 24h po
  // godzinie").
  if (hours !== null && (!Number.isInteger(hours) || hours < minHours || hours > maxHours)) {
    return { code: 'invalid_hours', message: `Licytacja trwa od ${minHours} do ${maxHours} godzin.` };
  }
  if (open >= limit) return { code: 'too_many', message: `Masz już ${limit} ofert na Targowisku. Wystawisz więcej, gdy któraś się skończy.` };
  return null;
}

// Why a bid (or, with `buyNow`, a purchase) cannot be made, or null.
/**
 * @param {Offer | null | undefined} offer
 * @param {{ amount?: number, buyNow?: boolean, characterId: number, userId: number, gold: number, now: number }} bid
 * @param {Content} content
 * @returns {Block | null}
 */
export function bidBlock(offer, { amount, buyNow = false, characterId, userId, gold, now }, content) {
  if (!offer || offer.state !== 'open' || offer.endsAt <= now) return { code: 'ended', message: 'Ta oferta już się skończyła.' };
  if (offer.sellerId === characterId) return { code: 'own_offer', message: 'To Twoja oferta.' };
  // The characters of one account do not trade with one another (241).
  if (offer.sellerUserId === userId) return { code: 'same_account', message: 'Postacie z jednego konta nie kupują od siebie na Targowisku.' };
  if (buyNow) {
    if (!offer.buyNow) return { code: 'no_buy_now', message: 'Tej oferty nie da się kupić od razu.' };
    if (gold < offer.buyNow) return { code: 'not_enough_gold', message: 'Brakuje złota.' };
    return null;
  }
  if (offer.bidderId === characterId) return { code: 'leading', message: 'Twoja oferta już prowadzi.' };
  if (!Number.isInteger(amount) || /** @type {number} */ (amount) < minimumBid(offer, content)) return { code: 'low_bid', message: `Najmniej ${minimumBid(offer, content)} zł.` };
  if (offer.buyNow && /** @type {number} */ (amount) >= offer.buyNow) return { code: 'use_buy_now', message: 'Ta kwota sięga ceny „Kup teraz”: kup od razu.' };
  if (gold < /** @type {number} */ (amount)) return { code: 'not_enough_gold', message: 'Brakuje złota.' };
  return null;
}

// The most the camp's Skup złomu adds to the scrapper's prices, at its top.
/**
 * @param {Content} content
 * @returns {number}
 */
const topSellBonus = (content) =>
  content.buildings
    .filter((/** @type {Record<string, any>} */ building) => building.effect.kind === 'sellPrice')
    .reduce((/** @type {number} */ sum, /** @type {Record<string, any>} */ building) => sum + building.effect.perLevel * building.maxLevel, 0);

// The most any resident or the camp pays for one piece of a good. The design:
// "Najwyższa cena skupu u dowolnego NPC musi być niższa od najniższej ceny
// sprzedaży tego samego przedmiotu". The scrapper with the Skup złomu at its
// top, Jagna at her top premium, the tanner at his for creatures' materials,
// and the orders at their best (the week's; a material's piece pays the same
// in every order, 4.11.2026).
/**
 * @param {{ kind: string, key: string }} good
 * @param {Content} content
 * @returns {number}
 */
export function buyCeiling({ kind, key }, content) {
  const { orders, herbalist, tannery } = content.settlement;
  const skup = 1 + topSellBonus(content);
  const weekly = orders.weekly.reward / orders.weekly.count;
  if (kind === 'herb' || kind === 'potion') {
    const base = kind === 'herb' ? content.herbsById[key].price : potionPrice(content.potionsById[key], content);
    return Math.max(base * skup * (1 + Math.max(...herbalist.premium)), base * orders.pay[kind] * weekly, base * skup * orders.overScrap);
  }
  if (kind === 'material') {
    const { materialId, rarityId } = parseStack(key);
    const base = materialPrice(rarityId, content);
    // The Garbarnia's best premium, with the Bractwo Łowców's top perk on it
    // (591 C), so that nobody sells to Wszebor for more than he sells.
    const hunters = Math.max(0, ...(content.settlement.brotherhoodPerks?.tanneryPremium?.byStanding ?? []));
    const tanner = tannery && ordinaryMaterial(materialId, content) ? base * skup * (1 + Math.max(...tannery.premium) + hunters) : 0;
    return Math.max(base * skup, tanner, base * orders.pay.material, base * skup * orders.overScrap);
  }
  return orders.partGold * content.raritiesById[content.partsById[key].rarity].sell * orders.pay.part * weekly;
}

// The herbs the residents sell (the merchant and Jagna): those below
// Zielarstwo's masteryLevel. The herbs of the mastery (952.1, from the 100th
// level) are only gathered, so no character gets a herb of the 180th level
// long before its Zielarstwo knows it.
/**
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export function tradedHerbs(content) {
  const mastery = content.professionsById[content.gathering?.profession]?.masteryLevel ?? Infinity;
  return content.herbs.filter((/** @type {Record<string, any>} */ herb) => herb.level < mastery);
}

// The merchant's goods of the day (242 A), the same for everyone: a few
// herbs (tradedHerbs), rarer materials and parts, each with the day's
// price, `margin` above the most anyone pays for it, a part never cheaper
// than the camp's counter at its first level, and swinging by the day;
// `stock` pieces of each a character may buy that day.
/**
 * @param {number} now
 * @param {Content} content
 */
export function merchantStock(now, content) {
  const { merchant } = tuning(content);
  const day = /** @type {Period} */ (questPeriod('daily', now, content));
  const rng = createRng(`market:merchant:${day.key}`);
  /**
   * @param {any[]} list
   * @param {number} count
   * @returns {any[]}
   */
  const pick = (list, count) => {
    const pool = [...list];
    /** @type {any[]} */
    const picked = [];
    while (picked.length < count && pool.length > 0) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return picked;
  };
  const goods = [
    ...pick(tradedHerbs(content), merchant.goods.herb).map((herb) => ({ kind: 'herb', key: herb.id })),
    ...pick(
      content.materials.filter((/** @type {Record<string, any>} */ material) => merchant.materialRarities.includes(material.rarity)),
      merchant.goods.material,
    ).map((material) => ({ kind: 'material', key: stackKey(material.id, material.rarity) })),
    ...pick(
      content.parts.filter((/** @type {Record<string, any>} */ part) => merchant.partRarities.includes(part.rarity)),
      merchant.goods.part,
    ).map((part) => ({ kind: 'part', key: part.id })),
  ];
  return {
    day: day.key,
    endsAt: day.endsAt,
    goods: goods.map((good, index) => {
      const price = Math.ceil(buyCeiling(good, content) * merchant.margin * rng.float(.../** @type {[number, number]} */ (merchant.swing)));
      return { id: `${day.key}:${index}`, ...good, price: good.kind === 'part' ? Math.max(price, partPrice(good.key, 1, content)) : price, stock: merchant.stock };
    }),
  };
}

// The merchant's price of a good for a character at `points` of the
// relation with him (287 A): the day's price less the standing's discount,
// a part still never below the camp's counter at its first level.
/**
 * @param {{ kind: string, key: string, price: number }} good
 * @param {number} points
 * @param {Content} content
 * @returns {number}
 */
export function merchantPrice(good, points, content) {
  const price = Math.ceil(good.price * (1 - relationDiscount(points, content)));
  return good.kind === 'part' ? Math.max(price, partPrice(good.key, 1, content)) : price;
}

// The herbs Jagna sells at the standing of the relation with her (the
// author: "Niech ma na początku 3 podstawowe zioła, a w miarę zwiekszania
// znajomości coraz więcej"): the first `stock` herbs by their Zielarstwo
// level, of those she sells at all (tradedHerbs, all of them to a friend),
// each `margin` above the most anyone pays for it ("Kup oczywiście
// zawsze drożej"), less the standing's discount (287 A). `next` names the
// standing that adds more, with them.
/**
 * @param {number} points
 * @param {Content} content
 */
export function herbalistStock(points, content) {
  const { stock, margin } = content.settlement.herbalist.sell;
  const standing = standingOf(points, content);
  /** @param {number} index */
  const countAt = (index) => stock[Math.min(index, stock.length - 1)];
  const herbs = [...tradedHerbs(content)].sort((a, b) => a.level - b.level || a.price - b.price);
  const count = countAt(standing.index);
  const more = standing.next ? herbs.slice(count, countAt(standing.index + 1)) : [];
  return {
    herbs: herbs.slice(0, count).map((herb) => ({ id: herb.id, price: Math.ceil(buyCeiling({ kind: 'herb', key: herb.id }, content) * margin * (1 - relationDiscount(points, content))) })),
    next: more.length > 0 ? { standing: standing.next.name, herbs: more.map((herb) => herb.id) } : null,
  };
}

// The wandering trader's day of the week (242 A), the same for everyone:
// the week's seed picks it.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {Period}
 */
export function wandererDay(now, content) {
  const week = /** @type {Period} */ (questPeriod('weekly', now, content));
  const rng = createRng(`market:wanderer:${week.key}`);
  // Midday of the day drawn, so that a change of the clocks moves nothing.
  return /** @type {Period} */ (questPeriod('daily', week.startsAt + rng.int(0, 6) * DAY + DAY / 2, content));
}

// The wandering trader's items for a character, on his day (null on the
// others): `items` items at the character's level, of the rarities drawn by
// `rarities`, for its class, each `priceFactor` times what the scrapper pays.
// `day` is his day, unless the test version calls him for another.
// `count` items, more with the Kompania Kupców (592): the first ones are the
// same with any count.
/**
 * @param {Record<string, any>} character
 * @param {number} now
 * @param {Content} content
 * @param {Period} [day]
 * @param {number} [count]
 */
export function wandererGoods(character, now, content, day = wandererDay(now, content), count = tuning(content).wanderer.items) {
  if (now < day.startsAt || now >= day.endsAt) return { comes: day, goods: null };
  const { wanderer } = tuning(content);
  const rng = createRng(`market:wanderer:${day.key}:${character.seed}`);
  const rarities = Object.entries(wanderer.rarities).map(([id, weight]) => ({ id, weight }));
  const goods = Array.from({ length: count }, (_, index) => {
    const item = randomItem(character.level, rng, content, /** @type {any} */ ({ classId: character.classId, maxClassLevel: character.classLevel ?? 1, rarityId: rng.weighted(rarities).id }));
    return { id: `${day.key}:${index}`, item, price: Math.round(sellPrice(item, content) * wanderer.priceFactor) };
  });
  return { comes: day, goods };
}

// The ceiling the wandering trader's prices keep above: the scrapper with
// the Skup złomu at its top.
/**
 * @param {Record<string, any>} item
 * @param {Content} content
 * @returns {number}
 */
export const itemBuyCeiling = (item, content) => sellPrice(item, content, topSellBonus(content));

// The search over the players' offers (a player's remarks passed on by the
// author, 11.11.2026: "za chwilę każdy będzie wystawiał coś i strasznie
// ciężko będzie coś znaleźć"): which offers the Targowisko shows (`show`:
// all of them, "Dla mnie" or "Licytuję"), the kind of goods as a tab of
// its own (items, potions, herbs, materials, minerals or parts; "any" mixes
// them), the class that can use an item (any class, for a companion of
// another class), who of the character's own can put an item on now
// ("Dla mnie": the character, or one of its companions), the rarity, the
// category (an item's slot, as before), and the order: the soonest to end
// first, as before, or by the price of a piece, the cheapest or the
// dearest first. The server reads the open offers in a light form and asks
// for the views of the page only, so the filters see every offer, not
// just the first hundred.
export const OFFER_SHOWS = ['all', 'for-me', 'bidding'];
export const OFFER_SORTS = ['ends', 'cheap', 'dear'];

// What a piece of an offer's goods costs now: its highest bid, or its
// starting price, over its count (an item is one piece).
/**
 * @param {Offer} offer
 * @returns {number}
 */
export const piecePrice = (offer) => (offer.bid ?? offer.startPrice) / Math.max(1, offer.count ?? 1);

// The rarity of an offer's goods (`kind`, `key`, and `item` of an item), or
// null: herbs and potions have none.
/**
 * @param {{ kind: string, key: string, item?: Record<string, any> | null } | Offer} goods
 * @param {Content} content
 * @returns {string | null}
 */
export function goodsRarity({ kind, key, item }, content) {
  if (kind === 'item') return item?.rarity ?? null;
  if (kind === 'material') return parseStack(key).rarityId ?? null;
  if (kind === 'part') return content.partsById[key]?.rarity ?? null;
  if (kind === 'mineral') {
    const mineral = content.mineralsById[key];
    return mineral ? (mineral.rarity ?? mineral.for?.[0] ?? null) : null;
  }
  return null;
}

// Who of `team` can put `item` ({ base, slot }) on now: 'me', the character,
// as "Załóż" asks (equipBlock: its class and the item's Tier), and the ids
// of its hired companions who can, as "Załóż z plecaka" in the Kwatery asks
// (companionWearBlock: one of their places, their class and their level).
// `team`: { classId, classLevel, companions }.
/**
 * @param {Record<string, any>} item
 * @param {Team} team
 * @param {Content} content
 * @returns {string[]}
 */
export function wearersOf(item, team, content) {
  return [
    ...(equipBlock(item, team.classId, team.classLevel, content) === null ? ['me'] : []),
    ...(team.companions ?? []).filter((companion) => companionWearBlock(companion, item, content) === null).map((companion) => companion.id),
  ];
}

// How many entries of `list` fall on each key `keyOf` gives (null left out).
/**
 * @template T
 * @param {T[]} list
 * @param {(entry: T) => string | null | undefined} keyOf
 * @returns {Record<string, number>}
 */
function tally(list, keyOf) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const entry of list) {
    const key = keyOf(entry);
    if (key !== null && key !== undefined) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// An item offer's Tier, as its card names it (itemView): its number, '1' for
// Tier I, by the class level its base asks for (encyclopedia.json); none for
// stacks.
/**
 * @param {Offer} offer
 * @param {Content} content
 * @returns {string | null}
 */
export function offerTier(offer, content) {
  if (offer.kind !== 'item' || !offer.item?.base || !content.basesById[offer.item.base]) return null;
  const classLevel = baseClassLevel(offer.item.base, content);
  const index = content.encyclopedia.tiers.findLastIndex((/** @type {{ classLevel: number }} */ tier) => tier.classLevel <= classLevel);
  return index < 0 ? null : String(index + 1);
}

// An offer's category, as the chips over a mixed list name it: an item's
// slot, a stack's kind.
/**
 * @param {Offer} offer
 * @returns {string | undefined}
 */
const offerCategory = (offer) => (offer.kind === 'item' ? offer.item?.slot : offer.kind);

/** @type {Record<string, (a: Offer, b: Offer) => number>} */
const ORDERS = {
  ends: (a, b) => a.endsAt - b.endsAt || a.id - b.id,
  cheap: (a, b) => piecePrice(a) - piecePrice(b) || a.endsAt - b.endsAt || a.id - b.id,
  dear: (a, b) => piecePrice(b) - piecePrice(a) || a.endsAt - b.endsAt || a.id - b.id,
};

// The offers (`offers`: { id, kind, key, count, item: { base, slot, rarity }
// of an item, startPrice, bid, endsAt, myBid }, the character's own left
// out) the search `asked` shows, for the character and its companions
// (`team`, as wearersOf). Each choice that does not fit what is there gives
// way: an unknown show, kind, class or person, a rarity or a category with
// nothing in it (as the category chips did, 2.11.2026), an unknown order.
// Over a list of items, the Tier too (offerTier; a player's remark passed on
// by the author, 12.11.2026: "żeby szybciej znaleźć przedmiot odpowiedni
// dla poziomu naszej postaci"), giving way the same.
// `limit` offers at most, `browse.page` without one, never past
// `browse.most`. Returns `view`, the search as it was made; `counts`, how
// many each choice holds where it stands (`shows` over all the offers,
// `people` the items each of the team can put on now, `kinds` and
// `classes` under "Wszystko", `tiers` over items, `rarities` and
// `categories` under the choices before them); `found`, how many it shows in all; `ids`, the
// offers of the page in their order; `wearers`, who can put each item of
// the page on.
/**
 * @param {Offer[]} offers
 * @param {any} asked the search as the request asks it, unchecked
 * @param {Team} team
 * @param {Content} content
 */
export function browseOffers(offers, asked, team, content) {
  const { page, most } = tuning(content).browse;
  const items = offers.filter((offer) => offer.kind === 'item' && offer.item);
  const wearers = new Map(items.map((offer) => [offer.id, wearersOf(offer.item, team, content)]));
  /**
   * @param {Offer} offer
   * @param {string} who
   */
  const wears = (offer, who) => wearers.get(offer.id)?.includes(who) ?? false;
  const bidding = offers.filter((offer) => offer.myBid !== null && offer.myBid !== undefined);
  const people = Object.fromEntries(['me', ...(team.companions ?? []).map((companion) => companion.id)].map((who) => [who, items.filter((offer) => wears(offer, who)).length]));
  /** @type {Record<string, any>} */
  const counts = { shows: { all: offers.length, 'for-me': people.me, bidding: bidding.length }, people };
  const show = OFFER_SHOWS.includes(asked?.show) ? asked.show : 'all';
  /** @type {{ show: string, kind: string, classId: string | null, who: string | null, tier: string | null, rarity: string | null, category: string, sort: string, limit?: number }} */
  const view = { show, kind: 'any', classId: null, who: null, tier: null, rarity: null, category: 'all', sort: OFFER_SORTS.includes(asked?.sort) ? asked.sort : 'ends' };
  /** @type {Offer[]} */
  let shown;
  if (show === 'for-me') {
    view.kind = 'item';
    view.who = Object.hasOwn(people, asked?.who ?? '') ? asked.who : 'me';
    shown = items.filter((offer) => wears(offer, /** @type {string} */ (view.who)));
  } else if (show === 'bidding') {
    shown = bidding;
  } else {
    counts.kinds = { ...Object.fromEntries(tuning(content).kinds.map((/** @type {string} */ kind) => [kind, 0])), ...tally(offers, (offer) => offer.kind) };
    if (Object.hasOwn(counts.kinds, asked?.kind ?? '')) view.kind = asked.kind;
    shown = view.kind === 'any' ? offers : offers.filter((offer) => offer.kind === view.kind);
    if (view.kind === 'item') {
      counts.classes = Object.fromEntries(content.classes.map((/** @type {Record<string, any>} */ cls) => [cls.id, shown.filter((offer) => offer.item && canUse(offer.item.base, cls.id, content)).length]));
      if (Object.hasOwn(counts.classes, asked?.classId ?? '')) {
        view.classId = asked.classId;
        shown = shown.filter((offer) => offer.item && canUse(offer.item.base, /** @type {string} */ (view.classId), content));
      }
    }
  }
  if (view.kind === 'item') {
    counts.tiers = tally(shown, (offer) => offerTier(offer, content));
    if (counts.tiers[asked?.tier] > 0) {
      view.tier = asked.tier;
      shown = shown.filter((offer) => offerTier(offer, content) === view.tier);
    }
  }
  counts.rarities = tally(shown, (offer) => goodsRarity(offer, content));
  if (counts.rarities[asked?.rarity] > 0) {
    view.rarity = asked.rarity;
    shown = shown.filter((offer) => goodsRarity(offer, content) === view.rarity);
  }
  // The category chips stand over a list of items, or one that mixes kinds.
  if (view.kind === 'item' || view.kind === 'any') {
    counts.categories = tally(shown, offerCategory);
    if (counts.categories[asked?.category] > 0) {
      view.category = asked.category;
      shown = shown.filter((offer) => offerCategory(offer) === view.category);
    }
  }
  const limit = Number.isInteger(asked?.limit) && asked.limit > 0 ? Math.min(asked.limit, most) : page;
  view.limit = limit;
  const ids = [...shown].sort(ORDERS[view.sort]).slice(0, limit).map((offer) => offer.id);
  return { view, counts, found: shown.length, ids, wearers: Object.fromEntries(ids.filter((id) => wearers.has(id)).map((id) => [id, wearers.get(id)])) };
}
