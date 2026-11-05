// Poszukiwani in the Osada (data/settlement.json, wanted; DECISIONS.md,
// "Poszukiwani"; the author's 619 B: „nazwane, silniejsze odmiany stworów z
// tych miejsc” and „wyjęci spod prawa”). Every day the sołtys posts wanted
// posters for each character: one for the named variant of the creatures of
// each of a few of its highest open places, and one for an outlaw in one of
// them. A poster taken brings its target into the explorations of its place
// (simulateHunt): as strong as the place's elite, by the rules' strength
// more. Pure: the day and the seed are the server's.

import { monsterCombatant } from './combatant.js';
import { stackKey } from './crafting.js';
import { trophyGrades } from './encyclopedia.js';
import { createRng } from './rng.js';
import { areaOpenFor } from './trial-hall.js';

export const wantedOf = (content) => content.settlement?.wanted ?? null;

// The bounty for a target in `area`: goldPerLevel × the place's first
// level, in whole goldSteps, at least one.
export function wantedGold(area, content) {
  const { goldPerLevel, goldStep } = wantedOf(content);
  return Math.max(goldStep, Math.round((goldPerLevel * area.minLevel) / goldStep) * goldStep);
}

// A poster: its target, at the level of the place's elite.
function poster(day, area, target, content) {
  const outlaw = !target.area;
  const monsterId = outlaw ? target.id : target.monster;
  return {
    id: `${day}:${area.id}:${monsterId}`,
    kind: outlaw ? 'outlaw' : 'creature',
    areaId: area.id,
    monsterId,
    name: target.name,
    female: target.female === true,
    level: area.maxLevel + content.balance.hunt.eliteLevelBonus,
    gold: wantedGold(area, content),
  };
}

// The posters of `day` for a character of `classLevel` (`seed`: the
// character's own; `early`: the place the Sala prób opened for it, if any):
// from the rules' `places` highest places open to it, `creatures` of them
// drawn, each with its variant, the highest first, then an outlaw drawn in
// one of them.
export function wantedPosters(classLevel, day, seed, content, early = null) {
  const rules = wantedOf(content);
  if (!rules) return [];
  const places = content.areas.filter((area) => areaOpenFor(area, classLevel, early, content)).slice(-rules.places);
  if (places.length === 0) return [];
  const rng = createRng(`${seed}:${day}:wanted`);
  const order = [...places];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const creatures = order
    .slice(0, rules.creatures)
    .map((area) => [area, rules.variants.find((variant) => variant.area === area.id)])
    .filter(([, variant]) => variant)
    .sort(([a], [b]) => b.minLevel - a.minLevel)
    .map(([area, variant]) => poster(day, area, variant, content));
  const outlaw = content.monstersById[rng.pick(rules.outlaws)];
  return [...creatures, poster(day, rng.pick(places), outlaw, content)];
}

// The trophy a beaten variant leaves: its creature's material in the first
// grade of its trophy (encyclopedia.js) the character has not found yet,
// but never the rarest of them: the poster brings the trophy closer, and
// its last piece is the character's own find (the author: „Uwaga zeby nie
// przesadzić z balansem jak te trofeum wlecą znowu się zrobi za łatwo”).
// In the first grade once only the rarest is missing, or none; null for a
// creature without a material.
export function wantedTrophy(monsterId, discovered, content) {
  const material = content.materialsByMonster[monsterId];
  if (!material) return null;
  const grades = trophyGrades(material.id, content);
  const missing = grades.slice(0, -1).find((rarityId) => !discovered[`material:${material.id}:${rarityId}`]);
  return stackKey(material.id, missing ?? grades[0]);
}

// The wanted's encounter: alone, at its level, by its own name.
export const wantedEncounter = (target) => ({
  elite: false,
  wanted: true,
  members: [{ monsterId: target.monsterId, level: target.level, name: target.name }],
});

// The [damage, HP] multipliers of the wanted on an exploration of `area`
// whose creatures have `strength` (exploreStrength): its HP and damage are
// those of the place's elite at its level, times the rules' strength.
export function wantedStrength(area, target, strength, content) {
  const [damage, hp] = wantedOf(content).strength;
  if (!area.elite) return [strength[0] * damage, strength[1] * hp];
  const elite = monsterCombatant({ monsterId: area.elite, level: target.level, id: 'elite' }, content);
  const own = monsterCombatant({ monsterId: target.monsterId, level: target.level, id: 'own' }, content);
  const hit = (unit) => unit.weapon.min + unit.weapon.max;
  return [strength[0] * damage * (hit(elite) / hit(own)), strength[1] * hp * (elite.maxHp / own.maxHp)];
}

// The rarity of the item a beaten outlaw leaves, by the rules' weights.
export const wantedLootRarity = (rng, content) => rng.weighted(Object.entries(wantedOf(content).loot), ([, weight]) => weight)[0];
