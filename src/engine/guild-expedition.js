// The Wyprawa Gildii (the author's 621 A, mock-up 624; data/guilds.json
// `expedition`; src/server/guild-expedition.js; DECISIONS.md, "Wyprawa
// Gildii (621 A)"): a guild's route of the week through one land, in seven
// stages. The members' minutes of exploration walk it, each counted as the
// member claims the report, and at the end of each stage a guardian bars
// the way until the guild beats it (the author: "coraz trudniejszy strażnik
// na końcu każdego etapu"); the minutes earned meanwhile wait and walk the
// route on at once when it falls. Whoever added minutes that week attacks
// the guardian as the Bestia Gildii, in one fight (guildBeastFight). Each
// guardian is stronger than the one before, and a fallen one gives a chest
// to everyone who added minutes; the last one a rare item besides. Pure:
// the levels, the minutes and the seeds are the server's.

import { addCounts, materialDrops, stackKey } from './crafting.js';
import { beastAttackDamage } from './guild-beast.js';
import { championItemRarity } from './hunt.js';
import { randomItem } from './items.js';
import { createRng } from './rng.js';

const rules = (content) => content.guilds.expedition;

// How many stages (and guardians) a route has.
export const expeditionStages = (content) => rules(content).guardians.length;

// The members' rounded average character level, at least 1 (as the
// Bestia's).
export function expeditionLevel(levels) {
  if (levels.length === 0) return 1;
  return Math.max(1, Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length));
}

// The land of the week for the members' average level: the one whose
// levels hold it, the highest land for a level above them all.
export function expeditionLand(level, content) {
  const lands = [...content.regions].sort((a, b) => a.minLevel - b.minLevel);
  return lands.find((land) => level >= land.minLevel && level <= land.maxLevel) ?? (level > lands.at(-1).maxLevel ? lands.at(-1) : lands[0]);
}

// How strong a creature is by its own make: its HP and its blows.
const make = (monster) => monster.hpFactor * monster.attack.damageFactor;

// The seven guardians of a land, the weakest first, each creature once:
// its strongest ordinary creatures (those of its highest places, the
// stronger by their own make first) as many as the elites and champions
// leave room for, then the elites of its places and last the champions of
// its inner regions, each group from its lowest place up. So the seventh
// is a champion where the land has one. Each with its highest place in the
// land: the land's trait counts in the fight, and the place's creatures
// name the affixes of the last chest's item.
export function expeditionGuardians(landId, content) {
  const land = content.regionsById[landId];
  const count = expeditionStages(content);
  const found = new Map();
  land.areas.forEach((area, place) => {
    const ids = [...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters).concat(area.elite ?? [], area.champion ?? []);
    for (const id of new Set(ids)) {
      const monster = content.monstersById[id];
      if (!monster) continue;
      found.set(id, { monsterId: id, areaId: area.id, place, rank: monster.champion ? 2 : monster.elite ? 1 : 0, make: make(monster) });
    }
  });
  const creatures = [...found.values()];
  const rare = creatures.filter((one) => one.rank > 0);
  const ordinary = creatures
    .filter((one) => one.rank === 0)
    .sort((a, b) => b.place - a.place || b.make - a.make || a.monsterId.localeCompare(b.monsterId))
    .slice(0, Math.max(0, count - rare.length));
  return [...ordinary, ...rare]
    .sort((a, b) => a.rank - b.rank || a.place - b.place || a.make - b.make || a.monsterId.localeCompare(b.monsterId))
    .slice(-count)
    .map(({ monsterId, areaId }) => ({ monsterId, areaId }));
}

// The route of a guild's week, made when the week's first look comes: the
// land of the members' average level (`levels`), that level, and its
// guardians.
export function guildExpedition({ levels }, content) {
  const level = expeditionLevel(levels);
  const land = expeditionLand(level, content);
  return { landId: land.id, level, guardians: expeditionGuardians(land.id, content) };
}

// The minutes of exploration one stage takes for the week's `members` (the
// active ones and the shares of those who joined later, as the Próby
// Gildii count them): perMember for each, rounded up to `step`, at least
// `min`.
export function expeditionStageMinutes(members, content) {
  const { perMember, step, min } = rules(content).stageMinutes;
  return Math.max(min, Math.ceil((Math.max(1, members) * perMember - 1e-9) / step) * step);
}

// The guardian at the end of stage `stage` (1 to 7) for a route of `level`:
// its creature, its level (the route's, one more for each stage before),
// and its most HP for the `members` it comes for, as the Bestia's: the
// stage's attacks of a typical character of its level for each of them.
export function expeditionGuardian({ stage, level, members, guardians }, content) {
  const tuning = rules(content).guardians[stage - 1];
  const at = level + stage - 1;
  const maxHp = Math.max(1, Math.round(Math.max(1, members) * tuning.attacks * beastAttackDamage(at, content)));
  return { ...guardians[stage - 1], stage, level: at, maxHp };
}

// Where the route of the week stands at `minutes`, the guild's minutes of
// the week: `walked`, the minutes of the stages whose guardians fell (each
// stage's as it was when its guardian came), `beaten` how many fell (in
// order), `need` the minutes of the stage now and `standing` whether its
// guardian has come. The stage now (1 to 7), the minutes walked in it (to
// its need), whether its guardian bars the way, and the minutes kept
// meanwhile, which walk the route on as it falls; `done` once all fell.
export function expeditionProgress({ minutes, walked = 0, beaten = 0, need, standing = false }, content) {
  const stages = expeditionStages(content);
  const into = Math.max(0, minutes - walked);
  if (beaten >= stages) return { stage: stages, progress: need, need, guardian: false, banked: 0, done: true };
  const reached = standing || into >= need;
  return {
    stage: beaten + 1,
    progress: reached ? need : into,
    need,
    guardian: reached,
    banked: reached ? Math.max(0, into - need) : 0,
    done: false,
  };
}

// The chest of the guardian of stage `stage` for a character as it is (its
// level, class and class level, and the slots it wears): gold by its level,
// the stage's draws of the guardian's material, each as a beaten creature
// of its kind leaves it (crafting.js), at the guardian's level, at least one
// piece; and on the stage with `item` (the last one, the "rzadki łup"), an
// item of the character's class it can wear, at its level, of a champion's
// rarity, favouring its empty slots, as in the Skrzynia Bestii. The same
// seed, the same chest.
export function expeditionChest({ stage, level, classId, classLevel, wornSlots = [], guardian, seed }, content) {
  const tuning = rules(content).guardians[stage - 1];
  const rng = createRng(`${seed}:chest`);
  const area = content.areasById[guardian.areaId];
  const item = tuning.item
    ? randomItem(level, rng, content, { classId, maxClassLevel: classLevel, rarityId: championItemRarity(level, rng, content), filled: new Set(wornSlots), area })
    : null;
  let materials = {};
  for (let draw = 0; draw < tuning.materials; draw++) materials = addCounts(materials, materialDrops(guardian.monsterId, guardian.level, 1, rng, content));
  const material = content.materialsByMonster[guardian.monsterId];
  if (material && tuning.materials > 0 && Object.keys(materials).length === 0) materials = { [stackKey(material.id, material.rarity)]: 1 };
  return { gold: Math.round(tuning.gold.base + tuning.gold.perLevel * level), materials, item };
}
