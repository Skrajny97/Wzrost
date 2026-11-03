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

// The spirit's data, or null where the game has none.
export const builderSpirit = (content) => content.camp?.cornerstone?.spirit ?? null;

// The gold `amount` pieces of a resource bring: whole coins, rounded down.
export function spiritGold(resource, amount, content) {
  const { lot, gold } = builderSpirit(content);
  return Math.floor((amount * gold[resource]) / lot);
}

// The fewest pieces of a resource that bring a coin.
export function spiritLeast(resource, content) {
  const { lot, gold } = builderSpirit(content);
  return Math.ceil(lot / gold[resource]);
}

// Why `amount` pieces of `resource` cannot be sold now, or null:
// `resources` is what the character has, by id.
export function spiritSaleBlock({ resources, resource, amount }, content) {
  const spirit = builderSpirit(content);
  const { texts } = spirit;
  if (typeof resource !== 'string' || !Object.hasOwn(spirit.gold, resource)) return { code: 'invalid_resource', message: texts.unknown };
  if (!Number.isInteger(amount) || amount < 1) return { code: 'invalid_amount', message: texts.amount };
  if (amount > (resources[resource] ?? 0)) return { code: 'not_enough', message: texts.notEnough };
  if (spiritGold(resource, amount, content) < 1) return { code: 'too_few', message: texts.least.replace('{count}', String(spiritLeast(resource, content))) };
  return null;
}

// What the camp's builds still need, by resource (gold left out): every
// level of the camp itself and of `buildings` (those the character has)
// after the ones built, under way and waiting, which are paid already, up to
// the highest. Nothing once all of them stand at their highest level.
export function campNeeds(buildings, stored, queue, content) {
  const needs = Object.fromEntries(content.resources.map((resource) => [resource.id, 0]));
  for (const building of [content.camp, ...buildings]) {
    for (let level = plannedLevel(building, stored, queue) + 1; level <= building.maxLevel; level++) {
      for (const [id, amount] of Object.entries(upgradeCost(building, level))) {
        if (Object.hasOwn(needs, id)) needs[id] += amount;
      }
    }
  }
  return needs;
}
