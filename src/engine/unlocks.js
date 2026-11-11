// @ts-check
// The order in which the game opens up during the tutorial (data/unlocks.json).
// An entry with a level opens at that character level, one with a classLevel
// at that class level (the skills); an entry with only a condition (the Core)
// stays closed until its own module opens it.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, level?: number, classLevel?: number, huntMinutes?: number, message?: string, feature?: string }} Unlock An entry of data/unlocks.json. */
/** @typedef {{ minLevel: number }} Area An inner region (data/areas.json). */

/**
 * @param {Content} content
 * @returns {Unlock[]}
 */
const unlocksOf = (content) => content.unlocks;

/**
 * @param {string} id
 * @param {number} level
 * @param {Content} content
 * @param {number} [classLevel]
 */
export function isUnlocked(id, level, content, classLevel = 0) {
  /** @type {Unlock} */
  const unlock = content.unlocksById[id];
  if (unlock.level !== undefined) return level >= unlock.level;
  return unlock.classLevel !== undefined && classLevel >= unlock.classLevel;
}

/**
 * @param {number} level
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {string[]}
 */
export function unlockedFeatures(level, content, classLevel = 0) {
  return unlocksOf(content).filter((unlock) => isUnlocked(unlock.id, level, content, classLevel)).map((unlock) => unlock.id);
}

// Exploration lengths: the shortest, then every step of the slider up to
// `longest` (1, 5, 10, 15… minutes).
/**
 * @param {number} longest
 * @param {Content} content
 * @returns {number[]}
 */
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
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function longestHunt(level, content) {
  return unlocksOf(content).reduce(
    (longest, unlock) => (unlock.huntMinutes && isUnlocked(unlock.id, level, content) ? Math.max(longest, unlock.huntMinutes) : longest),
    /** @type {number} */ (content.balance.hunt.shortHuntMaxMinutes),
  );
}

/**
 * @param {number} level
 * @param {Content} content
 */
export const huntDurations = (level, content) => durationsUpTo(longestHunt(level, content), content);

// The next longer step and the level it opens at, or null at the longest.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ level: number, minutes: number } | null}
 */
export function nextHuntUnlock(level, content) {
  const longest = longestHunt(level, content);
  const next = /** @type {(Unlock & { level: number, huntMinutes: number })[]} */ (unlocksOf(content).filter((unlock) => (unlock.huntMinutes ?? 0) > longest && unlock.level !== undefined))
    .sort((a, b) => a.level - b.level)[0];
  return next ? { level: next.level, minutes: next.huntMinutes } : null;
}

// An inner region opens when the class reaches the level just before its
// lowest one (areaUnlockLead in balance.json): a class at level 5 may explore
// the inner region of levels 6–10. The character chooses freely among the open
// ones, lower ones included.
/**
 * @param {Area} area
 * @param {Content} content
 * @returns {number}
 */
export const areaUnlockLevel = (area, content) => Math.max(1, area.minLevel - content.balance.hunt.areaUnlockLead);

/**
 * @param {Area} area
 * @param {number} classLevel
 * @param {Content} content
 */
export const areaUnlocked = (area, classLevel, content) => classLevel >= areaUnlockLevel(area, content);

// How many inner regions a class opens on its way from one class level to
// another (above the first, up to the second).
/**
 * @param {number} fromClassLevel
 * @param {number} toClassLevel
 * @param {Content} content
 * @returns {number}
 */
export const areasOpened = (fromClassLevel, toClassLevel, content) =>
  content.areas.filter((/** @type {Area} */ area) => areaUnlockLevel(area, content) > fromClassLevel && areaUnlockLevel(area, content) <= toClassLevel).length;

// A module's System message shows only where its part of the game is on
// (`feature`, in content.features).
/**
 * @param {Unlock} unlock
 * @param {Content} content
 */
const told = (unlock, content) => unlock.message && (!unlock.feature || (content.features ?? []).includes(unlock.feature));

// System messages for the modules that open exactly at this level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {string[]}
 */
export function unlockMessages(level, content) {
  return unlocksOf(content).filter((unlock) => unlock.level === level && told(unlock, content)).map((unlock) => /** @type {string} */ (unlock.message));
}

// The same for the modules a class level opens.
/**
 * @param {number} classLevel
 * @param {Content} content
 * @returns {string[]}
 */
export function classUnlockMessages(classLevel, content) {
  return unlocksOf(content).filter((unlock) => unlock.classLevel === classLevel && told(unlock, content)).map((unlock) => /** @type {string} */ (unlock.message));
}
