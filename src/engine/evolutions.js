// Class evolutions (data/evolutions.json; DECISIONS.md, "Ewolucje: odpowiedzi
// autora" and "Ewolucje: budowa"). At the first class level of
// balance.progression.classEvolutionLevels the character chooses the
// evolution of one of its two paths (the skills it learned, the main one
// first). The class goes by the evolution's name, its stats grow by the
// evolution's growth from the next class level on, and it gains the
// evolution's trait. Its two skills make way for the evolution's two, at
// level 0, so the Skill Points they took come back for them; the other path
// is gone for good.

import { skillParams, skillText, skillsBlock } from './skills.js';

export const evolutionOf = (character, content) => (character.evolution ? (content.evolutionsById[character.evolution] ?? null) : null);

// The name the class goes by: its evolution's, else its own.
export const classNameOf = (character, content) => evolutionOf(character, content)?.name ?? content.classesById[character.classId].name;

// The evolutions a character may choose: those of the paths it learned, the
// main one first. `all` (Testuj ewolucję, the test version only): every
// evolution of its class.
export function evolutionChoices(character, content, { all = false } = {}) {
  const ofClass = content.evolutions.filter((evolution) => evolution.classId === character.classId);
  if (all) return ofClass;
  return Object.keys(character.skills ?? {})
    .map((id) => ofClass.find((evolution) => evolution.path === id))
    .filter(Boolean);
}

// Why a character cannot take an evolution, or null when it can: it has
// none yet, the evolution is one of its choices, and it is at the class
// level of the first evolution with its skills ready for it (the second
// path and the points, skillsBlock). `test` lifts the level and the skills
// and opens every evolution of the class.
export function evolveBlock(character, evolutionId, content, { test = false } = {}) {
  if (character.evolution) return { code: 'evolved', message: 'Ta postać przeszła już ewolucję.' };
  if (!evolutionChoices(character, content, { all: test }).some((evolution) => evolution.id === evolutionId)) {
    return { code: 'unknown_evolution', message: 'Ta ewolucja nie jest dla tej postaci.' };
  }
  if (test) return null;
  const level = content.balance.progression.classEvolutionLevels[0];
  if (character.classLevel < level) return { code: 'class_level', message: `Ewolucję wybierzesz na ${level}. poziomie klasy.` };
  const block = skillsBlock(character, content);
  if (block) return { code: block.code, message: content.evolutionTexts.notReady };
  return null;
}

// The skills after the evolution: the evolution's two at level 0, so the
// points of the class's come back for them.
export const evolvedSkills = (evolutionId, content) => Object.fromEntries(content.evolutionsById[evolutionId].skills.map((id) => [id, 0]));

// HP and mana per class level as a whole: the class's up to the evolution,
// the evolution's own (perClassLevel, else the class's) after it, so the
// formulas (formulas.js) give the sum of both.
export function perClassLevelOf(character, content) {
  const cls = content.classesById[character.classId];
  const evolution = evolutionOf(character, content);
  const from = content.balance.progression.classEvolutionLevels[0];
  if (!evolution?.perClassLevel || character.classLevel <= from) return cls.perClassLevel;
  const after = character.classLevel - from;
  const mix = (key) => (cls.perClassLevel[key] * from + evolution.perClassLevel[key] * after) / character.classLevel;
  return { hp: mix('hp'), mana: mix('mana') };
}

// An evolution's card: its name, path, growth per class level, trait and
// skills with their numbers at the top level (the author: the numbers in
// their descriptions are those of the top level).
export function evolutionView(evolution, content) {
  const top = content.evolutionRules.skillMaxLevel;
  return {
    id: evolution.id,
    name: evolution.name,
    path: evolution.path,
    pathName: content.skillsById[evolution.path]?.name ?? null,
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
