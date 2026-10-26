// Skills (data/skills.json). At a class level milestone (classLevel, today
// only 10) the character learns one of the skills of its class there, for
// good: its main development path (each skill's `path`), which will decide
// the class's evolutions. From balance.skills.secondClassLevel it may learn
// one more of them for a Skill Point, and the path left closes: of the three
// it knows at most balance.skills.paths. The first learned stays first in
// `character.skills` (keys keep the order they were added in). Every class
// level after unlockClassLevel brings Skill Points, and each point raises a
// learned skill by a level, up to maxLevel. A skill's numbers grow evenly
// from level 1 to the top level ([from, to] in its params). The fight
// (combat.js) uses learned skills by their kind.

// Kinds used instead of a plain blow on the character's move, at the start of
// a fight, and the moment its HP falls below the skill's mark.
export const ACTIVE_KINDS = new Set(['strike', 'sweep', 'heal']);
export const START_KINDS = new Set(['buff', 'coat']);
export const WOUND_KINDS = new Set(['guard', 'shield', 'evade']);

export const skillsOfClass = (classId, content) => content.skills.filter((skill) => skill.classId === classId);

// The numbers of a skill at a level: a pair grows evenly from level 1 to the
// top level, a single value stays.
export function skillParams(skill, level, content) {
  const top = content.balance.skills.maxLevel;
  const share = (Math.min(Math.max(level, 1), top) - 1) / (top - 1);
  return Object.fromEntries(
    Object.entries(skill.params).map(([key, value]) => [key, Array.isArray(value) ? value[0] + (value[1] - value[0]) * share : value]),
  );
}

// Skill Points: earned from the class levels after the first milestone,
// spent one per level of each learned skill, but for the first level of the
// first one, which the milestone gives.
export function skillPoints(character, content) {
  const { unlockClassLevel, pointsPerClassLevel } = content.balance.skills;
  const earned = Math.max(0, character.classLevel - unlockClassLevel) * pointsPerClassLevel;
  const levels = Object.values(character.skills ?? {});
  const spent = Math.max(0, levels.reduce((sum, level) => sum + level, 0) - (levels.length > 0 ? 1 : 0));
  return { earned, spent, free: Math.max(0, earned - spent) };
}

// The skills of a milestone the character knows, in the order it learned them.
const knownOf = (pool, learned) =>
  Object.keys(learned)
    .map((id) => pool.find((skill) => skill.id === id))
    .filter(Boolean);

// The skills a character learned, with their numbers at their levels.
export function learnedSkills(character, content) {
  return Object.entries(character.skills ?? {})
    .filter(([id]) => content.skillsById[id])
    .map(([id, level]) => {
      const def = content.skillsById[id];
      return { id, name: def.name, kind: def.kind, mana: def.mana, cooldown: def.cooldown ?? 1, once: def.once === true, level, params: skillParams(def, level, content) };
    });
}

// Why a character cannot learn a skill, or null when it can: it must be of
// its class and at the milestone's class level. The first of a milestone is
// free; another one waits for secondClassLevel and takes a Skill Point, and
// no more than `paths` of a milestone can be known.
export function learnBlock(character, skillId, content) {
  const skill = content.skillsById[skillId];
  if (!skill || skill.classId !== character.classId) return { code: 'unknown_skill', message: 'Twoja klasa nie ma takiej umiejętności.' };
  if (character.classLevel < skill.classLevel) {
    return { code: 'class_level', message: `Tę umiejętność wybierzesz od poziomu klasy ${skill.classLevel}.` };
  }
  const learned = character.skills ?? {};
  if (learned[skill.id]) return { code: 'known', message: 'Tę umiejętność już znasz.' };
  const { paths, secondClassLevel } = content.balance.skills;
  const pool = skillsOfClass(skill.classId, content).filter((other) => other.classLevel === skill.classLevel);
  const known = knownOf(pool, learned);
  if (known.length >= paths) return { code: 'chosen', message: 'Masz już dwie ścieżki tego wyboru. Trzecia jest zamknięta.' };
  if (known.length > 0) {
    if (character.classLevel < secondClassLevel) {
      return { code: 'class_level', message: `Ścieżkę poboczną dobierzesz od poziomu klasy ${secondClassLevel}.` };
    }
    if (skillPoints(character, content).free < 1) return { code: 'no_points', message: 'Ścieżka poboczna kosztuje 1 Punkt Umiejętności.' };
  }
  return null;
}

// What the skills still need before the class's first evolution (the first
// of balance.progression.classEvolutionLevels), or null when nothing: every
// milestone below it with `paths` skills known (code second_path), and no
// Skill Point left that a known skill could take (skill_points). Counted with
// the points the character has at that level, so a report of several class
// levels cannot slip past it. Until then the class waits at that level
// (applyHunt); a class already past it waits for nothing.
export function evolutionBlock(character, content) {
  const level = content.balance.progression.classEvolutionLevels[0];
  if (character.classLevel > level) return null;
  const { maxLevel, paths } = content.balance.skills;
  const learned = character.skills ?? {};
  const pools = [...new Set(skillsOfClass(character.classId, content).map((skill) => skill.classLevel))].filter((classLevel) => classLevel < level);
  for (const classLevel of pools) {
    const pool = skillsOfClass(character.classId, content).filter((skill) => skill.classLevel === classLevel);
    if (knownOf(pool, learned).length < Math.min(paths, pool.length)) {
      return { code: 'second_path' };
    }
  }
  const { free } = skillPoints({ ...character, classLevel: Math.max(character.classLevel, level) }, content);
  const raisable = Object.entries(learned).some(([id, skillLevel]) => content.skillsById[id] && skillLevel < maxLevel);
  if (free > 0 && raisable) return { code: 'skill_points' };
  return null;
}

// Why a learned skill cannot take a point, or null when it can.
export function raiseBlock(character, skillId, content) {
  const level = character.skills?.[skillId];
  if (!level) return { code: 'not_learned', message: 'Tej umiejętności jeszcze nie znasz.' };
  if (level >= content.balance.skills.maxLevel) return { code: 'max_level', message: 'Ta umiejętność ma już najwyższy poziom.' };
  if (skillPoints(character, content).free < 1) return { code: 'no_points', message: 'Nie masz wolnych Punktów Umiejętności.' };
  return null;
}

// The skill's effect in words at its numbers. {name} is a whole number,
// {name%} a percent, {name%.1} a percent with one decimal, {name pp}
// percentage points, {name.1} one decimal, {cooldown} the cooldown and
// {critPower%} the power with a critical hit.
const decimal = (value) => String(Math.round(value * 10) / 10).replace('.', ',');

export function skillText(template, skill, params, content) {
  const values = { ...params, cooldown: skill.cooldown, critPower: (params.power ?? 0) * content.balance.combat.critMultiplier };
  return template.replace(/\{(\w+)(%\.1|%| pp|\.1)?\}/g, (whole, name, format) => {
    const value = values[name];
    if (typeof value !== 'number') return whole;
    if (format === '%.1') return `${decimal(value * 100)}%`;
    if (format === '%') return `${Math.round(value * 100)}%`;
    if (format === ' pp') return `${Math.round(value * 100)} pkt proc.`;
    if (format === '.1') return decimal(value);
    return String(Math.round(value));
  }).replace('proc..', 'proc.');
}

// The line about the cost and how often the skill works; a mana shield
// costs its share of mana at the skill's level (`params`, skillParams), and
// a skill marked `once` works once a fight.
export function skillCost(skill, content, params = skill.params) {
  if (typeof params.pool === 'number') return content.texts.skillCostPool[0].replace('{pool}', `${Math.round(params.pool * 100)}%`);
  const key = skill.once ? 'skillCostOnce' : ACTIVE_KINDS.has(skill.kind) ? 'skillCostActive' : START_KINDS.has(skill.kind) ? 'skillCostStart' : 'skillCostOnce';
  return content.texts[key][0].replace('{mana}', String(skill.mana)).replace('{cooldown}', String(skill.cooldown ?? 1));
}

// A skill's card: what it does at a level and, below the top, at the next.
export function skillView(skill, level, content) {
  const top = content.balance.skills.maxLevel;
  const shown = Math.max(1, level);
  return {
    id: skill.id,
    name: skill.name,
    path: skill.path,
    style: skill.style,
    rarity: skill.rarity,
    classLevel: skill.classLevel,
    description: skill.description,
    // 0: not learned; the card then shows the effect at level 1.
    level,
    maxLevel: top,
    effect: skillText(skill.effect, skill, skillParams(skill, shown, content), content),
    next: level > 0 && level < top ? skillText(skill.effect, skill, skillParams(skill, level + 1, content), content) : null,
    cost: skillCost(skill, content, skillParams(skill, shown, content)),
  };
}

// The Umiejętności tab: the paths of each milestone of the class, each with
// its skill, the skills learned and the free points. A path's `state`: main
// or second (learned, in that order), pick (can be learned now), soon (the
// second waits for its class level), points (the second waits for a free
// Skill Point), closed (two are known, this one is shut) or locked (the
// milestone's class level is not reached). `ready` is true when there is
// something to do there: a path to pick or a point to spend. `evolution`:
// the first evolution's class level and `need`, what the skills still need
// before it (evolutionBlock's code, or null).
export function skillsView(character, content) {
  const learned = character.skills ?? {};
  const points = skillPoints(character, content);
  const { maxLevel, paths, secondClassLevel } = content.balance.skills;
  const levels = [...new Set(skillsOfClass(character.classId, content).map((skill) => skill.classLevel))].sort((a, b) => a - b);
  const pools = levels.map((classLevel) => {
    const options = skillsOfClass(character.classId, content).filter((skill) => skill.classLevel === classLevel);
    const known = knownOf(options, learned).map((skill) => skill.id);
    const stateOf = (skill) => {
      if (known[0] === skill.id) return 'main';
      if (known.includes(skill.id)) return 'second';
      const block = learnBlock(character, skill.id, content);
      if (!block) return 'pick';
      if (block.code === 'chosen') return 'closed';
      if (block.code === 'no_points') return 'points';
      return known.length > 0 ? 'soon' : 'locked';
    };
    return {
      classLevel,
      open: character.classLevel >= classLevel,
      chosen: known,
      options: options.map((skill) => ({ ...skillView(skill, learned[skill.id] ?? 0, content), state: stateOf(skill) })),
    };
  });
  const raisable = Object.entries(learned).some(([id, level]) => content.skillsById[id] && level < maxLevel);
  const block = evolutionBlock(character, content);
  return {
    unlockLevel: content.balance.skills.unlockClassLevel,
    secondLevel: secondClassLevel,
    paths,
    evolution: { level: content.balance.progression.classEvolutionLevels[0], need: block?.code ?? null },
    points: points.free,
    pools,
    ready: pools.some((pool) => pool.options.some((skill) => skill.state === 'pick')) || (points.free > 0 && raisable),
  };
}
