// @ts-check
// Najemnicy in the Karczma (data/settlement.json, mercenaries;
// src/server/mercenaries.js; DECISIONS.md, "Najemnicy w Karczmie"; the
// author, 5.11.2026: 633.1 A, 633.2 A, 633.3 A). A character offers itself
// for some hours at a price for each hour of an exploration; another
// player takes it along on one exploration, as a member of a Drużyna would
// fight, and pays at once. Pure.

/** @typedef {Record<string, any>} Content */

/** @param {Content} content */
export const mercenariesOf = (content) => content.settlement?.mercenaries ?? null;

// Whether a character of `level` may offer itself or take a mercenary along.
/** @param {number} level @param {Content} content */
export const mercenariesOpen = (level, content) => Boolean(mercenariesOf(content)) && level >= mercenariesOf(content).fromLevel;

// What a character of `level` may ask for an hour of an exploration, in
// whole gold: the least and the game's suggestion by its level, and the
// most the same for every level (the author, 5.11.2026: "powinna sięgać
// nawet i 100000 złota jesli ktoś chce").
/** @param {number} level @param {Content} content */
export function mercenaryPriceRange(level, content) {
  const { price } = mercenariesOf(content);
  return { min: Math.round(price.minPerLevel * level), max: price.max, suggested: Math.round(price.suggestedPerLevel * level) };
}

// What an exploration of `minutes` costs at `perHour`: at least one gold.
/** @param {number} perHour @param {number} minutes */
export const mercenaryFee = (perHour, minutes) => Math.max(1, Math.round((perHour * minutes) / 60));

// Whether a mercenary of `mercenaryClassLevel` may go with a character of
// `classLevel`: the class levels differ by at most the Drużyna's spread
// (633.2 A, as in a Drużyna).
/** @param {number} classLevel @param {number} mercenaryClassLevel @param {Content} content */
export const mercenaryFits = (classLevel, mercenaryClassLevel, content) => Math.abs(classLevel - mercenaryClassLevel) <= content.balance.parties.classSpread;
