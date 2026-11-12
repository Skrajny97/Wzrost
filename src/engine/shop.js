// @ts-check
// The Skup złomu's counter (`shop` of the building in data/buildings.json):
// the scrap dealer sells crafting parts for gold. At the building's level L
// he has the parts of every rarity up to rarities[L − 1], the last one for
// every level from there on. A part costs goldPerPart × its rarity's sell
// multiplier, and every level above the first takes discountPerLevel off
// the price. The prices stay above what the items the parts come from fetch
// when sold instead (test/engine.test.js), so taking an item apart on the
// Stół rozbiórki keeps its worth. A day (Polish time, the quests' clock) the
// dealer sells a character `daily` parts of each rarity at most, fewer of a
// rarer one (the author: "30-20-10 itd.").

import { laterPeriod, questPeriod } from './quests.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ goldPerPart: number, discountPerLevel: number, rarities: string[], daily: Record<string, number>, counts: number[] }} Shop `shop` of the building in data/buildings.json. */
/** @typedef {{ name: string, shop: Shop }} ShopBuilding */
/** @typedef {{ id: string, name: string, rarity: string }} Part */

/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {number}
 */
const rarityIndex = (rarityId, content) => content.rarities.findIndex((/** @type {{ id: string }} */ rarity) => rarity.id === rarityId);

// The one building with a shop, if any.
/**
 * @param {Content} content
 * @returns {ShopBuilding | null}
 */
export const shopBuilding = (content) => content.buildings.find((/** @type {{ shop?: Shop }} */ building) => building.shop) ?? null;

// The building where the caller knows the game has it.
/** @param {Content} content */
const shopOf = (content) => /** @type {Shop} */ (shopBuilding(content)?.shop);

// A part's price at the building's level.
/**
 * @param {string} partId
 * @param {number} level
 * @param {Content} content
 */
export function partPrice(partId, level, content) {
  const { goldPerPart, discountPerLevel } = shopOf(content);
  const { sell } = content.raritiesById[content.partsById[partId].rarity];
  return Math.max(1, Math.round(goldPerPart * sell * (1 - discountPerLevel) ** (level - 1)));
}

// What the dealer sells at the building's level: every part with its price,
// the commonest first; nothing before the building stands.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ partId: string, price: number }[]}
 */
export function shopOffer(level, content) {
  const building = shopBuilding(content);
  if (!building || level < 1) return [];
  const { rarities } = building.shop;
  const cap = rarityIndex(rarities[Math.min(level, rarities.length) - 1], content);
  return /** @type {Part[]} */ (content.parts)
    .filter((part) => rarityIndex(part.rarity, content) <= cap)
    .sort((a, b) => rarityIndex(a.rarity, content) - rarityIndex(b.rarity, content))
    .map((part) => ({ partId: part.id, price: partPrice(part.id, level, content) }));
}

// The building's level from which the dealer sells the parts of a rarity,
// or null if he never does.
/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {number | null}
 */
export function shopLevelFor(rarityId, content) {
  const index = rarityIndex(rarityId, content);
  return shopOf(content).rarities.findIndex((cap) => rarityIndex(cap, content) >= index) + 1 || null;
}

// The day a purchase counts for, and the parts bought on the day of `now`,
// by id: those kept for an earlier day are none today.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {string}
 */
export const shopDay = (now, content) => questPeriod('daily', now, content).key;
/**
 * @param {{ day?: string, parts: Record<string, number> }} stored
 * @param {number} now
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export const shopBought = ({ day, parts }, now, content) => {
  const today = shopDay(now, content);
  // Those of a later day leave none of any kind (laterPeriod in quests.js:
  // a request still of the day gone buys no more and writes no day back;
  // the code review, 12.11.2026).
  if (laterPeriod(day, today)) return Object.fromEntries(content.parts.map((/** @type {Part} */ part) => [part.id, Infinity]));
  return day === today ? parts : {};
};

// How many more parts of a kind the dealer sells today, after `bought`.
/**
 * @param {string} partId
 * @param {Record<string, number>} bought
 * @param {Content} content
 */
export const shopLeft = (partId, bought, content) => Math.max(0, shopOf(content).daily[content.partsById[partId].rarity] - (bought[partId] ?? 0));

// Why `count` parts of a kind cannot be bought now, or null: `bought` is
// shopBought.
/**
 * @param {{ level: number, gold: number, partId: unknown, count: unknown, bought?: Record<string, number> }} purchase
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function shopBlock({ level, gold, partId, count, bought = {} }, content) {
  const building = shopBuilding(content);
  if (!building || level < 1) return { code: 'not_built', message: `Najpierw zbuduj: ${building?.name ?? 'Skup złomu'}.` };
  /** @type {Part | null} */
  const part = typeof partId === 'string' && Object.hasOwn(content.partsById, partId) ? content.partsById[partId] : null;
  if (!part) return { code: 'invalid_part', message: 'Złomiarz nie ma takich części.' };
  if (typeof count !== 'number' || !building.shop.counts.includes(count)) return { code: 'invalid_count', message: 'Złomiarz nie sprzedaje tylu części naraz.' };
  const offer = shopOffer(level, content).find((entry) => entry.partId === part.id);
  if (!offer) {
    const from = shopLevelFor(part.rarity, content);
    return { code: 'not_sold', message: from ? `Złomiarz sprzeda ${part.name} od poziomu ${from}.` : 'Złomiarz nie ma takich części.' };
  }
  const left = shopLeft(part.id, bought, content);
  if (left === 0) return { code: 'daily_limit', message: `Złomiarz nie sprzeda Ci już dziś więcej: ${part.name}. Wróć jutro.` };
  if (count > left) return { code: 'daily_limit', message: `Złomiarz sprzeda Ci dziś jeszcze ${left} szt.: ${part.name}.` };
  if (gold < offer.price * count) return { code: 'not_enough', message: 'Brakuje złota na te części.' };
  return null;
}
