// @ts-check
// Skills (data/skills.json). At a class level milestone (classLevel, today
// only 10) the character learns one of the skills of its class there for a
// Skill Point, for good: its main development path (each skill's `path`),
// which will decide the class's evolutions. From
// balance.skills.secondClassLevel it may learn one more of them for a point,
// and the path left closes: of the three it knows at most
// balance.skills.paths. The first learned stays first in `character.skills`
// (keys keep the order they were added in). Every class level from
// unlockClassLevel to lastPointClassLevel brings Skill Points, and each point
// learns a skill or raises a learned one by a level, up to maxLevel. A skill's
// numbers grow evenly from level 1 to the top level ([from, to] in its
// params). The fight (combat.js) uses learned skills by their kind.
//
// After the class's evolution (evolutions.js) its skills are the
// evolution's two: they start at level 0, take the points back, grow to the
// evolutions' own top level (a skill's maxLevel) and the class levels after
// the evolution bring more points for them. The second form (class level
// 100) does the same once more, with a higher top level.

import { counted, decimalText, word } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character, as its row keeps it. */
/**
 * @typedef {{
 *   id: string, name: string, classId: string, classLevel: number, kind: string, mana: number,
 *   params: Record<string, any>, effect: string, cooldown?: number, once?: boolean, maxLevel?: number,
 *   evolution?: string, from?: string, path?: string, style?: string, rarity?: string, description?: string,
 * }} Skill A skill of data/skills.json, or an evolution's (content.js).
 */
/** @typedef {{ code: string, message: string }} Block Why a skill cannot be learned or raised. */

// Kinds used instead of a plain blow on the character's move, at the start of
// a fight, and the moment its HP falls below the skill's mark; a stance
// (evolutions) wakes at the start of the character's move, besides its blow,
// and lasts a few of its moves. Harmonia żywiołów (harmony) works from the
// start of a fight.
export const ACTIVE_KINDS = new Set(['strike', 'sweep', 'heal', 'summon', 'mark', 'whirl']);
export const START_KINDS = new Set(['buff', 'coat', 'riposte', 'harmony']);
export const WOUND_KINDS = new Set(['guard', 'shield', 'evade']);
export const STANCE_KINDS = new Set(['stance']);

/**
 * @param {string} classId
 * @param {Content} content
 * @returns {Skill[]}
 */
export const skillsOfClass = (classId, content) => content.skills.filter((/** @type {Skill} */ skill) => skill.classId === classId);

// The top level of a skill: an evolution's own, else that of the classes'.
/**
 * @param {Skill} skill
 * @param {Content} content
 * @returns {number}
 */
export const topLevel = (skill, content) => skill.maxLevel ?? content.balance.skills.maxLevel;

// The stage of the character's evolution: 0 without one, 1 after the first,
// 2 after its second form. An evolution the deployment has off counts as a
// first one.
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {number}
 */
export const evolutionStage = (character, content) => (character.evolution ? (content.evolutionsById[character.evolution]?.stage ?? 1) : 0);

// The rules of each evolution stage's skills and points, the first one's
// first (content.js).
/**
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
const stagesOf = (content) => content.evolutionStages ?? (content.evolutionRules ? [content.evolutionRules] : []);

// The numbers of a skill at a level: a pair grows evenly from level 1 to the
// top level, a single value stays.
/**
 * @param {Skill} skill
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function skillParams(skill, level, content) {
  const top = topLevel(skill, content);
  const share = (Math.min(Math.max(level, 1), top) - 1) / (top - 1);
  return Object.fromEntries(
    Object.entries(skill.params).map(([key, value]) => [key, Array.isArray(value) ? value[0] + (value[1] - value[0]) * share : value]),
  );
}

// Skill Points: earned from the class level of the first milestone on, that
// one included (the author: "10 poziom powinien dawać już 1 Punkt
// Umiejętności"), up to lastPointClassLevel (the author: "nie dostaje
// punktu przy awansie z 49 na 50 lvl"), and spent one per level of each
// learned skill, the first level of the main path too (the author:
// "żadnych bonusów na start"). So they fill both paths to the top level,
// with none left (tools/validate-data.mjs).
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {{ earned: number, spent: number, free: number }}
 */
export function skillPoints(character, content) {
  const { unlockClassLevel, lastPointClassLevel, pointsPerClassLevel } = content.balance.skills;
  let earned = Math.max(0, Math.min(character.classLevel, lastPointClassLevel) - unlockClassLevel + 1) * pointsPerClassLevel;
  // After each evolution the class levels up to its last point bring more
  // (the author: 40 back and 50 of class levels 50–99, 45 + 45; after the
  // second form 90 back and 100 of class levels 100–199, 95 + 95).
  let last = lastPointClassLevel;
  for (const rules of stagesOf(content).slice(0, evolutionStage(character, content))) {
    earned += Math.max(0, Math.min(character.classLevel, rules.lastPointClassLevel) - last) * rules.pointsPerClassLevel;
    last = rules.lastPointClassLevel;
  }
  const spent = Object.values(character.skills ?? {}).reduce((sum, level) => sum + level, 0);
  return { earned, spent, free: Math.max(0, earned - spent) };
}

// Whether a Skill Point is left that a learned skill could take, counted
// with the points the character has at class level `level` (an evolution
// level ahead), so a report of several class levels cannot slip past it.
/**
 * @param {Character} character
 * @param {number} level
 * @param {Content} content
 * @returns {boolean}
 */
export function pointsLeft(character, level, content) {
  const { free } = skillPoints({ ...character, classLevel: Math.max(character.classLevel, level) }, content);
  return free > 0 && Object.entries(character.skills ?? {}).some(([id, skillLevel]) => content.skillsById[id] && skillLevel < topLevel(content.skillsById[id], content));
}

// The skills of a milestone the character knows, in the order it learned them.
/**
 * @param {Skill[]} pool
 * @param {Record<string, number>} learned
 * @returns {Skill[]}
 */
const knownOf = (pool, learned) =>
  /** @type {Skill[]} */ (
    Object.keys(learned)
      .map((id) => pool.find((skill) => skill.id === id))
      .filter(Boolean)
  );

// The skills a character learned, with their numbers at their levels; an
// evolution's skill without a point yet does nothing.
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {{ id: string, name: string, kind: string, mana: number, cooldown: number, once: boolean, level: number, params: Record<string, any> }[]}
 */
export function learnedSkills(character, content) {
  return Object.entries(character.skills ?? {})
    .filter(([id, level]) => content.skillsById[id] && level > 0)
    .map(([id, level]) => {
      const def = content.skillsById[id];
      return { id, name: def.name, kind: def.kind, mana: def.mana, cooldown: def.cooldown ?? 1, once: def.once === true, level, params: skillParams(def, level, content) };
    });
}

// Why a character cannot learn a skill, or null when it can: it must be of
// its class and at the milestone's class level, and each takes a Skill
// Point. Another one than the first waits for secondClassLevel, and no more
// than `paths` of a milestone can be known.
/**
 * @param {Character} character
 * @param {string} skillId
 * @param {Content} content
 * @returns {Block | null}
 */
export function learnBlock(character, skillId, content) {
  const skill = content.skillsById[skillId];
  if (!skill || skill.classId !== character.classId) return { code: 'unknown_skill', message: 'Twoja klasa nie ma takiej umiejętności.' };
  if (character.evolution || skill.evolution) return { code: 'evolution', message: 'Umiejętności ewolucji przychodzą z ewolucją, a ścieżki klasy znikają po niej.' };
  if (character.classLevel < skill.classLevel) {
    return { code: 'class_level', message: `Tę umiejętność wybierzesz od poziomu klasy ${skill.classLevel}.` };
  }
  const learned = character.skills ?? {};
  if (learned[skill.id]) return { code: 'known', message: 'Tę umiejętność już znasz.' };
  const { paths, secondClassLevel } = content.balance.skills;
  const pool = skillsOfClass(skill.classId, content).filter((other) => other.classLevel === skill.classLevel);
  const known = knownOf(pool, learned);
  if (known.length >= paths) return { code: 'chosen', message: 'Masz już dwie ścieżki tego wyboru. Trzecia jest zamknięta.' };
  if (known.length > 0 && character.classLevel < secondClassLevel) {
    return { code: 'class_level', message: `Ścieżkę poboczną dobierzesz od poziomu klasy ${secondClassLevel}.` };
  }
  if (skillPoints(character, content).free < 1) {
    return { code: 'no_points', message: known.length > 0 ? 'Ścieżka poboczna kosztuje 1 Punkt Umiejętności.' : 'Ścieżka główna kosztuje 1 Punkt Umiejętności.' };
  }
  return null;
}

// What the skills still need before the class's first evolution (the first
// of balance.progression.classEvolutionLevels), or null when nothing: every
// milestone below it with `paths` skills known (code second_path), and no
// Skill Point left that a known skill could take (skill_points). Counted with
// the points the character has at that level, so a report of several class
// levels cannot slip past it.
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {{ code: string } | null}
 */
export function skillsBlock(character, content) {
  const level = content.balance.progression.classEvolutionLevels[0];
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

// Why the class waits at an evolution level, or null: { code, level }. Up
// to the first evolution, while the skills are not ready for it
// (skillsBlock), and when they are, until the evolution is chosen (evolve).
// After it, at the next evolution level while a Skill Point is left (the
// author, E8), and then until the second form is taken (evolve); after the
// second form, at the level after it while a point is left. The class
// waits there (applyHunt); a class already past the level waits for
// nothing.
/**
 * @param {Character} character
 * @param {Content} content
 * @returns {{ code: string, level: number } | null}
 */
export function evolutionBlock(character, content) {
  const levels = content.balance.progression.classEvolutionLevels;
  if (character.evolution) {
    const current = content.evolutionsById[character.evolution];
    const level = levels[current?.stage ?? 1];
    if (level === undefined || character.classLevel > level) return null;
    if (pointsLeft(character, level, content)) return { code: 'skill_points', level };
    return current && content.evolutions.some((/** @type {Record<string, any>} */ evolution) => evolution.from === current.id) ? { code: 'evolve', level } : null;
  }
  const level = levels[0];
  if (character.classLevel > level) return null;
  const block = skillsBlock(character, content);
  if (block) return { ...block, level };
  return content.evolutions.some((/** @type {Record<string, any>} */ evolution) => evolution.classId === character.classId) ? { code: 'evolve', level } : null;
}

// Why a learned skill cannot take `count` points at once, or null when it
// can.
/**
 * @param {Character} character
 * @param {string} skillId
 * @param {Content} content
 * @param {number} [count]
 * @returns {Block | null}
 */
export function raiseBlock(character, skillId, content, count = 1) {
  const level = character.skills?.[skillId];
  if (level === undefined || !content.skillsById[skillId]) return { code: 'not_learned', message: 'Tej umiejętności jeszcze nie znasz.' };
  const top = topLevel(content.skillsById[skillId], content);
  if (level >= top) return { code: 'max_level', message: 'Ta umiejętność ma już najwyższy poziom.' };
  if (level + count > top) return { code: 'max_level', message: 'Ta umiejętność nie ma już tylu poziomów do zdobycia.' };
  const { free } = skillPoints(character, content);
  if (free < 1) return { code: 'no_points', message: 'Nie masz wolnych Punktów Umiejętności.' };
  if (free < count) return { code: 'no_points', message: 'Nie masz tylu wolnych Punktów Umiejętności.' };
  return null;
}

// The skill's effect in words at its numbers. {name} is a whole number,
// {name%} a percent, {name%.1} a percent with one decimal, {name pp}
// percentage points, {name.1} one decimal, {cooldown} the cooldown,
// {critPower%} the power with a critical hit and {name|one|few|many} the
// number with its words in their form (counted, text.js); the decimals and
// the points as the content's language writes them ("2,5", "2.5"; word()).
/**
 * @param {string} template
 * @param {Skill} skill
 * @param {Record<string, any>} params
 * @param {Content} content
 * @returns {string}
 */
export function skillText(template, skill, params, content) {
  // A critical hit as the fight deals it (combat.js): with the crit damage
  // of the trait of the skill's evolution (Egzekucja: Zabójcza precyzja;
  // the code review, 12.11.2026: the card left it out).
  const evolution = skill.evolution ? content.evolutionsById?.[skill.evolution] : null;
  const critDamage = evolution?.trait?.params?.critDamage ?? 0;
  /** @type {Record<string, any>} */
  const values = { ...params, cooldown: skill.cooldown, critPower: (params.power ?? 0) * content.balance.combat.critMultiplier * (1 + critDamage) };
  return counted(template, values).replace(/\{(\w+)(%\.1|%| pp|\.1)?\}/g, (whole, name, format) => {
    const value = values[name];
    if (typeof value !== 'number') return whole;
    if (format === '%.1') return `${decimalText(value * 100, content)}%`;
    if (format === '%') return `${Math.round(value * 100)}%`;
    if (format === ' pp') return word(content, '{value} pkt proc.', { value: Math.round(value * 100) });
    if (format === '.1') return decimalText(value, content);
    return String(Math.round(value));
  }).replace('proc..', 'proc.');
}

// The line about the cost and how often the skill works; a mana shield
// costs its share of mana at the skill's level (`params`, skillParams), and
// a skill marked `once` works once a fight.
/**
 * @param {Skill} skill
 * @param {Content} content
 * @param {Record<string, any>} [params]
 * @returns {string}
 */
export function skillCost(skill, content, params = skill.params) {
  if (typeof params.pool === 'number') return content.texts.skillCostPool[0].replace('{pool}', `${Math.round(params.pool * 100)}%`);
  const key = skill.once ? 'skillCostOnce' : ACTIVE_KINDS.has(skill.kind) || STANCE_KINDS.has(skill.kind) ? 'skillCostActive' : START_KINDS.has(skill.kind) ? 'skillCostStart' : 'skillCostOnce';
  return content.texts[key][0].replace('{mana}', String(skill.mana)).replace('{cooldown}', String(skill.cooldown ?? 1));
}

// A skill's card: what it does at a level and, below the top, at the next.
/**
 * @param {Skill} skill
 * @param {number} level
 * @param {Content} content
 */
export function skillView(skill, level, content) {
  const top = topLevel(skill, content);
  const shown = Math.max(1, level);
  return {
    id: skill.id,
    name: skill.name,
    // An evolution's skill grown from one of the class's (evolutions.js).
    from: skill.from ?? null,
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
/**
 * @param {Character} character
 * @param {Content} content
 */
export function skillsView(character, content) {
  const learned = character.skills ?? {};
  const points = skillPoints(character, content);
  const { paths, secondClassLevel } = content.balance.skills;
  const evolution = character.evolution ? content.evolutionsById[character.evolution] : null;
  const levels = [...new Set(skillsOfClass(character.classId, content).map((skill) => skill.classLevel))].sort((a, b) => a - b);
  // The evolution's name over its skills, a woman's for a female character.
  const evolutionName = evolution && ((character.appearance === 'female' && evolution.nameFemale) || evolution.name);
  const pools = evolution
    ? // After the evolution: its two skills, the grown one first.
      [
        {
          classLevel: content.balance.progression.classEvolutionLevels[(evolution.stage ?? 1) - 1],
          open: true,
          evolution: evolution.id,
          chosen: evolution.skills,
          options: evolution.skills.map((/** @type {string} */ id, /** @type {number} */ index) => ({ ...skillView(content.skillsById[id], learned[id] ?? 0, content), path: evolutionName, state: index === 0 ? 'main' : 'second' })),
        },
      ]
    : levels.map((classLevel) => {
        const options = skillsOfClass(character.classId, content).filter((skill) => skill.classLevel === classLevel);
        const known = knownOf(options, learned).map((skill) => skill.id);
        /** @param {Skill} skill */
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
  const raisable = Object.entries(learned).some(([id, level]) => content.skillsById[id] && level < topLevel(content.skillsById[id], content));
  const block = evolutionBlock(character, content);
  return {
    unlockLevel: content.balance.skills.unlockClassLevel,
    lastPointLevel: evolution ? (stagesOf(content)[(evolution.stage ?? 1) - 1] ?? content.evolutionRules).lastPointClassLevel : content.balance.skills.lastPointClassLevel,
    secondLevel: secondClassLevel,
    paths,
    evolution: { level: block?.level ?? content.balance.progression.classEvolutionLevels[0], need: block?.code ?? null },
    points: points.free,
    pools,
    ready: pools.some((pool) => pool.options.some((/** @type {{ state: string }} */ skill) => skill.state === 'pick')) || (points.free > 0 && raisable),
  };
}
