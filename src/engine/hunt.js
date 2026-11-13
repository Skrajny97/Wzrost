// @ts-check
// An exploration (called a hunt in the code): fights and finds spread over the
// chosen time in one inner region (an area). Fights grow with time
// (1 minute: 1 fight, half an hour: 4, an hour: 6, 4 hours: 10), but each
// stands for its share of the time, so XP, gold and materials follow the
// time spent; a longer exploration pays a little more XP and gold
// (lengthBonusByMinutes) and rests a little longer after each fight
// (restBonusByMinutes). Beaten creatures leave
// materials, never items: items come in treasure chests, found on the way,
// left by a beaten elite, and, for a character without a weapon, right after
// its first won fight. Longer explorations meet demanding encounters more
// often, with more materials, and have more finds, some of them empty. Monsters have the levels of the place, not of the character,
// and XP from monsters far below the character's level drops as the character
// levels up during the exploration. HP carries over between fights and
// recovers only partly. A lost fight ends the exploration with fainting (or,
// against the local elite or the champion in a safe region, with a wounded
// retreat). The champion, the strongest creature of a region, waits in one
// inner region: it almost always leaves its material, the rarest of the
// region, and sometimes a chest with an epic or rarer item. A character sent
// out to avoid them (avoidRare) meets neither the elite nor the champion, one
// seeking them (seekRare) meets both more often, and one tracking the
// creatures of its quests (tracked) meets those more often. In a place too
// easy for it, the elite and the champion it has not met yet come far more
// often, until it meets them (rareCatchUp).

import { challengeAt, combatantView, exploreStrength, monsterCombatant, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { areaLand, cardBonusLine, cardDrop, cardDropText, cardFrom, lowerLandCards } from './cards.js';
import { addCounts, materialDrops, materialView, materialsText } from './crafting.js';
import { canUse, itemName, itemRank, itemView, randomItem } from './items.js';
import { TIMED_KINDS, fightPotions } from './potions.js';
import {
  classXpToNext,
  faintPenalty,
  gainXp,
  lowLevelMultiplier,
  monsterXp,
  xpToNext,
} from './progression.js';
import { countEvents, createRng } from './rng.js';
import { nameInText, say, word } from './text.js';
import { classUnlockMessages, unlockMessages } from './unlocks.js';
import { classNameOf } from './evolutions.js';
import { evolutionBlock, skillPoints } from './skills.js';
import { companionCombatant, gendered, trackerMaterials } from './companions.js';
import { wantedEncounter, wantedLootRarity, wantedOf, wantedStrength } from './wanted.js';
import { raisedOutcome, weekChance, weekFactor, weekFighter, weekLine } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character, as the engine takes it. */
/** @typedef {Record<string, any>} Item An item as the bag and the gear keep it. */
/** @typedef {Record<string, any>} Area An inner region (content.areas). */
/** @typedef {Record<string, any>} Encounter An encounter of a region: its creatures and how often it comes. */
/** @typedef {Record<string, any>} Hunt An exploration as simulateHunt gives it and the activity keeps it. */
/** @typedef {Record<string, any>} Pace How an exploration of its length goes (explorationPace). */
/** @typedef {import('./rng.js').Rng} Rng */

// Value of [minutes, value] pairs at `minutes`, rising with the logarithm of
// the time between pairs.
/**
 * @param {number[][]} pairs
 * @param {number} minutes
 */
function byMinutes(pairs, minutes) {
  if (minutes <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    const [m0, v0] = pairs[i - 1];
    const [m1, v1] = pairs[i];
    if (minutes <= m1) return v0 + ((v1 - v0) * Math.log(minutes / m0)) / Math.log(m1 / m0);
  }
  return /** @type {number[]} */ (pairs.at(-1))[1];
}

// How an exploration of this length goes: the number of fights (the pair
// with the most minutes not above its time), the time each fight stands for
// against the reference, and the odds of a demanding encounter, the elite
// and, where it lives, the champion.
// `level`: the character's (the trip's leader's), whose challenge rests
// less after each won fight of a longer exploration (628 B).
/**
 * @param {number} minutes
 * @param {Content} content
 * @param {number} [level]
 */
export function explorationPace(minutes, content, level = 0) {
  const tuning = content.balance.hunt;
  const fights = tuning.fightsByMinutes.filter((/** @type {number[]} */ [from]) => from <= minutes).at(-1)?.[1] ?? 1;
  const timeFactor = minutes / fights / tuning.minutesPerFightReference;
  // A longer exploration pays off more (the author: "powinny mimo wszystko
  // długie w pewnym stopniu"): from half an hour on, the elite and the
  // champion come more often in an hour (the author: "szansa na spotkanie
  // elity ... powinna w dłuższej"), and so do the finds.
  const rare = byMinutes(tuning.rareLengthFactorByMinutes, minutes);
  return {
    fights,
    timeFactor,
    toughChance: byMinutes(tuning.toughChanceByMinutes, minutes),
    // The elite and the champion come by the hour, so each fight of a long
    // exploration meets them more often, and more often still for its length.
    eliteChance: Math.min(1, tuning.eliteChancePerFight * timeFactor * rare),
    championChance: Math.min(1, tuning.championChancePerFight * timeFactor * rare),
    finds: (minutes / tuning.findIntervalMinutes) * byMinutes(tuning.findLengthFactorByMinutes, minutes),
    // The author (166): "nie może być więcej walk w krótkiej wyprawie niż w
    // długiej", with a light bonus for the length.
    lengthBonus: byMinutes(tuning.lengthBonusByMinutes, minutes),
    restBonus: byMinutes((challengeAt(level, content) ?? tuning).restBonusByMinutes, minutes),
  };
}

// What `minutes` of an exploration in `area` at `level` bring on average,
// as an exploration pays them: the gold of the fights and of the finds, the
// camp's resources gathered and found (all kinds together), the materials
// the creatures leave, and the parts the finds' chests give when taken
// apart (salvageYield). The Portale pay a part of it (portals.js) and the
// Wieże their gold (towers.js).
/**
 * @param {Area} area
 * @param {number} level
 * @param {number} minutes
 * @param {Content} content
 */
export function expectedExploration(area, level, minutes, content) {
  const { rewards, hunt, crafting } = content.balance;
  const pace = explorationPace(minutes, content);
  const open = encountersFor(area, level);
  const encounters = open.length > 0 ? open : area.encounters;
  const weights = encounters.reduce((/** @type {number} */ sum, /** @type {Encounter} */ encounter) => sum + (encounter.weight ?? 1), 0);
  let gold = 0;
  let materials = 0;
  for (const encounter of encounters) {
    const share = (encounter.weight ?? 1) / weights;
    const groupFactor = hunt.groupFactors[encounter.monsters.length - 1];
    for (const id of encounter.monsters) {
      gold += share * content.monstersById[id].reward.gold * groupFactor;
      const material = content.materialsByMonster[id];
      if (material) materials += share * content.raritiesById[material.rarity].materialChance * groupFactor;
    }
  }
  const fights = pace.fights * pace.timeFactor;
  const outcomes = rewards.findOutcomes;
  const all = Object.values(outcomes).reduce((sum, weight) => sum + weight, 0);
  const finds = (/** @type {string} */ kind) => (pace.finds * (outcomes[kind] ?? 0)) / all;
  return {
    gold: rewards.goldPerLevel * level * gold * fights * (1 + pace.lengthBonus) + finds('gold') * rewards.findGoldPerLevel * level,
    resources: finds('resource') * rewards.findResourcePerLevel * level + (rewards.gatherPerLevelHour * level * minutes) / 60,
    materials: materials * fights,
    parts: finds('chest') * (crafting.salvageBase + Math.floor(level / crafting.salvageLevelStep)),
  };
}

// The most potions of a kind an exploration of `minutes` takes along
// (potions.js): one for each of its fights.
/**
 * @param {number} minutes
 * @param {Content} content
 */
export const potionsPerKind = (minutes, content) => explorationPace(minutes, content).fights;

// The pace with the elite and the champion avoided (none of them) or sought
// (rareSeekFactor times as often, the author: "niech zwiększa to szansę
// dwukrotnie"), `rumor` times as often again after a rumor from the
// Karczma about this place (settlement.js), and with those of `catchUp`
// (rareCatchUp) met in at least rareCatchUpChance of the fights. `more`:
// the Bractwo Łowców's share more often (591 B, rareOdds).
/**
 * @param {Pace} pace
 * @param {{ avoidRare?: any, seekRare?: any, catchUp?: any, rumor?: any, more?: any }} options1
 * @param {Content} content
 */
export function withRareOdds(pace, { avoidRare = false, seekRare = false, catchUp = null, rumor = 1, more = 0 }, content) {
  if (avoidRare) return { ...pace, eliteChance: 0, championChance: 0 };
  if (!seekRare && !catchUp && rumor === 1 && !more) return pace;
  const { rareSeekFactor, rareCatchUpChance } = content.balance.hunt;
  const factor = (seekRare ? rareSeekFactor : 1) * rumor * (1 + more);
  const odds = (/** @type {number} */ chance, /** @type {boolean} */ unmet) => Math.min(1, Math.max(chance * factor, unmet ? rareCatchUpChance : 0));
  return { ...pace, eliteChance: odds(pace.eliteChance, catchUp?.elite), championChance: odds(pace.championChance, catchUp?.champion) };
}

// A place whose strongest creatures already give the character less XP
// (lowLevelMultiplier).
/**
 * @param {number} characterLevel
 * @param {Area} area
 * @param {Content} content
 */
export const easyPlace = (characterLevel, area, content) => characterLevel - area.maxLevel > content.balance.hunt.lowLevelFreeDiff;

// The author: "Jak ktoś ma już karę za łatwe miejsce, musi mieć jednorazowy
// mocny bonus na znalezienie Elity/Czempiona, żeby uzupełnić swój
// bestiariusz. Później wraca to do normy." In a place too easy for the
// character, which of its elite and champion the character has not met yet
// (`met`: the ids of the creatures met), or null. Null too when `met` is
// not known.
/**
 * @param {number} characterLevel
 * @param {Area} area
 * @param {string[]} met
 * @param {Content} content
 */
export function rareCatchUp(characterLevel, area, met, content) {
  if (!met || !easyPlace(characterLevel, area, content)) return null;
  const elite = Boolean(area.elite) && !met.includes(area.elite);
  const champion = Boolean(area.champion) && !met.includes(area.champion);
  return elite || champion ? { elite, champion } : null;
}

// The champion is drawn only where it lives, so other places keep their draws.
/**
 * @param {Area} area
 * @param {Rng} rng
 * @param {Content} content
 * @param {number} characterLevel
 * @param {Pace} pace
 * @param {string[]} [tracked]
 * @param {string[]} [unknown]
 * @param {any} [scouted]
 */
export function rollEncounter(area, rng, content, characterLevel, pace, tracked = [], unknown = [], scouted = null) {
  if (area.champion && rng.chance(pace.championChance)) return championEncounter(area, content);
  if (rng.chance(pace.eliteChance)) return eliteEncounter(area, content);
  const weight = encounterWeight(tracked, unknown, content, scouted);
  const tough = toughEncountersFor(area, characterLevel);
  if (tough.length > 0 && rng.chance(pace.toughChance)) {
    return regularEncounter(rng.weighted(tough, weight), area, rng, content, { tough: true, characterLevel });
  }
  return regularEncounter(rng.weighted(encountersFor(area, characterLevel), weight), area, rng, content, { characterLevel });
}

// An encounter's weight: by half more (questTrackBonus) with a creature the
// character tracks for its quests ("Trop przede wszystkim stwory z zadań"),
// by a tenth more (unknownTrackBonus) with one it has not met yet, while it
// tracks those ("Trop nieznane stwory"), and by the Strażnica's share with
// the creature it tracks (`scouted`: { id, bonus }, fortress.js).
/**
 * @param {string[]} tracked
 * @param {string[]} unknown
 * @param {Content} content
 * @param {any} [scouted]
 */
const encounterWeight = (tracked, unknown, content, scouted = null) => (/** @type {Encounter} */ encounter) =>
  encounter.weight *
  (encounter.monsters.some((/** @type {string} */ id) => tracked.includes(id)) ? 1 + content.balance.hunt.questTrackBonus : 1) *
  (encounter.monsters.some((/** @type {string} */ id) => unknown.includes(id)) ? 1 + content.balance.hunt.unknownTrackBonus : 1) *
  (scouted && encounter.monsters.includes(scouted.id) ? 1 + scouted.bonus : 1);

// The creatures of a place's encounters, plain and demanding, that the
// character has not met (`met`: ids), for "Trop nieznane stwory".
/**
 * @param {Area} area
 * @param {string[]} met
 */
export const unknownCreatures = (area, met) => [
  ...new Set([...area.encounters, ...(area.tough ?? [])].flatMap((encounter) => encounter.monsters).filter((id) => !met.includes(id))),
];

// The inner region for an id. Activities and reports from before inner regions
// name a whole region: they get its inner region for the character's level.
/**
 * @param {string} id
 * @param {number} characterLevel
 * @param {Content} content
 */
export function areaFor(id, characterLevel, content) {
  const area = content.areasById[id];
  if (area) return area;
  const region = content.regionsById[id];
  return region && (region.areas.find((/** @type {Record<string, any>} */ candidate) => characterLevel <= candidate.maxLevel) ?? region.areas.at(-1));
}

// Some encounters (pairs at the end of the first area) appear only from a level on.
/**
 * @param {Area} area
 * @param {number} characterLevel
 */
export const encountersFor = (area, characterLevel) =>
  area.encounters.filter((/** @type {Encounter} */ encounter) => characterLevel >= (encounter.minLevel ?? 1));

/**
 * @param {Area} area
 * @param {number} characterLevel
 */
export const toughEncountersFor = (area, characterLevel) =>
  (area.tough ?? []).filter((/** @type {Encounter} */ encounter) => characterLevel >= (encounter.minLevel ?? 1));

// The local elite: above the strongest monsters of the place.
/**
 * @param {Area} area
 * @param {Content} content
 */
export function eliteEncounter(area, content) {
  return { elite: true, members: [{ monsterId: area.elite, level: area.maxLevel + content.balance.hunt.eliteLevelBonus }] };
}

// The region's champion, alone and above the elite.
/**
 * @param {Area} area
 * @param {Content} content
 */
export function championEncounter(area, content) {
  return { elite: false, champion: true, members: [{ monsterId: area.champion, level: area.maxLevel + content.balance.hunt.championLevelBonus }] };
}

// The creatures that may meet a character in an inner region (its
// Bestiariusz), each with the levels it can come at: the place's range
// in the usual encounters, some levels above it in the demanding ones, the
// elite above the strongest and the champion above the elite. In the order
// of the place's encounters, then the elite and the champion.
/**
 * @param {Area} area
 * @param {Content} content
 */
export function areaDangers(area, content) {
  const { toughLevelBonus, eliteLevelBonus, championLevelBonus } = content.balance.hunt;
  const dangers = new Map();
  const add = (/** @type {string} */ monsterId, /** @type {number} */ minLevel, /** @type {number} */ maxLevel, kind = {}) => {
    const known = dangers.get(monsterId);
    if (!known) dangers.set(monsterId, { monsterId, minLevel, maxLevel, elite: false, champion: false, ...kind });
    else Object.assign(known, { minLevel: Math.min(known.minLevel, minLevel), maxLevel: Math.max(known.maxLevel, maxLevel) }, kind);
  };
  for (const encounter of area.encounters) for (const monsterId of encounter.monsters) add(monsterId, area.minLevel, area.maxLevel);
  for (const encounter of area.tough ?? []) {
    const bonus = encounter.levelBonus ?? toughLevelBonus;
    for (const monsterId of encounter.monsters) add(monsterId, area.minLevel + bonus, area.maxLevel + bonus);
  }
  if (area.elite) add(area.elite, area.maxLevel + eliteLevelBonus, area.maxLevel + eliteLevelBonus, { elite: true });
  if (area.champion) add(area.champion, area.maxLevel + championLevelBonus, area.maxLevel + championLevelBonus, { champion: true });
  return [...dangers.values()];
}

// The chance of meeting each creature of an inner region in one fight, as
// its Bestiariusz shows it, also for those not met yet (the author:
// "standardowe procentowe możliwości spotkania danego stwora ... bez
// włączenia tropień konkretnych"): a fight of an exploration
// balance.bestiary.chanceMinutes long, at the place's highest level (all
// its encounters), without tracking, seeking or avoiding anything. The
// draws go as in rollEncounter: the champion, the elite, a demanding
// encounter, then a usual one. A creature twice in a group counts once.
/**
 * @param {Area} area
 * @param {Content} content
 */
export function meetingChances(area, content) {
  const pace = explorationPace(content.balance.bestiary.chanceMinutes, content);
  const champion = area.champion ? pace.championChance : 0;
  const elite = (1 - champion) * pace.eliteChance;
  const tough = toughEncountersFor(area, area.maxLevel);
  const toughShare = tough.length > 0 ? pace.toughChance : 0;
  const rest = 1 - champion - elite;
  const chances = new Map();
  const add = (/** @type {string} */ monsterId, /** @type {number} */ chance) => chances.set(monsterId, (chances.get(monsterId) ?? 0) + chance);
  const addTable = (/** @type {Encounter[]} */ encounters, /** @type {number} */ share) => {
    const total = encounters.reduce((/** @type {number} */ sum, /** @type {Encounter} */ encounter) => sum + encounter.weight, 0);
    for (const encounter of encounters) for (const monsterId of new Set(encounter.monsters)) add(monsterId, (share * encounter.weight) / total);
  };
  addTable(encountersFor(area, area.maxLevel), rest * (1 - toughShare));
  addTable(tough, rest * toughShare);
  if (area.elite) add(area.elite, elite);
  if (area.champion) add(area.champion, champion);
  return chances;
}

// The Bestiariusz of a whole land (the author: "Bestiariusz główny dla danej
// krainy głównej ze wszystkimi stworami"): the creatures of all its inner
// regions, each with the levels it comes at anywhere in the land, in the
// order of the places, the elites and the champion last.
/**
 * @param {Record<string, any>} region
 * @param {Content} content
 */
export function regionDangers(region, content) {
  const dangers = new Map();
  for (const area of region.areas) {
    for (const danger of areaDangers(area, content)) {
      const known = dangers.get(danger.monsterId);
      if (!known) dangers.set(danger.monsterId, { ...danger });
      else Object.assign(known, { minLevel: Math.min(known.minLevel, danger.minLevel), maxLevel: Math.max(known.maxLevel, danger.maxLevel) });
    }
  }
  const rank = (/** @type {Record<string, any>} */ danger) => (danger.champion ? 2 : danger.elite ? 1 : 0);
  return [...dangers.values()].sort((a, b) => rank(a) - rank(b));
}

// The chest of an inner region's Bestiariusz, opened once every creature on
// its list is met (balance.bestiary): gold growing along a curve with the
// place's highest level, from 30 in Skraj Wiatrołomów to 600 in Serce
// Uroczyska, Punkty Czasu growing by the same step with each next inner
// region (the author: "+10 co kolejny region"), from 5 to 95, and the same
// Punkty Systemu in each (the author: "równo +20 Punktów Systemu").
/**
 * @param {Area} area
 * @param {Content} content
 */
export function bestiaryChest(area, content) {
  const { gold, timePoints, timePointsStep, systemPoints, baseLevel, growth, goldStep } = content.balance.bestiary;
  const step = area.maxLevel / baseLevel;
  return {
    gold: Math.round((gold * step ** growth) / goldStep) * goldStep,
    timePoints: Math.round(timePoints + timePointsStep * (step - 1)),
    systemPoints,
  };
}

// The chest of a land's Bestiariusz, opened once every creature of the land
// is met: its last inner region's chest, landFactor times more of each
// (the author: "troche wiecej niz z ostatniego regionu odpowiednich
// zasobów"), the gold rounded as there.
/**
 * @param {Record<string, any>} region
 * @param {Content} content
 */
export function landBestiaryChest(region, content) {
  const { landFactor, goldStep } = content.balance.bestiary;
  const last = region.areas.reduce((/** @type {Record<string, any>} */ top, /** @type {Area} */ area) => (area.maxLevel > top.maxLevel ? area : top));
  const chest = bestiaryChest(last, content);
  return {
    gold: Math.round((chest.gold * landFactor) / goldStep) * goldStep,
    timePoints: Math.round(chest.timePoints * landFactor),
    systemPoints: Math.round(chest.systemPoints * landFactor),
  };
}

/**
 * @param {Record<string, any>[]} dangers
 * @param {string[]} met
 */
const allMet = (dangers, met) => {
  const known = new Set(met);
  return dangers.every((/** @type {Record<string, any>} */ danger) => known.has(danger.monsterId));
};

// Whether the character has met every creature on the inner region's list,
// and on the whole land's.
/**
 * @param {Area} area
 * @param {string[]} met
 * @param {Content} content
 */
export const bestiaryFull = (area, met, content) => allMet(areaDangers(area, content), met);
/**
 * @param {Record<string, any>} region
 * @param {string[]} met
 * @param {Content} content
 */
export const landBestiaryFull = (region, met, content) => allMet(regionDangers(region, content), met);

// The creatures on the Bestiariusz list of an inner region or a land, by id.
/**
 * @param {string} id
 * @param {Content} content
 */
function listedDangers(id, content) {
  if (content.areasById[id]) return areaDangers(content.areasById[id], content);
  if (content.regionsById[id]) return regionDangers(content.regionsById[id], content);
  return null;
}

// How an opened chest is kept: its id and how many creatures its list had,
// "windfalls-edge:5".
/**
 * @param {string} id
 * @param {Content} content
 */
export const openedChestEntry = (id, content) => `${id}:${/** @type {unknown[]} */ (listedDangers(id, content)).length}`;

// The chests open for the lists as they are now, by id. A list that has
// grown since its chest was opened opens it again, with the same reward
// (the author: "nowe stwory dadzą kolejne nagrody, mimo że ktoś je już
// wcześniej odebrał… niech tak zostanie. Przy okazji ludzie będą mieli powód
// by zwiedzić starsze poziomy"). A chest kept by its id alone was opened
// before the creatures of balance.bestiary.laterCreatures came.
/**
 * @param {string[]} entries
 * @param {Content} content
 */
export function openedChests(entries, content) {
  const later = new Set(content.balance.bestiary.laterCreatures);
  return entries.flatMap((/** @type {any} */ entry) => {
    const [id, count] = entry.split(':');
    const dangers = listedDangers(id, content);
    if (!dangers) return [];
    const then = count === undefined ? dangers.filter((danger) => !later.has(danger.monsterId)).length : Number(count);
    return then >= dangers.length ? [id] : [];
  });
}

// A level from the place's range, whatever the character's level. Lower
// levels come more often (monsterLevelWeights), so a character at the start of
// an inner region is not outmatched in every fight.
/**
 * @param {Area} area
 * @param {Rng} rng
 * @param {Content} content
 */
export function areaLevel(area, rng, content) {
  const weights = content.balance.hunt.monsterLevelWeights;
  const offsets = Array.from({ length: area.maxLevel - area.minLevel + 1 }, (_, i) => i);
  return area.minLevel + rng.weighted(offsets, (/** @type {number} */ i) => weights[Math.min(i, weights.length - 1)]);
}

// Monsters have the levels of the place: a group shares one level. A
// demanding encounter is some levels above that. Only a new character (up to
// beginnerLevel, the first minutes of the game, still without a weapon at the
// start) meets the lowest level of the place.
/**
 * @param {Encounter} encounter
 * @param {Area} area
 * @param {Rng} rng
 * @param {Content} content
 * @param {{ tough?: boolean, characterLevel?: number }} [options4]
 */
export function regularEncounter(encounter, area, rng, content, { tough = false, characterLevel } = {}) {
  const { toughLevelBonus, beginnerLevel } = content.balance.hunt;
  const bonus = tough ? (encounter.levelBonus ?? toughLevelBonus) : 0;
  const level = /** @type {number} */ (characterLevel) <= beginnerLevel ? area.minLevel : areaLevel(area, rng, content);
  return { elite: false, tough, members: encounter.monsters.map((/** @type {string} */ monsterId) => ({ monsterId, level: level + bonus })) };
}

// The rarity of the item a beaten champion of `level` leaves: the weights
// of the highest championItems step its level has reached.
/**
 * @param {number} level
 * @param {Rng} rng
 * @param {Content} content
 */
export function championItemRarity(level, rng, content) {
  const steps = content.balance.rewards.championItems;
  const step = steps.filter((/** @type {Record<string, any>} */ candidate) => candidate.fromLevel <= level).at(-1) ?? steps[0];
  return rng.weighted(Object.entries(step.rarities), ([, weight]) => weight)[0];
}

// Repeated monsters get numbers: "Wilk 1", "Wilk 2". `growth`: the share of
// the late and end game's growth (monsterCombatant), less in a fight where
// the character stands alone. `strength`: the [damage, HP] multipliers of
// the creatures of the newest place (exploreStrength in combatant.js).
// A player as it fights now, on the way or in an event's fight (events.js):
// its strengthening potions still working (`on`, each kind's bonus), the
// potions it carries (`kit`, fightPotions) and its trophies. Focus raises
// Intelekt and Mądrość, which the character's numbers grow from; the
// aconite oil coats a blade that has no coat of its own yet.
/**
 * @param {{ unit: Record<string, any>, character: Character, equipped: Item[], name: string, area: Area, hp: number, on?: any, kit?: any, trophies: any }} options
 * @param {Content} content
 */
export function fightingPlayer({ unit, character, equipped, name, area, hp, on = {}, kit = {}, trophies = {} }, content) {
  const base = on.focus ? playerCombatant({ character, equipped, hp, name, area, id: unit.id, statBoost: { intellect: on.focus, wisdom: on.focus } }, content) : unit;
  const oil = on.poison ? content.potions.find((/** @type {Record<string, any>} */ potion) => potion.effect.poison)?.dot : null;
  return {
    ...base,
    hp,
    ...(on.speed && { speed: base.speed * (1 + on.speed) }),
    ...(on.armor && { armor: Math.round(base.armor * (1 + on.armor)) }),
    // A curse and wounds take off what a strength potion adds, both on top
    // of what the Rdzeń gives (core.js).
    ...((on.damage || on.curse || on.wounds) && { damageBonus: (base.damageBonus ?? 0) + (on.damage ?? 0) - (on.curse ?? 0) - (on.wounds ?? 0) }),
    ...(on.ward && { ward: on.ward }),
    ...(on.poison && oil && !base.weapon.dot && { weapon: { ...base.weapon, dot: { ...oil, chance: on.poison } } }),
    ...(Object.keys(kit).length > 0 && { potions: kit }),
    ...(Object.keys(trophies).length > 0 && { trophies }),
  };
}

/**
 * @param {Encounter} encounter
 * @param {Content} content
 * @param {{ growth?: any, strength?: any }} [options2]
 */
export function encounterCombatants(encounter, content, { growth = 1, strength = [1, 1] } = {}) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const member of encounter.members) counts[member.monsterId] = (counts[member.monsterId] ?? 0) + 1;
  /** @type {Record<string, number>} */
  const seen = {};
  const groupFactor = content.balance.hunt.groupFactors[encounter.members.length - 1];
  return encounter.members.map((/** @type {any} */ member, /** @type {number} */ index) => {
    seen[member.monsterId] = (seen[member.monsterId] ?? 0) + 1;
    // A wanted creature of the Osada's posters (wanted.js) has its own name.
    const baseName = member.name ?? content.monstersById[member.monsterId].name;
    const name = counts[member.monsterId] > 1 ? `${baseName} ${seen[member.monsterId]}` : baseName;
    return monsterCombatant({ ...member, id: `e${index}`, name, groupFactor, growth, strength }, content);
  });
}

/**
 * @param {number} count
 * @param {number} durationMs
 * @param {Rng} rng
 */
function spread(count, durationMs, rng) {
  return Array.from({ length: count }, (_, i) => Math.round(((i + rng.float(0.2, 0.8)) / count) * durationMs));
}

// A resource find: `total` units split by the region's weights, so every kind
// comes in small, steady amounts rather than in rare, large ones. At least
// one unit of the most common kind.
/**
 * @param {Area} area
 * @param {number} total
 * @returns {[string, number][]}
 */
export function resourceBundle(area, total) {
  const weights = Object.entries(area.resources).filter(([, weight]) => weight > 0);
  const sum = weights.reduce((acc, [, weight]) => acc + weight, 0);
  const found = weights.map(([id, weight]) => /** @type {[string, number]} */ ([id, Math.round((total * weight) / sum)])).filter(([, amount]) => amount > 0);
  if (found.length > 0) return found;
  const [top] = weights.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return [[top, 1]];
}

// A player as it sets out (`one`: its character, gear, HP and name) in the
// week the exploration keeps (weeks.js): its character with the week's
// stats (`fighter`, weekFighter) and its combatant; in a week that changes
// its Witalność, with the same share of its HP as it had, so a player at
// full HP sets out at full HP.
/**
 * @param {Record<string, any>} one
 * @param {Record<string, any> | null} week
 * @param {Area} area
 * @param {string} id
 * @param {Content} content
 */
function settingOut(one, week, area, id, content) {
  const fighter = weekFighter(one.character, week);
  const unit = playerCombatant({ character: fighter, equipped: one.equipped, hp: one.hp, name: one.name, area, id }, content);
  if (one.hp === undefined || one.hp === null || !fighter.weekStats?.vitality) return { fighter, unit };
  const plain = playerCombatant({ character: one.character, equipped: one.equipped, name: one.name, area, id }, content).maxHp;
  return { fighter, unit: { ...unit, hp: Math.min(unit.maxHp, Math.round((Math.min(one.hp, plain) * unit.maxHp) / plain)) } };
}

// `unknown`: the creatures not met yet that the exploration tracks.
// `first`: the character's very first exploration, which goes one way:
// regular encounters only, no chests among the finds, and the one treasure
// is a plain weapon of its class after the first won fight. `potions`: the
// potions taken along, by id, the healing one drunk below `healBelow`;
// `buffs`: the strengthening potions drunk, by kind, each with its bonus for
// the exploration's first `fights` fights (or, kept in time by one started
// before 0.1.26, for its first `ms`), and `speed` the same for a speed potion
// alone, as explorations started before the other kinds kept it
// (potions.js). `wanted`: the Osada's wanted poster the character set out
// with (wanted.js), its target met in its place's explorations; on a
// Drużyna's trip the trip's target, with `own` false when the character
// holds no poster for it (tripWanted). `seat`: the
// Siedziba Gildii's bonuses for the character as it set out (guild-seat.js,
// seatHuntBonus): { xp, gold, rarity } shares, or null. `hard`: a Trudna
// wyprawa (629 A), from the challenge's level: its creatures are
// challenge.hard times stronger, and its fights and finds give that much
// more XP and gold. `week`: the week of the year the exploration set out in
// (weeks.js), kept with it, or null: its share more (or less) of the fights'
// XP and gold, of the chance of a chest among the finds and of a champion's
// chest, of the materials the creatures leave, and of the players' stats in
// the fights; on a Drużyna's trip every member's is the same, as they set
// out at once. `cards`: Talia Systemu's cards (cards.js), where the game has
// it on (the server's CARDS): { maxed: the creatures whose card the
// character has at its top level, owned: those whose card it has at all,
// xp and gold: the collection's shares more of the XP and gold
// (card-collection.js, cardExplorationBonus; 884 A) }; each creature beaten
// may leave its card (874 A), and each fight won, but the wanted's, may give
// a card of a creature of a land lower than the place's (902 B), one the
// character has not got first; all drawn from a seed of their own, so the
// rest of the exploration goes as it would without them. Null: no cards.
/**
 * @param {Record<string, any>} options
 * @param {Content} content
 */
export function simulateHunt(
  { character, equipped, hp, name, areaId, minutes, seed, lootSeed = null, roster = null, self = null, first = false, avoidRare = false, seekRare = false, rumor = 1, rareMore = 0, materialsMore = 0, tracked = [], unknown = [], met = null, potions = {}, healBelow, buffs = {}, speed = null, trophies = {}, companions = [], partners = [], blessing = null, scouted = null, wanted = null, seat = null, hard = false, week = null, cards = null },
  content,
) {
  // A Drużyna's trip (src/server/trips.js) gives `roster`, its players in
  // the trip's order, each with what it brought (its strengthening potions and
  // trophies, the leader's potions), and `seed`, the trip's: its timeline
  // and fights come out the same in every member's report (the author:
  // "postacie z drużyny mają inne raporty odbytych walk. To nie powinno mieć
  // miejsca - powinny być wspólne jedynie łupy, XP itp. osobne"). What the
  // member (`self`, its id) finds and earns comes from its own seed
  // (`lootSeed`) and its own character. Alone, one seed gives both, as ever.
  // The Bractwo Łowców (591 A, B): the elite and the champion come `rareMore`
  // more often (the trip's leader's, as its encounters), and the member's
  // creatures leave `materialsMore` more materials.
  const rng = createRng(seed);
  const lootRng = lootSeed ? createRng(lootSeed) : rng;
  const tuning = content.balance.hunt;
  const rewards = content.balance.rewards;
  const texts = content.texts;
  const area = content.areasById[areaId];
  // The players who fight, each with its HP through the exploration, the
  // potions it still carries and drank, and the fights its potions for a
  // time worked in: the trip's roster, or the character alone.
  const fighters = (roster ?? [{ id: null, character, equipped, hp, name, potions, healBelow, windows: { ...(speed && { speed }), ...buffs }, trophies }]).map((/** @type {Record<string, any>} */ one, /** @type {number} */ index) => {
    const { fighter, unit } = settingOut(one, week, area, index === 0 ? 'a0' : `p${index}`, content);
    return { ...one, character: fighter, worn: one.equipped, unit, hp: unit.hp, left: { ...(one.potions ?? {}) }, potionsUsed: {}, buffFights: {}, windows: one.windows ?? {}, trophies: one.trophies ?? {} };
  });
  const me = (roster && fighters.find((/** @type {Record<string, any>} */ one) => one.id === self)) || fighters[0];
  // The trip's encounters follow its leader (its level and the creatures it
  // has met), the same for everyone.
  const lead = fighters[0].character;
  // The newest place's creatures, stronger by the leader's level, and those
  // of a Trudna wyprawa stronger still, for more XP and gold.
  const harder = hard ? (challengeAt(lead.level, content)?.hard ?? null) : null;
  const strength = exploreStrength(area, lead.level, content, Boolean(harder));
  const hardXp = 1 + (harder?.xp ?? 0);
  const hardGold = 1 + (harder?.gold ?? 0);
  const durationMs = minutes * 60000;
  // The companions hired in the Osada (companions.js) go along, up to two
  // more members of the party, each with its own HP through the exploration
  // and a rest after each won fight as the character's; once one falls, it
  // keeps to the back for the rest of the way.
  // Each companion along takes xpCost of the character's XP (question 235
  // B: alone, the character gets as much as before).
  // The other players of a Drużyna (src/server/parties.js) fight beside the
  // character as they were when the leader set out, each with its own HP,
  // out once fallen, as the companions, first in the line after the
  // character; each one along takes parties.xpCost of the character's XP
  // (the design document: solo +10% XP, duo +5%, a full party no bonus).
  const others = roster ? fighters.length - 1 : partners.length;
  const partyXp = 1 - companions.length * content.settlement.companions.xpCost - others * content.balance.parties.xpCost;
  // Before the trips' roster, the other players fought beside the character
  // as mates, out once fallen; on a trip they fight as the character does.
  const friends = (roster ? [] : partners).map((/** @type {any} */ partner, /** @type {number} */ index) => {
    const { unit } = settingOut(partner, week, area, `p${index + 1}`, content);
    return { id: partner.id, unit, hp: unit.hp, out: false };
  });
  const mates = [
    ...friends,
    ...companions.map((/** @type {any} */ companion, /** @type {number} */ index) => {
      const unit = companionCombatant(companion, { area, id: `a${index + 1}` }, content);
      return { id: companion.id, unit, hp: unit.maxHp, out: false };
    }),
  ];

  // Each fight pays for the time it stands for (`share`), so every length
  // gives about the same per hour. The first exploration meets no demanding
  // encounter, elite or champion; an avoiding one no elite or champion, and a
  // seeking one meets them more often. In a place too easy for the
  // character, those it has not met come far more often until the first
  // fight with them, and then as usual.
  let catchUp = first || avoidRare ? null : rareCatchUp(lead.level, area, met, content);
  const odds = () => withRareOdds(explorationPace(minutes, content, lead.level), { avoidRare: first || avoidRare, seekRare, catchUp, rumor, more: rareMore }, content);
  let pace = odds();
  if (first) pace = { ...pace, toughChance: 0 };
  const fightCount = pace.fights;
  const share = pace.timeFactor;
  const findCount = countEvents(pace.finds, rng);
  const timeline = [
    ...spread(fightCount, durationMs, rng).map((t) => ({ t, type: 'fight' })),
    ...spread(findCount, durationMs, rng).map((t) => ({ t, type: 'find' })),
  ].sort((a, b) => a.t - b.t);

  // Slots covered by worn items or earlier finds, for loot that fills the gaps.
  // A later base of a family drops where the levels of the place reach the
  // class level it asks for, whatever the character's own: the Otoczak (from
  // class level 10) not in Skraj Wiatrołomów (1–5), but from Lisie Jary
  // (6–10) on. The place's creatures name the affixes: no Puszczyka in
  // Skraj Wiatrołomów, where no tawny owl lives. From a character level on,
  // a share of the items is for other classes, to trade or take apart.
  const filled = new Set(equipped.map((/** @type {Item} */ item) => item.slot));
  const otherClass = content.balance.items.otherClass;
  const otherClassShare = character.level >= otherClass.fromLevel ? otherClass.share : 0;
  // A longer exploration finds unique and rarer items a little more often
  // (482 B, at most +10% at four hours).
  const uniqueBonus = byMinutes(tuning.uniqueLengthFactorByMinutes, minutes);
  // The Siedziba Gildii (616 A): its Sztandar's and Skarbiec's shares more
  // XP and gold, in every fight and find, and its Dom Zwiadowców's more of
  // the rarities with affixes on the items found, as the Ołtarz's blessing
  // of luck raises them (rollRarity in items.js). On a Drużyna's trip each
  // member's own, from its own loot, so the trip's shared fights stay the
  // same; without a seat nothing changes.
  const seatXp = 1 + (seat?.xp ?? 0);
  const seatGold = 1 + (seat?.gold ?? 0);
  // Talia Systemu's collection (884 A): its shares more XP and gold, as the
  // Siedziba's, in every fight and find; on a trip each member's own.
  const cardsXp = 1 + (cards?.xp ?? 0);
  const cardsGold = 1 + (cards?.gold ?? 0);
  const seatRarity = 1 + (seat?.rarity ?? 0);
  const loot = { filled, classId: character.classId, maxClassLevel: area.maxLevel, area, otherClassShare, uniqueBonus, ...(seatRarity !== 1 && { rarityBonus: seatRarity }) };
  const hpStart = me.hp;
  let result = 'success';
  let endedAt = durationMs; // a faint or an escape ends the exploration early
  let xp = 0;
  let gold = 0;
  let timePoints = 0; // from time shards, a rare find
  // Gold from fights before rounding: a short exploration earns fractions per
  // fight, and only the running total is rounded.
  let fightGold = 0;
  // The level as it rises during the exploration, for the XP of later fights.
  const { maxLevel } = content.balance.progression;
  let reached = { level: character.level, xp: character.xp ?? 0 };
  /** @type {Item[]} */
  const items = [];
  /** @type {Record<string, number>} */
  const resources = {}; // { wood: 12, … } found for the camp
  /** @type {Record<string, number>} */
  let materials = {}; // { "wolf-pelt:common": 2, … } from beaten creatures
  // Tropiciel (an evolution's trait, the character's or a companion's form's),
  // and the Bractwo Łowców: more materials from creatures.
  const moreMaterials = (1 + trackerMaterials(character, companions, content)) * (1 + materialsMore) * weekFactor(week, 'materials');
  // The week's shares of the fights' XP and gold (weeks.js).
  const weekXp = weekFactor(week, 'xp');
  const weekGold = weekFactor(week, 'gold');
  const fights = [];
  const entries = [];
  let key = null;
  // An item from a chest. A character without a weapon holds a found one at
  // once, for the rest of the exploration, when its class level lets it wear
  // it (the code review: it fought with a weapon it could not put on after).
  // Not on a trip, whose fights stay the same for every member.
  const take = (/** @type {Item} */ item) => {
    items.push(item);
    if (!roster && item.slot === 'weapon' && !me.worn.some((/** @type {Item} */ held) => held.slot === 'weapon') && canUse(item.base, character.classId, content, character.classLevel)) {
      me.worn = [...me.worn, item];
      me.unit = playerCombatant({ character: me.character, equipped: me.worn, hp: me.hp, name, area }, content);
    }
    return items.length - 1;
  };

  // The Warownia's Ołtarz Systemu (fortress.js): a blessing of `kind` for the
  // exploration's first `blessing.fights` fights, its finds on the way among
  // them: `bonus` more XP, gold or chance of rarer items.
  const blessedWith = (/** @type {string} */ kind, /** @type {number} */ fightsDone) => Boolean(blessing) && blessing.kind === kind && fightsDone < blessing.fights;
  const blessedLoot = (/** @type {Record<string, any>} */ base, /** @type {number} */ fightsDone) =>
    blessedWith('luck', fightsDone) ? { ...base, rarityBonus: (base.rarityBonus ?? 1) * (1 + blessing.bonus) } : base;
  const blessedBy = (/** @type {string} */ kind, /** @type {number} */ fightsDone) => (blessedWith(kind, fightsDone) ? 1 + blessing.bonus : 1);

  // The Osada's wanted poster (wanted.js): in its place, each fight is the
  // fight with its target by the rules' chance, once. Its own seed draws it,
  // so an exploration that does not meet it goes as it would without it.
  // On a Drużyna's trip (since 10.11.2026) the target is the trip's
  // (tripWanted), drawn from the trip's seed, so it comes in the same fight
  // of every member's report; a member whose poster it is not (`own` false)
  // fights it as a strong foe, paid as its fight is, with no trophy, no
  // spoils and no poster fulfilled.
  // Read only where `sought` is, which needs both.
  const rules = /** @type {Record<string, any>} */ (wantedOf(content));
  const sought = rules && wanted && wanted.areaId === area.id && !first ? wanted : null;
  const own = Boolean(sought) && sought.own !== false;
  const wantedRng = /** @type {Rng} */ (sought ? createRng(`${seed}:wanted`) : null);
  const sighting = { met: false, beaten: false };
  // The cards the creatures left (cards.js): the member's own on a trip, as
  // its loot, from its own seed.
  const cardRng = cards && content.cards ? createRng(`${lootSeed ?? seed}:cards`) : null;
  /** @type {string[]} */
  const cardsFound = [];
  // The cards of the creatures of the lands below the place's (902 B).
  const lowerCards = cardRng ? lowerLandCards(areaLand(area.id, content), content) : [];
  const told = (/** @type {string} */ text) => (sought ? gendered(text, sought.female ? 'female' : 'male') : text);

  for (const [step, event] of timeline.entries()) {
    if (event.type === 'find') {
      // A find is gold, a treasure chest with an item of the place's level,
      // resources for the camp, nothing of interest or, rarely, a shard of
      // time (Time Points).
      const findLevel = areaLevel(area, lootRng, content);
      // The week's share more (or less) of the chance of a chest (items).
      const outcomes = raisedOutcome(
        Object.entries(rewards.findOutcomes).filter(([kind]) => !(first && kind === 'chest')),
        'chest',
        weekFactor(week, 'items'),
      );
      const outcome = lootRng.weighted(outcomes, ([, weight]) => weight)[0];
      if (outcome === 'gold') {
        const amount = Math.max(1, Math.round(rewards.findGoldPerLevel * findLevel * lootRng.float(0.5, 1.5) * blessedBy('gold', fights.length) * seatGold * cardsGold * hardGold));
        gold += amount;
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findGold', step, { gold: amount }) });
      } else if (outcome === 'chest') {
        const item = randomItem(findLevel, lootRng, content, blessedLoot(loot, fights.length));
        entries.push({ t: event.t, type: 'find', item: take(item), text: say(texts, 'findChest', step, { item: itemName(item, content) }) });
      } else if (outcome === 'resource') {
        const found = resourceBundle(area, rewards.findResourcePerLevel * findLevel * lootRng.float(0.5, 1.5));
        for (const [id, amount] of found) resources[id] = (resources[id] ?? 0) + amount;
        const list = found.map(([id, amount]) => `${nameInText(content.resourcesById[id].name, content)} +${amount}`).join(', ');
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findResource', step, { resources: list }) });
      } else if (outcome === 'time') {
        const amount = content.balance.timePoints.find;
        timePoints += amount;
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findTime', step, { time: amount }) });
      } else {
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findNothing', step) });
      }
      continue;
    }

    const meeting = Boolean(sought) && !sighting.met && wantedRng.chance(rules.chance);
    if (meeting) sighting.met = true;
    /** @type {Encounter} */
    const encounter = meeting ? wantedEncounter(sought) : rollEncounter(area, rng, content, lead.level, pace, tracked, unknown, scouted);
    if (catchUp && (encounter.elite || encounter.champion)) {
      catchUp = { elite: catchUp.elite && !encounter.elite, champion: catchUp.champion && !encounter.champion };
      if (!catchUp.elite && !catchUp.champion) catchUp = null;
      pace = odds();
    }
    const enemies = encounterCombatants(encounter, content, { strength: meeting ? wantedStrength(area, sought, strength, content) : strength });
    // Each player as it fights now: its strengthening potions still working
    // (in their number of the first fights; a window kept in time, of an
    // exploration started before 0.1.26, while its time lasts), the potions
    // it carries and its trophies.
    const players = fighters.map((/** @type {any} */ fighter) => {
      const kit = fightPotions(fighter.left, fighter.healBelow ?? content.potionUse?.healBelow, content);
      /** @type {Record<string, number>} */
      const on = {};
      for (const [kind, window] of Object.entries(fighter.windows)) {
        if (Number.isFinite(window.fights) ? fights.length < window.fights : event.t < window.ms) on[kind] = window.bonus;
      }
      for (const kind of Object.keys(on)) fighter.buffFights[kind] = (fighter.buffFights[kind] ?? 0) + 1;
      return fightingPlayer({ unit: fighter.unit, character: fighter.character, equipped: fighter.worn, name: fighter.name, area, hp: fighter.hp, on, kit, trophies: fighter.trophies }, content);
    });
    const ally = players[fighters.indexOf(me)];
    const fighting = mates.filter((mate) => !mate.out);
    const allies = [...players, ...fighting.map((mate) => ({ ...mate.unit, hp: mate.hp }))];
    const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
    const hpBefore = me.hp;
    for (const fighter of fighters) fighter.hp = /** @type {Record<string, any>} */ (fight.units.find((unit) => unit.id === fighter.unit.id)).hp;
    for (const mate of fighting) mate.hp = Math.max(0, /** @type {Record<string, any>} */ (fight.units.find((unit) => unit.id === mate.unit.id)).hp);
    // A potion drunk is the one player's that carries it (on a trip, the leader's).
    for (const id of fight.drunk) {
      const drinker = fighters.find((/** @type {any} */ fighter) => (fighter.left[id] ?? 0) > 0) ?? me;
      drinker.left[id] = (drinker.left[id] ?? 0) - 1;
      drinker.potionsUsed[id] = (drinker.potionsUsed[id] ?? 0) + 1;
    }

    // Every fight keeps what its playback needs: the sides and the events.
    /** @type {Record<string, any>} */
    const summary = {
      index: fights.length,
      t: event.t,
      elite: encounter.elite,
      champion: encounter.champion ?? false,
      tough: encounter.tough ?? false,
      ...(meeting && { wanted: true }),
      enemies: enemies.map((/** @type {Record<string, any>} */ enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
      won: fight.won,
      hpBefore,
      hpAfter: me.hp,
      xp: 0,
      gold: 0,
      materials: {},
      chests: [],
      // Talia Systemu's cards the creatures left, with `cards` only.
      ...(cardRng && { cards: /** @type {string[]} */ ([]) }),
      recovered: 0,
      allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
      enemiesView: enemies.map((/** @type {Record<string, any>} */ enemy) => combatantView(enemy, ally.level, content)),
      events: fight.events,
    };
    fights.push(summary);

    // The fight the report opens with: the one that ended the hunt, otherwise
    // the wanted's, the champion, an elite fight, then a demanding one,
    // otherwise the toughest group.
    const score =
      fight.won !== true
        ? 4e9
        : (meeting ? 3.5e9 : encounter.champion ? 3e9 : encounter.elite ? 2e9 : encounter.tough ? 1e9 : 0) + enemies.reduce((/** @type {number} */ sum, /** @type {Record<string, any>} */ e) => sum + e.maxHp, 0);
    if (!key || score > key.score) key = { score, index: summary.index };

    const enemyList = enemies.map((/** @type {Record<string, any>} */ enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
    const start = encounter.champion ? 'championStart' : encounter.elite ? 'eliteStart' : encounter.tough ? 'toughStart' : 'fightStart';
    const lines = [meeting ? told(say(rules.texts, 'meet', step, { enemies: enemyList })) : say(texts, start, step, { enemies: enemyList })];
    for (const mate of fighting.filter((one) => one.hp <= 0)) {
      mate.out = true;
      lines.push(say(texts, 'companionDown', step, { name: mate.unit.name }));
    }

    if (fight.won === true) {
      let fightXp = 0;
      const goldBefore = fightGold;
      for (const enemy of enemies) {
        // The wanted pays as an elite.
        const monster = meeting ? { ...content.monstersById[enemy.monsterId], elite: true } : content.monstersById[enemy.monsterId];
        fightXp +=
          monsterXp(monster, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(reached.level, enemy.level, content);
        const rank = monster.champion ? rewards.championGoldMultiplier : monster.elite ? rewards.eliteGoldMultiplier : 1;
        const goldFactor = rank * enemy.groupFactor * share * (1 + pace.lengthBonus) * blessedBy('gold', fights.length - 1) * seatGold * cardsGold * hardGold * weekGold;
        fightGold += rewards.goldPerLevel * enemy.level * monster.reward.gold * lootRng.float(0.5, 1.5) * goldFactor;
        const weight = enemy.groupFactor * share * (encounter.tough ? rewards.toughDropMultiplier : 1) * moreMaterials;
        summary.materials = addCounts(summary.materials, materialDrops(enemy.monsterId, enemy.level, weight, lootRng, content));
        // A card of the creature (874 A), not of the wanted's target nor
        // twice of one creature in an exploration.
        const card = cardRng && !meeting ? cardDrop(enemy.monsterId, cardRng, { maxed: [...cards.maxed ?? [], ...cardsFound] }, content) : null;
        if (card) {
          summary.cards.push(card);
          cardsFound.push(card);
        }
      }
      // And once for the fight, but the wanted's, a card of a creature of a
      // lower land (902 B): one the character has not got first, none at its
      // top level, none it found on this exploration.
      const lower = cardRng && !meeting ? cardFrom(lowerCards, cardRng, { chance: content.cards.drops.lower, owned: cards.owned ?? [], maxed: cards.maxed ?? [], found: cardsFound }) : null;
      if (lower) {
        summary.cards.push(lower);
        cardsFound.push(lower);
      }
      materials = addCounts(materials, summary.materials);
      // A character without a weapon, and with none found yet, finds a chest
      // with one of its class right after its first won fight (randomItem
      // gives a weapon while none is found). A beaten elite leaves a chest,
      // often with a rarer item, and a beaten champion sometimes one with an
      // epic or rarer item.
      /** @type {[Item, string | null][]} */
      const chests = [];
      if (!filled.has('weapon')) {
        const weapon = randomItem(enemies[0].level, lootRng, content, first ? { ...loot, rarityId: content.rarities[0].id } : blessedLoot(loot, fights.length - 1));
        chests.push([weapon, 'firstChest']);
      }
      if (encounter.elite) {
        chests.push([randomItem(enemies[0].level, lootRng, content, blessedLoot({ ...loot, rarityBonus: rewards.eliteRarityBonus * seatRarity }, fights.length - 1)), 'eliteChest']);
      }
      if (encounter.champion && lootRng.chance(weekChance(rewards.championItemChance, week, 'items'))) {
        const rarityId = championItemRarity(enemies[0].level, lootRng, content);
        chests.push([randomItem(enemies[0].level, lootRng, content, { ...loot, rarityId }), 'championChest']);
      }
      // A beaten outlaw leaves a rarer item, and a variant its trophy.
      const spoils = meeting && own && sought.kind === 'outlaw' ? randomItem(enemies[0].level, lootRng, content, { ...loot, rarityId: wantedLootRarity(lootRng, content) }) : null;
      if (spoils) chests.push([spoils, null]);
      const trophy = meeting && own && sought.trophy ? { [sought.trophy]: 1 } : null;
      if (meeting && own) sighting.beaten = true;
      for (const [item] of chests) summary.chests.push(take(item));
      summary.xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * share * (1 + pace.lengthBonus) * partyXp * blessedBy('xp', fights.length - 1) * seatXp * cardsXp * hardXp * weekXp);
      summary.gold = Math.round(fightGold) - Math.round(goldBefore);
      xp += summary.xp;
      reached = gainXp(reached.level, reached.xp, summary.xp, (level) => xpToNext(level, content), maxLevel);
      gold += summary.gold;
      for (const fighter of fighters) {
        const back = Math.round((fighter.unit.maxHp - fighter.hp) * Math.min(1, fighter.unit.recovery + pace.restBonus));
        if (fighter === me) summary.recovered = back;
        fighter.hp += back;
      }
      for (const mate of fighting.filter((one) => !one.out)) mate.hp += Math.round((mate.unit.maxHp - mate.hp) * Math.min(1, mate.unit.recovery + pace.restBonus));

      lines.push(say(texts, 'victory', step), word(content, 'HP: {before} → {after}. +{xp} XP, +{gold} złota.', { before: hpBefore, after: summary.hpAfter, xp: summary.xp, gold: summary.gold }));
      if (Object.keys(summary.materials).length > 0) {
        lines.push(say(texts, 'materials', step, { materials: materialsText(summary.materials, content) }));
      }
      for (const card of summary.cards ?? []) lines.push(cardDropText(card, step, content, card === lower ? 'lower' : 'drop'));
      for (const [item, text] of chests) lines.push(text ? say(texts, text, step, { item: itemName(item, content) }) : say(rules.texts, 'loot', step, { item: itemName(item, content) }));
      if (trophy) {
        summary.materials = addCounts(summary.materials, trophy);
        materials = addCounts(materials, trophy);
        lines.push(say(rules.texts, 'trophy', step, { material: materialsText(trophy, content) }));
      }
      if (meeting && own) lines.push(told(say(rules.texts, 'won', step)));
      if (summary.recovered > 0) lines.push(say(texts, 'recover', step, { hp: summary.recovered }));
      entries.push({ t: event.t, type: 'fight', fight: summary.index, text: lines.join(' ') });
      continue;
    }

    if (fight.won === false) {
      result = (encounter.elite || encounter.champion || meeting) && area.safe ? 'escaped' : 'fainted';
      for (const fighter of fighters) fighter.hp = Math.max(1, Math.round(fighter.unit.maxHp * tuning.hpAfterFaint));
      lines.push(say(texts, result === 'fainted' ? 'defeat' : 'escape', step, { target: me.unit.name }));
      endedAt = event.t;
    } else {
      result = 'escaped';
      for (const fighter of fighters) fighter.hp = Math.max(1, fighter.hp);
      lines.push(say(texts, 'draw', step, { target: me.unit.name }));
      endedAt = event.t;
    }
    summary.hpAfter = me.hp;
    entries.push({ t: event.t, type: 'fight', fight: summary.index, text: lines.join(' ') });
    break;
  }

  // On the way the character also gathers a little of the region's resources:
  // a steady amount for the time explored, at the place's middle level, so
  // the camp does not wait for lucky finds.
  const gatheredTotal = rewards.gatherPerLevelHour * ((area.minLevel + area.maxLevel) / 2) * (endedAt / 3600000);
  if (gatheredTotal >= 0.5) {
    const gathered = resourceBundle(area, gatheredTotal);
    for (const [id, amount] of gathered) resources[id] = (resources[id] ?? 0) + amount;
    const list = gathered.map(([id, amount]) => `${nameInText(content.resourcesById[id].name, content)} +${amount}`).join(', ');
    entries.push({ t: endedAt, type: 'gather', text: say(texts, 'gathered', timeline.length, { resources: list }) });
  }

  return {
    areaId,
    minutes,
    result,
    xp,
    gold,
    resources,
    materials,
    timePoints,
    items,
    // Talia Systemu's cards the creatures left (cards.js), with `cards` only,
    // and the collection's bonus, for the report's line.
    ...(cardRng && { cards: cardsFound }),
    ...((cardsXp > 1 || cardsGold > 1) && { cardsBonus: { xp: cards?.xp ?? 0, gold: cards?.gold ?? 0 } }),
    hpStart,
    hpEnd: me.hp,
    maxHp: me.unit.maxHp,
    fights,
    entries,
    keyFight: key && { index: key.index },
    potionsUsed: me.potionsUsed,
    buffFights: me.buffFights,
    // The fights the Ołtarz's blessing worked in.
    blessingFights: blessing ? Math.min(fights.length, blessing.fights) : 0,
    // The wanted poster's target: met on the way, and beaten (of a poster of
    // the character's own).
    ...(own && { wanted: { id: sought.id, ...sighting } }),
    ...(harder && { hard: true }),
    // The week it set out in, for its event's fight and the report's line
    // (weeks.js).
    ...(week && { week }),
    // The companions at the end: their HP and whether they fell on the way;
    // the party's players too.
    ...(companions.length > 0 && {
      companions: mates.filter((mate) => !friends.includes(mate)).map((mate) => ({ id: mate.id, name: mate.unit.name, hpEnd: mate.hp, maxHp: mate.unit.maxHp, fainted: mate.out })),
    }),
    ...(friends.length > 0 && { partners: friends.map((/** @type {any} */ mate) => ({ id: mate.id, name: mate.unit.name, hpEnd: mate.hp, maxHp: mate.unit.maxHp, fainted: mate.out })) }),
    ...(roster && { partners: fighters.filter((/** @type {any} */ fighter) => fighter !== me).map((/** @type {any} */ fighter) => ({ id: fighter.id, name: fighter.unit.name, hpEnd: fighter.hp, maxHp: fighter.unit.maxHp, fainted: false })) }),
  };
}

// A faint loses the whole exploration (651 C; the author: „ma być 0
// czegokolwiek + kara”): its XP, gold, resources, materials, items, herbs
// and the Time Points of its finds, and a wanted poster's target beaten on
// the way. The XP penalty comes on top of that (applyHunt). The fights stay
// in the report as they went, without their chests; the potions drunk, the
// blessing's fights and an event's price stay spent, and a companion who
// fell is wounded as before.
/**
 * @param {Hunt} hunt
 */
export function faintForfeit(hunt) {
  if (hunt.result !== 'fainted') return hunt;
  return {
    ...hunt,
    forfeit: true,
    xp: 0,
    gold: 0,
    resources: {},
    materials: {},
    timePoints: 0,
    items: [],
    herbs: {},
    ...(hunt.cards && { cards: [] }),
    fights: hunt.fights.map((/** @type {Record<string, any>} */ fight) => ({ ...fight, chests: [], ...(fight.cards && { cards: [] }) })),
    ...(hunt.wanted && { wanted: { ...hunt.wanted, beaten: false } }),
  };
}

// Applies the hunt's XP to the character. Solo, all of the combat contribution
// is the player's, so class XP equals the XP from fights. Fainting costs only
// character XP, never a level, and never class XP. The class waits at its
// first evolution level while the skills are not ready for it (the second
// path and the Skill Points) and then until the evolution is chosen, and
// after it at the next evolution level while a Skill Point is left
// (evolutionBlock); its XP adds up there until then. `evolutionGate: false`
// lets the progression simulator measure a skill alone, past the level where
// a player would need a second one.
/**
 * @param {Character} character
 * @param {Hunt} hunt
 * @param {Content} content
 * @param {{ evolutionGate?: any, faintShare?: any }} [options3]
 */
export function applyHunt(character, hunt, content, { evolutionGate = true, faintShare = 1 } = {}) {
  const maxLevel = content.balance.progression.maxLevel;
  const next = gainXp(character.level, character.xp, hunt.xp, (level) => xpToNext(level, content), maxLevel);
  const { next: nextClass, wait } = classGain(character, hunt.xp, content, evolutionGate);
  const penalty = hunt.result === 'fainted' ? faintPenalty(next.level, next.xp, content, faintShare) : 0;

  const messages = levelUpMessages(character, { level: next.level, classLevel: nextClass.level }, content);
  if (wait) messages.push(wait);
  if (penalty > 0) messages.push(say(content.texts, 'faintPenalty', 0, { xp: penalty }));
  // Every level brings Time Points, and so do the time shards found.
  const time = content.balance.timePoints;
  const levels = next.level - character.level;
  const classLevels = nextClass.level - character.classLevel;

  return {
    level: next.level,
    xp: next.xp - penalty,
    classLevel: nextClass.level,
    classXp: nextClass.xp,
    penalty,
    // A new level of either kind heals fully (hpAfterHunt).
    levelled: levels > 0 || classLevels > 0,
    timePoints: time.perLevel * levels + time.perClassLevel * classLevels + (hunt.timePoints ?? 0),
    messages,
  };
}

// The class's part of a gain of XP: up to its evolution level while it waits
// there (evolutionBlock), its XP adding up, with the System line saying so
// when it had XP for a level past it (`wait`).
/**
 * @param {Character} character
 * @param {number} xp
 * @param {Content} content
 * @param {any} [evolutionGate]
 */
function classGain(character, xp, content, evolutionGate = true) {
  const maxLevel = content.balance.progression.maxLevel;
  const block = evolutionGate ? evolutionBlock(character, content) : null;
  const waits = Boolean(block);
  const evolution = block?.level ?? maxLevel;
  const toNextClass = (/** @type {number} */ level) => classXpToNext(level, content);
  const next = gainXp(character.classLevel, character.classXp, xp, toNextClass, waits ? evolution : maxLevel, waits);
  const held = waits && gainXp(character.classLevel, character.classXp, xp, toNextClass, maxLevel).level > next.level;
  const waitText = /** @type {Record<string, string>} */ ({ second_path: 'classWaitsPath', skill_points: 'classWaitsPoints', evolve: 'classWaitsEvolution' })[/** @type {string} */ (block?.code)];
  return { next, wait: held ? say(content.texts, waitText, 0, { className: classNameOf(character, content), level: evolution }) : null };
}

// Class XP alone, as the Warownia's Plac treningowy gives it (fortress.js):
// the class's new levels with their Time Points and System lines, as after
// an exploration, without the character's XP.
/**
 * @param {Character} character
 * @param {number} xp
 * @param {Content} content
 */
export function applyClassXp(character, xp, content) {
  const { next, wait } = classGain(character, xp, content);
  const messages = levelUpMessages(character, { level: character.level, classLevel: next.level, heal: false }, content);
  if (wait) messages.push(wait);
  const classLevels = next.level - character.classLevel;
  return { classLevel: next.level, classXp: next.xp, timePoints: content.balance.timePoints.perClassLevel * classLevels, levelled: classLevels > 0, messages };
}

// The System lines of new character and class levels, one gain to a line
// (the author: "taki format będziemy stosować. Czytelniejszy."): the levels
// reached, then the free points, Time Points and Skill Points of all of them
// together, then the heal (`heal`: not for the Plac treningowy's training,
// which does not heal), and last what the new levels open. Before the Stats
// screen opens, the line with the points says when they can be spent.
/**
 * @param {Character} character
 * @param {{ level: number, classLevel?: any, heal?: any }} options1
 * @param {Content} content
 */
export function levelUpMessages(character, { level, classLevel = character.classLevel, heal = true }, content) {
  const levels = level - character.level;
  const classLevels = classLevel - character.classLevel;
  if (levels <= 0 && classLevels <= 0) return [];
  const { texts } = content;
  const perLevel = content.statIds.length;
  const time = content.balance.timePoints;
  const unlockLevel = content.unlocksById.stats.level;
  // Skill Points come with each class level from the one the skills open at,
  // and after the evolution with those it adds; the class goes by its
  // evolution's name (the code review: both left the evolution out).
  const { evolution } = character;
  const skillGain = skillPoints({ classLevel, evolution }, content).earned - skillPoints({ classLevel: character.classLevel, evolution }, content).earned;
  const messages = [];
  if (levels > 0) messages.push(say(texts, 'levelUp', 0, { level }));
  if (classLevels > 0) messages.push(say(texts, 'classLevelUp', 0, { className: classNameOf(character, content), level: classLevel }));
  messages.push(
    say(texts, level < unlockLevel ? 'statPointsWaiting' : 'statPointsGained', 0, { points: perLevel * levels + Math.floor(perLevel / 4) * classLevels, unlockLevel }),
    say(texts, 'timePointsGained', 0, { time: time.perLevel * levels + time.perClassLevel * classLevels }),
  );
  if (skillGain > 0) messages.push(say(texts, 'skillPoints', 0, { points: skillGain }));
  if (heal) messages.push(say(texts, character.appearance === 'female' ? 'levelHealFemale' : 'levelHeal', 0, {}));
  for (let at = character.level + 1; at <= level; at++) messages.push(...unlockMessages(at, content));
  for (let at = character.classLevel + 1; at <= classLevel; at++) messages.push(...classUnlockMessages(at, content));
  return messages;
}

// HP when the report is claimed: a new character or class level heals the
// character fully at its new level, with the gear it wears then (and will
// refill mana once something spends it); otherwise what the exploration left.
/**
 * @param {{ character: Character, applied: Record<string, any>, hunt: Hunt, equipped: Item[], name: string }} options
 * @param {Content} content
 */
export function hpAfterHunt({ character, applied, hunt, equipped, name }, content) {
  if (!applied.levelled) return hunt.hpEnd;
  const levelled = { ...character, level: applied.level, xp: applied.xp, classLevel: applied.classLevel, classXp: applied.classXp };
  return playerCombatant({ character: levelled, equipped, name }, content).maxHp;
}

// "Zużyte mikstury: 2 × Mniejsza mikstura leczenia." and the fights each
// kind of potion for a time worked in, or nothing for an exploration without
// potions.
/**
 * @param {Hunt} hunt
 * @param {Content} content
 */
function potionsLines(hunt, content) {
  const texts = content.potionUse?.texts;
  const used = Object.entries(hunt.potionsUsed ?? {}).filter(([id]) => content.potionsById[id]);
  const lines = [];
  if (used.length > 0) lines.push(say(texts, 'used', 0, { potions: used.map(([id, count]) => `${count} × ${content.potionsById[id].name}`).join(', ') }));
  for (const kind of TIMED_KINDS) {
    const fights = hunt.buffFights?.[kind] ?? 0;
    if (fights > 0) lines.push(say(texts, `${kind}Fights`, 0, { fights, all: hunt.fights.length }));
  }
  return lines;
}

// `autoEquipped`: indices of the finds that went straight into empty slots.
// `overflow`: what the scrapper bought because the bag was full
// ({ capacity, count, gold, sold: indices of the finds among them }).
/**
 * @param {{ hunt: Hunt, applied: Record<string, any>, character: Character, areaId: string, startedAt: number, endsAt: number, autoEquipped?: number[], overflow?: any }} options
 * @param {Content} content
 */
export function huntReport({ hunt, applied, character, areaId, startedAt, endsAt, autoEquipped = [], overflow = null }, content) {
  const area = content.areasById[areaId];
  const best = hunt.items.reduce(
    (/** @type {Record<string, any>} */ top, /** @type {Item} */ item) => (top === null || itemRank(item, content) > itemRank(top, content) ? item : top),
    null,
  );
  return {
    kind: 'hunt',
    areaId,
    areaName: area.name,
    regionId: area.regionId,
    regionName: area.regionName,
    minutes: hunt.minutes,
    startedAt,
    endsAt,
    result: hunt.result,
    resultText: content.texts.result[hunt.result],
    ...(hunt.hard && { hard: true }),
    summary: {
      // A faint loses all the exploration brought (faintForfeit), said in
      // a line.
      ...(hunt.forfeit && { forfeit: say(content.texts, 'faintForfeit', 0, {}) }),
      // Fights give the same XP to the character and the class (solo); the
      // fainting penalty takes only character XP.
      xp: hunt.xp,
      classXp: hunt.xp,
      penalty: applied.penalty,
      gold: hunt.gold,
      resources: hunt.resources,
      timePoints: applied.timePoints,
      fights: hunt.fights.length,
      itemsFound: hunt.items.length,
      bestFind: best && itemView(best, content),
      materials: Object.entries(hunt.materials ?? {}).map(([key, count]) => materialView(key, count, content)),
      levelBefore: character.level,
      levelAfter: applied.level,
      classLevelBefore: character.classLevel,
      classLevelAfter: applied.classLevel,
      hpStart: hunt.hpStart,
      hpEnd: hunt.hpEnd,
      maxHp: hunt.maxHp,
      // The potions drunk in the fights and the fights a speed potion sped
      // up (potions.js), each told in a line.
      potions: potionsLines(hunt, content),
    },
    system: [
      ...applied.messages,
      ...autoEquipped.map((index, i) => {
        const item = hunt.items[index];
        return say(content.texts, 'autoEquip', i, { item: itemName(item, content), slot: content.slotsById[item.slot].name });
      }),
      ...(overflow && overflow.count > 0 ? [say(content.texts, 'bagOverflow', 0, overflow)] : []),
      // The week it set out in, where its effects changed the result
      // ("Tydzień Kuny: +5% złota z walk.", weeks.js), and Talia Systemu's
      // collection, where its bonus did (cards.js).
      ...[weekLine(hunt, content), cardBonusLine(hunt, content)].filter(Boolean),
    ],
    items: hunt.items.map((/** @type {Item} */ item, /** @type {number} */ index) => ({ ...itemView(item, content), ...(overflow?.sold.includes(index) && { sold: true }) })),
    fights: hunt.fights.map((/** @type {Record<string, any>} */ fight) => ({
      t: fight.t,
      elite: fight.elite,
      champion: fight.champion ?? false,
      tough: fight.tough,
      // The fight of an event at the exploration's end (events.js).
      ...(fight.event && { event: true }),
      // The fight with a wanted poster's target (wanted.js).
      ...(fight.wanted && { wanted: true }),
      won: fight.won,
      hpBefore: fight.hpBefore,
      hpAfter: fight.hpAfter,
      xp: fight.xp,
      gold: fight.gold,
      materials: Object.entries(fight.materials).map(([key, count]) => materialView(key, count, content)),
      chests: fight.chests.length,
      allies: fight.allies,
      enemies: fight.enemiesView,
      events: fight.events,
    })),
    keyFight: hunt.keyFight,
    entries: hunt.entries,
    // The event at the exploration's end and the option chosen (events.js).
    event: hunt.event ?? null,
    // The potions drunk, by id (potions.js).
    potionsUsed: hunt.potionsUsed ?? {},
  };
}
