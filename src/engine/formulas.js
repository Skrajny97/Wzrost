// Shared combat and economy formulas. Every constant comes from data/balance.json.

// K from the design document: it grows with the opponent's level, so a fixed
// amount of armor, resistance, dodge or crit is worth less against stronger foes.
export function kValue(level, balance) {
  return balance.combat.kBase + balance.combat.kPerLevel * level;
}

// Diminishing returns: P / (P + K). Never reaches 1, so nobody becomes immortal.
export function reduction(value, opponentLevel, balance) {
  return value > 0 ? value / (value + kValue(opponentLevel, balance)) : 0;
}

export function cappedChance(rating, opponentLevel, cap, balance) {
  return cap * reduction(rating, opponentLevel, balance);
}

// Damage multiplier from the stat a weapon or attack uses. The bonus has the
// same diminishing return against the attacker's own level, so damage grows
// like HP with the level and fights last about as long at level 5 as at 500.
export function damageScale(stat, level, balance) {
  return 1 + balance.combat.scalingMax * reduction(stat, level, balance);
}

export function speed(dexterity, level, balance) {
  const { speedMax, speedKBase, speedKPerLevel } = balance.combat;
  return 1 + ((speedMax - 1) * dexterity) / (dexterity + speedKBase + speedKPerLevel * level);
}

export function maxHp(vitality, level, balance) {
  const { hpBase, hpPerVitality, hpPerLevel } = balance.character;
  return Math.round(hpBase + hpPerVitality * vitality + hpPerLevel * level);
}

export function maxMana(wisdom, balance) {
  return Math.round(balance.character.manaBase + balance.character.manaPerWisdom * wisdom);
}

// Stat budget of an item (or of a monster's natural weapon and hide) at a level.
export function budget(level, rarityBudget, balance) {
  return (balance.items.budgetBase + balance.items.budgetPerLevel * level) * rarityBudget;
}

export function weaponDamage(baseBudget, damageFactor, balance) {
  return (balance.items.damageBase + baseBudget * balance.items.damagePerBudget) * damageFactor;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
