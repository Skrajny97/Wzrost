// @ts-check
// The Kuźnia's smith, Żelisław of the Bractwo Kowali (question 326 A; the
// author: "Kowal i to i rzadkość, niech to Bractwo ma zastosowanie
// jakieś"): he sells the Zwój ochronny for the Kowadło, a few a day, and
// raises an item's rarity by one step, once per item, for gold and pieces
// of materials of the item's rarity (339 A: of the new one, legendary and
// rarer raises were out of reach), any of them added up (481 B:
// piecesOfRarity in crafting.js). How far he goes follows the relation
// with him, and the Bractwo Kowali's reputation lowers his gold prices.
// The numbers are in data/settlement.json (`forge`).

import { affixShare, affixValue } from './items.js';
import { standingOf } from './settlement.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Item An item as the character keeps it. */
/** @typedef {{ id: string, sell: number }} Rarity A rarity of data/rarities.json. */
/** @typedef {{ id: string, kind: string, stat: string, value: number }} Affix */
/** @typedef {import('./rng.js').Rng} Rng */

// The rarity after an item's own, or null at the top.
/**
 * @param {Item} item
 * @param {Content} content
 * @returns {Rarity | null}
 */
export function nextRarity(item, content) {
  const index = content.rarities.findIndex((/** @type {Rarity} */ rarity) => rarity.id === item.rarity);
  return index < 0 ? null : (content.rarities[index + 1] ?? null);
}

// The highest rarity the smith raises to at `points` of the relation with
// him: Obcy to unikalny, up to Przyjaciel to boski.
/**
 * @param {number} points
 * @param {Content} content
 * @returns {string}
 */
export function forgeTopRarity(points, content) {
  const tops = content.settlement.forge.topRarity;
  return tops[Math.min(standingOf(points, content).index, tops.length - 1)];
}

// The part of his gold prices the Bractwo Kowali's reputation takes off.
/**
 * @param {number} reputation
 * @param {Content} content
 * @returns {number}
 */
export function forgeDiscount(reputation, content) {
  const discounts = content.settlement.forge.discount;
  return discounts[Math.min(standingOf(reputation, content).index, discounts.length - 1)];
}

// A scroll's price at the Bractwo's reputation: the Zwój ochronny's, or with
// `kind` "steadyScroll" the Zwój utrwalenia's.
/**
 * @param {number} reputation
 * @param {Content} content
 * @param {string} [kind]
 */
export const scrollPrice = (reputation, content, kind = 'scroll') => Math.round(content.settlement.forge[kind].gold * (1 - forgeDiscount(reputation, content)));

// What raising `item` takes, or why it cannot be raised: `reason` is
// "raised" (once per item), "top" (no rarity above) or "relation" (above
// what the relation lets the smith do; `top` names that rarity). It takes
// gold and `materials` pieces of materials of the item's own rarity
// (`material`), any of them added up, as the Kowadło does.
/**
 * @param {Item} item
 * @param {number} relation
 * @param {number} reputation
 * @param {Content} content
 */
export function raiseOffer(item, relation, reputation, content) {
  const next = nextRarity(item, content);
  if (item.raised) return { reason: 'raised' };
  if (!next) return { reason: 'top' };
  const top = forgeTopRarity(relation, content);
  /** @param {string} id */
  const index = (id) => content.rarities.findIndex((/** @type {Rarity} */ rarity) => rarity.id === id);
  if (index(next.id) > index(top)) return { reason: 'relation', next: next.id, top };
  const { goldPerLevel, materials } = content.settlement.forge.raise;
  return { next: next.id, gold: Math.round(goldPerLevel * item.level * next.sell * (1 - forgeDiscount(reputation, content))), materials, material: item.rarity };
}

// The item one rarity up: its affixes grow to what the new rarity gives at
// its level (an affix already above that keeps its number), and one more
// affix comes, of the kind it has fewer of, not one it has.
/**
 * @param {Item} item
 * @param {Rng} rng
 * @param {Content} content
 * @returns {Item}
 */
export function raiseRarity(item, rng, content) {
  const next = /** @type {Rarity} */ (nextRarity(item, content));
  const share = affixShare(item.level, next.id, content);
  const tuning = content.balance.items;
  /** @type {Affix[]} */
  const affixes = item.affixes.map((/** @type {Affix} */ affix) => ({ ...affix, value: Math.max(affix.value, affixValue(affix.stat, share, tuning)) }));
  const prefixes = affixes.filter((affix) => affix.kind === 'prefix').length;
  const suffixes = affixes.length - prefixes;
  const kind = prefixes === suffixes ? (rng.chance(0.5) ? 'prefix' : 'suffix') : prefixes < suffixes ? 'prefix' : 'suffix';
  const used = new Set(affixes.map((affix) => affix.id));
  /** @type {{ id: string, stat: string, weight: number }[]} */
  const pool = (kind === 'prefix' ? content.prefixes : content.suffixes).filter((/** @type {{ id: string }} */ affix) => !used.has(affix.id));
  const affix = rng.weighted(pool);
  affixes.push({ id: affix.id, kind, stat: affix.stat, value: affixValue(affix.stat, share, tuning) });
  return { ...item, rarity: next.id, affixes, raised: true };
}
