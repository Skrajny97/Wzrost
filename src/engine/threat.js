// Threat level shown before an exploration, from the inner region, its length,
// current HP and the party. Sample fights against every kind of encounter of
// the inner region (regular, demanding, the elite and, where it lives, the
// champion) show how much HP each kind
// costs. They use the same combatant as the exploration itself (stats,
// equipment, and later skills and companions), so the rating follows the whole
// character, not its level alone. The chance of fainting then follows from how
// likely each HP level is before every next fight, with the odds of each kind
// for that length and the rest after each won fight, as in a real
// exploration. HP is counted in steps of 4% of the maximum.

import { playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import {
  championEncounter,
  eliteEncounter,
  encounterCombatants,
  encountersFor,
  explorationPace,
  regularEncounter,
  toughEncountersFor,
} from './hunt.js';
import { createRng } from './rng.js';
import { durationsUpTo } from './unlocks.js';

// Sample fights per kind of encounter: each encounter of the inner region and the
// elite. Kinds whose outcome is in doubt (some fights lost, or a close one)
// then share more fights, in proportion to how often they are met, so one
// unlucky fight decides less. A character that loses 15% or more of the
// regular fights is in very high danger on any exploration, so more fights
// would change nothing. The elite is met in at most one exploration in nine
// and its fights are long, so it keeps the first few, as does the champion.
const SAMPLES = 3;
const MORE_SAMPLES = { regular: 27, tough: 18, elite: 0, champion: 0 };
const STEPS = 25;
const LOST = STEPS + 1;
export const THREAT_LEVELS = ['low', 'moderate', 'high', 'very-high'];
// Highest chance of fainting for "low", "moderate" and "high".
const LIMITS = [0.01, 0.05, 0.15];

// One kind of encounter: how many of its sample fights cost each amount of HP,
// in steps, and how many were lost (the last bin).
const sampleKind = (build, weight) => ({ build, weight, counts: new Array(LOST + 1).fill(0), fought: 0, lost: 0, worst: 0 });

// A fight that drags on ends the exploration without fainting, so it is left out.
function fightSamples(kind, times, player, rng, content) {
  for (let i = 0; i < times; i++) {
    const fight = simulateFight({ allies: [{ ...player }], enemies: encounterCombatants(kind.build(), content), rng, content });
    if (fight.won === null) continue;
    kind.fought += 1;
    if (!fight.won) {
      kind.counts[LOST] += 1;
      kind.lost += 1;
      continue;
    }
    const left = fight.units.find((unit) => unit.id === player.id).hp;
    const steps = Math.round(((player.maxHp - left) / player.maxHp) * STEPS);
    kind.counts[steps] += 1;
    kind.worst = Math.max(kind.worst, steps);
  }
}

const inDoubt = (kind) => kind.lost < kind.fought && (kind.lost > 0 || kind.worst >= STEPS * 0.6);

// Weighted mix of the kinds' shares of fights, by HP lost in steps.
function mix(kinds) {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  const shares = new Array(LOST + 1).fill(0);
  for (const kind of kinds) {
    if (kind.fought === 0) continue;
    for (let steps = 0; steps <= LOST; steps++) shares[steps] += (kind.counts[steps] / kind.fought) * (kind.weight / total);
  }
  return shares;
}

// The expensive part: sample fights for the character's current build. It
// does not depend on HP or the length, so the server can keep it until the
// build changes.
export function threatSamples({ character, equipped, areaId }, content) {
  const area = content.areasById[areaId];
  const player = playerCombatant({ character, equipped, name: 'próba', area }, content);
  const rng = createRng(`threat:${areaId}:${character.level}`);
  const kinds = (encounters, options) =>
    encounters.map((encounter) =>
      sampleKind(() => regularEncounter(encounter, area, rng, content, { ...options, characterLevel: character.level }), encounter.weight),
    );
  const groups = {
    regular: kinds(encountersFor(area, character.level)),
    tough: kinds(toughEncountersFor(area, character.level), { tough: true }),
    elite: [sampleKind(() => eliteEncounter(area, content), 1)],
    champion: area.champion ? [sampleKind(() => championEncounter(area, content), 1)] : [],
  };
  for (const list of Object.values(groups)) for (const kind of list) fightSamples(kind, SAMPLES, player, rng, content);
  if (mix(groups.regular)[LOST] < LIMITS.at(-1)) {
    for (const [group, list] of Object.entries(groups)) {
      const total = list.reduce((sum, kind) => sum + kind.weight, 0);
      for (const kind of list.filter(inDoubt)) {
        fightSamples(kind, Math.ceil((MORE_SAMPLES[group] * kind.weight) / total), player, rng, content);
      }
    }
  }
  return {
    maxHp: player.maxHp,
    recovery: player.recovery,
    regular: mix(groups.regular),
    tough: groups.tough.length > 0 ? mix(groups.tough) : null,
    elite: mix(groups.elite),
    champion: groups.champion.length > 0 ? mix(groups.champion) : null,
    // Against the elite or the champion of a safe region running out of HP
    // is a retreat.
    safe: Boolean(area.safe),
  };
}

// Chance of fainting for every exploration length, between 0 and 1.
export function faintChances({ character, equipped, hp, areaId }, content, samples) {
  const { maxHp, recovery, regular, tough, elite, champion, safe } = samples ?? threatSamples({ character, equipped, areaId }, content);
  // HP after the rest that follows a won fight, for each HP left after it.
  const rested = Array.from({ length: STEPS + 1 }, (_, left) => Math.round(left + (STEPS - left) * recovery));
  const start = Math.round((Math.min(hp, maxHp) / maxHp) * STEPS);
  let chances = new Float64Array(STEPS + 1);
  let next = new Float64Array(STEPS + 1);
  // Per length: the share of fights by HP lost, all kinds mixed by their odds,
  // and the chance that a fight begun with some HP ends in fainting.
  const shares = new Float64Array(LOST + 1);
  const faintFrom = new Float64Array(STEPS + 1);

  const result = {};
  for (const minutes of durationsUpTo(content.balance.hunt.maxMinutes, content)) {
    const pace = explorationPace(minutes, content);
    // The champion is drawn first, then the elite (rollEncounter).
    const championShare = champion ? pace.championChance : 0;
    const eliteShare = (1 - championShare) * pace.eliteChance;
    const toughShare = tough ? pace.toughChance : 0;
    const losses = [];
    // The elite's and the champion's share of fights that cost `steps`.
    const rare = (steps) => eliteShare * elite[steps] + (champion ? championShare * champion[steps] : 0);
    for (let steps = 0; steps <= LOST; steps++) {
      const fight = regular[steps] * (1 - toughShare) + (toughShare > 0 ? tough[steps] * toughShare : 0);
      shares[steps] = (1 - eliteShare - championShare) * fight + rare(steps);
      if (steps < LOST && shares[steps] > 0) losses.push(steps);
    }
    // A lost fight, or one that takes all the HP left, ends in fainting, except
    // against the elite or the champion of a safe region.
    const fainting = (steps) => shares[steps] - (safe ? rare(steps) : 0);
    let tail = fainting(LOST);
    for (let steps = STEPS; steps >= 0; steps--) {
      tail += fainting(steps);
      faintFrom[steps] = tail;
    }

    chances.fill(0);
    chances[start] = 1;
    let fainted = 0;
    for (let fight = 0; fight < pace.fights; fight++) {
      next.fill(0);
      for (let step = 0; step <= STEPS; step++) {
        const chance = chances[step];
        if (chance === 0) continue;
        fainted += chance * faintFrom[step];
        for (const loss of losses) {
          if (loss >= step) break;
          next[rested[step - loss]] += chance * shares[loss];
        }
      }
      [chances, next] = [next, chances];
    }
    result[minutes] = Math.min(1, fainted);
  }
  return result;
}

export function threatLevel(chance) {
  const index = LIMITS.findIndex((limit) => chance < limit);
  return THREAT_LEVELS[index === -1 ? THREAT_LEVELS.length - 1 : index];
}

export function estimateThreat(input, content, samples) {
  return Object.fromEntries(
    Object.entries(faintChances(input, content, samples)).map(([minutes, chance]) => [minutes, threatLevel(chance)]),
  );
}
