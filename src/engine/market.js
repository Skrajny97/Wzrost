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
import { materialPrice, ordinaryMaterial, parseStack, stackKey } from './crafting.js';
import { randomItem, sellPrice } from './items.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { relationDiscount, standingOf } from './settlement.js';
import { partPrice } from './shop.js';

const DAY = 86400000;
const tuning = (content) => content.settlement.market;

// How many offers a character keeps at once (240 A).
export function offerLimit(reputation, content) {
  const { offers, brotherhood } = tuning(content);
  return offers + standingOf(reputation?.[brotherhood] ?? 0, content).index;
}

// The least the next bid may be: the starting price, or the bid so far and
// `minRaise` of it more, at least a gold more.
export function minimumBid(offer, content) {
  if (!offer.bid) return offer.startPrice;
  return Math.max(offer.bid + 1, Math.ceil(offer.bid * (1 + tuning(content).minRaise)));
}

// What the seller gets of a price: all but the Targowisko's fee (239 A).
export const sellerShare = (price, content) => price - Math.ceil(price * tuning(content).fee);

// Why an offer cannot be put up, or null: a kind the Targowisko takes, a
// whole count the character holds, prices in whole gold, "Kup teraz" not
// below the starting price, and a free place among the character's offers.
export function listBlock({ kind, count, startPrice, buyNow }, held, open, limit, content) {
  const { kinds, maxPrice } = tuning(content);
  if (!kinds.includes(kind)) return { code: 'invalid_kind', message: 'Tego nie wystawisz na Targowisku.' };
  if (!Number.isInteger(count) || count < 1 || count > held) return { code: 'not_enough', message: 'Nie masz tylu.' };
  if (kind === 'item' && count !== 1) return { code: 'not_enough', message: 'Przedmiot wystawia się pojedynczo.' };
  const price = (value) => Number.isInteger(value) && value >= 1 && value <= maxPrice;
  if (!price(startPrice)) return { code: 'invalid_price', message: 'Podaj cenę wywoławczą w złocie.' };
  if (buyNow !== null && buyNow !== undefined && (!price(buyNow) || buyNow < startPrice)) {
    return { code: 'invalid_price', message: 'Cena „Kup teraz” nie może być niższa od wywoławczej.' };
  }
  if (open >= limit) return { code: 'too_many', message: `Masz już ${limit} ofert na Targowisku. Wystawisz więcej, gdy któraś się skończy.` };
  return null;
}

// Why a bid (or, with `buyNow`, a purchase) cannot be made, or null.
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
  if (!Number.isInteger(amount) || amount < minimumBid(offer, content)) return { code: 'low_bid', message: `Najmniej ${minimumBid(offer, content)} zł.` };
  if (offer.buyNow && amount >= offer.buyNow) return { code: 'use_buy_now', message: 'Ta kwota sięga ceny „Kup teraz”: kup od razu.' };
  if (gold < amount) return { code: 'not_enough_gold', message: 'Brakuje złota.' };
  return null;
}

// The most the camp's Skup złomu adds to the scrapper's prices, at its top.
const topSellBonus = (content) =>
  content.buildings.filter((building) => building.effect.kind === 'sellPrice').reduce((sum, building) => sum + building.effect.perLevel * building.maxLevel, 0);

// The most any resident or the camp pays for one piece of a good. The design:
// "Najwyższa cena skupu u dowolnego NPC musi być niższa od najniższej ceny
// sprzedaży tego samego przedmiotu". The scrapper with the Skup złomu at its
// top, Jagna at her top premium, the tanner at his for creatures' materials,
// and the orders at their best (the week's, of a higher quality).
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
    const tanner = tannery && ordinaryMaterial(materialId, content) ? base * skup * (1 + Math.max(...tannery.premium)) : 0;
    return Math.max(base * skup, tanner, base * orders.pay.material * orders.quality.reward * weekly, base * skup * orders.overScrap);
  }
  return orders.partGold * content.raritiesById[content.partsById[key].rarity].sell * orders.pay.part * weekly;
}

// The merchant's goods of the day (242 A), the same for everyone: a few
// herbs, rarer materials and parts, each with the day's price, `margin`
// above the most anyone pays for it, a part never cheaper than the camp's
// counter at its first level, and swinging by the day; `stock` pieces of
// each a character may buy that day.
export function merchantStock(now, content) {
  const { merchant } = tuning(content);
  const day = questPeriod('daily', now, content);
  const rng = createRng(`market:merchant:${day.key}`);
  const pick = (list, count) => {
    const pool = [...list];
    const picked = [];
    while (picked.length < count && pool.length > 0) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return picked;
  };
  const goods = [
    ...pick(content.herbs, merchant.goods.herb).map((herb) => ({ kind: 'herb', key: herb.id })),
    ...pick(
      content.materials.filter((material) => merchant.materialRarities.includes(material.rarity)),
      merchant.goods.material,
    ).map((material) => ({ kind: 'material', key: stackKey(material.id, material.rarity) })),
    ...pick(
      content.parts.filter((part) => merchant.partRarities.includes(part.rarity)),
      merchant.goods.part,
    ).map((part) => ({ kind: 'part', key: part.id })),
  ];
  return {
    day: day.key,
    endsAt: day.endsAt,
    goods: goods.map((good, index) => {
      const price = Math.ceil(buyCeiling(good, content) * merchant.margin * rng.float(...merchant.swing));
      return { id: `${day.key}:${index}`, ...good, price: good.kind === 'part' ? Math.max(price, partPrice(good.key, 1, content)) : price, stock: merchant.stock };
    }),
  };
}

// The merchant's price of a good for a character at `points` of the
// relation with him (287 A): the day's price less the standing's discount,
// a part still never below the camp's counter at its first level.
export function merchantPrice(good, points, content) {
  const price = Math.ceil(good.price * (1 - relationDiscount(points, content)));
  return good.kind === 'part' ? Math.max(price, partPrice(good.key, 1, content)) : price;
}

// The herbs Jagna sells at the standing of the relation with her (the
// author: "Niech ma na początku 3 podstawowe zioła, a w miarę zwiekszania
// znajomości coraz więcej"): the first `stock` herbs by their Zielarstwo
// level, each `margin` above the most anyone pays for it ("Kup oczywiście
// zawsze drożej"), less the standing's discount (287 A). `next` names the
// standing that adds more, with them.
export function herbalistStock(points, content) {
  const { stock, margin } = content.settlement.herbalist.sell;
  const standing = standingOf(points, content);
  const countAt = (index) => stock[Math.min(index, stock.length - 1)];
  const herbs = [...content.herbs].sort((a, b) => a.level - b.level || a.price - b.price);
  const count = countAt(standing.index);
  const more = standing.next ? herbs.slice(count, countAt(standing.index + 1)) : [];
  return {
    herbs: herbs.slice(0, count).map((herb) => ({ id: herb.id, price: Math.ceil(buyCeiling({ kind: 'herb', key: herb.id }, content) * margin * (1 - relationDiscount(points, content))) })),
    next: more.length > 0 ? { standing: standing.next.name, herbs: more.map((herb) => herb.id) } : null,
  };
}

// The wandering trader's day of the week (242 A), the same for everyone:
// the week's seed picks it.
export function wandererDay(now, content) {
  const week = questPeriod('weekly', now, content);
  const rng = createRng(`market:wanderer:${week.key}`);
  // Midday of the day drawn, so that a change of the clocks moves nothing.
  return questPeriod('daily', week.startsAt + rng.int(0, 6) * DAY + DAY / 2, content);
}

// The wandering trader's items for a character, on his day (null on the
// others): `items` items at the character's level, of the rarities drawn by
// `rarities`, for its class, each `priceFactor` times what the scrapper pays.
// `day` is his day, unless the test version calls him for another.
export function wandererGoods(character, now, content, day = wandererDay(now, content)) {
  if (now < day.startsAt || now >= day.endsAt) return { comes: day, goods: null };
  const { wanderer } = tuning(content);
  const rng = createRng(`market:wanderer:${day.key}:${character.seed}`);
  const rarities = Object.entries(wanderer.rarities).map(([id, weight]) => ({ id, weight }));
  const goods = Array.from({ length: wanderer.items }, (_, index) => {
    const item = randomItem(character.level, rng, content, { classId: character.classId, maxClassLevel: character.classLevel ?? 1, rarityId: rng.weighted(rarities).id });
    return { id: `${day.key}:${index}`, item, price: Math.round(sellPrice(item, content) * wanderer.priceFactor) };
  });
  return { comes: day, goods };
}

// The ceiling the wandering trader's prices keep above: the scrapper with
// the Skup złomu at its top.
export const itemBuyCeiling = (item, content) => sellPrice(item, content, topSellBonus(content));
