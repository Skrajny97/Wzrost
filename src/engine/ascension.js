// @ts-check
// Gwiazdki at the Zaklinaczka in the Osada (the author, 19.11.2026: „gdy
// przedmiot jest na +10 to można mu wbić jeszcze 5 gwiazdek z małą szansą
// na sukces za kupę złota jak ma się rozwiniętą relacje z Zaklinaczką… nie
// bedzie sie to cofać nic jak przy Kowadle”, and his answers 1180 B–1184 A;
// data/settlement.json `ascension`). An item of any rarity upgraded to the
// Kowadło's highest level (+10) takes up to five stars, one for each try that
// comes off. Each try has its own small chance (15%, 12.5%, 10%, 7.5% and 5%
// for the first to the fifth star), whatever the tries before it did. A try
// costs gold and parts of legendary rarity or rarer, and one that fails takes
// them and nothing else: the item keeps its stars, its upgrade and itself. She
// sets them from the standing Zaufany with her. What a star adds to the
// item's numbers (each 10% of its base, beside the Kowadło's 6% a level) and
// what its try costs are items.js's (upgradeNumbers, starCost); the stars
// are kept on the item (`stars`), so they go wherever it goes.

import { maxStars, maxUpgrade, starCost } from './items.js';
import { standingOf } from './settlement.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Item An item, as the bag and the gear keep it. */
/** @typedef {import('./rng.js').Rng} Rng */

/** @param {Content} content */
const tuning = (content) => content.settlement.ascension;

// A text of the stars' words with its {name} filled in; one not given stays.
/**
 * @param {string} text
 * @param {Record<string, unknown>} vars
 */
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, /** @type {string} */ name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// The chance of the try at the `star`-th star (1181 A).
/**
 * @param {number} star
 * @param {Content} content
 * @returns {number}
 */
export const starChance = (star, content) => tuning(content).chances[star - 1];

// The standing she sets stars from (1183 A: Zaufany), and with the relation
// with her (`points`) whether it is reached and the points still to it.
/**
 * @param {number} points
 * @param {Content} content
 * @returns {{ id: string, name: string, open: boolean, toGo: number }}
 */
export function starStanding(points, content) {
  const { standings } = content.settlement;
  const from = standings.findIndex((/** @type {Record<string, any>} */ standing) => standing.id === tuning(content).from);
  const { id, name, points: needed } = standings[from];
  return { id, name, open: standingOf(points, content).index >= from, toGo: Math.max(0, needed - points) };
}

// The next star `item` would take: its number, its chance and the price of
// its try (starCost); null for an item that takes none (below the Kowadło's
// highest upgrade, or with all its stars).
/**
 * @param {Item} item
 * @param {Content} content
 * @returns {{ star: number, chance: number, gold: number, part: string, count: number } | null}
 */
export function nextStar(item, content) {
  const stars = item.stars ?? 0;
  if ((item.upgrade ?? 0) < maxUpgrade(content) || stars >= maxStars(content)) return null;
  return { star: stars + 1, chance: starChance(stars + 1, content), ...starCost(item, stars + 1, content) };
}

// Why the item cannot take its next star now, or null: below +10, with all
// its stars, a relation with her below her standing, too little gold or too
// few of the parts the star takes. `gold`, `parts` (by id) and `relation`
// (her points) are the character's; the messages are the data's words.
/**
 * @param {Item} item
 * @param {{ gold: number, parts: Record<string, number>, relation: number }} held
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function starBlock(item, { gold, parts, relation }, content) {
  const words = tuning(content).texts.errors;
  const top = maxUpgrade(content);
  if ((item.upgrade ?? 0) < top) return { code: 'not_upgraded', message: filled(words.notUpgraded, { upgrade: top }) };
  const stars = item.stars ?? 0;
  if (stars >= maxStars(content)) return { code: 'all_stars', message: words.full };
  const standing = starStanding(relation, content);
  if (!standing.open) return { code: 'relation', message: filled(words.relation, { standing: standing.name }) };
  const cost = starCost(item, stars + 1, content);
  if (gold < cost.gold) return { code: 'not_enough_gold', message: words.gold };
  if ((parts[cost.part] ?? 0) < cost.count) return { code: 'not_enough_parts', message: filled(words.parts, { part: content.partsById[cost.part].name, count: cost.count }) };
  return null;
}

// One try at the next star, with the server's random numbers (1181 A): a
// success sets the star, and a failure leaves the item as it was, its
// stars too.
/**
 * @param {Item} item
 * @param {Rng} rng
 * @param {Content} content
 * @returns {{ result: 'success' | 'failure', stars: number }}
 */
export function rollStar(item, rng, content) {
  const stars = item.stars ?? 0;
  return rng.chance(starChance(stars + 1, content)) ? { result: 'success', stars: stars + 1 } : { result: 'failure', stars };
}
