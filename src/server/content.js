// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy).

import { areaDangers, areaUnlockLevel, buildContent } from '../engine/index.js';
import affixes from '../../data/affixes.json' with { type: 'json' };
import balance from '../../data/balance.json' with { type: 'json' };
import classes from '../../data/classes.json' with { type: 'json' };
import effects from '../../data/effects.json' with { type: 'json' };
import elements from '../../data/elements.json' with { type: 'json' };
import itemBases from '../../data/item-bases.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import rarities from '../../data/rarities.json' with { type: 'json' };
import regions from '../../data/regions.json' with { type: 'json' };
import slots from '../../data/slots.json' with { type: 'json' };
import stats from '../../data/stats.json' with { type: 'json' };
import texts from '../../data/texts.json' with { type: 'json' };
import unlocks from '../../data/unlocks.json' with { type: 'json' };
import resources from '../../data/resources.json' with { type: 'json' };
import buildings from '../../data/buildings.json' with { type: 'json' };
import camp from '../../data/camp.json' with { type: 'json' };
import appearances from '../../data/appearances.json' with { type: 'json' };
import music from '../../data/music.json' with { type: 'json' };
import sounds from '../../data/sounds.json' with { type: 'json' };
import tutorial from '../../data/tutorial.json' with { type: 'json' };
import materials from '../../data/materials.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import professions from '../../data/professions.json' with { type: 'json' };

export const content = buildContent({
  stats,
  elements,
  effects,
  rarities,
  slots,
  classes,
  'item-bases': itemBases,
  affixes,
  monsters,
  regions,
  balance,
  texts,
  unlocks,
  resources,
  buildings,
  camp,
  appearances,
  materials,
  quests,
  skills,
  professions,
});

// The narrator's lines that are read once, in their order: cards and
// pointers, and a lead marked `once`, whose tap changes no screen. Another
// lead or a tap is done when the game moves on, so it is not kept.
const keptLines = tutorial.lines.filter((line) => line.kind === 'card' || line.kind === 'point' || line.once);
export const tutorialLines = keptLines.map((line) => line.id);

// The kept lines of one part: the introduction (no chapter) or one of the
// chapters after it, such as the Umiejętności.
export const tutorialPart = (chapter = null) => keptLines.filter((line) => (line.chapter ?? null) === chapter).map((line) => line.id);
export const tutorialChapters = Object.keys(tutorial.chapters);

// The first steps of the introduction, which a skipped one plays for the player.
export const firstSteps = tutorial.firstSteps;

// What the page needs to label things; no balance numbers.
export function publicContent() {
  return {
    stats: content.stats.map(({ id, name, combat }) => ({ id, name, effect: combat })),
    classes: content.classes.map(({ id, name, role, start, description, position }) => ({
      id,
      name,
      role,
      start,
      description,
      position,
    })),
    elements: content.elements.map(({ id, name, color }) => ({ id, name, color })),
    effects: content.effects.map(({ id, name, color }) => ({ id, name, color })),
    slots: content.slots,
    rarities: content.rarities.map(({ id, name, forms, color }) => ({ id, name, forms, color })),
    regions: content.regions.map(({ id, land, name, minLevel, maxLevel, safe, description, trait, areas }) => ({
      id,
      land,
      name,
      minLevel,
      maxLevel,
      safe,
      description,
      trait: { name: trait.name, description: trait.description },
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        minLevel: area.minLevel,
        maxLevel: area.maxLevel,
        description: area.description,
        unlockClassLevel: areaUnlockLevel(area, content),
        // "Czyhające niebezpieczeństwa": the page shows a creature by name
        // only once the character has met it (`met` in the character's view).
        dangers: areaDangers(area, content).map((danger) => ({
          ...danger,
          name: content.monstersById[danger.monsterId].name,
          family: content.monstersById[danger.monsterId].family,
        })),
      })),
    })),
    durations: { min: content.balance.hunt.minMinutes, step: content.balance.hunt.stepMinutes, max: content.balance.hunt.maxMinutes },
    lengths: content.texts.lengths,
    unlocks: content.unlocks.map(({ id, name, level, classLevel, condition }) => ({ id, name, level, classLevel, condition })),
    resources: content.resources.map(({ id, name, description, system }) => ({ id, name, description, system: Boolean(system) })),
    buildings: content.buildings.map(({ id, name, description, maxLevel }) => ({ id, name, description, maxLevel })),
    // With the family of the creature that leaves it, for its icon.
    materials: content.materials.map(({ id, name, gender, rarity, description, monster }) => ({
      id,
      name,
      gender,
      rarity,
      description,
      family: content.monstersById[monster].family,
    })),
    parts: content.parts.map(({ id, name, rarity, description }) => ({ id, name, rarity, description })),
    appearances: content.appearances,
    freeResetMaxLevel: content.balance.progression.freeResetMaxLevel,
    // Levels a character may have above a place's strongest creatures
    // before their XP drops: then the Walka screen warns of an easy place.
    easyAbove: content.balance.hunt.lowLevelFreeDiff,
    // Punkty Systemu for a confirmed e-mail (email.js).
    emailReward: content.balance.account.emailSystemPoints,
    classEvolutionLevels: content.balance.progression.classEvolutionLevels,
    // Background music: the client plays it on every screen (music.js).
    music,
    // Recorded combat sounds and voices (sound.js).
    sounds,
    // The narrator's introduction for a new character (narrator.js), with
    // the Time Points the narrator gives.
    tutorial: { ...tutorial, $comment: undefined, startTimePoints: content.balance.timePoints.start },
  };
}
