// The order in which the game opens up during the tutorial (data/unlocks.json).
// An entry with a level opens at that character level; an entry with only a
// condition (the Core) stays closed until its own module opens it.

export function isUnlocked(id, level, content) {
  const unlock = content.unlocksById[id];
  return unlock.level !== undefined && level >= unlock.level;
}

export function unlockedFeatures(level, content) {
  return content.unlocks.filter((unlock) => isUnlocked(unlock.id, level, content)).map((unlock) => unlock.id);
}

// Exploration lengths: the shortest, then every step of the slider up to
// `longest` (1, 5, 10, 15… minutes).
export function durationsUpTo(longest, content) {
  const { minMinutes, stepMinutes } = content.balance.hunt;
  const durations = [minMinutes];
  for (let minutes = (Math.floor(minMinutes / stepMinutes) + 1) * stepMinutes; minutes <= longest; minutes += stepMinutes) {
    durations.push(minutes);
  }
  return durations;
}

// Before long hunts open, only the short durations can be chosen.
export function huntDurations(level, content) {
  const tuning = content.balance.hunt;
  const long = isUnlocked('long-hunts', level, content);
  return durationsUpTo(long ? tuning.maxMinutes : tuning.shortHuntMaxMinutes, content);
}

// An inner region opens when the class reaches the level just before its
// lowest one (areaUnlockLead in balance.json): a class at level 5 may explore
// the inner region of levels 6–10. The character chooses freely among the open
// ones, lower ones included.
export const areaUnlockLevel = (area, content) => Math.max(1, area.minLevel - content.balance.hunt.areaUnlockLead);

export const areaUnlocked = (area, classLevel, content) => classLevel >= areaUnlockLevel(area, content);

// System messages for the modules that open exactly at this level.
export function unlockMessages(level, content) {
  return content.unlocks.filter((unlock) => unlock.level === level && unlock.message).map((unlock) => unlock.message);
}
