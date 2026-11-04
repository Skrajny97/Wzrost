// Experience, levels, the fainting penalty, HP regeneration between hunts and
// the Punkty Czasu that come with time.

// The level length is measured in hours of exploring at that level. The first
// levels take firstLevelMinutes each (a 5-minute exploration is enough), then
// the time grows like (level / flatLevels)^levelTimeExponent, and through the
// mid-game (midGame) by up to levelTimeFactor more. XP per hour grows like
// monster XP (level^xpExponent); xpPerHourScale is set from the balance
// simulation (tools/simulate.mjs).
export function huntingHours(level, content) {
  const { firstLevelMinutes, flatLevels, levelTimeExponent, midGame } = content.balance.progression;
  const base = (firstLevelMinutes / 60) * Math.max(1, level / flatLevels) ** levelTimeExponent;
  return base * midGameSlowdown(level, midGame);
}

// How many times longer a level takes for the mid-game: evenly more from
// fromLevel to levelTimeFactor at toLevel, then less again, geometrically,
// to none at fadeLevel, so that each level still takes longer than the one
// before it and the late game keeps its pace (about a day a level at 500).
function midGameSlowdown(level, midGame) {
  const { toLevel, fadeLevel, levelTimeFactor } = midGame;
  if (level <= toLevel) return 1 + (levelTimeFactor - 1) * midGameShare(level, midGame);
  return levelTimeFactor ** Math.max(0, 1 - Math.log(level / toLevel) / Math.log(fadeLevel / toLevel));
}

// How far a level is into the mid-game of `range` ({ fromLevel, toLevel }):
// 0 up to fromLevel, 1 from toLevel on, evenly between. The author: "krzywą
// wzrostu wyzwania musimy bardzo delikatnie podwyższyć … I oczywiscie chodzi
// o midgame, bo early musi byc latwiejssze", so the first levels keep their
// pace and monsters, and the mid-game levels take a little longer and their
// monsters hit a little harder (balance.monsters.midGame).
export function midGameShare(level, { fromLevel, toLevel }) {
  return Math.min(1, Math.max(0, (level - fromLevel) / (toLevel - fromLevel)));
}

// The level a character had `minutes` of exploring before reaching `level`.
export function levelBefore(level, minutes, content) {
  let left = minutes / 60;
  let before = level;
  while (before > 1 && left >= huntingHours(before - 1, content)) {
    left -= huntingHours(before - 1, content);
    before -= 1;
  }
  return before;
}

// The level of the items a character usually wears at a level: found half its
// exploring time ago, but at most gearLagMinutes ago. Monsters' natural weapons
// and hides follow it, so gear lags alike on both sides. Computed once per
// content for every level.
const gearTables = new WeakMap();
export function gearLevel(level, content) {
  let table = gearTables.get(content);
  if (!table) {
    const { maxLevel } = content.balance.progression;
    const lag = content.balance.monsters.gearLagMinutes;
    table = [1];
    let minutes = 0;
    for (let l = 1; l <= maxLevel + 5; l++) {
      table[l] = levelBefore(l, Math.min(lag, minutes / 2), content);
      minutes += huntingHours(l, content) * 60;
    }
    gearTables.set(content, table);
  }
  return table[Math.min(level, table.length - 1)];
}

// The first levels need less XP (earlyXpFactors): in the first inner region
// the monsters are mostly of levels 1–2, so a level 3–5 character earns less
// than the curve assumes.
export function xpToNext(level, content) {
  const factor = content.balance.progression.earlyXpFactors[level - 1] ?? 1;
  return Math.max(1, Math.round(xpPerHour(level, content) * huntingHours(level, content) * factor));
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

// `hold`: at maxLevel the XP keeps adding up instead of ending at 0, so a
// class waiting at its evolution level loses none of it: the levels come
// with the next XP after the wait.
export function gainXp(level, xp, gained, toNext, maxLevel, hold = false) {
  let levels = 0;
  let current = xp + gained;
  while (level < maxLevel && current >= toNext(level)) {
    current -= toNext(level);
    level += 1;
    levels += 1;
  }
  return { level, xp: level >= maxLevel && !hold ? 0 : current, levels };
}

// Half of the XP needed for the current level, but never below the start of
// it; `share` of it with the Warownia's Kapliczka (faintShare).
export function faintPenalty(level, xp, content, share = 1) {
  return Math.min(xp, Math.floor(share * content.balance.hunt.faintXpPenalty * xpToNext(level, content)));
}

export function monsterXp(monster, level, content) {
  const rewards = content.balance.rewards;
  const rank = monster.champion ? rewards.championXpMultiplier : monster.elite ? rewards.eliteXpMultiplier : 1;
  return rewards.xpBase * level ** rewards.xpExponent * monster.reward.xp * rank;
}

// Hunting far below your level gives clearly less XP.
export function lowLevelMultiplier(characterLevel, monsterLevel, content) {
  const hunt = content.balance.hunt;
  const levelsBelow = characterLevel - monsterLevel - hunt.lowLevelFreeDiff;
  return levelsBelow <= 0 ? 1 : Math.max(hunt.lowLevelMinMultiplier, 1 - hunt.lowLevelStepPenalty * levelsBelow);
}

// `bonus`: the share the camp adds to resting (Ognisko).
export function regenPerMinute(maxHp, vitality, content, bonus = 0) {
  const regen = content.balance.regen;
  return maxHp * (regen.perMinute + regen.perVitalityPerMinute * vitality) * (1 + bonus);
}

// HP after resting from `since` to `now` (both server times in ms). `change`
// ({ at, bonus }) is a new camp bonus from the time `at` on.
export function restedHp({ hp, since, now, maxHp, vitality, bonus = 0, change }, content) {
  const minutes = (from, to) => Math.max(0, to - from) / 60000;
  const switchAt = change ? Math.min(Math.max(change.at, since), now) : now;
  const gained =
    regenPerMinute(maxHp, vitality, content, bonus) * minutes(since, switchAt) +
    (change ? regenPerMinute(maxHp, vitality, content, change.bonus) * minutes(switchAt, now) : 0);
  return Math.min(maxHp, Math.floor(hp + gained));
}

// Punkty Czasu that time alone brings: one every generateMinutes since
// `since`, also while the player is away, with no limit. `since` moves on by
// whole intervals, so the time towards the next point carries on.
export function gainedTimePoints(since, now, content) {
  const every = content.balance.timePoints.generateMinutes * 60000;
  const points = Math.max(0, Math.floor((now - since) / every));
  return { points, since: since + points * every };
}
