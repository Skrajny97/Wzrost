// Threat level shown before a hunt, from the region, its length, current HP
// and the party. Sample fights against every kind of encounter of the region,
// its elite included, show how much HP each kind costs. The chance of
// fainting then follows from how likely each HP level is before every next
// fight, with the encounters' odds and the rest after each won fight, as in a
// real hunt. HP is counted in steps of 2% of the maximum.

import { playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { eliteEncounter, encounterCombatants, encountersFor, regularEncounter } from './hunt.js';
import { createRng } from './rng.js';

const SAMPLES_PER_KIND = 6;
const STEPS = 50;
// A region this many levels away from the character is judged without fights.
const FAR_LEVELS = 3;
export const THREAT_LEVELS = ['low', 'moderate', 'high', 'very-high'];
// Highest chance of fainting for "low", "moderate" and "high".
const LIMITS = [0.01, 0.05, 0.15];

const fightsIn = (minutes, tuning) => Math.max(1, Math.round(minutes / tuning.fightIntervalMinutes));

// The expensive part: sample fights for the character's current build. It
// does not depend on HP, so the server can keep it until the build changes.
export function threatSamples({ character, equipped, regionId }, content) {
  const region = content.regionsById[regionId];
  const tuning = content.balance.hunt;
  const player = playerCombatant({ character, equipped, name: 'próba', region }, content);
  const samples = { maxHp: player.maxHp, recovery: player.recovery, losses: [], odds: [], safe: [] };
  if (character.level < region.minLevel - FAR_LEVELS) return { ...samples, far: 'above' };
  if (character.level > region.maxLevel + FAR_LEVELS) return { ...samples, far: 'below' };

  const rng = createRng(`threat:${regionId}:${character.level}`);
  const encounters = encountersFor(region, character.level);
  const totalWeight = encounters.reduce((sum, encounter) => sum + encounter.weight, 0);
  const kinds = [
    ...encounters.map((encounter) => ({
      odds: ((1 - tuning.eliteChancePerFight) * encounter.weight) / totalWeight,
      build: () => regularEncounter(encounter, region, rng, content, character.level),
    })),
    { odds: tuning.eliteChancePerFight, elite: true, build: () => eliteEncounter(region, content, character.level) },
  ];

  // HP lost in each sample fight, in steps, with summed odds. A lost fight
  // takes everything. Against the elite of a safe region running out of HP
  // means a retreat, not fainting ("safe"); a fight that drags on ends the
  // hunt without fainting, so it is left out.
  const lossOdds = new Map();
  for (const kind of kinds) {
    const safe = Boolean(kind.elite && region.safe);
    for (let i = 0; i < SAMPLES_PER_KIND; i++) {
      const fight = simulateFight({ allies: [{ ...player }], enemies: encounterCombatants(kind.build(), content), rng, content });
      if (fight.won === null) continue;
      const hpLeft = fight.won ? fight.units.find((unit) => unit.id === player.id).hp : 0;
      const steps = fight.won ? Math.round(((player.maxHp - hpLeft) / player.maxHp) * STEPS) : STEPS + 1;
      const key = `${steps}:${safe}`;
      const entry = lossOdds.get(key) ?? { steps, safe, odds: 0 };
      entry.odds += kind.odds / SAMPLES_PER_KIND;
      lossOdds.set(key, entry);
    }
  }
  const entries = [...lossOdds.values()];
  return {
    ...samples,
    losses: entries.map((entry) => entry.steps),
    odds: entries.map((entry) => entry.odds),
    safe: entries.map((entry) => entry.safe),
  };
}

// Chance of fainting for every hunt length, between 0 and 1.
export function faintChances({ character, equipped, hp, regionId }, content, samples) {
  const tuning = content.balance.hunt;
  const { maxHp, recovery, losses, odds, safe, far } = samples ?? threatSamples({ character, equipped, regionId }, content);
  if (far) return Object.fromEntries(tuning.durations.map((minutes) => [minutes, far === 'above' ? 1 : 0]));

  // HP after the rest that follows a won fight, for each HP left after it.
  const rested = Array.from({ length: STEPS + 1 }, (_, left) => Math.round(left + (STEPS - left) * recovery));
  // chances[step]: how likely the next fight starts with step × 2% HP.
  let chances = new Float64Array(STEPS + 1);
  let next = new Float64Array(STEPS + 1);
  chances[Math.round((Math.min(hp, maxHp) / maxHp) * STEPS)] = 1;
  const faintedAt = [];
  for (let fight = 0; fight < fightsIn(Math.max(...tuning.durations), tuning); fight++) {
    next.fill(0);
    let fainted = 0;
    for (let step = 0; step <= STEPS; step++) {
      const chance = chances[step];
      if (chance === 0) continue;
      for (let i = 0; i < losses.length; i++) {
        const left = step - losses[i];
        if (left > 0) next[rested[left]] += chance * odds[i];
        else if (!safe[i]) fainted += chance * odds[i];
      }
    }
    faintedAt.push(fainted);
    [chances, next] = [next, chances];
  }

  return Object.fromEntries(
    tuning.durations.map((minutes) => {
      const fainted = faintedAt.slice(0, fightsIn(minutes, tuning)).reduce((sum, chance) => sum + chance, 0);
      return [minutes, Math.min(1, fainted)];
    }),
  );
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
