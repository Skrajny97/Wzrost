// @ts-check
// Shared combat and economy formulas. Every constant comes from data/balance.json.

/** @typedef {typeof import('../../data/balance.json')} Balance The numbers of data/balance.json. */
/** @typedef {{ hp: number, mana: number }} PerClassLevel What a class level adds (data/classes.json). */

// K from the design document: it grows with the opponent's level, so a fixed
// amount of armor, resistance, dodge or crit is worth less against stronger foes.
/**
 * @param {number} level
 * @param {Balance} balance
 */
export function kValue(level, balance) {
  return balance.combat.kBase + balance.combat.kPerLevel * level;
}

// Diminishing returns: P / (P + K). Never reaches 1, so nobody becomes immortal.
/**
 * @param {number} value
 * @param {number} opponentLevel
 * @param {Balance} balance
 */
export function reduction(value, opponentLevel, balance) {
  return value > 0 ? value / (value + kValue(opponentLevel, balance)) : 0;
}

/**
 * @param {number} rating
 * @param {number} opponentLevel
 * @param {number} cap
 * @param {Balance} balance
 */
export function cappedChance(rating, opponentLevel, cap, balance) {
  return cap * reduction(rating, opponentLevel, balance);
}

// Damage multiplier from the stat a weapon or attack uses. The bonus has the
// same diminishing return against the attacker's own level, so damage grows
// like HP with the level and fights last about as long at level 5 as at 500.
/**
 * @param {number} stat
 * @param {number} level
 * @param {Balance} balance
 */
export function damageScale(stat, level, balance) {
  return 1 + balance.combat.scalingMax * reduction(stat, level, balance);
}

/**
 * @param {number} dexterity
 * @param {number} level
 * @param {Balance} balance
 */
export function speed(dexterity, level, balance) {
  const { speedMax, speedKBase, speedKPerLevel } = balance.combat;
  return 1 + ((speedMax - 1) * dexterity) / (dexterity + speedKBase + speedKPerLevel * level);
}

// HP grows with Vitality and with each class level, by as much as the class
// gives (perClassLevel in data/classes.json).
/**
 * @param {number} vitality
 * @param {number} classLevel
 * @param {PerClassLevel} perClassLevel
 * @param {Balance} balance
 */
export function maxHp(vitality, classLevel, perClassLevel, balance) {
  const { hpBase, hpPerVitality } = balance.character;
  return Math.round(hpBase + hpPerVitality * vitality + perClassLevel.hp * classLevel);
}

// Mana grows with Wisdom and, so that every class can use its skills, with
// each class level, by as much as the class gives.
/**
 * @param {number} wisdom
 * @param {number} classLevel
 * @param {PerClassLevel} perClassLevel
 * @param {Balance} balance
 */
export function maxMana(wisdom, classLevel, perClassLevel, balance) {
  const { manaBase, manaPerWisdom } = balance.character;
  return Math.round(manaBase + manaPerWisdom * wisdom + perClassLevel.mana * classLevel);
}

// Stat budget of an item (or of a monster's natural weapon and hide) at a level.
/**
 * @param {number} level
 * @param {number} rarityBudget
 * @param {Balance} balance
 */
export function budget(level, rarityBudget, balance) {
  return (balance.items.budgetBase + balance.items.budgetPerLevel * level) * rarityBudget;
}

/**
 * @param {number} baseBudget
 * @param {number} damageFactor
 * @param {Balance} balance
 */
export function weaponDamage(baseBudget, damageFactor, balance) {
  return (balance.items.damageBase + baseBudget * balance.items.damagePerBudget) * damageFactor;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
