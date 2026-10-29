// An exploration (called a hunt in the code): fights and finds spread over the
// chosen time in one inner region (an area). Fights grow slowly with time
// (1 minute: 1 fight, an hour: 4), but each stands for its share of the time,
// so XP, gold and materials follow the time spent. Beaten creatures leave
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

import { combatantView, monsterCombatant, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { addCounts, materialDrops, materialView, materialsText } from './crafting.js';
import { itemName, itemRank, itemView, randomItem } from './items.js';
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
import { say } from './text.js';
import { classUnlockMessages, unlockMessages } from './unlocks.js';
import { evolutionBlock, skillPoints } from './skills.js';

// Value of [minutes, value] pairs at `minutes`, rising with the logarithm of
// the time between pairs.
function byMinutes(pairs, minutes) {
  if (minutes <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    const [m0, v0] = pairs[i - 1];
    const [m1, v1] = pairs[i];
    if (minutes <= m1) return v0 + ((v1 - v0) * Math.log(minutes / m0)) / Math.log(m1 / m0);
  }
  return pairs.at(-1)[1];
}

// How an exploration of this length goes: the number of fights (the pair
// with the most minutes not above its time), the time each fight stands for
// against the reference, and the odds of a demanding encounter, the elite
// and, where it lives, the champion.
export function explorationPace(minutes, content) {
  const tuning = content.balance.hunt;
  const fights = tuning.fightsByMinutes.filter(([from]) => from <= minutes).at(-1)?.[1] ?? 1;
  const timeFactor = minutes / fights / tuning.minutesPerFightReference;
  return {
    fights,
    timeFactor,
    toughChance: byMinutes(tuning.toughChanceByMinutes, minutes),
    // The elite and the champion keep their rate per hour, so each fight of a
    // long exploration meets them more often.
    eliteChance: Math.min(1, tuning.eliteChancePerFight * timeFactor),
    championChance: Math.min(1, tuning.championChancePerFight * timeFactor),
    finds: minutes / tuning.findIntervalMinutes,
  };
}

// The most potions of a kind an exploration of `minutes` takes along
// (potions.js): one for each of its fights.
export const potionsPerKind = (minutes, content) => explorationPace(minutes, content).fights;

// The pace with the elite and the champion avoided (none of them) or sought
// (rareSeekFactor times as often, the author: "niech zwiększa to szansę
// dwukrotnie"), and with those of `catchUp` (rareCatchUp) met in at least
// rareCatchUpChance of the fights.
export function withRareOdds(pace, { avoidRare = false, seekRare = false, catchUp = null }, content) {
  if (avoidRare) return { ...pace, eliteChance: 0, championChance: 0 };
  if (!seekRare && !catchUp) return pace;
  const { rareSeekFactor, rareCatchUpChance } = content.balance.hunt;
  const odds = (chance, unmet) => Math.min(1, Math.max(seekRare ? chance * rareSeekFactor : chance, unmet ? rareCatchUpChance : 0));
  return { ...pace, eliteChance: odds(pace.eliteChance, catchUp?.elite), championChance: odds(pace.championChance, catchUp?.champion) };
}

// A place whose strongest creatures already give the character less XP
// (lowLevelMultiplier).
export const easyPlace = (characterLevel, area, content) => characterLevel - area.maxLevel > content.balance.hunt.lowLevelFreeDiff;

// The author: "Jak ktoś ma już karę za łatwe miejsce, musi mieć jednorazowy
// mocny bonus na znalezienie Elity/Czempiona, żeby uzupełnić swój
// bestiariusz. Później wraca to do normy." In a place too easy for the
// character, which of its elite and champion the character has not met yet
// (`met`: the ids of the creatures met), or null. Null too when `met` is
// not known.
export function rareCatchUp(characterLevel, area, met, content) {
  if (!met || !easyPlace(characterLevel, area, content)) return null;
  const elite = Boolean(area.elite) && !met.includes(area.elite);
  const champion = Boolean(area.champion) && !met.includes(area.champion);
  return elite || champion ? { elite, champion } : null;
}

// The champion is drawn only where it lives, so other places keep their draws.
export function rollEncounter(area, rng, content, characterLevel, pace, tracked = []) {
  if (area.champion && rng.chance(pace.championChance)) return championEncounter(area, content);
  if (rng.chance(pace.eliteChance)) return eliteEncounter(area, content);
  const weight = encounterWeight(tracked, content);
  const tough = toughEncountersFor(area, characterLevel);
  if (tough.length > 0 && rng.chance(pace.toughChance)) {
    return regularEncounter(rng.weighted(tough, weight), area, rng, content, { tough: true, characterLevel });
  }
  return regularEncounter(rng.weighted(encountersFor(area, characterLevel), weight), area, rng, content, { characterLevel });
}

// An encounter's weight: by half more (questTrackBonus) with a creature the
// character tracks for its quests ("Trop przede wszystkim stwory z zadań").
const encounterWeight = (tracked, content) => (encounter) =>
  encounter.weight * (encounter.monsters.some((id) => tracked.includes(id)) ? 1 + content.balance.hunt.questTrackBonus : 1);

// The inner region for an id. Activities and reports from before inner regions
// name a whole region: they get its inner region for the character's level.
export function areaFor(id, characterLevel, content) {
  const area = content.areasById[id];
  if (area) return area;
  const region = content.regionsById[id];
  return region && (region.areas.find((candidate) => characterLevel <= candidate.maxLevel) ?? region.areas.at(-1));
}

// Some encounters (pairs at the end of the first area) appear only from a level on.
export const encountersFor = (area, characterLevel) =>
  area.encounters.filter((encounter) => characterLevel >= (encounter.minLevel ?? 1));

export const toughEncountersFor = (area, characterLevel) =>
  (area.tough ?? []).filter((encounter) => characterLevel >= (encounter.minLevel ?? 1));

// The local elite: above the strongest monsters of the place.
export function eliteEncounter(area, content) {
  return { elite: true, members: [{ monsterId: area.elite, level: area.maxLevel + content.balance.hunt.eliteLevelBonus }] };
}

// The region's champion, alone and above the elite.
export function championEncounter(area, content) {
  return { elite: false, champion: true, members: [{ monsterId: area.champion, level: area.maxLevel + content.balance.hunt.championLevelBonus }] };
}

// The creatures that may meet a character in an inner region (its
// Bestiariusz), each with the levels it can come at: the place's range
// in the usual encounters, some levels above it in the demanding ones, the
// elite above the strongest and the champion above the elite. In the order
// of the place's encounters, then the elite and the champion.
export function areaDangers(area, content) {
  const { toughLevelBonus, eliteLevelBonus, championLevelBonus } = content.balance.hunt;
  const dangers = new Map();
  const add = (monsterId, minLevel, maxLevel, kind = {}) => {
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
export function meetingChances(area, content) {
  const pace = explorationPace(content.balance.bestiary.chanceMinutes, content);
  const champion = area.champion ? pace.championChance : 0;
  const elite = (1 - champion) * pace.eliteChance;
  const tough = toughEncountersFor(area, area.maxLevel);
  const toughShare = tough.length > 0 ? pace.toughChance : 0;
  const rest = 1 - champion - elite;
  const chances = new Map();
  const add = (monsterId, chance) => chances.set(monsterId, (chances.get(monsterId) ?? 0) + chance);
  const addTable = (encounters, share) => {
    const total = encounters.reduce((sum, encounter) => sum + encounter.weight, 0);
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
export function regionDangers(region, content) {
  const dangers = new Map();
  for (const area of region.areas) {
    for (const danger of areaDangers(area, content)) {
      const known = dangers.get(danger.monsterId);
      if (!known) dangers.set(danger.monsterId, { ...danger });
      else Object.assign(known, { minLevel: Math.min(known.minLevel, danger.minLevel), maxLevel: Math.max(known.maxLevel, danger.maxLevel) });
    }
  }
  const rank = (danger) => (danger.champion ? 2 : danger.elite ? 1 : 0);
  return [...dangers.values()].sort((a, b) => rank(a) - rank(b));
}

// The chest of an inner region's Bestiariusz, opened once every creature on
// its list is met (balance.bestiary): gold growing along a curve with the
// place's highest level, from 30 in Skraj Wiatrołomów to 600 in Serce
// Uroczyska, Punkty Czasu growing by the same step with each next inner
// region (the author: "+10 co kolejny region"), from 5 to 95, and the same
// Punkty Systemu in each (the author: "równo +20 Punktów Systemu").
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
export function landBestiaryChest(region, content) {
  const { landFactor, goldStep } = content.balance.bestiary;
  const last = region.areas.reduce((top, area) => (area.maxLevel > top.maxLevel ? area : top));
  const chest = bestiaryChest(last, content);
  return {
    gold: Math.round((chest.gold * landFactor) / goldStep) * goldStep,
    timePoints: Math.round(chest.timePoints * landFactor),
    systemPoints: Math.round(chest.systemPoints * landFactor),
  };
}

const allMet = (dangers, met) => {
  const known = new Set(met);
  return dangers.every((danger) => known.has(danger.monsterId));
};

// Whether the character has met every creature on the inner region's list,
// and on the whole land's.
export const bestiaryFull = (area, met, content) => allMet(areaDangers(area, content), met);
export const landBestiaryFull = (region, met, content) => allMet(regionDangers(region, content), met);

// The creatures on the Bestiariusz list of an inner region or a land, by id.
function listedDangers(id, content) {
  if (content.areasById[id]) return areaDangers(content.areasById[id], content);
  if (content.regionsById[id]) return regionDangers(content.regionsById[id], content);
  return null;
}

// How an opened chest is kept: its id and how many creatures its list had,
// "windfalls-edge:5".
export const openedChestEntry = (id, content) => `${id}:${listedDangers(id, content).length}`;

// The chests open for the lists as they are now, by id. A list that has
// grown since its chest was opened opens it again, with the same reward
// (the author: "nowe stwory dadzą kolejne nagrody, mimo że ktoś je już
// wcześniej odebrał… niech tak zostanie. Przy okazji ludzie będą mieli powód
// by zwiedzić starsze poziomy"). A chest kept by its id alone was opened
// before the creatures of balance.bestiary.laterCreatures came.
export function openedChests(entries, content) {
  const later = new Set(content.balance.bestiary.laterCreatures);
  return entries.flatMap((entry) => {
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
export function areaLevel(area, rng, content) {
  const weights = content.balance.hunt.monsterLevelWeights;
  const offsets = Array.from({ length: area.maxLevel - area.minLevel + 1 }, (_, i) => i);
  return area.minLevel + rng.weighted(offsets, (i) => weights[Math.min(i, weights.length - 1)]);
}

// Monsters have the levels of the place: a group shares one level. A
// demanding encounter is some levels above that. Only a new character (up to
// beginnerLevel, the first minutes of the game, still without a weapon at the
// start) meets the lowest level of the place.
export function regularEncounter(encounter, area, rng, content, { tough = false, characterLevel } = {}) {
  const { toughLevelBonus, beginnerLevel } = content.balance.hunt;
  const bonus = tough ? (encounter.levelBonus ?? toughLevelBonus) : 0;
  const level = characterLevel <= beginnerLevel ? area.minLevel : areaLevel(area, rng, content);
  return { elite: false, tough, members: encounter.monsters.map((monsterId) => ({ monsterId, level: level + bonus })) };
}

// The rarity of the item a beaten champion of `level` leaves: the weights
// of the highest championItems step its level has reached.
export function championItemRarity(level, rng, content) {
  const steps = content.balance.rewards.championItems;
  const step = steps.filter((candidate) => candidate.fromLevel <= level).at(-1) ?? steps[0];
  return rng.weighted(Object.entries(step.rarities), ([, weight]) => weight)[0];
}

// Repeated monsters get numbers: "Wilk 1", "Wilk 2".
export function encounterCombatants(encounter, content) {
  const counts = {};
  for (const member of encounter.members) counts[member.monsterId] = (counts[member.monsterId] ?? 0) + 1;
  const seen = {};
  const groupFactor = content.balance.hunt.groupFactors[encounter.members.length - 1];
  return encounter.members.map((member, index) => {
    seen[member.monsterId] = (seen[member.monsterId] ?? 0) + 1;
    const baseName = content.monstersById[member.monsterId].name;
    const name = counts[member.monsterId] > 1 ? `${baseName} ${seen[member.monsterId]}` : baseName;
    return monsterCombatant({ ...member, id: `e${index}`, name, groupFactor }, content);
  });
}

function spread(count, durationMs, rng) {
  return Array.from({ length: count }, (_, i) => Math.round(((i + rng.float(0.2, 0.8)) / count) * durationMs));
}

// A resource find: `total` units split by the region's weights, so every kind
// comes in small, steady amounts rather than in rare, large ones. At least
// one unit of the most common kind.
export function resourceBundle(area, total) {
  const weights = Object.entries(area.resources).filter(([, weight]) => weight > 0);
  const sum = weights.reduce((acc, [, weight]) => acc + weight, 0);
  const found = weights.map(([id, weight]) => [id, Math.round((total * weight) / sum)]).filter(([, amount]) => amount > 0);
  if (found.length > 0) return found;
  const [top] = weights.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return [[top, 1]];
}

// `first`: the character's very first exploration, which goes one way:
// regular encounters only, no chests among the finds, and the one treasure
// is a plain weapon of its class after the first won fight. `potions`: the
// potions taken along, by id, the healing one drunk below `healBelow`;
// `buffs`: the potions for a time drunk before, by kind, each with its bonus
// for the first `ms` of the exploration, and `speed` the same for a speed
// potion alone, as explorations started before the other kinds kept it
// (potions.js).
export function simulateHunt(
  { character, equipped, hp, name, areaId, minutes, seed, first = false, avoidRare = false, seekRare = false, tracked = [], met = null, potions = {}, healBelow, buffs = {}, speed = null },
  content,
) {
  const rng = createRng(seed);
  const tuning = content.balance.hunt;
  const rewards = content.balance.rewards;
  const texts = content.texts;
  const area = content.areasById[areaId];
  let worn = equipped;
  let player = playerCombatant({ character, equipped: worn, hp, name, area }, content);
  const durationMs = minutes * 60000;

  // Each fight pays for the time it stands for (`share`), so every length
  // gives about the same per hour. The first exploration meets no demanding
  // encounter, elite or champion; an avoiding one no elite or champion, and a
  // seeking one meets them more often. In a place too easy for the
  // character, those it has not met come far more often until the first
  // fight with them, and then as usual.
  let catchUp = first || avoidRare ? null : rareCatchUp(character.level, area, met, content);
  const odds = () => withRareOdds(explorationPace(minutes, content), { avoidRare: first || avoidRare, seekRare, catchUp }, content);
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
  const filled = new Set(equipped.map((item) => item.slot));
  const otherClass = content.balance.items.otherClass;
  const otherClassShare = character.level >= otherClass.fromLevel ? otherClass.share : 0;
  const loot = { filled, classId: character.classId, maxClassLevel: area.maxLevel, area, otherClassShare };
  const hpStart = player.hp;
  let hpNow = player.hp;
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
  const items = [];
  const resources = {}; // { wood: 12, … } found for the camp
  let materials = {}; // { "wolf-pelt:common": 2, … } from beaten creatures
  const fights = [];
  const entries = [];
  let key = null;
  // The potions still carried and those drunk, by id, and, by kind, the
  // fights the potions for a time worked in. The aconite oil coats a blade
  // that has no coat of its own yet.
  const left = { ...potions };
  const potionsUsed = {};
  const windows = { ...(speed && { speed }), ...buffs };
  const buffFights = {};
  const oil = content.potions.find((potion) => potion.effect.poison)?.dot;
  // An item from a chest. A character without a weapon holds a found one at
  // once, for the rest of the exploration.
  const take = (item) => {
    items.push(item);
    if (item.slot === 'weapon' && !worn.some((held) => held.slot === 'weapon')) {
      worn = [...worn, item];
      player = playerCombatant({ character, equipped: worn, hp: hpNow, name, area }, content);
    }
    return items.length - 1;
  };

  for (const [step, event] of timeline.entries()) {
    if (event.type === 'find') {
      // A find is gold, a treasure chest with an item of the place's level,
      // resources for the camp, nothing of interest or, rarely, a shard of
      // time (Time Points).
      const findLevel = areaLevel(area, rng, content);
      const outcomes = Object.entries(rewards.findOutcomes).filter(([kind]) => !(first && kind === 'chest'));
      const outcome = rng.weighted(outcomes, ([, weight]) => weight)[0];
      if (outcome === 'gold') {
        const amount = Math.max(1, Math.round(rewards.findGoldPerLevel * findLevel * rng.float(0.5, 1.5)));
        gold += amount;
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findGold', step, { gold: amount }) });
      } else if (outcome === 'chest') {
        const item = randomItem(findLevel, rng, content, loot);
        entries.push({ t: event.t, type: 'find', item: take(item), text: say(texts, 'findChest', step, { item: itemName(item, content) }) });
      } else if (outcome === 'resource') {
        const found = resourceBundle(area, rewards.findResourcePerLevel * findLevel * rng.float(0.5, 1.5));
        for (const [id, amount] of found) resources[id] = (resources[id] ?? 0) + amount;
        const list = found.map(([id, amount]) => `${content.resourcesById[id].name.toLowerCase()} +${amount}`).join(', ');
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

    const encounter = rollEncounter(area, rng, content, character.level, pace, tracked);
    if (catchUp && (encounter.elite || encounter.champion)) {
      catchUp = { elite: catchUp.elite && !encounter.elite, champion: catchUp.champion && !encounter.champion };
      if (!catchUp.elite && !catchUp.champion) catchUp = null;
      pace = odds();
    }
    const enemies = encounterCombatants(encounter, content);
    const kit = fightPotions(left, healBelow ?? content.potionUse?.healBelow, content);
    const on = {};
    for (const [kind, window] of Object.entries(windows)) if (event.t < window.ms) on[kind] = window.bonus;
    // Focus raises Intelekt and Mądrość, which the character's numbers grow from.
    const base = on.focus ? playerCombatant({ character, equipped: worn, hp: hpNow, name, area, statBoost: { intellect: on.focus, wisdom: on.focus } }, content) : player;
    const ally = {
      ...base,
      hp: hpNow,
      ...(on.speed && { speed: base.speed * (1 + on.speed) }),
      ...(on.armor && { armor: Math.round(base.armor * (1 + on.armor)) }),
      ...(on.damage && { damageBonus: on.damage }),
      ...(on.ward && { ward: on.ward }),
      ...(on.poison && oil && !base.weapon.dot && { weapon: { ...base.weapon, dot: { ...oil, chance: on.poison } } }),
      ...(Object.keys(kit).length > 0 && { potions: kit }),
    };
    const fight = simulateFight({ allies: [ally], enemies, rng, content, record: true, trait: area.trait });
    const hpBefore = hpNow;
    hpNow = fight.units.find((unit) => unit.id === ally.id).hp;
    for (const id of fight.drunk) {
      left[id] -= 1;
      potionsUsed[id] = (potionsUsed[id] ?? 0) + 1;
    }
    for (const kind of Object.keys(on)) buffFights[kind] = (buffFights[kind] ?? 0) + 1;

    // Every fight keeps what its playback needs: the sides and the events.
    const summary = {
      index: fights.length,
      t: event.t,
      elite: encounter.elite,
      champion: encounter.champion ?? false,
      tough: encounter.tough ?? false,
      enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
      won: fight.won,
      hpBefore,
      hpAfter: hpNow,
      xp: 0,
      gold: 0,
      materials: {},
      chests: [],
      recovered: 0,
      allies: [combatantView(ally, enemies[0].level, content)],
      enemiesView: enemies.map((enemy) => combatantView(enemy, ally.level, content)),
      events: fight.events,
    };
    fights.push(summary);

    // The fight the report opens with: the one that ended the hunt, otherwise
    // the champion, an elite fight, then a demanding one, otherwise the
    // toughest group.
    const score =
      fight.won !== true
        ? 4e9
        : (encounter.champion ? 3e9 : encounter.elite ? 2e9 : encounter.tough ? 1e9 : 0) + enemies.reduce((sum, e) => sum + e.maxHp, 0);
    if (!key || score > key.score) key = { score, index: summary.index };

    const enemyList = enemies.map((enemy) => `${enemy.name} (poz. ${enemy.level})`).join(', ');
    const start = encounter.champion ? 'championStart' : encounter.elite ? 'eliteStart' : encounter.tough ? 'toughStart' : 'fightStart';
    const lines = [say(texts, start, step, { enemies: enemyList })];

    if (fight.won === true) {
      let fightXp = 0;
      const goldBefore = fightGold;
      for (const enemy of enemies) {
        const monster = content.monstersById[enemy.monsterId];
        fightXp +=
          monsterXp(monster, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(reached.level, enemy.level, content);
        const rank = monster.champion ? rewards.championGoldMultiplier : monster.elite ? rewards.eliteGoldMultiplier : 1;
        const goldFactor = rank * enemy.groupFactor * share;
        fightGold += rewards.goldPerLevel * enemy.level * monster.reward.gold * rng.float(0.5, 1.5) * goldFactor;
        const weight = enemy.groupFactor * share * (encounter.tough ? rewards.toughDropMultiplier : 1);
        summary.materials = addCounts(summary.materials, materialDrops(enemy.monsterId, enemy.level, weight, rng, content));
      }
      materials = addCounts(materials, summary.materials);
      // A character without a weapon, and with none found yet, finds a chest
      // with one of its class right after its first won fight (randomItem
      // gives a weapon while none is found). A beaten elite leaves a chest,
      // often with a rarer item, and a beaten champion sometimes one with an
      // epic or rarer item.
      const chests = [];
      if (!filled.has('weapon')) {
        const weapon = randomItem(enemies[0].level, rng, content, first ? { ...loot, rarityId: content.rarities[0].id } : loot);
        chests.push([weapon, 'firstChest']);
      }
      if (encounter.elite) {
        chests.push([randomItem(enemies[0].level, rng, content, { ...loot, rarityBonus: rewards.eliteRarityBonus }), 'eliteChest']);
      }
      if (encounter.champion && rng.chance(rewards.championItemChance)) {
        const rarityId = championItemRarity(enemies[0].level, rng, content);
        chests.push([randomItem(enemies[0].level, rng, content, { ...loot, rarityId }), 'championChest']);
      }
      for (const [item] of chests) summary.chests.push(take(item));
      summary.xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * share);
      summary.gold = Math.round(fightGold) - Math.round(goldBefore);
      xp += summary.xp;
      reached = gainXp(reached.level, reached.xp, summary.xp, (level) => xpToNext(level, content), maxLevel);
      gold += summary.gold;
      summary.recovered = Math.round((player.maxHp - hpNow) * player.recovery);
      hpNow += summary.recovered;

      lines.push(say(texts, 'victory', step), `HP: ${hpBefore} → ${summary.hpAfter}. +${summary.xp} XP, +${summary.gold} złota.`);
      if (Object.keys(summary.materials).length > 0) {
        lines.push(say(texts, 'materials', step, { materials: materialsText(summary.materials, content) }));
      }
      for (const [item, text] of chests) lines.push(say(texts, text, step, { item: itemName(item, content) }));
      if (summary.recovered > 0) lines.push(say(texts, 'recover', step, { hp: summary.recovered }));
      entries.push({ t: event.t, type: 'fight', fight: summary.index, text: lines.join(' ') });
      continue;
    }

    if (fight.won === false) {
      result = (encounter.elite || encounter.champion) && area.safe ? 'escaped' : 'fainted';
      hpNow = Math.max(1, Math.round(player.maxHp * tuning.hpAfterFaint));
      lines.push(say(texts, result === 'fainted' ? 'defeat' : 'escape', step, { target: player.name }));
      endedAt = event.t;
    } else {
      result = 'escaped';
      hpNow = Math.max(1, hpNow);
      lines.push(say(texts, 'draw', step, { target: player.name }));
      endedAt = event.t;
    }
    summary.hpAfter = hpNow;
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
    const list = gathered.map(([id, amount]) => `${content.resourcesById[id].name.toLowerCase()} +${amount}`).join(', ');
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
    hpStart,
    hpEnd: hpNow,
    maxHp: player.maxHp,
    fights,
    entries,
    keyFight: key && { index: key.index },
    potionsUsed,
    buffFights,
  };
}

// Applies the hunt's XP to the character. Solo, all of the combat contribution
// is the player's, so class XP equals the XP from fights. Fainting costs only
// character XP, never a level, and never class XP. The class waits at its
// first evolution level while the skills are not ready for it (the second
// path and the Skill Points, evolutionBlock), and its XP adds up there until
// then. `evolutionGate: false` lets the progression simulator measure a skill
// alone, past the level where a player would need a second one.
export function applyHunt(character, hunt, content, { evolutionGate = true } = {}) {
  const maxLevel = content.balance.progression.maxLevel;
  const evolution = content.balance.progression.classEvolutionLevels[0];
  const block = evolutionGate ? evolutionBlock(character, content) : null;
  const waits = Boolean(block);
  const next = gainXp(character.level, character.xp, hunt.xp, (level) => xpToNext(level, content), maxLevel);
  const toNextClass = (level) => classXpToNext(level, content);
  const nextClass = gainXp(character.classLevel, character.classXp, hunt.xp, toNextClass, waits ? evolution : maxLevel, waits);
  // The class had XP for a level past its evolution level and waits instead.
  const held = waits && gainXp(character.classLevel, character.classXp, hunt.xp, toNextClass, maxLevel).level > nextClass.level;
  const penalty = hunt.result === 'fainted' ? faintPenalty(next.level, next.xp, content) : 0;

  const messages = levelUpMessages(character, { level: next.level, classLevel: nextClass.level }, content);
  const className = content.classesById[character.classId].name;
  if (held) messages.push(say(content.texts, block.code === 'second_path' ? 'classWaitsPath' : 'classWaitsPoints', 0, { className, level: evolution }));
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

// The System lines of new character and class levels, one gain to a line
// (the author: "taki format będziemy stosować. Czytelniejszy."): the levels
// reached, then the free points, Time Points and Skill Points of all of them
// together, then the heal, and last what the new levels open. Before the
// Stats screen opens, the line with the points says when they can be spent.
export function levelUpMessages(character, { level, classLevel = character.classLevel }, content) {
  const levels = level - character.level;
  const classLevels = classLevel - character.classLevel;
  if (levels <= 0 && classLevels <= 0) return [];
  const { texts } = content;
  const perLevel = content.statIds.length;
  const time = content.balance.timePoints;
  const unlockLevel = content.unlocksById.stats.level;
  // Skill Points come with each class level from the one the skills open at.
  const skillGain = skillPoints({ classLevel }, content).earned - skillPoints({ classLevel: character.classLevel }, content).earned;
  const messages = [];
  if (levels > 0) messages.push(say(texts, 'levelUp', 0, { level }));
  if (classLevels > 0) messages.push(say(texts, 'classLevelUp', 0, { className: content.classesById[character.classId].name, level: classLevel }));
  messages.push(
    say(texts, level < unlockLevel ? 'statPointsWaiting' : 'statPointsGained', 0, { points: perLevel * levels + Math.floor(perLevel / 4) * classLevels, unlockLevel }),
    say(texts, 'timePointsGained', 0, { time: time.perLevel * levels + time.perClassLevel * classLevels }),
  );
  if (skillGain > 0) messages.push(say(texts, 'skillPoints', 0, { points: skillGain }));
  messages.push(say(texts, character.appearance === 'female' ? 'levelHealFemale' : 'levelHeal', 0, {}));
  for (let at = character.level + 1; at <= level; at++) messages.push(...unlockMessages(at, content));
  for (let at = character.classLevel + 1; at <= classLevel; at++) messages.push(...classUnlockMessages(at, content));
  return messages;
}

// HP when the report is claimed: a new character or class level heals the
// character fully at its new level, with the gear it wears then (and will
// refill mana once something spends it); otherwise what the exploration left.
export function hpAfterHunt({ character, applied, hunt, equipped, name }, content) {
  if (!applied.levelled) return hunt.hpEnd;
  const levelled = { ...character, level: applied.level, xp: applied.xp, classLevel: applied.classLevel, classXp: applied.classXp };
  return playerCombatant({ character: levelled, equipped, name }, content).maxHp;
}

// "Zużyte mikstury: 2 × Mniejsza mikstura leczenia." and the fights each
// kind of potion for a time worked in, or nothing for an exploration without
// potions.
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
export function huntReport({ hunt, applied, character, areaId, startedAt, endsAt, autoEquipped = [], overflow = null }, content) {
  const area = content.areasById[areaId];
  const best = hunt.items.reduce(
    (top, item) => (top === null || itemRank(item, content) > itemRank(top, content) ? item : top),
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
    summary: {
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
    ],
    items: hunt.items.map((item, index) => ({ ...itemView(item, content), ...(overflow?.sold.includes(index) && { sold: true }) })),
    fights: hunt.fights.map((fight) => ({
      t: fight.t,
      elite: fight.elite,
      champion: fight.champion ?? false,
      tough: fight.tough,
      // The fight of an event at the exploration's end (events.js).
      ...(fight.event && { event: true }),
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
