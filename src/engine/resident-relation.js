// @ts-check
// The relation with a resident of the Osada as their card shows it. A player
// asked where to see when Szczęsny's card packs get cheaper, and the author
// (19.11.2026): "Stopień relacji jest widoczny, a konkretna punktacja nie...
// w sumie racja może dodam i ją albo jakiś pasek progressu". The card shows
// the points against the next standing's ("180 / 250") over a bar, and one
// line on what the nearest higher standing that changes anything with that
// resident gives ("Stały klient: pakiety kart 20% taniej"); at the top, that
// it is the highest. The line's numbers come from the data of the residents'
// services, read through the functions that apply them in the game, so it
// says what the standing really gives; its words are residentRelation in
// data/settlement.json.

import { starStanding } from './ascension.js';
import { forgeTopRarity } from './forge.js';
import { herbalistStock } from './market.js';
import { brotherhoodPerk, herbalistPremium, reforgeChoices, relationDiscount, standingOf } from './settlement.js';
import { tanneryPremium, tanneryStock } from './tannery.js';
import { counted, decimalText } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/**
 * @typedef {object} RelationOptions
 * @property {boolean} [cards] Whether the game has Talia Systemu (the server's CARDS), so Szczęsny's packs; true by default.
 * @property {Record<string, number>} [reputation] The character's reputation with the brotherhoods: the Bractwo Łowców's adds to what Wszebor pays, and the Bractwo Zielarzy's may have taught Jagna's recipes already.
 */

// Each perk of a relation that may change with its standing: its value at
// `points` of the relation with `residentId`, or nothing where the resident
// has no such perk. A value is a number, a rarity's id or a yes and no, so
// two standings compare by it; perkWords says it.
/**
 * @param {string} residentId
 * @param {Content} content
 * @param {RelationOptions} options
 * @returns {Record<string, (points: number) => number | boolean | string>}
 */
function perksOf(residentId, content, { cards = true, reputation = {} }) {
  const { settlement } = content;
  const { standings } = settlement;
  const index = (/** @type {number} */ points) => standingOf(points, content).index;
  const from = (/** @type {string} */ id) => standings.findIndex((/** @type {{ id: string }} */ standing) => standing.id === id);
  /** @type {Record<string, (points: number) => number | boolean | string>} */
  const perks = {};
  // Szczęsny's pack of cards (cards.json pack.relationDiscount, 15.11.2026).
  const pack = cards ? content.cards?.pack : null;
  if (pack && content.cards?.host?.resident === residentId) {
    perks.packDiscount = (points) => pack.relationDiscount[Math.min(index(points), pack.relationDiscount.length - 1)];
  }
  // The Zaklinaczka: new affixes to choose from (reforge.choices), and her
  // stars from Zaufany (ascension.from, 1183 A).
  if (settlement.reforge?.resident === residentId) perks.choices = (points) => reforgeChoices(points, content);
  if (settlement.ascension?.resident === residentId) perks.ascension = (points) => starStanding(points, content).open;
  // The smith raises to rarer items with the relation (forge.topRarity).
  if (settlement.forge?.resident === residentId) perks.forge = (points) => forgeTopRarity(points, content);
  // Jagna and Wszebor pay more than the scrapper (premium; Wszebor also
  // the Bractwo Łowców's points, as his trade adds them), sell more goods
  // (sell.stock) and teach (Jagna's rare recipes, which the Bractwo
  // Zielarzy's reputation may have taught already: a recipe counts once
  // its standing is above that reputation).
  if (settlement.herbalist?.resident === residentId) {
    perks.premium = (points) => herbalistPremium(points, content);
    if (settlement.herbalist.sell) perks.herbs = (points) => herbalistStock(points, content).herbs.length;
    const known = Math.max(0, ...(settlement.herbalist.teaching ?? []).filter((/** @type {{ kind: string }} */ way) => way.kind === 'reputation').map((/** @type {{ id: string }} */ way) => reputation[way.id] ?? 0));
    const taughtFrom = (/** @type {{ taught?: string }} */ potion) => standings[from(potion.taught ?? '')]?.points ?? Infinity;
    perks.recipes = (points) => content.potions.filter((/** @type {{ taught?: string }} */ potion) => potion.taught && taughtFrom(potion) <= points && taughtFrom(potion) > known).length;
  }
  if (settlement.tannery?.resident === residentId) {
    perks.premium = (points) => tanneryPremium(points, content) + brotherhoodPerk('tanneryPremium', reputation, content);
    if (settlement.tannery.sell) perks.materials = (points) => tanneryStock(points, content).goods.length;
  }
  // Those who sell take the relation's discount off (287 A): Gościwit on
  // the Targowisko, Jagna and Wszebor.
  const sellers = [settlement.market?.resident, settlement.herbalist?.sell && settlement.herbalist.resident, settlement.tannery?.sell && settlement.tannery.resident];
  if (sellers.includes(residentId)) perks.discount = (points) => relationDiscount(points, content);
  // Zbylut's werbunek: the price of a standing against the stranger's
  // (companions.priceByStanding).
  const prices = settlement.companions?.priceByStanding;
  if (prices && settlement.tavern?.resident === residentId) {
    perks.hire = (points) => 1 - (prices[standings[index(points)].id] ?? 1) / (prices[standings[0].id] ?? 1);
  }
  // A friend's present of the week (gifts.from, 818.2), from those who
  // leave one.
  const weekly = settlement.gifts?.residents?.find((/** @type {{ resident: string }} */ one) => one.resident === residentId)?.weekly;
  if (weekly) perks.present = (points) => index(points) >= from(settlement.gifts.from);
  return perks;
}

// The perks counted in pieces, not shares.
const COUNTS = new Set(['choices', 'herbs', 'materials']);

// A perk as its line says it (residentRelation.perks): shares in percents
// (to a tenth, "2,5" in Polish, "2.5" in English), counts with their nouns,
// a rarity by its name, a yes by the words alone; the recipes, new at the
// standing, by how many come there.
/**
 * @param {string} kind
 * @param {number | boolean | string} value
 * @param {number | boolean | string} before
 * @param {Content} content
 */
function perkWords(kind, value, before, content) {
  const words = content.settlement.residentRelation.perks;
  const fill = (/** @type {Record<string, unknown>} */ vars) => counted(words[kind], vars).replace(/\{(\w+)\}/g, (/** @type {string} */ whole, /** @type {string} */ name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
  if (typeof value === 'boolean') return words[kind];
  if (kind === 'forge') return fill({ rarity: content.raritiesById[String(value)]?.name ?? value });
  if (kind === 'recipes') return fill({ count: Number(value) - Number(before) });
  if (COUNTS.has(kind)) return fill({ count: Number(value) });
  return fill({ percent: decimalText(Math.round(Number(value) * 1000) / 10, content) });
}

// What the relation with `residentId` gives at the standing of `index`,
// against the standing below it: one phrase for each perk that changes
// there, in the order of residentRelation.perks. The first standing gives
// nothing.
/**
 * @param {string} residentId
 * @param {number} index
 * @param {Content} content
 * @param {RelationOptions} [options]
 * @returns {string[]}
 */
export function relationPerks(residentId, index, content, options = {}) {
  const { standings, residentRelation } = content.settlement;
  if (index < 1 || index >= standings.length) return [];
  const perks = perksOf(residentId, content, options);
  return Object.keys(residentRelation.perks)
    .filter((kind) => perks[kind])
    .map((kind) => ({ kind, value: perks[kind](standings[index].points), before: perks[kind](standings[index - 1].points) }))
    .filter(({ value, before }) => value !== before && value !== false)
    .map(({ kind, value, before }) => perkWords(kind, value, before, content));
}

// "A", "A i B", "A, B i C", with the content's word for "and"
// (residentRelation.and).
/**
 * @param {string[]} parts
 * @param {Content} content
 */
function listed(parts, content) {
  const { and } = content.settlement.residentRelation;
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${and} ${parts.at(-1)}`;
}

// The relation with a resident for their card: the points, the next
// standing's points (null at the top) and the line: what the nearest higher
// standing that changes anything with them gives ("Stały klient: pakiety
// kart 20% taniej"), or at the top that it is the highest ("Przyjaciel:
// najwyższy stopień"); null where no higher standing changes anything, as
// the bar and the points say enough then.
/**
 * @param {string} residentId
 * @param {number} points
 * @param {Content} content
 * @param {RelationOptions} [options]
 * @returns {{ points: number, next: number | null, line: string | null }}
 */
export function residentRelation(residentId, points, content, options = {}) {
  const { standings, residentRelation: words } = content.settlement;
  const standing = standingOf(points, content);
  const fill = (/** @type {string} */ text, /** @type {Record<string, string>} */ vars) => text.replace(/\{(\w+)\}/g, (/** @type {string} */ whole, /** @type {string} */ name) => vars[name] ?? whole);
  if (!standing.next) return { points, next: null, line: fill(words.top, { standing: standing.name }) };
  for (let index = standing.index + 1; index < standings.length; index += 1) {
    const perks = relationPerks(residentId, index, content, options);
    if (perks.length > 0) return { points, next: standing.next.points, line: fill(words.next, { standing: standings[index].name, perks: listed(perks, content) }) };
  }
  return { points, next: standing.next.points, line: null };
}
