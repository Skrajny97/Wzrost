// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy), in the request's language (i18n.js):
// content() is the content as the engine uses it, publicContent() what the
// page labels things with. The Polish is built as the Worker starts; the
// English, the Polish with the texts of data/en/ laid over it
// (src/engine/overlay.js), the first time a request asks for it. Each
// language has its own content, so what the engine keeps once for a
// content (skill-demo.js, encyclopedia.js) is kept for each language apart.

import { areaDangers, areaUnlockLevel, bestiaryChest, buildContent, evolutionArt, landBestiaryChest, meetingChances, ordinaryMaterial, overlayTexts, regionDangers } from '../engine/index.js';
import { buildingOn, craftingOn, evolutionsOn, settlementOn } from './features.js';
import { language, languageOffered, pageDictionary } from './i18n.js';
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
import portals from '../../data/portals.json' with { type: 'json' };
import guilds from '../../data/guilds.json' with { type: 'json' };
import cosmetics from '../../data/cosmetics.json' with { type: 'json' };
// The English texts (data/en/), by the data file they translate. A file
// added there is named here too (tools/i18n-check.mjs checks it).
import enAffixes from '../../data/en/affixes.json' with { type: 'json' };
import enAppearances from '../../data/en/appearances.json' with { type: 'json' };
import enBalance from '../../data/en/balance.json' with { type: 'json' };
import enBuildings from '../../data/en/buildings.json' with { type: 'json' };
import enCamp from '../../data/en/camp.json' with { type: 'json' };
import enChat from '../../data/en/chat.json' with { type: 'json' };
import enClasses from '../../data/en/classes.json' with { type: 'json' };
import enCommunity from '../../data/en/community.json' with { type: 'json' };
import enCosmetics from '../../data/en/cosmetics.json' with { type: 'json' };
import enEffects from '../../data/en/effects.json' with { type: 'json' };
import enElements from '../../data/en/elements.json' with { type: 'json' };
import enEncyclopedia from '../../data/en/encyclopedia.json' with { type: 'json' };
import enEvents from '../../data/en/events.json' with { type: 'json' };
import enEvolutions from '../../data/en/evolutions.json' with { type: 'json' };
import enGiftCodes from '../../data/en/gift-codes.json' with { type: 'json' };
import enGuilds from '../../data/en/guilds.json' with { type: 'json' };
import enItemBases from '../../data/en/item-bases.json' with { type: 'json' };
import enMaterials from '../../data/en/materials.json' with { type: 'json' };
import enMonsters from '../../data/en/monsters.json' with { type: 'json' };
import enMusic from '../../data/en/music.json' with { type: 'json' };
import enNews from '../../data/en/news.json' with { type: 'json' };
import enProfessions from '../../data/en/professions.json' with { type: 'json' };
import enQuests from '../../data/en/quests.json' with { type: 'json' };
import enRarities from '../../data/en/rarities.json' with { type: 'json' };
import enRegions from '../../data/en/regions.json' with { type: 'json' };
import enResources from '../../data/en/resources.json' with { type: 'json' };
import enSettlement from '../../data/en/settlement.json' with { type: 'json' };
import enSkills from '../../data/en/skills.json' with { type: 'json' };
import enSkins from '../../data/en/skins.json' with { type: 'json' };
import enSlots from '../../data/en/slots.json' with { type: 'json' };
import enStats from '../../data/en/stats.json' with { type: 'json' };
import enTexts from '../../data/en/texts.json' with { type: 'json' };
import enTowers from '../../data/en/towers.json' with { type: 'json' };
import enPortals from '../../data/en/portals.json' with { type: 'json' };
import enTutorial from '../../data/en/tutorial.json' with { type: 'json' };
import enUnlocks from '../../data/en/unlocks.json' with { type: 'json' };

// The data files by their names, as data/en/ names its translations.
const polishData = {
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
  portals,
  guilds,
  cosmetics,
  tutorial,
  music,
  sounds,
  animations,
};

export const OVERLAYS = {
  en: {
    affixes: enAffixes,
    appearances: enAppearances,
    balance: enBalance,
    buildings: enBuildings,
    camp: enCamp,
    chat: enChat,
    classes: enClasses,
    community: enCommunity,
    cosmetics: enCosmetics,
    effects: enEffects,
    elements: enElements,
    encyclopedia: enEncyclopedia,
    events: enEvents,
    evolutions: enEvolutions,
    'gift-codes': enGiftCodes,
    guilds: enGuilds,
    'item-bases': enItemBases,
    materials: enMaterials,
    monsters: enMonsters,
    music: enMusic,
    // What's new? drafts: not game data sent to the page, laid over by news.js.
    news: enNews,
    professions: enProfessions,
    quests: enQuests,
    rarities: enRarities,
    regions: enRegions,
    resources: enResources,
    settlement: enSettlement,
    skills: enSkills,
    skins: enSkins,
    slots: enSlots,
    stats: enStats,
    texts: enTexts,
    towers: enTowers,
    tutorial: enTutorial,
    portals: enPortals,
    unlocks: enUnlocks,
  },
};

const dataByLanguage = { pl: polishData };
// The data files in a language: the Polish ones with its texts over them.
export function dataIn(lang) {
  dataByLanguage[lang] ??= Object.fromEntries(Object.entries(polishData).map(([name, data]) => [name, overlayTexts(data, OVERLAYS[lang]?.[name])]));
  return dataByLanguage[lang];
}

// The content of one language, with the deployment's switches.
function prepare(built, lang) {
  // Its language, and the English of the texts the engine writes itself
  // (word() in src/engine/text.js): the engine takes nothing from the
  // server, so its words come with the content, none for Polish.
  built.language = lang;
  built.words = pageDictionary(lang);

  // The parts of the game this deployment has on, for the System's messages
  // about them (unlocks.json `feature`): read when asked, as the switches are
  // read for each request (features.js).
  Object.defineProperty(built, 'features', { get: () => [...(craftingOn() ? ['crafting'] : []), ...(settlementOn() ? ['settlement'] : [])] });

  // The class evolutions, where the deployment has them on (features.js).
  // Where they are off the game plays as before them: the class grows past
  // the first evolution level once its skills are ready, no evolution is
  // offered and there is no Ewolucja tab (the unlock "evolution").
  const evolutionParts = {
    on: { evolutions: built.evolutions, evolutionsById: built.evolutionsById, evolutionSkills: built.evolutionSkills, unlocks: built.unlocks },
    off: { evolutions: [], evolutionsById: {}, evolutionSkills: [], unlocks: built.unlocks.filter((unlock) => unlock.id !== 'evolution') },
  };
  for (const key of Object.keys(evolutionParts.on)) {
    Object.defineProperty(built, key, { get: () => evolutionParts[evolutionsOn() ? 'on' : 'off'][key] });
  }
  return built;
}

const contentByLanguage = { pl: prepare(buildContent(polishData), 'pl') };
export function contentIn(lang) {
  contentByLanguage[lang] ??= prepare(buildContent(dataIn(lang)), lang);
  return contentByLanguage[lang];
}

// The game's content in the request's language.
export const content = () => contentIn(language());

// The chat's channels on this server (data/chat.json): one of a language
// (`language`, the English one) only where the server speaks it (i18n.js),
// so the live game keeps its two. With `own`, as the page gets them: the
// channel of the request's language first, as the chat opens on its first
// channel and lights the Społeczność for its messages
// (src/client/chat-news.js), so a page in English opens on the English
// one; everyone may read and write in it.
export function chatChannels({ own = false } = {}) {
  const channels = content().chat.channels.filter((channel) => !channel.language || languageOffered(channel.language));
  const first = own ? channels.find((channel) => channel.language === language()) : null;
  return first ? [first, ...channels.filter((channel) => channel !== first)] : channels;
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
const dangerView = (game) => (danger) => ({
  ...danger,
  name: game.monstersById[danger.monsterId].name,
  family: game.monstersById[danger.monsterId].family,
});

// What the page needs to label things; no balance numbers.
export function publicContent() {
  const game = content();
  const data = dataIn(language());
  return {
    stats: game.stats.map(({ id, name, combat }) => ({ id, name, effect: combat })),
    classes: game.classes.map(({ id, name, short, role, start, description, position }) => ({
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
    evolutionTexts: game.evolutionTexts,
    evolutionPlace: game.evolutionPlace,
    // The art a second form and its skills take until they have their own
    // (the first evolution's portrait, walk and ride; the icon, sound and
    // look of the skill grown from, or of the first evolution's in its
    // place): the page's art.js finds them by these ids.
    evolutionArt: evolutionArt(game),
    // The picture behind the Gildia page's heading, once one is chosen.
    guildPlace: game.guilds.place ?? null,
    // The tabs of the Gildia page: its members, the Siedziba, the Wyprawa,
    // the Bestia, the Próby, the Prośby Gildii and the Wymiana.
    guildTabs: game.guilds.tabs,
    // The words of "Poproś gildię", shown where pieces are missing, before
    // the Prośby Gildii answer (src/client/guild-requests.js).
    guildAsk: game.guilds.requests.texts.ask,
    // The Ranking's tabs and the periods of its "Gildie", and the words of
    // the best guild of last week by its gold tag (guild-fame.js, 380 C).
    guildFame: { tabs: game.guilds.fame.texts.tabs, periods: game.guilds.fame.texts.periods, champion: game.guilds.fame.texts.champion },
    // The Sklep Systemu (cosmetics.js): its cosmetics with their prices and
    // looks, for the shop and for every portrait and name that wears one,
    // and the words of its page.
    cosmetics: { items: game.cosmetics, texts: game.cosmeticTexts },
    giftTexts: game.giftTexts,
    elements: game.elements.map(({ id, name, resistance, color }) => ({ id, name, resistance, color })),
    effects: game.effects.map(({ id, name, color }) => ({ id, name, color })),
    slots: game.slots,
    rarities: game.rarities.map(({ id, name, forms, color }) => ({ id, name, forms, color })),
    regions: game.regions.map((region) => ({
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
      dangers: regionDangers(region, game).map(dangerView(game)),
      chest: landBestiaryChest(region, game),
      areas: region.areas.map((area) => {
        const chances = meetingChances(area, game);
        return {
          id: area.id,
          name: area.name,
          minLevel: area.minLevel,
          maxLevel: area.maxLevel,
          description: area.description,
          unlockClassLevel: areaUnlockLevel(area, game),
          // From the strong inner regions on, the card says to go with two
          // companions (the author: 438.2 A).
          ...(area.minLevel >= game.balance.hunt.companionsAdvice.fromLevel && { companionsAdvice: game.balance.hunt.companionsAdvice.text }),
          // The Bestiariusz: the page shows a creature by name only once
          // the character has met it (`met` in the character's view), with
          // its chance of coming in a fight from the start, and its chest
          // opens once all are met.
          dangers: areaDangers(area, game).map((danger) => ({ ...dangerView(game)(danger), chance: chances.get(danger.monsterId) ?? 0 })),
          chest: bestiaryChest(area, game),
        };
      }),
    })),
    durations: { min: game.balance.hunt.minMinutes, step: game.balance.hunt.stepMinutes, max: game.balance.hunt.maxMinutes },
    lengths: game.texts.lengths,
    unlocks: game.unlocks.map(({ id, name, level, classLevel, condition }) => ({ id, name, level, classLevel, condition })),
    resources: game.resources.map(({ id, name, genitive, description, system }) => ({ id, name, genitive, description, system: Boolean(system) })),
    buildings: game.buildings.filter(buildingOn).map(({ id, name, description, maxLevel }) => ({ id, name, description, maxLevel })),
    // The places of the Osada's board, for their shortcuts under the Osada
    // in the computer's menu (src/client/layout.js).
    settlementPlaces: (game.settlement?.places ?? []).map(({ id, name, soon }) => ({ id, name, ...(soon && { soon: true }) })),
    // With the family of the creature that leaves it, for its icon, and
    // `trophy` for an elite's or a champion's, which no order for any
    // materials takes ("Poproś gildię", src/client/guild-requests.js).
    materials: game.materials.map(({ id, name, gender, rarity, description, monster }) => ({
      id,
      name,
      gender,
      rarity,
      description,
      family: game.monstersById[monster].family,
      ...(!ordinaryMaterial(id, game) && { trophy: true }),
    })),
    parts: game.parts.map(({ id, name, rarity, description }) => ({ id, name, rarity, description })),
    appearances: game.appearances,
    // The skin tones: `drawn` is the portrait as drawn, the others have their
    // own recoloured files (art.js).
    skins: { default: game.defaultSkin, tones: game.skins.map(({ id, name, swatch, ramp }) => ({ id, name, swatch, drawn: !ramp })) },
    freeResetMaxLevel: game.balance.progression.freeResetMaxLevel,
    // Levels a character may have above a place's strongest creatures
    // before their XP drops: then the Walka screen warns of an easy place.
    easyAbove: game.balance.hunt.lowLevelFreeDiff,
    // Punkty Systemu for a confirmed e-mail (email.js).
    emailReward: game.balance.account.emailSystemPoints,
    classEvolutionLevels: game.balance.progression.classEvolutionLevels,
    // Background music: the client plays it on every screen (music.js).
    music: data.music,
    // Recorded combat sounds and voices (sound.js).
    sounds: data.sounds,
    // The looping scenes while the character works or explores (scenes.js).
    animations: { ...data.animations, $comment: undefined },
    // The narrator's introduction for a new character (narrator.js), with
    // the Time Points the narrator gives.
    tutorial: { ...data.tutorial, $comment: undefined, startTimePoints: game.balance.timePoints.start },
    // The chat of the Społeczność tab (chat.js): its channels on this
    // server, the page's language's first (chatChannels), how long a
    // message may be, how often the open chat asks for new ones, and the
    // rules accepted before the first message.
    chat: {
      channels: chatChannels({ own: true }),
      maxLength: game.chat.rules.maxLength,
      // The admin's messages with links (chat.js, cleanText) and its window
      // "Dodaj link".
      linkMaxLength: game.chat.rules.linkMaxLength,
      link: game.chat.texts.link,
      itemsMax: game.chat.rules.items,
      pollSeconds: game.chat.rules.pollSeconds,
      rules: game.chat.texts.rules,
      // The window of a name the filter blocks (names.js).
      names: game.chat.names,
      // Tagging with "@" (mentions.js): how many names the line suggests,
      // and the words of the page.
      mentions: {
        suggestions: game.chat.mentions.suggestions,
        texts: { button: game.chat.mentions.texts.button, suggestions: game.chat.mentions.texts.suggestions, tagged: game.chat.mentions.texts.tagged, news: game.chat.mentions.texts.news },
      },
    },
    // The Społeczność's drop-down list, and the limits of the Znajomi, the
    // Upominek and the Wymiana the page tells of (community.js, trade.js).
    community: {
      sections: game.community.sections,
      friendsMax: game.community.friends.max,
      gift: { name: game.community.gift.name, claimsPerDay: game.community.gift.claimsPerDay, timePoints: game.community.gift.timePoints },
      trade: { proposalSeconds: game.community.trade.proposalSeconds, maxItems: game.community.trade.maxItems },
    },
  };
}
