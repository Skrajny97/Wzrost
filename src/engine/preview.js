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
