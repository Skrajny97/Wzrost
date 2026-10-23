// A hunt: a series of fights and finds spread over the chosen time. HP carries
// over between fights and recovers only partly, so longer hunts are riskier.
// A lost fight ends the hunt with fainting (or, against the local elite in a
// safe region, with a wounded retreat).

import { combatantView, monsterCombatant, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { clamp } from './formulas.js';
import { itemName, itemRank, itemView, randomItem } from './items.js';
import {
  classXpToNext,
  faintPenalty,
  gainXp,
  lowLevelMultiplier,
  monsterXp,
  xpToNext,
} from './progression.js';
import { createRng } from './rng.js';
import { say } from './text.js';
import { unlockMessages } from './unlocks.js';

export function rollEncounter(region, rng, content, characterLevel, { allowElite = true } = {}) {
  if (allowElite && rng.chance(content.balance.hunt.eliteChancePerFight)) {
    return eliteEncounter(region, content, characterLevel);
  }
  return regularEncounter(rng.weighted(encountersFor(region, characterLevel)), region, rng, content, characterLevel);
}

// Some encounters (groups in the tutorial region) appear only from a level on.
export const encountersFor = (region, characterLevel) =>
  region.encounters.filter((encounter) => characterLevel >= (encounter.minLevel ?? 1));

// The local elite: a level above the character, within the region's range plus one.
export function eliteEncounter(region, content, characterLevel) {
  const level = clamp(characterLevel + content.balance.hunt.eliteLevelBonus, region.minLevel + 1, region.maxLevel + 1);
  return { elite: true, members: [{ monsterId: region.elite, level }] };
}

// Monsters are around the character's level, within the region's range.
export function regularEncounter(encounter, region, rng, content, characterLevel) {
  const spread = region.levelSpread ?? content.balance.hunt.monsterLevelSpread;
  return {
    elite: false,
    members: encounter.monsters.map((monsterId) => ({
      monsterId,
      level: clamp(characterLevel + rng.int(-spread, spread), region.minLevel, region.maxLevel),
    })),
  };
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

// An expected count like 2.4 becomes 2 or 3, with the right average.
function countEvents(expected, rng) {
  const whole = Math.floor(expected);
  return whole + (rng.chance(expected - whole) ? 1 : 0);
}

function spread(count, durationMs, rng) {
  return Array.from({ length: count }, (_, i) => Math.round(((i + rng.float(0.2, 0.8)) / count) * durationMs));
}

export function simulateHunt({ character, equipped, hp, name, regionId, minutes, seed }, content) {
  const rng = createRng(seed);
  const tuning = content.balance.hunt;
  const rewards = content.balance.rewards;
  const texts = content.texts;
  const region = content.regionsById[regionId];
  const player = playerCombatant({ character, equipped, hp, name, region }, content);
  const durationMs = minutes * 60000;

  // Every hunt has at least one fight. When a hunt is shorter than the usual
  // time between fights, that fight pays only its share, so short hunts never
  // give more per hour than long ones.
  const expectedFights = minutes / tuning.fightIntervalMinutes;
  const fightCount = Math.max(1, countEvents(expectedFights, rng));
  const share = Math.min(1, expectedFights);
  const findCount = countEvents(minutes / tuning.findIntervalMinutes, rng);
  const timeline = [
    ...spread(fightCount, durationMs, rng).map((t) => ({ t, type: 'fight' })),
    ...spread(findCount, durationMs, rng).map((t) => ({ t, type: 'find' })),
  ].sort((a, b) => a.t - b.t);

  const findLevel = clamp(character.level, region.minLevel, region.maxLevel);
  // Slots covered by worn items or earlier finds, for loot that fills the gaps.
  const filled = new Set(equipped.map((item) => item.slot));
  const loot = { filled, classId: character.classId };
  let hpNow = player.hp;
  let result = 'success';
  let xp = 0;
  let gold = 0;
  const items = [];
  const fights = [];
  const entries = [];
  let key = null;

  for (const [step, event] of timeline.entries()) {
    if (event.type === 'find') {
      if (rng.chance(rewards.findGoldChance)) {
        const amount = Math.max(1, Math.round(rewards.findGoldPerLevel * findLevel * rng.float(0.5, 1.5)));
        gold += amount;
        entries.push({ t: event.t, type: 'find', text: say(texts, 'findGold', step, { gold: amount }) });
      } else {
        const item = randomItem(findLevel, rng, content, loot);
        items.push(item);
        entries.push({ t: event.t, type: 'find', item: items.length - 1, text: say(texts, 'findItem', step, { item: itemName(item, content) }) });
      }
      continue;
    }

    const encounter = rollEncounter(region, rng, content, character.level);
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
      enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
      won: fight.won,
      hpBefore,
      hpAfter: hpNow,
      xp: 0,
      gold: 0,
      loot: [],
      recovered: 0,
      allies: [combatantView(ally, enemies[0].level, content)],
      enemiesView: enemies.map((enemy) => combatantView(enemy, ally.level, content)),
      events: fight.events,
    };
    fights.push(summary);

    // The fight the report opens with: the one that ended the hunt, otherwise
    // an elite fight, otherwise the toughest group.
    const score = fight.won !== true ? 3e9 : (encounter.elite ? 2e9 : 0) + enemies.reduce((sum, e) => sum + e.maxHp, 0);
    if (!key || score > key.score) key = { score, index: summary.index };

    const enemyList = enemies.map((enemy) => `${enemy.name} (poz. ${enemy.level})`).join(', ');
    const lines = [say(texts, encounter.elite ? 'eliteStart' : 'fightStart', step, { enemies: enemyList })];

    if (fight.won === true) {
      let fightXp = 0;
      for (const enemy of enemies) {
        const monster = content.monstersById[enemy.monsterId];
        fightXp +=
          monsterXp(monster, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(character.level, enemy.level, content);
        const goldFactor = (monster.elite ? rewards.eliteGoldMultiplier : 1) * enemy.groupFactor * share;
        summary.gold += Math.round(rewards.goldPerLevel * enemy.level * monster.reward.gold * rng.float(0.5, 1.5) * goldFactor);
        // A character without a weapon always gets one of its class from the first opponent it beats.
        const needsWeapon = !filled.has('weapon');
        if (monster.elite || needsWeapon || rng.chance(rewards.itemDropChance * enemy.groupFactor * share)) {
          const rarityBonus = monster.elite ? rewards.eliteRarityBonus : 1;
          items.push(randomItem(enemy.level, rng, content, { ...loot, rarityBonus }));
          summary.loot.push(items.length - 1);
        }
      }
      summary.xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * share);
      xp += summary.xp;
      gold += summary.gold;
      summary.recovered = Math.round((player.maxHp - hpNow) * player.recovery);
      hpNow += summary.recovered;

      lines.push(say(texts, 'victory', step), `HP: ${hpBefore} → ${summary.hpAfter}. +${summary.xp} XP, +${summary.gold} złota.`);
      for (const index of summary.loot) lines.push(say(texts, 'loot', step, { item: itemName(items[index], content) }));
      if (summary.recovered > 0) lines.push(say(texts, 'recover', step, { hp: summary.recovered }));
      entries.push({ t: event.t, type: 'fight', fight: summary.index, text: lines.join(' ') });
      continue;
    }

    if (fight.won === false) {
      result = encounter.elite && region.safe ? 'escaped' : 'fainted';
      hpNow = Math.max(1, Math.round(player.maxHp * tuning.hpAfterFaint));
      lines.push(say(texts, result === 'fainted' ? 'defeat' : 'escape', step, { target: player.name }));
    } else {
      result = 'escaped';
      hpNow = Math.max(1, hpNow);
      lines.push(say(texts, 'draw', step, { target: player.name }));
    }
    summary.hpAfter = hpNow;
    entries.push({ t: event.t, type: 'fight', fight: summary.index, text: lines.join(' ') });
    break;
  }

  return {
    regionId,
    minutes,
    result,
    xp,
    gold,
    items,
    hpStart: player.hp,
    hpEnd: hpNow,
    maxHp: player.maxHp,
    fights,
    entries,
    keyFight: key && { index: key.index },
  };
}

// Applies the hunt's XP to the character. Solo, all of the combat contribution
// is the player's, so class XP equals the XP from fights. Fainting costs only
// character XP, never a level, and never class XP.
export function applyHunt(character, hunt, content) {
  const maxLevel = content.balance.progression.maxLevel;
  const next = gainXp(character.level, character.xp, hunt.xp, (level) => xpToNext(level, content), maxLevel);
  const nextClass = gainXp(
    character.classLevel,
    character.classXp,
    hunt.xp,
    (level) => classXpToNext(level, content),
    maxLevel,
  );
  const penalty = hunt.result === 'fainted' ? faintPenalty(next.level, next.xp, content) : 0;

  const pointsPerLevel = content.statIds.length;
  const messages = [];
  for (let level = character.level + 1; level <= next.level; level++) {
    messages.push(say(content.texts, 'levelUp', level, { level, points: pointsPerLevel }), ...unlockMessages(level, content));
  }
  const className = content.classesById[character.classId].name;
  // Class levels come first, so their points can wait for the Stats screen.
  const unlockLevel = content.unlocksById.stats.level;
  const textId = next.level < unlockLevel ? 'classLevelUpLocked' : 'classLevelUp';
  for (let level = character.classLevel + 1; level <= nextClass.level; level++) {
    messages.push(say(content.texts, textId, level, { className, level, points: Math.floor(pointsPerLevel / 4), unlockLevel }));
  }
  if (penalty > 0) messages.push(say(content.texts, 'faintPenalty', 0, { xp: penalty }));

  return {
    level: next.level,
    xp: next.xp - penalty,
    classLevel: nextClass.level,
    classXp: nextClass.xp,
    penalty,
    messages,
  };
}

// `autoEquipped`: indices of the finds that went straight into empty slots.
export function huntReport({ hunt, applied, character, regionId, startedAt, endsAt, autoEquipped = [] }, content) {
  const region = content.regionsById[regionId];
  const best = hunt.items.reduce(
    (top, item) => (top === null || itemRank(item, content) > itemRank(top, content) ? item : top),
    null,
  );
  return {
    kind: 'hunt',
    regionId,
    regionName: region.name,
    minutes: hunt.minutes,
    startedAt,
    endsAt,
    result: hunt.result,
    resultText: content.texts.result[hunt.result],
    summary: {
      xp: hunt.xp,
      penalty: applied.penalty,
      gold: hunt.gold,
      fights: hunt.fights.length,
      itemsFound: hunt.items.length,
      bestFind: best && itemView(best, content),
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
    ],
    items: hunt.items.map((item) => itemView(item, content)),
    fights: hunt.fights.map((fight) => ({
      t: fight.t,
      elite: fight.elite,
      won: fight.won,
      hpBefore: fight.hpBefore,
      hpAfter: fight.hpAfter,
      xp: fight.xp,
      gold: fight.gold,
      loot: fight.loot.length,
      allies: fight.allies,
      enemies: fight.enemiesView,
      events: fight.events,
    })),
    keyFight: hunt.keyFight,
    entries: hunt.entries,
  };
}
