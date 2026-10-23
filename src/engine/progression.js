// Experience, levels, the fainting penalty and HP regeneration between hunts.

// The level length is measured in hours of hunting at that level:
// hoursBase × level^hoursExponent, about 35 minutes at level 1 and about two
// days at level 50. XP per hour grows like monster XP (level^xpExponent);
// xpPerHourScale is set from the balance simulation (tools/simulate.mjs).
export function huntingHours(level, content) {
  const { hoursBase, hoursExponent } = content.balance.progression;
  return hoursBase * level ** hoursExponent;
}

export function xpToNext(level, content) {
  return Math.max(1, Math.round(xpPerHour(level, content) * huntingHours(level, content)));
}

// XP per hour of hunting at a level, in a region that suits it: the scale the
// curve above was set with.
export function xpPerHour(level, content) {
  const { progression, rewards } = content.balance;
  return progression.xpPerHourScale * level ** rewards.xpExponent;
}

export function hoursToNext(level, xp, content) {
  if (level >= content.balance.progression.maxLevel) return 0;
  return Math.max(0, xpToNext(level, content) - xp) / xpPerHour(level, content);
}

export function classXpToNext(level, content) {
  return Math.round(xpToNext(level, content) * content.balance.progression.classXpFactor);
}

export function gainXp(level, xp, gained, toNext, maxLevel) {
  let levels = 0;
  let current = xp + gained;
  while (level < maxLevel && current >= toNext(level)) {
    current -= toNext(level);
    level += 1;
    levels += 1;
  }
  return { level, xp: level >= maxLevel ? 0 : current, levels };
}

// Half of the XP needed for the current level, but never below the start of it.
export function faintPenalty(level, xp, content) {
  return Math.min(xp, Math.floor(content.balance.hunt.faintXpPenalty * xpToNext(level, content)));
}

export function monsterXp(monster, level, content) {
  const rewards = content.balance.rewards;
  return rewards.xpBase * level ** rewards.xpExponent * monster.reward.xp * (monster.elite ? rewards.eliteXpMultiplier : 1);
}

// Hunting far below your level gives clearly less XP.
export function lowLevelMultiplier(characterLevel, monsterLevel, content) {
  const hunt = content.balance.hunt;
  const levelsBelow = characterLevel - monsterLevel - hunt.lowLevelFreeDiff;
  return levelsBelow <= 0 ? 1 : Math.max(hunt.lowLevelMinMultiplier, 1 - hunt.lowLevelStepPenalty * levelsBelow);
}

export function regenPerMinute(maxHp, vitality, content) {
  const regen = content.balance.regen;
  return maxHp * (regen.perMinute + regen.perVitalityPerMinute * vitality);
}

// HP after resting from `since` to `now` (both server times in ms).
export function restedHp({ hp, since, now, maxHp, vitality }, content) {
  const minutes = Math.max(0, now - since) / 60000;
  return Math.min(maxHp, Math.floor(hp + regenPerMinute(maxHp, vitality, content) * minutes));
}
