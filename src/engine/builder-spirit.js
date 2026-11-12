// @ts-check
// The Duch budowniczego at the Kamień węgielny Warowni (`cornerstone.spirit`
// in data/camp.json; the author: "Niech przy Kamieniu czuwa duch
// budowniczego, który za zasoby płaci złotem"). He buys the camp's
// resources, any amount the player chooses, for `gold` gold per `lot`
// pieces of each. The gold is rounded down, as at the other sales, so
// selling a few pieces at a time never pays more than selling them all at
// once; a piece is worth less than a coin, so a sale takes at least the
// pieces that bring one. What the camp's builds still need shows which
// pieces are surplus.

import { plannedLevel, upgradeCost } from './camp.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ lot: number, gold: Record<string, number>, texts: Record<string, string> }} Spirit `cornerstone.spirit` in data/camp.json. */

// The spirit's data, or null where the game has none.
/**
 * @param {Content} content
 * @returns {Spirit | null}
 */
export const builderSpirit = (content) => content.camp?.cornerstone?.spirit ?? null;

// The spirit's data where the caller knows the game has it.
/** @param {Content} content */
const spiritOf = (content) => /** @type {Spirit} */ (builderSpirit(content));

// The gold `amount` pieces of a resource bring: whole coins, rounded down.
/**
 * @param {string} resource
 * @param {number} amount
 * @param {Content} content
 */
export function spiritGold(resource, amount, content) {
  const { lot, gold } = spiritOf(content);
  return Math.floor((amount * gold[resource]) / lot);
}

// The fewest pieces of a resource that bring a coin.
/**
 * @param {string} resource
 * @param {Content} content
 */
export function spiritLeast(resource, content) {
  const { lot, gold } = spiritOf(content);
  return Math.ceil(lot / gold[resource]);
}

// Why `amount` pieces of `resource` cannot be sold now, or null:
// `resources` is what the character has, by id.
/**
 * @param {{ resources: Record<string, number>, resource: unknown, amount: unknown }} sale
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function spiritSaleBlock({ resources, resource, amount }, content) {
  const spirit = spiritOf(content);
  const { texts } = spirit;
  if (typeof resource !== 'string' || !Object.hasOwn(spirit.gold, resource)) return { code: 'invalid_resource', message: texts.unknown };
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return { code: 'invalid_amount', message: texts.amount };
  if (amount > (resources[resource] ?? 0)) return { code: 'not_enough', message: texts.notEnough };
  if (spiritGold(resource, amount, content) < 1) return { code: 'too_few', message: texts.least.replace('{count}', String(spiritLeast(resource, content))) };
  return null;
}

// What the camp's builds still need, by resource (gold left out): every
// level of the camp itself and of `buildings` (those the character has)
// after the ones built, under way and waiting, which are paid already, up to
// the highest one it can reach now (`top`: its maxLevel, or in the Warownia
// the resource buildings' level 20, 618). Nothing once all of them stand at
// their highest level.
/**
 * @param {Record<string, any>[]} buildings
 * @param {import('./camp.js').Camp} stored
 * @param {import('./camp.js').Waiting[]} queue
 * @param {Content} content
 * @param {(building: Record<string, any>) => number} [top]
 * @returns {Record<string, number>}
 */
export function campNeeds(buildings, stored, queue, content, top = (building) => building.maxLevel) {
  /** @type {Record<string, number>} */
  const needs = Object.fromEntries(content.resources.map((/** @type {{ id: string }} */ resource) => [resource.id, 0]));
  for (const building of [content.camp, ...buildings]) {
    for (let level = plannedLevel(building, stored, queue) + 1; level <= top(building); level++) {
      for (const [id, amount] of Object.entries(upgradeCost(building, level))) {
        if (Object.hasOwn(needs, id)) needs[id] += amount;
      }
    }
  }
  return needs;
}
