// @ts-check
// Poszukiwani in the Osada (data/settlement.json, wanted; DECISIONS.md,
// "Poszukiwani"; the author's 619 B: „nazwane, silniejsze odmiany stworów z
// tych miejsc” and „wyjęci spod prawa”). Every day the sołtys posts wanted
// posters for each character: one for the named variant of the creatures of
// each of its highest open places (its highest and the two below it), and
// one for an outlaw in one of them. A poster taken brings its target into
// the explorations of its place (simulateHunt): as strong as the place's
// elite, by the rules' strength more. Pure: the day and the seed are the
// server's.

import { monsterCombatant } from './combatant.js';
import { stackKey } from './crafting.js';
import { trophyGrades } from './encyclopedia.js';
import { createRng } from './rng.js';
import { areaOpenFor } from './trial-hall.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {{ id: string, regionId: string, minLevel: number, maxLevel: number, elite?: string }} Area An inner region (data/areas.json). */
/** @typedef {{ id: string, kind: string, areaId: string, monsterId: string, name: string, female: boolean, level: number, gold: number }} Poster */
/** @typedef {{ kind: string, areaId: string, monsterId: string, name: string, female: boolean, level: number }} Target */

/**
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const wantedOf = (content) => content.settlement?.wanted ?? null;

// The rules where the caller knows the game has them.
/** @param {Content} content */
const rulesOf = (content) => /** @type {Record<string, any>} */ (wantedOf(content));

// The bounty for a target in `area`: goldPerLevel × the place's first
// level, in whole goldSteps, at least one.
/**
 * @param {Area} area
 * @param {Content} content
 * @returns {number}
 */
export function wantedGold(area, content) {
  const { goldPerLevel, goldStep } = rulesOf(content);
  return Math.max(goldStep, Math.round((goldPerLevel * area.minLevel) / goldStep) * goldStep);
}

// A poster: its target, at the level of the place's elite.
/**
 * @param {string} day
 * @param {Area} area
 * @param {Record<string, any>} target a creature's variant (`area`, `monster`) or an outlaw (a monster)
 * @param {Content} content
 * @returns {Poster}
 */
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
// from the rules' `places` highest places open to it, since 12.11.2026 its
// highest and the two below it whatever their land (the author: „Te listy
// gończe, poszukiwani powinni sięgać maksymalnie 2 stopnie niżej niż
// pozwala level”, after a player at level 43 got posters of the first land,
// 400 gold each; from 10.11.2026 they left out its newest land), `creatures`
// of them drawn, each with its variant, the highest first, then an outlaw
// drawn in one of them.
/**
 * @param {number} classLevel
 * @param {string} day
 * @param {unknown} seed
 * @param {Content} content
 * @param {string | null} [early]
 * @returns {Poster[]}
 */
export function wantedPosters(classLevel, day, seed, content, early = null) {
  const rules = wantedOf(content);
  if (!rules) return [];
  /** @type {Area[]} */
  const open = content.areas.filter((/** @type {Area} */ area) => areaOpenFor(area, classLevel, early, content));
  const places = open.slice(-rules.places);
  if (places.length === 0) return [];
  const rng = createRng(`${seed}:${day}:wanted`);
  const order = [...places];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const creatures = order
    .slice(0, rules.creatures)
    .map((area) => /** @type {[Area, Record<string, any> | undefined]} */ ([area, rules.variants.find((/** @type {{ area: string }} */ variant) => variant.area === area.id)]))
    .filter(([, variant]) => variant)
    .sort(([a], [b]) => b.minLevel - a.minLevel)
    .map(([area, variant]) => poster(day, area, /** @type {Record<string, any>} */ (variant), content));
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
/**
 * @param {(Poster | null | undefined)[]} posters
 * @param {unknown} seed
 * @returns {Target | null}
 */
export function tripWanted(posters, seed) {
  /** @type {Map<string, { poster: Poster, count: number }>} */
  const held = new Map();
  for (const poster of /** @type {Poster[]} */ (posters.filter(Boolean))) {
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
/**
 * @param {Poster | null | undefined} poster
 * @param {Target | null | undefined} target
 * @returns {boolean}
 */
export const wantedTarget = (poster, target) => Boolean(poster && target) && poster?.areaId === target?.areaId && poster?.monsterId === target?.monsterId;

// The trophy a beaten variant leaves: its creature's material in the first
// grade of its trophy (encyclopedia.js) the character has not found yet,
// but never the rarest of them: the poster brings the trophy closer, and
// its last piece is the character's own find (the author: „Uwaga zeby nie
// przesadzić z balansem jak te trofeum wlecą znowu się zrobi za łatwo”).
// In the first grade once only the rarest is missing, or none; null for a
// creature without a material.
/**
 * @param {string} monsterId
 * @param {Record<string, unknown>} discovered
 * @param {Content} content
 * @returns {string | null}
 */
export function wantedTrophy(monsterId, discovered, content) {
  const material = content.materialsByMonster[monsterId];
  if (!material) return null;
  /** @type {string[]} */
  const grades = trophyGrades(material.id, content);
  const missing = grades.slice(0, -1).find((rarityId) => !discovered[`material:${material.id}:${rarityId}`]);
  return stackKey(material.id, missing ?? grades[0]);
}

// The wanted's encounter: alone, at its level, by its own name.
/** @param {Target} target */
export const wantedEncounter = (target) => ({
  elite: false,
  wanted: true,
  members: [{ monsterId: target.monsterId, level: target.level, name: target.name }],
});

// The [damage, HP] multipliers of the wanted on an exploration of `area`
// whose creatures have `strength` (exploreStrength): its HP and damage are
// those of the place's elite at its level, times the rules' strength.
/**
 * @param {Area} area
 * @param {Target} target
 * @param {[number, number]} strength
 * @param {Content} content
 * @returns {[number, number]}
 */
export function wantedStrength(area, target, strength, content) {
  const [damage, hp] = rulesOf(content).strength;
  if (!area.elite) return [strength[0] * damage, strength[1] * hp];
  const elite = monsterCombatant(/** @type {any} */ ({ monsterId: area.elite, level: target.level, id: 'elite' }), content);
  const own = monsterCombatant(/** @type {any} */ ({ monsterId: target.monsterId, level: target.level, id: 'own' }), content);
  /** @param {{ weapon: { min: number, max: number } }} unit */
  const hit = (unit) => unit.weapon.min + unit.weapon.max;
  return [strength[0] * damage * (hit(elite) / hit(own)), strength[1] * hp * (elite.maxHp / own.maxHp)];
}

// The rarity of the item a beaten outlaw leaves, by the rules' weights.
/**
 * @param {Rng} rng
 * @param {Content} content
 * @returns {string}
 */
export const wantedLootRarity = (rng, content) => rng.weighted(/** @type {[string, number][]} */ (Object.entries(rulesOf(content).loot)), ([, weight]) => weight)[0];
