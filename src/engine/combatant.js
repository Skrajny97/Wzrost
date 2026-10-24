// Combatants: the player character and monsters reduced to the same shape, so
// the combat code treats both alike (and later companions or other players).

import { budget, cappedChance, damageScale, maxHp, speed, weaponDamage } from './formulas.js';
import { upgradedItem } from './items.js';
import { gearLevel } from './progression.js';
import { computeStats } from './stats.js';

export function playerCombatant({ character, equipped, hp, name, area, id = 'a0', side = 'ally' }, content) {
  const balance = content.balance;
  const { totals, bonuses } = computeStats(character, equipped, content);
  const weaponItem = equipped.find((item) => item.slot === 'weapon');
  const weapon = weaponItem ? itemWeapon(weaponItem, content) : unarmed(character.level, content);
  let armor = bonuses.armor + totals.endurance * balance.combat.armorPerEndurance;
  if (area?.trait.frontArmorBonus && character.position === 'front') armor *= 1 + area.trait.frontArmorBonus;
  const cls = content.classesById[character.classId];
  const hpMax = maxHp(totals.vitality, character.level, balance);
  return {
    id,
    side,
    name,
    isPlayer: true,
    classId: character.classId,
    family: 'player',
    elite: false,
    position: character.position,
    level: character.level,
    maxHp: hpMax,
    hp: Math.min(hp ?? hpMax, hpMax),
    weapon,
    scalingValue: totals[weapon.scaling],
    damageScale: damageScale(totals[weapon.scaling], character.level, balance),
    armor: Math.round(armor),
    resist: { ...bonuses.resist },
    dodgeRating: totals.dexterity * balance.combat.dodgePerDexterity,
    critRating: totals.perception * balance.combat.critPerPerception,
    willRating: totals.will * balance.combat.willPerPoint,
    speed: speed(totals.dexterity, character.level, balance),
    recovery:
      balance.hunt.recoveryAfterFight +
      cls.recovery.base +
      cls.recovery.perWisdom * totals.wisdom +
      (area?.trait.recoveryBonus ?? 0),
  };
}

// How a strike looks in the fight animation: a blow, an arrow or a spell.
const strikeOf = (strike, category) => strike ?? (category === 'magical' ? 'magic' : 'melee');

function itemWeapon(worn, content) {
  const item = upgradedItem(worn, content);
  const base = content.basesById[item.base];
  return {
    attackName: base.attackName,
    category: base.category,
    strike: strikeOf(base.strike, base.category),
    element: item.element,
    scaling: base.scaling,
    min: item.damage.min,
    max: item.damage.max,
  };
}

// Without a weapon the character fights with its fists, which hit like a weak
// common weapon of its level.
function unarmed(level, content) {
  const balance = content.balance;
  const { attackName, damageFactor, variance } = balance.combat.unarmed;
  const average = weaponDamage(budget(level, content.rarities[0].budget, balance), damageFactor, balance);
  const min = Math.max(1, Math.round(average * (1 - variance)));
  return { attackName, category: 'physical', strike: 'melee', scaling: 'strength', min, max: Math.max(min, Math.round(average * (1 + variance))) };
}

// `groupFactor` weakens each member of a group, so two or three monsters are
// harder than one, but not two or three times harder.
export function monsterCombatant({ monsterId, level, id, name, position, side = 'enemy', groupFactor = 1 }, content) {
  const balance = content.balance;
  const monster = content.monstersById[monsterId];
  const stat = (key) => (monster.stats.base[key] ?? 0) + (monster.stats.growth[key] ?? 0) * (level - 1);
  // A monster's natural weapon and hide match the items a character usually
  // wears at its level (gearLevel), so at the fast first levels they lag
  // behind like the character's.
  const hide = balance.monsters.budgetBase + balance.items.budgetPerLevel * gearLevel(level, content);
  const average = weaponDamage(hide, monster.attack.damageFactor, balance) * balance.monsters.damageMultiplier * groupFactor;
  const resist = {};
  for (const [element, value] of Object.entries(monster.resistances ?? {})) {
    resist[element] = Math.round(value.base + value.perLevel * (level - 1));
  }
  const { hpPerVitality, hpPerLevel } = balance.character;
  const rawHp = balance.monsters.hpBase + hpPerVitality * stat('vitality') + hpPerLevel * level;
  const hpMax = Math.max(1, Math.round(rawHp * monster.hpFactor * groupFactor));
  return {
    id,
    side,
    name: name ?? monster.name,
    isPlayer: false,
    monsterId,
    family: monster.family,
    elite: Boolean(monster.elite),
    groupFactor,
    position: position ?? monster.position,
    level,
    maxHp: hpMax,
    hp: hpMax,
    weapon: {
      attackName: monster.attack.name,
      category: monster.attack.category,
      strike: strikeOf(monster.attack.strike, monster.attack.category),
      element: monster.attack.element,
      scaling: monster.attack.scaling,
      min: average * (1 - monster.attack.variance),
      max: average * (1 + monster.attack.variance),
      dot: monster.attack.dot,
    },
    scalingValue: stat(monster.attack.scaling),
    damageScale: damageScale(stat(monster.attack.scaling), level, balance),
    armor: Math.round(hide * balance.items.armorPerBudget * monster.armorFactor + stat('endurance') * balance.combat.armorPerEndurance),
    resist,
    dodgeRating: stat('dexterity') * balance.combat.dodgePerDexterity,
    critRating: stat('perception') * balance.combat.critPerPerception,
    willRating: stat('will') * balance.combat.willPerPoint,
    speed: speed(stat('dexterity'), level, balance),
    recovery: 0,
  };
}

// What the report shows when a participant's stats are expanded with "+".
export function combatantView(unit, opponentLevel, content) {
  const balance = content.balance;
  const scale = unit.damageScale;
  const percent = (value) => Math.round(value * 100);
  return {
    id: unit.id,
    side: unit.side,
    name: unit.name,
    level: unit.level,
    position: unit.position,
    family: unit.family,
    classId: unit.classId,
    monsterId: unit.monsterId,
    elite: unit.elite,
    maxHp: unit.maxHp,
    hp: unit.hp,
    attack: unit.weapon.attackName,
    strike: unit.weapon.strike,
    element: unit.weapon.element ?? null,
    damage: `${Math.round(unit.weapon.min * scale)}–${Math.round(unit.weapon.max * scale)}`,
    armor: unit.armor,
    dodge: percent(cappedChance(unit.dodgeRating, opponentLevel, balance.combat.dodgeCap, balance)),
    crit: percent(cappedChance(unit.critRating, opponentLevel, balance.combat.critCap, balance)),
    speed: Math.round(unit.speed * 100) / 100,
  };
}
