// Poszukiwani in the Osada (data/settlement.json, wanted; DECISIONS.md,
// "Poszukiwani"; the author's 619 B: „nazwane, silniejsze odmiany stworów z
// tych miejsc” and „wyjęci spod prawa”). Every day the sołtys posts wanted
// posters for each character: one for the named variant of the creatures of
// each of a few of its highest open places below its newest land
// (wantedPlaces), and one for an outlaw in one of them. A poster taken
// brings its target into the explorations of its place (simulateHunt): as
// strong as the place's elite, by the rules' strength more. Pure: the day
// and the seed are the server's.

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

// The places open to a character (`open`, in the game's order) that its
// posters come from, since 10.11.2026 not those of its newest land, the
// land (region) of its highest open place, where it has just come and
// falls at once (the author: „zbalansowanie poszukiwanych pod nowy poziom
// trudności, zeby nie pokazywało zleceń z ostatniej odblokowanej krainy, bo
// często tam się wejdzie i od razu padnie”): the places of the lands below
// it; with no land below it, those of the first land but its newest place,
// or the only one open.
export function wantedPlaces(open, content) {
  if (open.length === 0) return [];
  const land = (area) => content.regions.findIndex((region) => region.id === area.regionId);
  const newest = land(open.at(-1));
  const below = open.filter((area) => land(area) < newest);
  if (below.length > 0) return below;
  return open.length > 1 ? open.slice(0, -1) : open;
}

// The posters of `day` for a character of `classLevel` (`seed`: the
// character's own; `early`: the place the Sala prób opened for it, if any):
// from the rules' `places` highest of its places wantedPlaces gives,
// `creatures` of them drawn, each with its variant, the highest first, then
// an outlaw drawn in one of them. `lands` false: a day whose posters were
// drawn before that rule (its basis kept before 10.11.2026, server
// wanted.js), from the highest places open of all, so the day's posters
// stay as they were drawn.
export function wantedPosters(classLevel, day, seed, content, early = null, { lands = true } = {}) {
  const rules = wantedOf(content);
  if (!rules) return [];
  const open = content.areas.filter((area) => areaOpenFor(area, classLevel, early, content));
  const places = (lands ? wantedPlaces(open, content) : open).slice(-rules.places);
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

// The wanted target a Drużyna's trip seeks (src/server/parties.js), since
// 10.11.2026 (the author: „chcemy zrobić większy focus na drużynę, ergo
// poszukiwanych powinno moc sie znajdywac nawet w drużynie, szczególnie
// mając tych samych”): of the posters in hand for the trip's place of those
// who go (`posters`, one for each, or null), the target most of them hold,
// a creature's variant or an outlaw in that place; of targets held alike,
// one drawn from the trip's seed. The target alone, without a poster's id
// or trophy, which stay each holder's own; null when nobody holds one.
export function tripWanted(posters, seed) {
  const held = new Map();
  for (const poster of posters.filter(Boolean)) {
    const key = `${poster.areaId}:${poster.monsterId}`;
    held.set(key, { poster: held.get(key)?.poster ?? poster, count: (held.get(key)?.count ?? 0) + 1 });
  }
  if (held.size === 0) return null;
  const most = Math.max(...[...held.values()].map((one) => one.count));
  const top = [...held.values()].filter((one) => one.count === most);
  const { poster } = top.length === 1 ? top[0] : top[createRng(`${seed}:wanted-target`).int(0, top.length - 1)];
  return { kind: poster.kind, areaId: poster.areaId, monsterId: poster.monsterId, name: poster.name, female: poster.female === true, level: poster.level };
}

// Whether a poster in hand is for the trip's wanted target (tripWanted).
export const wantedTarget = (poster, target) => Boolean(poster && target) && poster.areaId === target.areaId && poster.monsterId === target.monsterId;

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
