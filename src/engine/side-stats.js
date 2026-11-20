// @ts-check
// Poboczne statystyki (1218 B and D, the author 20.11.2026, both marked on
// the review page at once): the professions give stats, and Siła and
// Intelekt went to waste in a character whose weapons do not hit with
// them. Such a side stat gives something of its own now (balance.sideStats):
// Siła HP in every fight (B, combatant.js) and more of the resources from
// the explorations (D, hunt.js), Intelekt resistance to every element (B)
// and more of the professions' XP (D, src/server/professions.js). Every
// other stat helps everyone already (Zręczność the dodge and the speed,
// and so on).

import { evolutionOf } from './evolutions.js';
import { gearKey, gearLists, statAsOf, weaponScalingOf } from './gear.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character, as its row keeps it. */
/**
 * What the side stats give: `ids`, the side stats; `strength` and
 * `intellect`, their points (0 for one that is no side stat); `hp`, the
 * maximum HP more; `resist`, the resistance more to every element;
 * `resources` and `professionXp`, the shares more of the explorations'
 * resources and the professions' XP.
 * @typedef {{ ids: string[], strength: number, intellect: number, hp: number, resist: number, resources: number, professionXp: number }} SideStats
 */

// The stats that may be side stats, in the stats' order.
const SIDE = ['strength', 'intellect'];

// The stats a gear key's weapons hit with: its line's own (`scaling`, the
// Strzelec Burzy's Intelekt and the Łowca's Siła), else its weapons'
// families' (item-bases.json `scaling`).
/** @type {WeakMap<Content, Map<string, string[]>>} */
const weaponStatsCache = new WeakMap();
/**
 * @param {string} key A gear key (gearKey).
 * @param {Content} content
 * @returns {string[]}
 */
export function weaponStatsOf(key, content) {
  let known = weaponStatsCache.get(content);
  if (!known) weaponStatsCache.set(content, (known = new Map()));
  const cached = known.get(key);
  if (cached) return cached;
  const own = weaponScalingOf(key, content);
  const families = gearLists(key, content).weapons;
  /** @type {string[]} */
  const stats = own
    ? [own]
    : [...new Set(content.bases.filter((/** @type {Record<string, any>} */ base) => base.scaling && families.includes(base.family ?? base.id)).map((/** @type {Record<string, any>} */ base) => base.scaling))];
  known.set(key, stats);
  return stats;
}

// The character's side stats: Siła and Intelekt its weapons do not hit
// with, by its class or its form (gearKey), never by the weapon it holds,
// so taking it off (the fists hit with Siła) changes nothing. Not a stat
// its form counts as another (`as`, whose points go to that one: the Wielki
// Inkwizytor's Intelekt is its Siła, so it has none), nor the stat its
// evolution's skills grow with (`skillStat`, 986 B).
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {string[]}
 */
export function sideStatIds(character, content) {
  const key = gearKey(character.classId, character.evolution, content);
  const used = weaponStatsOf(key, content);
  const counted = statAsOf(key, content);
  const skillStat = evolutionOf(character, content)?.skillStat ?? null;
  return SIDE.filter((stat) => !used.includes(stat) && counted[stat] === undefined && stat !== skillStat);
}

// What the side stats give with their points in `totals` (computeStats's
// totals; in a fight with the week's and the potions' shares, as
// playerCombatant has them): Siła strengthHp maximum HP a point and step
// more of the explorations' resources for every whole `per` points, at most
// `cap`; Intelekt a point of resistance to every element for every
// intellectResistPer points and the same share more of the professions'
// XP. Nothing for a character without side stats.
/**
 * @param {Character} character
 * @param {Record<string, number>} totals
 * @param {Content} content
 * @returns {SideStats}
 */
export function sideStats(character, totals, content) {
  const tuning = content.balance.sideStats;
  const ids = sideStatIds(character, content);
  /** @param {string} stat */
  const points = (stat) => (ids.includes(stat) ? Math.max(0, Math.round(totals[stat] ?? 0)) : 0);
  const strength = points('strength');
  const intellect = points('intellect');
  /** @param {number} value */
  const share = (value) => Math.min(tuning.cap, Math.round(Math.floor(value / tuning.per) * tuning.step * 10000) / 10000);
  return {
    ids,
    strength,
    intellect,
    hp: Math.floor(strength * tuning.strengthHp),
    resist: Math.floor(intellect / tuning.intellectResistPer),
    resources: share(strength),
    professionXp: share(intellect),
  };
}
