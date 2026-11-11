// @ts-check
// The Sala prób in the Osada (data/settlement.json, trialHall; DECISIONS.md,
// "Sala prób"). The author: „jakieś miejsce w Osadzie "Sala prób", którego
// przejście odblokowuje dostęp do wyższej instancji niż dopuszczalna” and
// „620 B, ale taniej wejście albo i za darmo raz dziennie”. Its trial is for
// the next place the class level has not opened yet: two of the place's
// encounters and its elite, one after another, at the place's first level
// and as strong as on an exploration there (exploreStrength). The HP does
// not come back between the fights; the healing potions of the bag work as
// on an exploration, and the companions ready to go fight beside the
// character. Passing all three opens the place for the character for good,
// one place before its class level does (`early`). Pure: the seed is the
// server's.

import { combatantView, exploreStrength, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { addCounts, materialDrops, materialsText } from './crafting.js';
import { encounterCombatants, encountersFor, explorationPace } from './hunt.js';
import { fightPotions } from './potions.js';
import { lowLevelMultiplier, monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say, word } from './text.js';
import { areaUnlocked } from './unlocks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, minLevel: number } & Record<string, any>} Area An inner region (data/areas.json). */
/** @typedef {{ elite: boolean, members: { monsterId: string, level: number }[] }} Encounter */

/**
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const trialHallOf = (content) => content.settlement?.trialHall ?? null;

// Whether a place is open to a character: by its class level, or opened
// early in the Sala prób.
/**
 * @param {Area} area
 * @param {number} classLevel
 * @param {string | null | undefined} early
 * @param {Content} content
 * @returns {boolean}
 */
export const areaOpenFor = (area, classLevel, early, content) => areaUnlocked(area, classLevel, content) || (Boolean(early) && area.id === early);

// The place the Sala prób tests a character of `classLevel` for: the first
// one its class level has not opened yet, with whether it has passed that
// trial already (`passed`); null once every place is open.
/**
 * @param {number} classLevel
 * @param {string | null | undefined} early
 * @param {Content} content
 * @returns {{ area: Area, passed: boolean } | null}
 */
export function trialTarget(classLevel, early, content) {
  /** @type {Area | undefined} */
  const area = content.areas.find((/** @type {Area} */ one) => !areaUnlocked(one, classLevel, content));
  return area ? { area, passed: area.id === early } : null;
}

// The three encounters of a trial in `area`, from `seed`: two of the place's
// own (those its first level lets come), then its elite (a third encounter
// where it has none), every creature at the place's first level, the elite
// as many levels above as on an exploration.
/**
 * @param {Area} area
 * @param {unknown} seed
 * @param {Content} content
 * @returns {Encounter[]}
 */
export function trialEncounters(area, seed, content) {
  const rng = createRng(`${seed}:encounters`);
  const level = area.minLevel;
  const open = encountersFor(area, level);
  const pool = open.length > 0 ? open : area.encounters;
  /** @returns {Encounter} */
  const regular = () => {
    const group = rng.weighted(/** @type {{ weight?: number, monsters: string[] }[]} */ (pool), (encounter) => encounter.weight ?? 1);
    return { elite: false, members: group.monsters.map((/** @type {string} */ monsterId) => ({ monsterId, level })) };
  };
  const elite = area.elite
    ? { elite: true, members: [{ monsterId: area.elite, level: level + content.balance.hunt.eliteLevelBonus }] }
    : regular();
  return [regular(), regular(), elite];
}

// A trial: the fights in order until one is lost. Each won fight pays as a
// fight of an exploration of the hall's rewardMinutes at its level, times
// rewardFactor (the proposal 620: „łupy i XP lepsze”; DECISIONS.md, "Sala
// prób", point 4): XP, gold and the creatures' materials, the elite an
// elite's XP and gold, with the solo bonus of an exploration's fight; the
// companions take their shares of the XP as on an exploration. `potions`:
// the potions by id the character may drink, those of its bag whose recipes
// it knows; the healing ones are drunk below `healBelow`, one at a time, as
// on an exploration. Returns a hunt for applyHunt and huntReport, with
// `hall`.
/**
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, area: Area, seed: unknown, potions?: Record<string, number>, healBelow?: number, companions?: Record<string, any>[], trophies?: Record<string, any> }} trial
 * @param {Content} content
 */
export function trialHallFights({ character, equipped, name, area, seed, potions = {}, healBelow, companions = [], trophies = {} }, content) {
  const hall = /** @type {Record<string, any>} */ (trialHallOf(content));
  const rng = createRng(`${seed}:fights`);
  const rewards = content.balance.rewards;
  const pace = explorationPace(hall.rewardMinutes, content);
  const lengthed = pace.timeFactor * (1 + pace.lengthBonus);
  const partyXp = 1 - companions.length * content.settlement.companions.xpCost;
  const strength = exploreStrength(area, character.level, content);
  const player = playerCombatant(/** @type {any} */ ({ character, equipped, name, area }), content);
  /** @type {Record<string, number>} */
  const left = { ...potions };
  /** @type {Record<string, number>} */
  const potionsUsed = {};
  let hp = player.hp;
  const mates = companions.map((companion, index) => {
    const unit = companionCombatant(companion, /** @type {any} */ ({ area, id: `a${index + 1}` }), content);
    return { unit, hp: unit.hp };
  });

  /** @type {Record<string, any>[]} */
  const fights = [];
  /** @type {string[]} */
  const lines = [];
  let xp = 0;
  let gold = 0;
  /** @type {Record<string, number>} */
  let materials = {};
  let won = true;
  for (const [index, encounter] of trialEncounters(area, seed, content).entries()) {
    /** @type {Record<string, any>[]} */
    const enemies = encounterCombatants(encounter, content, /** @type {any} */ ({ strength }));
    const kit = fightPotions(left, healBelow ?? content.potionUse?.healBelow, content);
    const ally = {
      ...player,
      hp,
      ...(Object.keys(kit).length > 0 && { potions: kit }),
      ...(Object.keys(trophies).length > 0 && { trophies }),
    };
    const fighting = mates.filter((mate) => mate.hp > 0);
    const allies = [ally, ...fighting.map((mate) => ({ ...mate.unit, hp: mate.hp }))];
    const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
    const hpBefore = hp;
    /** @param {string} id */
    const unitHp = (id) => /** @type {{ hp: number }} */ (fight.units.find((/** @type {{ id: string }} */ unit) => unit.id === id)).hp;
    hp = Math.max(0, unitHp(player.id));
    for (const mate of fighting) mate.hp = Math.max(0, unitHp(mate.unit.id));
    for (const id of fight.drunk) {
      left[id] = (left[id] ?? 0) - 1;
      potionsUsed[id] = (potionsUsed[id] ?? 0) + 1;
    }
    const enemyList = enemies.map((enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
    lines.push(say(hall.texts, encounter.elite ? 'eliteStart' : 'fightStart', index, { number: index + 1, enemies: enemyList }));

    let fightXp = 0;
    let fightGold = 0;
    /** @type {Record<string, number>} */
    let fightMaterials = {};
    if (fight.won === true) {
      for (const enemy of enemies) {
        // The creature's own rank, as on an exploration (the code review:
        // the elite paid as an ordinary creature).
        const monster = content.monstersById[enemy.monsterId];
        const rank = monster.champion ? rewards.championGoldMultiplier : monster.elite ? rewards.eliteGoldMultiplier : 1;
        fightXp += monsterXp(monster, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(character.level, enemy.level, content);
        fightGold += rewards.goldPerLevel * enemy.level * monster.reward.gold * rng.float(0.5, 1.5) * rank * enemy.groupFactor * lengthed;
        fightMaterials = addCounts(fightMaterials, materialDrops(enemy.monsterId, enemy.level, enemy.groupFactor * pace.timeFactor * hall.rewardFactor, rng, content));
      }
      fightXp = Math.round(fightXp * (1 + content.balance.hunt.soloXpBonus) * lengthed * partyXp * hall.rewardFactor);
      fightGold = Math.round(fightGold * hall.rewardFactor);
      xp += fightXp;
      gold += fightGold;
      materials = addCounts(materials, fightMaterials);
      lines.push(say(content.texts, 'victory', index), word(content, '+{xp} XP, +{gold} złota.', { xp: fightXp, gold: fightGold }));
    } else {
      won = false;
      lines.push(say(hall.texts, 'defeat', index, { target: player.name }));
    }
    fights.push({
      index,
      t: index,
      elite: encounter.elite,
      champion: false,
      tough: false,
      enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
      won: fight.won,
      hpBefore,
      hpAfter: hp,
      xp: fightXp,
      gold: fightGold,
      materials: fightMaterials,
      chests: [],
      recovered: 0,
      allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
      enemiesView: enemies.map((enemy) => combatantView(enemy, player.level, content)),
      events: fight.events,
    });
    if (!won) break;
  }
  if (Object.keys(materials).length > 0) lines.push(say(content.texts, 'materials', 0, { materials: materialsText(materials, content) }));
  const text = say(hall.texts, won ? 'won' : 'lost', 0, { area: area.name });
  return {
    areaId: area.id,
    minutes: 0,
    // A lost trial costs no XP: the hall only leads the character out.
    result: won ? 'success' : 'escaped',
    xp,
    gold,
    resources: {},
    materials,
    timePoints: 0,
    items: [],
    hpStart: player.maxHp,
    hpEnd: hp,
    maxHp: player.maxHp,
    fights,
    entries: [{ t: 0, type: 'fight', fight: fights.length - 1, text: lines.join(' ') }],
    keyFight: { index: fights.length - 1 },
    potionsUsed,
    buffFights: {},
    hall: { areaId: area.id, won, fights: fights.length, text },
  };
}
