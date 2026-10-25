// The order in which the game opens up during the tutorial (data/unlocks.json).
// An entry with a level opens at that character level, one with a classLevel
// at that class level (the skills); an entry with only a condition (the Core)
// stays closed until its own module opens it.

export function isUnlocked(id, level, content, classLevel = 0) {
  const unlock = content.unlocksById[id];
  if (unlock.level !== undefined) return level >= unlock.level;
  return unlock.classLevel !== undefined && classLevel >= unlock.classLevel;
}

export function unlockedFeatures(level, content, classLevel = 0) {
  return content.unlocks.filter((unlock) => isUnlocked(unlock.id, level, content, classLevel)).map((unlock) => unlock.id);
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

// Hunts grow longer in steps (huntMinutes in unlocks.json): up to
// shortHuntMaxMinutes at first, then up to the longest step unlocked.
export function longestHunt(level, content) {
  return content.unlocks.reduce(
    (longest, unlock) => (unlock.huntMinutes && isUnlocked(unlock.id, level, content) ? Math.max(longest, unlock.huntMinutes) : longest),
    content.balance.hunt.shortHuntMaxMinutes,
  );
}

export const huntDurations = (level, content) => durationsUpTo(longestHunt(level, content), content);

// The next longer step and the level it opens at, or null at the longest.
export function nextHuntUnlock(level, content) {
  const longest = longestHunt(level, content);
  const next = content.unlocks
    .filter((unlock) => unlock.huntMinutes > longest && unlock.level !== undefined)
    .sort((a, b) => a.level - b.level)[0];
  return next ? { level: next.level, minutes: next.huntMinutes } : null;
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

// The same for the modules a class level opens.
export function classUnlockMessages(classLevel, content) {
  return content.unlocks.filter((unlock) => unlock.classLevel === classLevel && unlock.message).map((unlock) => unlock.message);
}
