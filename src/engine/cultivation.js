// @ts-check
// Kultywacja (1230 A; DECISIONS.md, „Kultywacja (1230 A)”): the character
// meditates instead of exploring, for 10 minutes to 8 hours in steps of 10
// as at a profession's work, from its unlock on (`minutes`; the author,
// 24.11.2026: „Kultywacja ma działać jak Profesja czyli można ją robić nawet
// po 10 minut”, cultivationMinutes). While its class is ahead, it gets
// character XP: `xpFactor` (balance.json `cultivation`) times the XP an
// exploration as long gives in the newest place its class opens, at that
// place's top level (xpPerHour, as the XP curve was set and
// tools/level-gap-sim.mjs counts it), but never past the class: at most the
// XP that brings the character to the start of its class's level. No class
// XP, loot or gold. Every meditation also grows the
// Kultywacja's own level, 0 to `maxLevel` (the author, 24.11.2026: „Niech
// Kultywacja ma swoje poziomy (max 100) i daje +1% do XP postaci podczas
// wypraw”, „wbicie pierwszego poziomu powinno zająć już z 4 godziny”): a
// point of its XP a minute, from 4 hours for the first level to 20 for the
// hundredth (the author's 1248 B, cultivationXpToNext), each one
// `levelBonus` more character XP from explorations (applyHunt in hunt.js).
// An Awatar Systemu may meditate instead of the character (DECISIONS.md,
// „Kultywacja Awatarem (26.11.2026)”; the author: „Do tego trzeba pozwolić
// robić Kultywację Awatarem. Ale tylko jednym na raz”): the Kultywacja's XP
// whole, as its profession's work (avatar.professionShare), and its
// `share` of the character XP (avatar.share, a quarter; cultivationKept,
// cultivationPlan), under the same cap.

import { gainXp, xpPerHour, xpToNext } from './progression.js';
import { applyWork } from './professions.js';
import { areaUnlocked } from './unlocks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, minLevel: number, maxLevel: number }} Area An inner region (content.areas). */
/** @typedef {{ level: number, xp: number, classLevel: number }} Levels A character's levels and its XP into its level. */
/** @typedef {{ level: number, xp: number }} Progress The Kultywacja's own level and its XP into it. */

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
 * The character XP a Kultywacja of `minutes` keeps at its start, at `rate`
 * XP an hour: all of it for the character's own (`share` 1), and an Awatar
 * Systemu's `share` of it for the Awatar's (avatar.share, a quarter),
 * rounded as the Awatar's share of a profession's work is (workGains in
 * src/server/professions.js). The claim caps it at the class
 * (cultivationGain).
 * @param {number} rate
 * @param {number} minutes
 * @param {number} [share]
 * @returns {number}
 */
export const cultivationKept = (rate, minutes, share = 1) => Math.round(cultivationXp(rate, minutes) * share);

/**
 * The Kultywacja's own XP from a level to the next, a point a minute of
 * meditation (the author's 1248 B): `firstLevelMinutes` for the first level,
 * evenly more for each next one, up to `lastLevelMinutes` for the last (from
 * level maxLevel − 1), each rounded to `levelRoundMinutes`; 0 at the top.
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function cultivationXpToNext(level, content) {
  const { firstLevelMinutes: first, lastLevelMinutes: last, levelRoundMinutes: step, maxLevel } = content.balance.cultivation;
  if (level >= maxLevel) return 0;
  const minutes = first + ((last - first) * Math.max(0, level)) / Math.max(1, maxLevel - 1);
  return step * Math.round(minutes / step);
}

/**
 * The Kultywacja after `minutes` of meditation: its level and XP, and the
 * XP it took (`gained`: none past the top level).
 * @param {Progress} progress
 * @param {number} minutes
 * @param {Content} content
 * @returns {Progress & { gained: number }}
 */
export function cultivationProgress(progress, minutes, content) {
  const { maxLevel } = content.balance.cultivation;
  let left = -progress.xp;
  for (let at = progress.level; at < maxLevel; at += 1) left += cultivationXpToNext(at, content);
  const gained = Math.max(0, Math.min(minutes, left));
  const next = gainXp(progress.level, progress.xp, gained, (level) => cultivationXpToNext(level, content), maxLevel);
  return { level: next.level, xp: next.xp, gained };
}

/**
 * The share more character XP explorations give at a Kultywacja level.
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const cultivationBonus = (level, content) => Math.max(0, level) * content.balance.cultivation.levelBonus;

/**
 * The hours of meditation from level 0 to a Kultywacja level.
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function cultivationHours(level, content) {
  let minutes = 0;
  for (let at = 0; at < level; at += 1) minutes += cultivationXpToNext(at, content);
  return minutes / 60;
}

/**
 * The lengths of a Kultywacja, in minutes: `minutes.min` to `minutes.max`
 * every `minutes.step`, the same at every level, as a profession's work
 * (miningMinutes) and not an exploration's lengths.
 * @param {Content} content
 * @returns {number[]}
 */
export function cultivationMinutes(content) {
  const { min, step, max } = content.balance.cultivation.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

/**
 * Kultywacja for a character now: whether its class is ahead (`open`: the
 * character XP flows), `factor`, the place its XP is counted from (`area`),
 * the XP an hour (`rate`), the XP that brings it to its class's level
 * (`cap`) and the minutes of it that do (`minutes`), whether a meditation
 * would give anything at all (`possible`: the class ahead, or the
 * Kultywacja below its top level), and for each of `durations` (its lengths,
 * cultivationMinutes) the character XP it gives with the character's level
 * after it, and the Kultywacja's XP with its level after it. With `share`
 * below 1 the same for an Awatar Systemu meditating (cultivationKept): its
 * share of the character XP, at that pace to the class (`rate`,
 * `minutes`), and the Kultywacja's XP whole.
 * @param {Levels} character
 * @param {Progress} progress
 * @param {number[]} durations
 * @param {Content} content
 * @param {number} [share]
 */
export function cultivationPlan(character, progress, durations, content, share = 1) {
  const { level, xp, classLevel } = character;
  const area = newestArea(classLevel, content);
  const rate = cultivationRate(classLevel, content);
  const cap = xpToLevel(level, xp, classLevel, content);
  const { maxLevel } = content.balance.progression;
  const toNext = (/** @type {number} */ at) => xpToNext(at, content);
  return {
    open: cap > 0,
    possible: cap > 0 || progress.level < content.balance.cultivation.maxLevel,
    factor: content.balance.cultivation.xpFactor,
    area: { id: area.id, name: area.name },
    share,
    rate: Math.round(rate * share),
    cap,
    minutes: cap > 0 && share > 0 ? Math.ceil((cap / (rate * share)) * 60) : 0,
    lengths: durations.map((minutes) => {
      const gained = Math.min(cap, cultivationKept(rate, minutes, share));
      const grown = cultivationProgress(progress, minutes, content);
      return { minutes, xp: gained, level: gainXp(level, xp, gained, toNext, maxLevel).level, cultivationXp: grown.gained, cultivationLevel: grown.level };
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
