// Najemnicy in the Karczma (data/settlement.json, mercenaries;
// src/server/mercenaries.js; DECISIONS.md, "Najemnicy w Karczmie"; the
// author, 5.11.2026: 633.1 A, 633.2 A, 633.3 A). A character offers itself
// for some hours at a price for each hour of an exploration; another
// player takes it along on one exploration, as a member of a Drużyna would
// fight, and pays at once. Pure.

export const mercenariesOf = (content) => content.settlement?.mercenaries ?? null;

// Whether a character of `level` may offer itself or take a mercenary along.
export const mercenariesOpen = (level, content) => Boolean(mercenariesOf(content)) && level >= mercenariesOf(content).fromLevel;

// What a character of `level` may ask for an hour of an exploration, in
// whole gold: the least, the most and the game's suggestion.
export function mercenaryPriceRange(level, content) {
  const { price } = mercenariesOf(content);
  return { min: Math.round(price.min * level), max: Math.round(price.max * level), suggested: Math.round(price.suggested * level) };
}

// What an exploration of `minutes` costs at `perHour`: at least one gold.
export const mercenaryFee = (perHour, minutes) => Math.max(1, Math.round((perHour * minutes) / 60));

// Whether a mercenary of `mercenaryClassLevel` may go with a character of
// `classLevel`: the class levels differ by at most the Drużyna's spread
// (633.2 A, as in a Drużyna).
export const mercenaryFits = (classLevel, mercenaryClassLevel, content) => Math.abs(classLevel - mercenaryClassLevel) <= content.balance.parties.classSpread;
