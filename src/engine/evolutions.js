// Class evolutions (data/evolutions.json; DECISIONS.md, "Ewolucje: odpowiedzi
// autora" and "Ewolucje: budowa"). At the first class level of
// balance.progression.classEvolutionLevels the character chooses the
// evolution of one of its two paths (the skills it learned, the main one
// first). The class goes by the evolution's name, its stats grow by the
// evolution's growth from the next class level on, and it gains the
// evolution's trait. Its two skills make way for the evolution's two, at
// level 0, so the Skill Points they took come back for them; the other path
// is gone for good.
//
// At the second class level of the list (100) the evolution has one further
// form (its `from` names the evolution it grows out of; "Druga ewolucja
// klas"), taken without a choice the same way: a new name (a woman's too),
// a stronger trait, a bigger growth from the level after it and two skills
// of its own, the first grown out of one of the evolution's. The character
// keeps only the latest form (`character.evolution`); the line of forms
// before it follows from `from`.

import { pointsLeft, skillParams, skillText, skillsBlock } from './skills.js';

export const evolutionOf = (character, content) => (character.evolution ? (content.evolutionsById[character.evolution] ?? null) : null);

// The forms the character's class went through, the first evolution first
// and the one it has now last; none without an evolution.
export function evolutionLine(character, content) {
  const line = [];
  for (let evolution = evolutionOf(character, content); evolution && line.length < 10; evolution = evolution.from ? content.evolutionsById[evolution.from] : null) {
    line.unshift(evolution);
  }
  return line;
}

// The form an evolution grows into at the next evolution level, or null.
export const nextFormOf = (evolution, content) => (evolution ? (content.evolutions.find((other) => other.from === evolution.id) ?? null) : null);

// An evolution's name for a look: a woman's where it has one.
export const evolutionName = (evolution, appearance) => (appearance === 'female' && evolution.nameFemale) || evolution.name;

// The name the class goes by: its evolution's, else its own.
export function classNameOf(character, content) {
  const evolution = evolutionOf(character, content);
  return evolution ? evolutionName(evolution, character.appearance) : content.classesById[character.classId].name;
}

// The evolutions a character may choose: those of the paths it learned, the
// main one first. `all` (Testuj ewolucję, the test version only): every
// evolution of its class. Only first evolutions: a second form is not
// chosen, it grows out of one.
export function evolutionChoices(character, content, { all = false } = {}) {
  const ofClass = content.evolutions.filter((evolution) => evolution.classId === character.classId && !evolution.from);
  if (all) return ofClass;
  return Object.keys(character.skills ?? {})
    .map((id) => ofClass.find((evolution) => evolution.path === id))
    .filter(Boolean);
}

// Why a character cannot take an evolution, or null when it can: it has
// none yet, the evolution is one of its choices, and it is at the class
// level of the first evolution with its skills ready for it (the second
// path and the points, skillsBlock). A second form: the character has the
// evolution it grows out of, stands at the second evolution level and has
// no Skill Point left that a skill could take. `test` lifts the level and
// the skills and opens every first evolution of the class.
export function evolveBlock(character, evolutionId, content, { test = false } = {}) {
  const levels = content.balance.progression.classEvolutionLevels;
  const target = content.evolutionsById[evolutionId];
  if (target?.from) {
    const current = evolutionOf(character, content);
    if (current && current.stage >= target.stage) return { code: 'evolved', message: 'Ta postać przeszła już tę ewolucję.' };
    if (current?.id !== target.from) return { code: 'unknown_evolution', message: 'Ta ewolucja nie jest dla tej postaci.' };
    if (test) return null;
    const level = levels[target.stage - 1];
    if (character.classLevel < level) return { code: 'class_level', message: `Kolejną ewolucję przyjmiesz na ${level}. poziomie klasy.` };
    if (pointsLeft(character, level, content)) return { code: 'skill_points', message: content.evolutionTexts.nextNotReady };
    return null;
  }
  if (character.evolution) return { code: 'evolved', message: 'Ta postać przeszła już ewolucję.' };
  if (!evolutionChoices(character, content, { all: test }).some((evolution) => evolution.id === evolutionId)) {
    return { code: 'unknown_evolution', message: 'Ta ewolucja nie jest dla tej postaci.' };
  }
  if (test) return null;
  const level = levels[0];
  if (character.classLevel < level) return { code: 'class_level', message: `Ewolucję wybierzesz na ${level}. poziomie klasy.` };
  const block = skillsBlock(character, content);
  if (block) return { code: block.code, message: content.evolutionTexts.notReady };
  return null;
}

// The skills after the evolution: the evolution's two at level 0, so the
// points of the class's come back for them.
export const evolvedSkills = (evolutionId, content) => Object.fromEntries(content.evolutionsById[evolutionId].skills.map((id) => [id, 0]));

// The stretches of class levels and who grows the class over each: the
// class up to the first evolution's level, each form of the line from the
// level after its own evolution level up to the next one's, and the last
// form on from there.
export function classSpans(character, content) {
  const cls = content.classesById[character.classId];
  const line = evolutionLine(character, content);
  const levels = content.balance.progression.classEvolutionLevels;
  const spans = [{ owner: cls, from: 1, to: line.length > 0 ? levels[0] : Infinity }];
  line.forEach((evolution, index) => spans.push({ owner: evolution, from: levels[index] + 1, to: index < line.length - 1 ? levels[index + 1] : Infinity }));
  return spans;
}

// How many class levels from `lowest` up to `classLevel` fall in a span.
export const levelsIn = (span, lowest, classLevel) => Math.max(0, Math.min(span.to, classLevel) - Math.max(span.from, lowest) + 1);

// HP and mana per class level as a whole: the class's up to the evolution,
// each form's own (perClassLevel, else the form's before it, or the
// class's) after it, so the formulas (formulas.js) give the sum of all.
export function perClassLevelOf(character, content) {
  const cls = content.classesById[character.classId];
  let rate = cls.perClassLevel;
  let own = false;
  const total = { hp: 0, mana: 0 };
  for (const span of classSpans(character, content)) {
    if (span.owner !== cls && span.owner.perClassLevel) rate = span.owner.perClassLevel;
    const count = levelsIn(span, 1, character.classLevel);
    if (count > 0 && rate !== cls.perClassLevel) own = true;
    total.hp += rate.hp * count;
    total.mana += rate.mana * count;
  }
  if (!own) return cls.perClassLevel;
  return { hp: total.hp / character.classLevel, mana: total.mana / character.classLevel };
}

// The evolution in the character's view: the one it took, with its card,
// or, once it may take one (class level 50 and the skills ready), the cards
// of its two to choose from. With an evolution, the form it grows into
// (`next`) once that can be taken, and the class level it comes at.
export function evolutionPanel(character, content) {
  const current = evolutionOf(character, content);
  if (current) {
    const next = nextFormOf(current, content);
    return {
      current: evolutionView(current, content, character),
      choices: [],
      next: next && !evolveBlock(character, next.id, content) ? evolutionView(next, content, character) : null,
      nextLevel: next ? content.balance.progression.classEvolutionLevels[next.stage - 1] : null,
    };
  }
  const ready = character.classLevel >= content.balance.progression.classEvolutionLevels[0] && !skillsBlock(character, content);
  return { current: null, choices: ready ? evolutionChoices(character, content).map((evolution) => evolutionView(evolution, content, character)) : [] };
}

// An evolution's card: its name (for the character's look), its
// description, path or the evolution it grows out of, growth per class
// level, trait and skills with their numbers at the top level (the author:
// the numbers in their descriptions are those of the top level).
export function evolutionView(evolution, content, character = null) {
  const top = (content.evolutionStages?.[(evolution.stage ?? 1) - 1] ?? content.evolutionRules).skillMaxLevel;
  const appearance = character?.appearance;
  const from = evolution.from ? content.evolutionsById[evolution.from] : null;
  return {
    id: evolution.id,
    name: evolutionName(evolution, appearance),
    stage: evolution.stage ?? 1,
    description: evolution.description ?? null,
    // The level the skills' numbers are told at.
    skillLevel: top,
    path: evolution.path ?? null,
    pathName: evolution.path ? (content.skillsById[evolution.path]?.name ?? null) : null,
    fromName: from ? evolutionName(from, appearance) : null,
    growth: Object.entries(evolution.growth).map(([stat, value]) => ({ stat, name: content.statsById[stat].name, value })),
    trait: { name: evolution.trait.name, text: evolution.trait.text },
    skills: evolution.skills.map((id) => {
      const skill = content.skillsById[id];
      return {
        id,
        name: skill.name,
        style: skill.style,
        from: skill.from ? (content.skillsById[skill.from]?.name ?? null) : null,
        description: skill.description,
        effect: skillText(skill.effect, skill, skillParams(skill, top, content), content),
      };
    }),
  };
}

// What the art of a second form and of its skills stands in with until
// they have their own (the client's art.js): a form takes its first
// evolution's portrait, walk and ride (`forms`); a grown skill the icon,
// sound and look of the skill it grew from, and a new one those of its first
// evolution's skill in the same place, or, where the grown skill came from
// that one, of the other (`skills`). Real art only needs its files and ids.
export function evolutionArt(content) {
  const forms = {};
  const skills = {};
  for (const evolution of content.evolutions) {
    const parent = evolution.from ? content.evolutionsById[evolution.from] : null;
    if (!parent) continue;
    forms[evolution.id] = parent.id;
    const grownFrom = content.skillsById[evolution.skills[0]]?.from;
    evolution.skills.forEach((id, index) => {
      const from = content.skillsById[id]?.from;
      const same = parent.skills[index];
      skills[id] = [from ?? (same === grownFrom ? (parent.skills.find((other) => other !== grownFrom) ?? same) : same)];
    });
  }
  return { forms, skills };
}
