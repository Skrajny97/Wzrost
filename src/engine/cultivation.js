// @ts-check
// Kultywacja (1230 A; DECISIONS.md, „Kultywacja (1230 A)”): while the class
// is ahead of the character, the character may meditate for a length an
// exploration offers instead of exploring, for character XP only: `xpFactor`
// (balance.json `cultivation`) times the XP an exploration as long gives in
// the newest place its class opens, at that place's top level (xpPerHour,
// as the XP curve was set and tools/level-gap-sim.mjs counts it), but never
// past the class: at most the XP that brings the character to the start of
// its class's level. No class XP, loot or gold.

import { gainXp, xpPerHour, xpToNext } from './progression.js';
import { applyWork } from './professions.js';
import { areaUnlocked } from './unlocks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, minLevel: number, maxLevel: number }} Area An inner region (content.areas). */
/** @typedef {{ level: number, xp: number, classLevel: number }} Levels A character's levels and its XP into its level. */

/**
 * The newest place a class level opens: of the inner regions open to it, the
 * one of the highest levels (the first one while none is open).
 * @param {number} classLevel
 * @param {Content} content
 * @returns {Area}
 */
export function newestArea(classLevel, content) {
  /** @type {Area[]} */
  const areas = content.areas;
  return areas.reduce((newest, area) => (areaUnlocked(area, classLevel, content) && area.maxLevel >= newest.maxLevel ? area : newest), areas[0]);
}

/**
 * The character XP of an hour of Kultywacja at a class level: `xpFactor`
 * times an exploration's in the newest place it opens.
 * @param {number} classLevel
 * @param {Content} content
 * @returns {number}
 */
export const cultivationRate = (classLevel, content) => content.balance.cultivation.xpFactor * xpPerHour(newestArea(classLevel, content).maxLevel, content);

/**
 * The character XP from `level` with `xp` into it to the start of level
 * `target`: 0 for a character there or above it.
 * @param {number} level
 * @param {number} xp
 * @param {number} target
 * @param {Content} content
 * @returns {number}
 */
export function xpToLevel(level, xp, target, content) {
  let needed = -xp;
  for (let at = level; at < target; at += 1) needed += xpToNext(at, content);
  return Math.max(0, needed);
}

/**
 * The XP a Kultywacja of `minutes` gives at `rate` XP an hour, at most `cap`.
 * @param {number} rate
 * @param {number} minutes
 * @param {number} [cap]
 * @returns {number}
 */
export const cultivationXp = (rate, minutes, cap = Infinity) => Math.min(cap, Math.round((rate * minutes) / 60));

/**
 * Kultywacja for a character now: whether it may begin (`open`: its class
 * above it), `factor`, the place its XP is counted from (`area`), the XP an
 * hour (`rate`), the XP that brings it to its class's level (`cap`) and the
 * minutes of it that do (`minutes`), and for each of `durations` (the
 * lengths an exploration offers it) the XP it gives and the character's
 * level after it.
 * @param {Levels} character
 * @param {number[]} durations
 * @param {Content} content
 */
export function cultivationPlan(character, durations, content) {
  const { level, xp, classLevel } = character;
  const area = newestArea(classLevel, content);
  const rate = cultivationRate(classLevel, content);
  const cap = xpToLevel(level, xp, classLevel, content);
  const { maxLevel } = content.balance.progression;
  const toNext = (/** @type {number} */ at) => xpToNext(at, content);
  return {
    open: cap > 0,
    factor: content.balance.cultivation.xpFactor,
    area: { id: area.id, name: area.name },
    rate: Math.round(rate),
    cap,
    minutes: cap > 0 ? Math.ceil((cap / rate) * 60) : 0,
    lengths: durations.map((minutes) => {
      const gained = cultivationXp(rate, minutes, cap);
      return { minutes, xp: gained, level: gainXp(level, xp, gained, toNext, maxLevel).level };
    }),
  };
}

/**
 * A Kultywacja that ended, claimed: the XP of its length kept at its start
 * (`xp`), but at most what brings the character to its class's level as it
 * is now (`capped` when that took some of it), and the character after it
 * as after a work's XP (applyWork: its levels, Time Points and the System's
 * lines; a new level heals).
 * @param {Levels & Record<string, any>} character
 * @param {number} xp
 * @param {Content} content
 */
export function cultivationGain(character, xp, content) {
  const gained = Math.max(0, Math.min(xp, xpToLevel(character.level, character.xp, character.classLevel, content)));
  return { gained, capped: gained < xp, after: applyWork(character, gained, content) };
}
