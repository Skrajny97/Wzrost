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

// Hunt lengths go from the shortest up to `longest` in equal steps (the slider's).
export function durationsUpTo(longest, content) {
  const { minMinutes, stepMinutes } = content.balance.hunt;
  const durations = [];
  for (let minutes = minMinutes; minutes <= longest; minutes += stepMinutes) durations.push(minutes);
  return durations;
}

// Before long hunts open, only the short durations can be chosen.
export function huntDurations(level, content) {
  const tuning = content.balance.hunt;
  const long = isUnlocked('long-hunts', level, content);
  return durationsUpTo(long ? tuning.maxMinutes : tuning.shortHuntMaxMinutes, content);
}

// System messages for the modules that open exactly at this level.
export function unlockMessages(level, content) {
  return content.unlocks.filter((unlock) => unlock.level === level && unlock.message).map((unlock) => unlock.message);
}
