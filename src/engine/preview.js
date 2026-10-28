// Numbers for the stats screen: the character's combat values and what one
// more point of each stat would change in them. Chances and reductions are
// measured against an opponent of the character's own level.

import { playerCombatant } from './combatant.js';
import { cappedChance, maxMana, reduction } from './formulas.js';
import { regenPerMinute } from './progression.js';
import { computeStats } from './stats.js';

export function combatValues(character, equipped, content) {
  const balance = content.balance;
  const tuning = balance.combat;
  const unit = playerCombatant({ character, equipped, name: '' }, content);
  const { totals } = computeStats(character, equipped, content);
  const level = character.level;
  const scale = unit.damageScale;
  return {
    damageMin: Math.round(unit.weapon.min * scale),
    damageMax: Math.round(unit.weapon.max * scale),
    damage: ((unit.weapon.min + unit.weapon.max) / 2) * scale,
    reduction: reduction(unit.armor, level, balance),
    dodge: cappedChance(unit.dodgeRating, level, tuning.dodgeCap, balance),
    crit: cappedChance(unit.critRating, level, tuning.critCap, balance),
    effectResist: cappedChance(unit.willRating, level, tuning.willCap, balance),
    speed: unit.speed,
    maxHp: unit.maxHp,
    mana: maxMana(totals.wisdom, level, balance),
    regen: regenPerMinute(unit.maxHp, totals.vitality, content),
    recovery: unit.recovery,
    // Each element's resistance as the share of its damage it takes away.
    resist: Object.fromEntries(content.elements.map(({ id }) => [id, reduction(unit.resist[id] ?? 0, level, balance)])),
  };
}

// For each stat, the changes one more point brings. Damage is a relative
// change (0.03 is +3%), everything else an absolute one.
export function statEffects(character, equipped, content) {
  const now = combatValues(character, equipped, content);
  return Object.fromEntries(
    content.statIds.map((stat) => {
      const points = { ...character.points, [stat]: (character.points[stat] ?? 0) + 1 };
      const next = combatValues({ ...character, points }, equipped, content);
      const changes = {};
      for (const key of ['damage', 'reduction', 'dodge', 'crit', 'effectResist', 'speed', 'maxHp', 'mana', 'regen', 'recovery']) {
        const change = key === 'damage' ? next.damage / now.damage - 1 : next[key] - now[key];
        if (Math.abs(change) > 1e-9) changes[key] = change;
      }
      return [stat, changes];
    }),
  );
}

// The combat values an item changes, rounded as the game shows them (the
// resistances keyed as the item's stats, "resist.fire"), and a verdict on the
// whole: "better" when some go up and none goes down, "worse" when some go
// down and none up, "mixed" when some go up and some down, and "same" when
// none changes.
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

function percent(value) {
  return Math.round(value * 1000) / 10;
}

export function valueChanges(now, after) {
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

// What putting an item on changes, in place of what its slot holds. `now`:
// the values as worn, when they are counted already.
export function equipChange(character, equipped, item, content, now = combatValues(character, equipped, content)) {
  const worn = equipped.filter((candidate) => candidate.slot !== item.slot);
  return valueChanges(now, combatValues(character, [...worn, item], content));
}
