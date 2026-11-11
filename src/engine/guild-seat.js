// @ts-check
// The Siedziba Gildii (data/guilds.json, seat; src/server/guild-seat.js;
// DECISIONS.md, "Siedziba Gildii (616 A)"; the author: "616 A - akcept, ale
// muszą być zwijalne budynki i ludzie muszą móc wpłacać na co chcą, lider i
// zastępca może tylko oznaczyć co jest preferowane"): the guild's buildings,
// each from level 0 to maxLevel, raised by what the members donate to them,
// each member to the building it picks, in gold and the building's one camp
// resource. A level comes as soon as the donations collected for the
// building cover the level's whole cost, in both; what is donated beyond it
// carries over to the next level, so a building's level follows from all
// that was ever donated to it. Each level gives every member of the guild
// its building's bonus: more XP or gold from explorations, a cheaper
// Kowadło, rarer items more often. Pure.

import { decimalText } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, bonus: 'xp' | 'gold' | 'anvil' | 'rarity', perLevel: number, effect: string }} SeatBuilding A building of data/guilds.json `seat`. */
/** @typedef {{ gold: number, resource: number }} Amounts */
/** @typedef {{ maxLevel: number, buildings: SeatBuilding[], cost: { gold: { min: number, perLevel: number }, resource: { min: number, perLevel: number } } }} SeatRules */

/**
 * @param {Content} content
 * @returns {SeatRules}
 */
const rules = (content) => content.guilds.seat;

/** @param {Content} content */
export const seatBuildings = (content) => rules(content).buildings;

// The building of an id, or null.
/**
 * @param {string} id
 * @param {Content} content
 */
export const seatBuilding = (id, content) => rules(content).buildings.find((building) => building.id === id) ?? null;

// What level `level` of a building costs: { gold, resource }, each the
// larger of its least and its perLevel times the level (the mock-up of 616:
// 8 000 gold and 600 of the resource for the first, then 5 000 and 400 a
// level).
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Amounts}
 */
export function seatLevelCost(level, content) {
  const { gold, resource } = rules(content).cost;
  return { gold: Math.max(gold.min, gold.perLevel * level), resource: Math.max(resource.min, resource.perLevel * level) };
}

// What levels 1 to `level` cost together.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Amounts}
 */
export function seatCostTo(level, content) {
  const total = { gold: 0, resource: 0 };
  for (let at = 1; at <= level; at += 1) {
    const cost = seatLevelCost(at, content);
    total.gold += cost.gold;
    total.resource += cost.resource;
  }
  return total;
}

// A building as the donations to it make it (`donated`: all the gold and
// the resource ever donated, { gold, resource }, or nothing): its level, the
// highest whose cost and every cost below it both are covered; the next
// level, with its cost, what is collected for it (what lies beyond the
// levels reached, at most the cost) and the surplus beyond that, which goes
// on to the levels after it; and the room left below the top level, the
// most of each that can still be donated (nothing is donated past it).
/**
 * @param {Partial<Amounts> | null | undefined} donated
 * @param {Content} content
 */
export function seatProgress(donated, content) {
  const { maxLevel } = rules(content);
  const gold = donated?.gold ?? 0;
  const resource = donated?.resource ?? 0;
  let level = 0;
  const spent = { gold: 0, resource: 0 };
  while (level < maxLevel) {
    const cost = seatLevelCost(level + 1, content);
    if (gold - spent.gold < cost.gold || resource - spent.resource < cost.resource) break;
    spent.gold += cost.gold;
    spent.resource += cost.resource;
    level += 1;
  }
  const top = seatCostTo(maxLevel, content);
  const room = { gold: Math.max(0, top.gold - gold), resource: Math.max(0, top.resource - resource) };
  if (level >= maxLevel) return { level, maxLevel, next: null, room };
  const cost = seatLevelCost(level + 1, content);
  const over = { gold: gold - spent.gold, resource: resource - spent.resource };
  return {
    level,
    maxLevel,
    next: {
      level: level + 1,
      cost,
      collected: { gold: Math.min(cost.gold, over.gold), resource: Math.min(cost.resource, over.resource) },
      surplus: { gold: Math.max(0, over.gold - cost.gold), resource: Math.max(0, over.resource - cost.resource) },
    },
    room,
  };
}

// The level of each building from the donations to them (`donated`, by
// building: { gold, resource }); a building nobody donated to stands at 0.
/**
 * @param {Record<string, Partial<Amounts>> | null | undefined} donated
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export const seatLevels = (donated, content) => Object.fromEntries(seatBuildings(content).map((building) => [building.id, seatProgress(donated?.[building.id], content).level]));

// What one building gives at a level, as a share (0.03 is 3%).
/**
 * @param {SeatBuilding} building
 * @param {number} level
 */
export const seatBonusAt = (building, level) => Math.round(building.perLevel * level * 10000) / 10000;

// What the seat gives every member at the buildings' levels (`levels`, by
// building; none: all at 0): { xp, gold, anvil, rarity }, each the share of
// the buildings with that bonus: more XP from the explorations' fights, more
// gold from their fights and finds, less gold on the Kowadło, the rarities
// with affixes likelier on their items.
/**
 * @param {Record<string, number> | null | undefined} levels
 * @param {Content} content
 * @returns {{ xp: number, gold: number, anvil: number, rarity: number }}
 */
export function seatBonuses(levels, content) {
  const bonuses = { xp: 0, gold: 0, anvil: 0, rarity: 0 };
  for (const building of seatBuildings(content)) bonuses[building.bonus] = Math.round((bonuses[building.bonus] + seatBonusAt(building, levels?.[building.id] ?? 0)) * 10000) / 10000;
  return bonuses;
}

// The seat's bonuses an exploration takes along as it sets out (hunts.js,
// simulateHunt): { xp, gold, rarity }, only those above nothing, or null.
/**
 * @param {Record<string, number> | null | undefined} levels
 * @param {Content} content
 * @returns {Record<string, number> | null}
 */
export function seatHuntBonus(levels, content) {
  const { xp, gold, rarity } = seatBonuses(levels, content);
  const kept = Object.fromEntries(Object.entries({ xp, gold, rarity }).filter(([, share]) => share > 0));
  return Object.keys(kept).length > 0 ? kept : null;
}

// What a building gives at a level, in the words of its card: "+3% XP z
// wypraw", a share with up to one decimal as the camp's, as the language
// of the `content` given writes it ("0,5%", "0.5%" in English; Polish
// without one); null at level 0.
/**
 * @param {SeatBuilding} building
 * @param {number} level
 * @param {Content} content
 */
export function seatEffect(building, level, content) {
  if (level <= 0) return null;
  const value = decimalText(Math.round(seatBonusAt(building, level) * 1000) / 10, content);
  return building.effect.replace('{value}', value);
}

// The Kowadło's discount with the Kuźnia Gildii's (`seat`, its share) taken
// off the price another discount leaves (the Bractwo Kowali's, 590), so the
// two never add up to more than either alone would take off the rest.
/**
 * @param {number} discount
 * @param {number} seat
 */
export const withSeatDiscount = (discount, seat) => (seat > 0 ? Math.round((1 - (1 - discount) * (1 - seat)) * 10000) / 10000 : discount);
