// @ts-check
// Character statistics: where each point comes from, free points and
// distributing them by class.

import { coreEffects } from './core.js';
import { classSpans, levelsIn } from './evolutions.js';
import { upgradedItem } from './items.js';
import { professionStats } from './professions.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character as the engine gets it (classId, level, classLevel, points…). */
/** @typedef {{ class: number, character: number, professions: number, equipment: number, core: number }} Source Where a stat's points come from. */
/** @typedef {{ armor: number, resist: Record<string, number> }} Bonuses */

// Totals and their sources (the segments of the source bar on the stats
// screen). After the class's evolution its levels grow by the evolution's
// growth, from the level after the evolution on, and after the second form
// by the form's, from the level after it (classSpans).
/**
 * @param {Character} character
 * @param {Record<string, any>[]} equipped
 * @param {Content} content
 * @returns {{ totals: Record<string, number>, sources: Record<string, Source>, bonuses: Bonuses }}
 */
export function computeStats(character, equipped, content) {
  const cls = content.classesById[character.classId];
  /** @type {Record<string, number>} */
  const totals = {};
  /** @type {Record<string, Source>} */
  const sources = {};
  const fromProfessions = /** @type {Record<string, number>} */ (professionStats(character.professions, content));
  /** @type {{ growth: Record<string, number>, levels: number }[]} */
  const spans = classSpans(character, content).map((/** @type {any} */ span) => ({ growth: span.owner.growth, levels: levelsIn(span, 2, character.classLevel) }));
  for (const stat of content.statIds) {
    const fromClass = Math.floor(spans.reduce((sum, span) => sum + (span.growth[stat] ?? 0) * span.levels, cls.baseStats[stat]));
    const fromPoints = character.points[stat] ?? 0;
    sources[stat] = { class: fromClass, character: fromPoints, professions: fromProfessions[stat] ?? 0, equipment: 0, core: 0 };
  }

  /** @type {Bonuses} */
  const bonuses = { armor: 0, resist: {} };
  for (const worn of equipped) {
    const item = upgradedItem(worn, content);
    if (item.armor) bonuses.armor += item.armor;
    // A body armour's zaklęcie żywiołu adds its resistance (settlement.js).
    /** @type {{ stat: string, value: number }[]} */
    const properties = [...(item.implicit ? [item.implicit] : []), ...item.affixes, ...(item.imbue?.stat ? [item.imbue] : [])];
    for (const { stat, value } of properties) {
      if (stat in sources) sources[stat].equipment += value;
      else if (stat === 'armor') bonuses.armor += value;
      else if (stat.startsWith('resist.')) {
        const element = stat.slice('resist.'.length);
        bonuses.resist[element] = (bonuses.resist[element] ?? 0) + value;
      }
    }
  }

  // The Rdzeń's Artefakty (core.js) raise a stat by a share of its points
  // from the class, the character, the professions and the gear.
  const core = character.core ? coreEffects(character.core, character.classId, content) : null;
  for (const [stat, share] of Object.entries(core?.stats ?? {})) {
    const s = sources[stat];
    if (s) s.core = Math.round(Math.max(0, s.class + s.character + s.professions + s.equipment) * share);
  }

  for (const stat of content.statIds) {
    const s = sources[stat];
    totals[stat] = s.class + s.character + s.professions + s.equipment + s.core;
  }
  return { totals, sources, bonuses };
}

// Each character level gives as many points as there are stats, each class
// level a quarter of that (author's decision, see DECISIONS.md), and an event
// may give a few more (`bonusPoints`, the blue mushroom). By where they come
// from, as the free reset after an evolution shows them.
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {{ character: number, class: number, bonus: number, total: number }}
 */
export function pointSources(character, content) {
  const perLevel = content.statIds.length;
  const sources = {
    character: perLevel * (character.level - 1),
    class: Math.floor(perLevel / 4) * (character.classLevel - 1),
    bonus: character.bonusPoints ?? 0,
  };
  return { ...sources, total: sources.character + sources.class + sources.bonus };
}

/**
 * @param {Character} character
 * @param {Content} content
 */
export function earnedPoints(character, content) {
  return pointSources(character, content).total;
}

// Only whole numbers count, so a stored value of another kind cannot turn
// the sum into text or NaN.
/**
 * @param {Character} character
 * @returns {number}
 */
export function spentPoints(character) {
  return Object.values(character.points).reduce((/** @type {number} */ sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
}

/**
 * @param {Character} character
 * @param {Content} content
 */
export function freePoints(character, content) {
  return earnedPoints(character, content) - spentPoints(character);
}

// "Rozdaj według klasy": splits the free points in the proportions of the
// class weights (largest remainder method, ties broken by stat order).
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function autoDistribute(character, content) {
  const free = freePoints(character, content);
  /** @type {Record<string, number>} */
  const weights = content.classesById[character.classId].autoPoints;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const shares = /** @type {string[]} */ (content.statIds)
    .filter((stat) => weights[stat] > 0)
    .map((stat, order) => {
      const exact = (free * weights[stat]) / totalWeight;
      return { stat, order, whole: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
  let left = free - shares.reduce((sum, share) => sum + share.whole, 0);
  for (const share of [...shares].sort((a, b) => b.rest - a.rest || a.order - b.order)) {
    if (left === 0) break;
    share.whole += 1;
    left -= 1;
  }
  const points = { ...character.points };
  for (const share of shares) {
    if (share.whole > 0) points[share.stat] = (points[share.stat] ?? 0) + share.whole;
  }
  return points;
}
