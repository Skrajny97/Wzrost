// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy).

import { areaDangers, areaUnlockLevel, bestiaryChest, buildContent, landBestiaryChest, meetingChances, regionDangers } from '../engine/index.js';
import { craftingOn } from './features.js';
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
import skins from '../../data/skins.json' with { type: 'json' };
import animations from '../../data/animations.json' with { type: 'json' };
import music from '../../data/music.json' with { type: 'json' };
import sounds from '../../data/sounds.json' with { type: 'json' };
import tutorial from '../../data/tutorial.json' with { type: 'json' };
import materials from '../../data/materials.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import professions from '../../data/professions.json' with { type: 'json' };
import chat from '../../data/chat.json' with { type: 'json' };
import community from '../../data/community.json' with { type: 'json' };
import events from '../../data/events.json' with { type: 'json' };
import encyclopedia from '../../data/encyclopedia.json' with { type: 'json' };
import evolutions from '../../data/evolutions.json' with { type: 'json' };

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
  skins,
  materials,
  quests,
  skills,
  professions,
  chat,
  community,
  events,
  encyclopedia,
  evolutions,
});

// The parts of the game this deployment has on, for the System's messages
// about them (unlocks.json `feature`): read when asked, as the switches are
// read for each request (features.js).
Object.defineProperty(content, 'features', { get: () => (craftingOn() ? ['crafting'] : []) });

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

// A creature on a Bestiariusz list, with its name and family for the page.
const dangerView = (danger) => ({
  ...danger,
  name: content.monstersById[danger.monsterId].name,
  family: content.monstersById[danger.monsterId].family,
});

// What the page needs to label things; no balance numbers.
export function publicContent() {
  return {
    stats: content.stats.map(({ id, name, combat }) => ({ id, name, effect: combat })),
    classes: content.classes.map(({ id, name, short, role, start, description, position }) => ({
      id,
      name,
      short,
      role,
      start,
      description,
      position,
    })),
    // The words of the class evolutions' choice and ceremony.
    evolutionTexts: content.evolutionTexts,
    elements: content.elements.map(({ id, name, resistance, color }) => ({ id, name, resistance, color })),
    effects: content.effects.map(({ id, name, color }) => ({ id, name, color })),
    slots: content.slots,
    rarities: content.rarities.map(({ id, name, forms, color }) => ({ id, name, forms, color })),
    regions: content.regions.map((region) => ({
      id: region.id,
      land: region.land,
      name: region.name,
      minLevel: region.minLevel,
      maxLevel: region.maxLevel,
      safe: region.safe,
      description: region.description,
      trait: { name: region.trait.name, description: region.trait.description },
      // The land's Bestiariusz: every creature of its inner regions, with
      // a chest of its own.
      dangers: regionDangers(region, content).map(dangerView),
      chest: landBestiaryChest(region, content),
      areas: region.areas.map((area) => {
        const chances = meetingChances(area, content);
        return {
          id: area.id,
          name: area.name,
          minLevel: area.minLevel,
          maxLevel: area.maxLevel,
          description: area.description,
          unlockClassLevel: areaUnlockLevel(area, content),
          // The Bestiariusz: the page shows a creature by name only once
          // the character has met it (`met` in the character's view), with
          // its chance of coming in a fight from the start, and its chest
          // opens once all are met.
          dangers: areaDangers(area, content).map((danger) => ({ ...dangerView(danger), chance: chances.get(danger.monsterId) ?? 0 })),
          chest: bestiaryChest(area, content),
        };
      }),
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
    // The skin tones: `drawn` is the portrait as drawn, the others have their
    // own recoloured files (art.js).
    skins: { default: content.defaultSkin, tones: content.skins.map(({ id, name, swatch, ramp }) => ({ id, name, swatch, drawn: !ramp })) },
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
    // The looping scenes while the character works or explores (scenes.js).
    animations: { ...animations, $comment: undefined },
    // The narrator's introduction for a new character (narrator.js), with
    // the Time Points the narrator gives.
    tutorial: { ...tutorial, $comment: undefined, startTimePoints: content.balance.timePoints.start },
    // The chat of the Społeczność tab (chat.js): its channels, how long a
    // message may be, how often the open chat asks for new ones, and the
    // rules accepted before the first message.
    chat: {
      channels: content.chat.channels,
      maxLength: content.chat.rules.maxLength,
      itemsMax: content.chat.rules.items,
      pollSeconds: content.chat.rules.pollSeconds,
      rules: content.chat.texts.rules,
    },
    // The Społeczność's drop-down list, and the limits of the Znajomi, the
    // Upominek and the Wymiana the page tells of (community.js, trade.js).
    community: {
      sections: content.community.sections,
      friendsMax: content.community.friends.max,
      gift: { name: content.community.gift.name, claimsPerDay: content.community.gift.claimsPerDay, timePoints: content.community.gift.timePoints },
      trade: { proposalSeconds: content.community.trade.proposalSeconds, maxItems: content.community.trade.maxItems },
    },
  };
}
