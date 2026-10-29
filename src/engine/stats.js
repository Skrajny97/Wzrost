// Character statistics: where each point comes from, free points and
// distributing them by class.

import { upgradedItem } from './items.js';
import { professionStats } from './professions.js';

// Totals and their sources (the segments of the source bar on the stats
// screen). After the class's evolution its levels grow by the evolution's
// growth, from the level after the evolution on.
export function computeStats(character, equipped, content) {
  const cls = content.classesById[character.classId];
  const totals = {};
  const sources = {};
  const fromProfessions = professionStats(character.professions, content);
  const evolution = character.evolution ? content.evolutionsById[character.evolution] : null;
  const evolvedAt = content.balance.progression.classEvolutionLevels[0];
  const classLevels = evolution ? Math.min(character.classLevel, evolvedAt) - 1 : character.classLevel - 1;
  const evolvedLevels = evolution ? Math.max(0, character.classLevel - evolvedAt) : 0;
  for (const stat of content.statIds) {
    const fromClass = Math.floor(cls.baseStats[stat] + (cls.growth[stat] ?? 0) * classLevels + (evolution?.growth[stat] ?? 0) * evolvedLevels);
    const fromPoints = character.points[stat] ?? 0;
    sources[stat] = { class: fromClass, character: fromPoints, professions: fromProfessions[stat] ?? 0, equipment: 0, core: 0 };
  }

  const bonuses = { armor: 0, resist: {} };
  for (const worn of equipped) {
    const item = upgradedItem(worn, content);
    if (item.armor) bonuses.armor += item.armor;
    const properties = [...(item.implicit ? [item.implicit] : []), ...item.affixes];
    for (const { stat, value } of properties) {
      if (stat in sources) sources[stat].equipment += value;
      else if (stat === 'armor') bonuses.armor += value;
      else if (stat.startsWith('resist.')) {
        const element = stat.slice('resist.'.length);
        bonuses.resist[element] = (bonuses.resist[element] ?? 0) + value;
      }
    }
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
export function pointSources(character, content) {
  const perLevel = content.statIds.length;
  const sources = {
    character: perLevel * (character.level - 1),
    class: Math.floor(perLevel / 4) * (character.classLevel - 1),
    bonus: character.bonusPoints ?? 0,
  };
  return { ...sources, total: sources.character + sources.class + sources.bonus };
}

export function earnedPoints(character, content) {
  return pointSources(character, content).total;
}

export function spentPoints(character) {
  return Object.values(character.points).reduce((sum, value) => sum + value, 0);
}

export function freePoints(character, content) {
  return earnedPoints(character, content) - spentPoints(character);
}

// "Rozdaj według klasy": splits the free points in the proportions of the
// class weights (largest remainder method, ties broken by stat order).
export function autoDistribute(character, content) {
  const free = freePoints(character, content);
  const weights = content.classesById[character.classId].autoPoints;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const shares = content.statIds
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
