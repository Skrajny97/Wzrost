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

// Before long hunts open, only the short durations can be chosen.
export function huntDurations(level, content) {
  const tuning = content.balance.hunt;
  const long = isUnlocked('long-hunts', level, content);
  return tuning.durations.filter((minutes) => long || minutes <= tuning.shortHuntMaxMinutes);
}

// System messages for the modules that open exactly at this level.
export function unlockMessages(level, content) {
  return content.unlocks.filter((unlock) => unlock.level === level && unlock.message).map((unlock) => unlock.message);
}
