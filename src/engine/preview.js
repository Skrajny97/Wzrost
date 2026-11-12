// @ts-check
// Numbers for the stats screen: the character's combat values and what each
// stat gives in them now. Chances and reductions are measured against an
// opponent of the character's own level.

import { playerCombatant } from './combatant.js';
import { evolutionOf } from './evolutions.js';
import { cappedChance, reduction } from './formulas.js';
import { upgradedItem } from './items.js';
import { regenPerMinute } from './progression.js';
import { computeStats } from './stats.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character, as its row keeps it. */
/** @typedef {Record<string, any>} Item An item, as items.js makes it. */
/**
 * @typedef {{ damageMin: number, damageMax: number, damage: number, reduction: number, dodge: number, crit: number, effectResist: number,
 *   speed: number, maxHp: number, mana: number, regen: number, recovery: number, resist: Record<string, number> }} CombatValues
 */
/** @typedef {'damage' | 'reduction' | 'dodge' | 'crit' | 'effectResist' | 'speed' | 'maxHp' | 'mana' | 'regen' | 'recovery'} ValueKey */

/**
 * @param {Character} character
 * @param {Item[]} equipped
 * @param {Content} content
 * @returns {CombatValues}
 */
export function combatValues(character, equipped, content) {
  const balance = content.balance;
  const tuning = balance.combat;
  const unit = playerCombatant(/** @type {any} */ ({ character, equipped, name: '' }), content);
  const { totals } = computeStats(character, equipped, content);
  const level = character.level;
  const scale = unit.damageScale;
  // With the damage bonus the Rdzeń's Artefakty give (core.js).
  const bonus = 1 + (unit.damageBonus ?? 0);
  return {
    damageMin: Math.round(unit.weapon.min * scale * bonus),
    damageMax: Math.round(unit.weapon.max * scale * bonus),
    damage: ((unit.weapon.min + unit.weapon.max) / 2) * scale * bonus,
    reduction: reduction(unit.armor, level, balance),
    dodge: cappedChance(unit.dodgeRating, level, tuning.dodgeCap, balance),
    crit: cappedChance(unit.critRating, level, tuning.critCap, balance),
    effectResist: cappedChance(unit.willRating, level, tuning.willCap, balance),
    speed: unit.speed,
    maxHp: unit.maxHp,
    mana: unit.maxMana,
    regen: regenPerMinute(unit.maxHp, totals.vitality, content),
    recovery: unit.recovery,
    // Each element's resistance as the share of its damage it takes away.
    resist: Object.fromEntries(content.elements.map((/** @type {{ id: string }} */ { id }) => [id, reduction(unit.resist[id] ?? 0, level, balance)])),
  };
}

// The stats screen's Parametry dodatkowe (the author, after a player asked
// for the total armour: "Mozna zbudować jakies okno w statystykach
// <Parametry dodatkowe>"): the ratings behind the combat values and what
// they give against an opponent of the character's own level. The armour
// with its sources (the items, Wytrzymałość, and the evolution's trait that
// raises it by a share), the chances with their caps, the crit's multiplier,
// the speed, the HP at rest (with `rest`, the share the Ognisko adds, as the
// character rests now) and after each fight, and each element's resistance,
// with the share less of its damage a trait shelters from.
/**
 * @param {Character} character
 * @param {Item[]} equipped
 * @param {Content} content
 * @param {{ rest?: number }} [options]
 */
export function extraValues(character, equipped, content, { rest = 0 } = {}) {
  const balance = content.balance;
  const tuning = balance.combat;
  const unit = playerCombatant(/** @type {any} */ ({ character, equipped, name: '' }), content);
  const { totals, bonuses } = computeStats(character, equipped, content);
  const level = character.level;
  const feat = unit.feat;
  // A feat comes with an evolution (combatant.js).
  const trait = feat?.kind === 'bulwark' ? { name: /** @type {Record<string, any>} */ (evolutionOf(character, content)).trait.name, share: feat.armor } : null;
  /**
   * @param {number} rating
   * @param {number} cap
   */
  const chance = (rating, cap) => ({ rating: Math.round(rating), chance: cappedChance(rating, level, cap, balance), cap });
  // Widmowy krok raises the dodge above the cap, as in the fight (combat.js;
  // the code review, 12.11.2026: the window left it out).
  const step = feat?.kind === 'shadowStep' ? (feat.dodge ?? 0) : 0;
  /** @param {{ rating: number, chance: number, cap: number }} plain */
  const dodgeOf = (plain) => (step ? { ...plain, chance: Math.min(0.95, plain.chance + step), cap: plain.cap + step } : plain);
  return {
    level,
    armor: {
      total: unit.armor,
      equipment: Math.round(bonuses.armor),
      endurance: Math.round(totals.endurance * tuning.armorPerEndurance),
      trait,
      reduction: reduction(unit.armor, level, balance),
    },
    dodge: dodgeOf(chance(unit.dodgeRating, tuning.dodgeCap)),
    crit: { ...chance(unit.critRating, tuning.critCap), multiplier: tuning.critMultiplier * (1 + (feat?.critDamage ?? 0)) },
    effectResist: chance(unit.willRating, tuning.willCap),
    speed: unit.speed,
    regen: regenPerMinute(unit.maxHp, totals.vitality, content, rest),
    recovery: unit.recovery,
    resist: content.elements.map((/** @type {{ id: string, name: string }} */ { id, name }) => {
      const rating = unit.resist[id] ?? 0;
      return { id, name, rating, reduction: reduction(rating, level, balance), shelter: unit.shelter?.[id] ?? 0 };
    }),
  };
}

// For each stat, what its whole total gives now: the combat values as they
// are against those with the stat at nothing (the author: „lepiej pisz ile
// daja aktualne staty a nie jeden punkt”). Damage is a relative change (0.92
// is +92%), everything else an absolute one.
/**
 * @param {Character} character
 * @param {Item[]} equipped
 * @param {Content} content
 * @returns {Record<string, Partial<Record<ValueKey, number>>>}
 */
export function statShares(character, equipped, content) {
  const now = combatValues(character, equipped, content);
  const { totals, sources } = computeStats(character, equipped, content);
  /** @type {ValueKey[]} */
  const keys = ['damage', 'reduction', 'dodge', 'crit', 'effectResist', 'speed', 'maxHp', 'mana', 'regen', 'recovery'];
  return Object.fromEntries(
    content.statIds.map((/** @type {string} */ stat) => {
      // The Rdzeń's share of a stat goes with the stat's other points.
      const points = { ...character.points, [stat]: (character.points[stat] ?? 0) - (totals[stat] - sources[stat].core) };
      const without = combatValues({ ...character, points }, equipped, content);
      /** @type {Partial<Record<ValueKey, number>>} */
      const shares = {};
      for (const key of keys) {
        const share = key === 'damage' ? now.damage / without.damage - 1 : now[key] - without[key];
        if (Math.abs(share) > 1e-9) shares[key] = share;
      }
      return [stat, shares];
    }),
  );
}

// The combat values an item changes, rounded as the game shows them (the
// resistances keyed as the item's stats, "resist.fire"), and a verdict on the
// whole: "better" when some go up and none goes down, "worse" when some go
// down and none up, "mixed" when some go up and some down, and "same" when
// none changes.
/** @type {Record<string, (value: number) => number>} */
const shown = {
  damage: (value) => Math.round(value * 10) / 10,
  reduction: percent,
  maxHp: Math.round,
  dodge: percent,
  crit: percent,
  effectResist: percent,
  speed: (value) => Math.round(value * 100) / 100,
  mana: Math.round,
  regen: (value) => Math.round(value * 100) / 100,
  recovery: percent,
};

/** @param {number} value */
function percent(value) {
  return Math.round(value * 1000) / 10;
}

/**
 * @param {Record<string, any>} now The combat values before (combatValues).
 * @param {Record<string, any>} after The combat values after.
 */
export function valueChanges(now, after) {
  /** @type {Record<string, number>} */
  const changes = {};
  for (const [key, round] of Object.entries(shown)) {
    const change = Math.round((round(after[key]) - round(now[key])) * 100) / 100;
    if (change !== 0) changes[key] = change;
  }
  for (const element of Object.keys(after.resist ?? {})) {
    const change = Math.round((percent(after.resist[element]) - percent(now.resist[element])) * 100) / 100;
    if (change !== 0) changes[`resist.${element}`] = change;
  }
  const up = Object.values(changes).some((change) => change > 0);
  const down = Object.values(changes).some((change) => change < 0);
  return { changes, verdict: up && down ? 'mixed' : up ? 'better' : down ? 'worse' : 'same' };
}

// The verdict follows the class's proposed spread of points (autoPoints,
// the path of "Rozdaj według klasy"; a player's note, the author
// 12.11.2026: "celna uwaga"). An item's attributes count by their sum
// weighted by the path (pathScore), so two items compare by the weighted
// average of their main attributes and an attribute the class puts no
// points into (the Mądrość of a Wojownik) counts for nothing. Damage, armor
// and resistances count by the combat values they change, the attributes
// left out of those (bareItem).

/**
 * @param {string} classId
 * @param {Content} content
 * @returns {Record<string, number>}
 */
const pathWeights = (classId, content) => content.classesById[classId]?.autoPoints ?? {};

// An item for the verdict: its numbers final (its upgrade and gem in them),
// without its attributes, and with `pathScore`, their sum weighted by the
// class's path.
/**
 * @param {Item} item
 * @param {string} classId
 * @param {Content} content
 * @returns {Item}
 */
export function bareItem(item, classId, content) {
  const weights = pathWeights(classId, content);
  const final = upgradedItem(item, content);
  let pathScore = 0;
  // Whether a property stays: anything but an attribute, which goes to the score.
  /** @param {{ stat?: string, value?: number }} property */
  const stays = (property) => {
    if (!property.stat || !content.statIds.includes(property.stat)) return true;
    pathScore += (weights[property.stat] ?? 0) * (property.value ?? 0);
    return false;
  };
  const implicit = final.implicit && stays(final.implicit) ? final.implicit : null;
  const imbue = final.imbue && stays(final.imbue) ? final.imbue : null;
  const affixes = final.affixes.filter(stays);
  return { ...final, upgrade: 0, gem: null, implicit, imbue, affixes, pathScore };
}

// The gear for the verdict (bareItem), for the character's class.
/**
 * @param {Character} character
 * @param {Item[]} equipped
 * @param {Content} content
 * @returns {Item[]}
 */
export const pathGear = (character, equipped, content) => equipped.map((item) => bareItem(item, character.classId, content));

/** @param {Item[]} items */
const scoreOf = (items) => items.reduce((sum, item) => sum + item.pathScore, 0);

// The verdict from the change in the path's score and the changes in the
// combat values without the attributes: "better" when something goes up and
// nothing down, "worse" the other way, "mixed" for both, "same" for none.
/**
 * @param {number} score
 * @param {Record<string, number>} changes
 */
function verdictOf(score, changes) {
  const values = Object.values(changes);
  const up = score > 0 || values.some((change) => change > 0);
  const down = score < 0 || values.some((change) => change < 0);
  return up && down ? 'mixed' : up ? 'better' : down ? 'worse' : 'same';
}

// The verdict on the gear `after` in place of `before`, along the class's
// path.
/**
 * @param {Character} character
 * @param {Item[]} before
 * @param {Item[]} after
 * @param {Content} content
 */
export function gearVerdict(character, before, after, content) {
  const was = pathGear(character, before, content);
  const will = pathGear(character, after, content);
  return verdictOf(scoreOf(will) - scoreOf(was), valueChanges(combatValues(character, was, content), combatValues(character, will, content)).changes);
}

// The verdict on putting `item` on in place of what its slot holds, along
// the class's path. `pathWorn` and `pathNow`: the worn gear for the verdict
// (pathGear) and its values, counted once for a whole bag.
/**
 * @param {Character} character
 * @param {Item} item
 * @param {Content} content
 * @param {Item[]} pathWorn
 * @param {CombatValues} [pathNow]
 */
export function equipVerdict(character, item, content, pathWorn, pathNow = combatValues(character, pathWorn, content)) {
  const others = pathWorn.filter((candidate) => candidate.slot !== item.slot);
  const leaving = scoreOf(pathWorn.filter((candidate) => candidate.slot === item.slot));
  const coming = bareItem(item, character.classId, content);
  return verdictOf(coming.pathScore - leaving, valueChanges(pathNow, combatValues(character, [...others, coming], content)).changes);
}

// What putting an item on changes, in place of what its slot holds: every
// combat value as the game shows it, and the verdict for the class's path
// (equipVerdict). `now`: the values as worn, when they are counted already.
/**
 * @param {Character} character
 * @param {Item[]} equipped
 * @param {Item} item
 * @param {Content} content
 * @param {CombatValues} [now]
 */
export function equipChange(character, equipped, item, content, now = combatValues(character, equipped, content)) {
  const worn = equipped.filter((candidate) => candidate.slot !== item.slot);
  const { changes } = valueChanges(now, combatValues(character, [...worn, item], content));
  return { changes, verdict: equipVerdict(character, item, content, pathGear(character, equipped, content)) };
}
