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
// out to avoid them (avoidRare) meets neither the elite nor the champion.

import { combatantView, monsterCombatant, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { addCounts, materialDrops, materialView, materialsText } from './crafting.js';
import { itemName, itemRank, itemView, randomItem } from './items.js';
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

// The champion is drawn only where it lives, so other places keep their draws.
export function rollEncounter(area, rng, content, characterLevel, pace) {
  if (area.champion && rng.chance(pace.championChance)) return championEncounter(area, content);
  if (rng.chance(pace.eliteChance)) return eliteEncounter(area, content);
  const tough = toughEncountersFor(area, characterLevel);
  if (tough.length > 0 && rng.chance(pace.toughChance)) {
    return regularEncounter(rng.weighted(tough), area, rng, content, { tough: true, characterLevel });
  }
  return regularEncounter(rng.weighted(encountersFor(area, characterLevel)), area, rng, content, { characterLevel });
}

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

// The creatures that may meet a character in an inner region ("Czyhające
// niebezpieczeństwa"), each with the levels it can come at: the place's range
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
// is a plain weapon of its class after the first won fight.
export function simulateHunt({ character, equipped, hp, name, areaId, minutes, seed, first = false, avoidRare = false }, content) {
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
  // encounter, elite or champion; an avoiding one no elite or champion.
  let pace = explorationPace(minutes, content);
  if (first) pace = { ...pace, toughChance: 0 };
  if (first || avoidRare) pace = { ...pace, eliteChance: 0, championChance: 0 };
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
  // Skraj Wiatrołomów, where no tawny owl lives.
  const filled = new Set(equipped.map((item) => item.slot));
  const loot = { filled, classId: character.classId, maxClassLevel: area.maxLevel, area };
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

    const encounter = rollEncounter(area, rng, content, character.level, pace);
    const enemies = encounterCombatants(encounter, content);
    const ally = { ...player, hp: hpNow };
    const fight = simulateFight({ allies: [ally], enemies, rng, content, record: true });
    const hpBefore = hpNow;
    hpNow = fight.units.find((unit) => unit.id === ally.id).hp;

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
  // Skill Points come from the class levels after the skills open.
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
  };
}
