// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy).

import { areaDangers, areaUnlockLevel, bestiaryChest, buildContent, landBestiaryChest, meetingChances, ordinaryMaterial, regionDangers } from '../engine/index.js';
import { buildingOn, craftingOn, evolutionsOn, settlementOn } from './features.js';
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
import giftCodes from '../../data/gift-codes.json' with { type: 'json' };
import settlement from '../../data/settlement.json' with { type: 'json' };
import towers from '../../data/towers.json' with { type: 'json' };
import guilds from '../../data/guilds.json' with { type: 'json' };
import cosmetics from '../../data/cosmetics.json' with { type: 'json' };

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
  'gift-codes': giftCodes,
  settlement,
  towers,
  guilds,
  cosmetics,
});

// The parts of the game this deployment has on, for the System's messages
// about them (unlocks.json `feature`): read when asked, as the switches are
// read for each request (features.js).
Object.defineProperty(content, 'features', { get: () => [...(craftingOn() ? ['crafting'] : []), ...(settlementOn() ? ['settlement'] : [])] });

// The class evolutions, where the deployment has them on (features.js).
// Where they are off the game plays as before them: the class grows past
// the first evolution level once its skills are ready, no evolution is
// offered and there is no Ewolucja tab (the unlock "evolution").
const evolutionParts = {
  on: { evolutions: content.evolutions, evolutionsById: content.evolutionsById, evolutionSkills: content.evolutionSkills, unlocks: content.unlocks },
  off: { evolutions: [], evolutionsById: {}, evolutionSkills: [], unlocks: content.unlocks.filter((unlock) => unlock.id !== 'evolution') },
};
for (const key of Object.keys(evolutionParts.on)) {
  Object.defineProperty(content, key, { get: () => evolutionParts[evolutionsOn() ? 'on' : 'off'][key] });
}

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
    // The words of the class evolutions' choice and ceremony, and the
    // picture behind the Ewolucja tab's heading.
    evolutionTexts: content.evolutionTexts,
    evolutionPlace: content.evolutionPlace,
    // The picture behind the Gildia page's heading, once one is chosen.
    guildPlace: content.guilds.place ?? null,
    // The tabs of the Gildia page: its members, the Bestia, the Próby and
    // the Prośby Gildii.
    guildTabs: content.guilds.tabs,
    // The words of "Poproś gildię", shown where pieces are missing, before
    // the Prośby Gildii answer (src/client/guild-requests.js).
    guildAsk: content.guilds.requests.texts.ask,
    // The Ranking's tabs and the periods of its "Gildie", and the words of
    // the best guild of last week by its gold tag (guild-fame.js, 380 C).
    guildFame: { tabs: content.guilds.fame.texts.tabs, periods: content.guilds.fame.texts.periods, champion: content.guilds.fame.texts.champion },
    // The Sklep Systemu (cosmetics.js): its cosmetics with their prices and
    // looks, for the shop and for every portrait and name that wears one,
    // and the words of its page.
    cosmetics: { items: content.cosmetics, texts: content.cosmeticTexts },
    giftTexts: content.giftTexts,
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
          // From the strong inner regions on, the card says to go with two
          // companions (the author: 438.2 A).
          ...(area.minLevel >= content.balance.hunt.companionsAdvice.fromLevel && { companionsAdvice: content.balance.hunt.companionsAdvice.text }),
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
    resources: content.resources.map(({ id, name, genitive, description, system }) => ({ id, name, genitive, description, system: Boolean(system) })),
    buildings: content.buildings.filter(buildingOn).map(({ id, name, description, maxLevel }) => ({ id, name, description, maxLevel })),
    // With the family of the creature that leaves it, for its icon, and
    // `trophy` for an elite's or a champion's, which no order for any
    // materials takes ("Poproś gildię", src/client/guild-requests.js).
    materials: content.materials.map(({ id, name, gender, rarity, description, monster }) => ({
      id,
      name,
      gender,
      rarity,
      description,
      family: content.monstersById[monster].family,
      ...(!ordinaryMaterial(id, content) && { trophy: true }),
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
      // The window of a name the filter blocks (names.js).
      names: content.chat.names,
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
