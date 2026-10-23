// Threat level shown before a hunt, from the region, its length, current HP
// and the party. Sample fights against every kind of encounter of the region,
// its elite included, show how much HP each kind costs. The chance of
// fainting then follows from how likely each HP level is before every next
// fight, with the encounters' odds and the rest after each won fight, as in a
// real hunt. HP is counted in steps of 2% of the maximum, which keeps this
// cheap enough for the CPU limit.

import { playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { eliteEncounter, encounterCombatants, regularEncounter } from './hunt.js';
import { createRng } from './rng.js';

const SAMPLES_PER_KIND = 2;
const STEPS = 50;
export const THREAT_LEVELS = ['low', 'moderate', 'high', 'very-high'];
// Highest chance of fainting for "low", "moderate" and "high".
const LIMITS = [0.01, 0.05, 0.15];

const fightsIn = (minutes, tuning) => Math.max(1, Math.round(minutes / tuning.fightIntervalMinutes));

// Chance of fainting for every hunt length, between 0 and 1.
export function faintChances({ character, equipped, hp, regionId }, content) {
  const region = content.regionsById[regionId];
  const tuning = content.balance.hunt;
  const player = playerCombatant({ character, equipped, name: 'próba', region }, content);
  const rng = createRng(`threat:${regionId}:${character.level}`);

  const totalWeight = region.encounters.reduce((sum, encounter) => sum + encounter.weight, 0);
  const kinds = [
    ...region.encounters.map((encounter) => ({
      odds: ((1 - tuning.eliteChancePerFight) * encounter.weight) / totalWeight,
      build: () => regularEncounter(encounter, region, rng, content, character.level),
    })),
    { odds: tuning.eliteChancePerFight, elite: true, build: () => eliteEncounter(region, content, character.level) },
  ];

  // What a fight of each kind does, from full HP: the share of HP lost, or the
  // end of the hunt without fainting (a fight that drags on, or the elite of a
  // safe region). A lost fight costs everything.
  const outcomes = kinds.flatMap((kind) =>
    Array.from({ length: SAMPLES_PER_KIND }, () => {
      const odds = kind.odds / SAMPLES_PER_KIND;
      const enemies = encounterCombatants(kind.build(), content);
      const fight = simulateFight({ allies: [{ ...player }], enemies, rng, content });
      if (fight.won === null || (fight.won === false && kind.elite && region.safe)) return { odds, ends: true };
      if (fight.won === false) return { odds, loss: Infinity };
      return { odds, loss: (player.maxHp - fight.units.find((unit) => unit.id === player.id).hp) / player.maxHp };
    }),
  ).filter((outcome) => !outcome.ends);

  // Losses in HP steps with their summed odds; a lost fight takes everything.
  const lossOdds = new Map();
  for (const outcome of outcomes) {
    const steps = outcome.loss === Infinity ? STEPS + 1 : Math.round(outcome.loss * STEPS);
    lossOdds.set(steps, (lossOdds.get(steps) ?? 0) + outcome.odds);
  }
  const losses = [...lossOdds.keys()];
  const odds = losses.map((loss) => lossOdds.get(loss));
  // HP after the rest that follows a won fight, for each HP left after it.
  const rested = Array.from({ length: STEPS + 1 }, (_, left) => Math.round(left + (STEPS - left) * player.recovery));

  // chances[step]: how likely the next fight starts with step × 2% HP.
  let chances = new Float64Array(STEPS + 1);
  let next = new Float64Array(STEPS + 1);
  chances[Math.round((Math.min(hp, player.maxHp) / player.maxHp) * STEPS)] = 1;
  const faintedAt = [];
  for (let fight = 0; fight < fightsIn(Math.max(...tuning.durations), tuning); fight++) {
    next.fill(0);
    let fainted = 0;
    for (let step = 0; step <= STEPS; step++) {
      const chance = chances[step];
      if (chance === 0) continue;
      for (let i = 0; i < losses.length; i++) {
        const left = step - losses[i];
        if (left <= 0) fainted += chance * odds[i];
        else next[rested[left]] += chance * odds[i];
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

export function estimateThreat(input, content) {
  return Object.fromEntries(
    Object.entries(faintChances(input, content)).map(([minutes, chance]) => {
      const index = LIMITS.findIndex((limit) => chance < limit);
      return [minutes, THREAT_LEVELS[index === -1 ? THREAT_LEVELS.length - 1 : index]];
    }),
  );
}
