// Skills (data/skills.json). At a class level milestone (classLevel, today
// only 10) the character learns one of the skills of its class there, for
// good. Every class level after balance.skills.unlockClassLevel brings Skill
// Points, and each point raises a learned skill by a level, up to maxLevel.
// A skill's numbers grow evenly from level 1 to the top level ([from, to] in
// its params). The fight (combat.js) uses learned skills by their kind.

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
// spent one per level above 1 of each learned skill.
export function skillPoints(character, content) {
  const { unlockClassLevel, pointsPerClassLevel } = content.balance.skills;
  const earned = Math.max(0, character.classLevel - unlockClassLevel) * pointsPerClassLevel;
  const spent = Object.values(character.skills ?? {}).reduce((sum, level) => sum + level - 1, 0);
  return { earned, spent, free: Math.max(0, earned - spent) };
}

// The skills a character learned, with their numbers at their levels.
export function learnedSkills(character, content) {
  return Object.entries(character.skills ?? {})
    .filter(([id]) => content.skillsById[id])
    .map(([id, level]) => {
      const def = content.skillsById[id];
      return { id, name: def.name, kind: def.kind, mana: def.mana, cooldown: def.cooldown ?? 1, level, params: skillParams(def, level, content) };
    });
}

// Why a character cannot learn a skill, or null when it can: it must be of
// its class, at the milestone's class level, and the only one of that pool.
export function learnBlock(character, skillId, content) {
  const skill = content.skillsById[skillId];
  if (!skill || skill.classId !== character.classId) return { code: 'unknown_skill', message: 'Twoja klasa nie ma takiej umiejętności.' };
  if (character.classLevel < skill.classLevel) {
    return { code: 'class_level', message: `Tę umiejętność wybierzesz od poziomu klasy ${skill.classLevel}.` };
  }
  const learned = character.skills ?? {};
  const pool = skillsOfClass(skill.classId, content).filter((other) => other.classLevel === skill.classLevel);
  if (pool.some((other) => learned[other.id])) return { code: 'chosen', message: 'Umiejętność z tego wyboru jest już wybrana.' };
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

// The line about the cost and how often the skill works.
export function skillCost(skill, content) {
  const key = ACTIVE_KINDS.has(skill.kind) ? 'skillCostActive' : START_KINDS.has(skill.kind) ? 'skillCostStart' : 'skillCostOnce';
  return content.texts[key][0].replace('{mana}', String(skill.mana)).replace('{cooldown}', String(skill.cooldown ?? 1));
}

// A skill's card: what it does at a level and, below the top, at the next.
export function skillView(skill, level, content) {
  const top = content.balance.skills.maxLevel;
  const shown = Math.max(1, level);
  return {
    id: skill.id,
    name: skill.name,
    style: skill.style,
    rarity: skill.rarity,
    classLevel: skill.classLevel,
    description: skill.description,
    // 0: not learned; the card then shows the effect at level 1.
    level,
    maxLevel: top,
    effect: skillText(skill.effect, skill, skillParams(skill, shown, content), content),
    next: level > 0 && level < top ? skillText(skill.effect, skill, skillParams(skill, level + 1, content), content) : null,
    cost: skillCost(skill, content),
  };
}

// The Umiejętności tab: the choices of each milestone of the class, the
// skills learned and the free points. `ready` is true when there is
// something to do there (a choice open or a point to spend).
export function skillsView(character, content) {
  const learned = character.skills ?? {};
  const points = skillPoints(character, content);
  const levels = [...new Set(skillsOfClass(character.classId, content).map((skill) => skill.classLevel))].sort((a, b) => a - b);
  const pools = levels.map((classLevel) => {
    const options = skillsOfClass(character.classId, content).filter((skill) => skill.classLevel === classLevel);
    const chosen = options.find((skill) => learned[skill.id]);
    return {
      classLevel,
      open: character.classLevel >= classLevel,
      chosen: chosen?.id ?? null,
      options: options.map((skill) => skillView(skill, learned[skill.id] ?? 0, content)),
    };
  });
  const raisable = Object.entries(learned).some(([id, level]) => content.skillsById[id] && level < content.balance.skills.maxLevel);
  return {
    unlockLevel: content.balance.skills.unlockClassLevel,
    points: points.free,
    pools,
    ready: pools.some((pool) => pool.open && !pool.chosen) || (points.free > 0 && raisable),
  };
}
