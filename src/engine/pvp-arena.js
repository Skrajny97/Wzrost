// @ts-check
// The Arena in the Osada (data/settlement.json, arena; src/server/pvp-arena.js).
// The author, 10.11.2026: „Musimy zacząć też pracować nad Areną PvP, bo
// rośnie baza graczy”, after a player's „Więcej rywalizacji między
// graczami”; his choice 762 A. Asynchronous: the player never waits for
// the rival. It picks one of three rivals of a similar rating and fights
// the rival's character as it is saved now, with the result at once; the
// rival's character defends itself. Nothing else of either character
// changes: only their ratings. Not to be confused with src/client/arena.js,
// the playback of every fight. Pure: the seed and the time are the
// server's.

import { simulateFight } from './combat.js';
import { combatantView, playerCombatant } from './combatant.js';
import { laterPeriod, questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {'win' | 'loss' | 'draw'} Result A fight's result for the attacker. */
/** @typedef {{ character: Record<string, any>, equipped: Record<string, any>[], name: string }} Fighter A side's character as it is saved. */
/** @typedef {[number, number][]} Curve Points [level, value]. */

/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const arenaRules = (content) => content.settlement?.arena ?? null;

// A fight's score for its rating: a win, a loss and a draw.
/** @type {Record<Result, number>} */
const SCORES = { win: 1, loss: 0, draw: 0.5 };

// Half away from zero, as SQLite's ROUND, so a season's move of the ratings
// (seasonRating) comes out the same in the engine and in the server's SQL.
/** @param {number} value */
const rounded = (value) => Math.sign(value) * Math.round(Math.abs(value));

// How many times its HP each side of a duel has: duel.hpCurve's points
// [level, factor] at the two characters' average level, straight between
// two points, as the first point below it and as the last past it. The
// characters hit harder against their HP the higher they are (the
// evolutions), so the factor grows with the level and a fight lasts about
// as many rounds at every level (tools/pvp-arena-sim.mjs): without it two
// characters of level 100 or more ended half their fights in four moves
// each, and with one factor big enough for them those of level 25 went on
// for twenty-five rounds.
/**
 * @param {number} levelA
 * @param {number} levelB
 * @param {Content} content
 * @returns {number}
 */
export function duelHpFactor(levelA, levelB, content) {
  return curveAt(arenaRules(content).duel.hpCurve, (levelA + levelB) / 2);
}

// The third forms ("Trzecia ewolucja klas") hit harder against their HP
// again, so a duel where either side has one gives both sides that many
// times more HP (duel.thirdFormHp), and it lasts about as many rounds as
// one of second forms (tools/pvp-arena-sim.mjs). Characters without one
// fight as before them.
/**
 * @param {Record<string, any>[]} characters
 * @param {Content} content
 * @returns {number}
 */
export function thirdFormHp(characters, content) {
  const share = arenaRules(content).duel.thirdFormHp ?? 1;
  return characters.some((/** @type {Record<string, any>} */ character) => (content.evolutionsById[character.evolution]?.stage ?? 0) >= 3) ? share : 1;
}

// A curve's value at a level: its points [level, value], straight between
// two points, as the first point below it and as the last past it.
/**
 * @param {Curve} curve
 * @param {number} level
 * @returns {number}
 */
function curveAt(curve, level) {
  const next = curve.findIndex(([at]) => at > level);
  if (next === 0) return curve[0][1];
  if (next === -1) return curve[curve.length - 1][1];
  const [fromLevel, from] = curve[next - 1];
  const [toLevel, to] = curve[next];
  return from + ((to - from) * (level - fromLevel)) / (toLevel - fromLevel);
}

// The share of its armour each side of a duel has (question 772): the
// characters wear far more armour than the creatures their blows were
// measured against (a whole set of upgraded items, where a creature has
// its hide), so a blow of a weapon took half or less of what it takes
// from a creature, while a spell, against resistances as small as the
// creatures', took as much: the classes of weapons lost most of their
// duels. duel.armorCurve's points [level, share] at the two characters'
// average level, as the HP curve; the whole armour without one.
/**
 * @param {number} levelA
 * @param {number} levelB
 * @param {Content} content
 * @returns {number}
 */
export function duelArmorShare(levelA, levelB, content) {
  const curve = arenaRules(content).duel.armorCurve;
  return curve ? curveAt(curve, (levelA + levelB) / 2) : 1;
}

// One side of a duel: the character as it is saved, with its stats, gear,
// skills and evolution, and nothing else: no companions, mercenaries or
// potions (none are given), in no place (no place's trait), at full HP
// times `factor` (duelHpFactor), so that the fight lasts a few rounds, and
// with `armor` of its armour (duelArmorShare). What it throws back of the
// blows it takes (Nieugięty, Niezłomny, Wyzwanie, Lustro many) counts in
// the same share (question 780): a rival's blows are far bigger than a
// creature's, the reflections were measured against, and a reflection
// passes any armour, so a Bastion won most of its duels on them alone. The
// guild wars' battles (guild-wars.js) make their fighters so too.
/**
 * @param {Fighter} fighter
 * @param {string} id
 * @param {'ally' | 'enemy'} side
 * @param {{ factor: number, armor: number }} shape
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function duelist({ character, equipped, name }, id, side, { factor, armor }, content) {
  // combatant.js is not checked yet: its options are typed by their
  // defaults alone (hp, area).
  const unit = playerCombatant(/** @type {any} */ ({ character, equipped, name, id, side }), content);
  const maxHp = Math.max(1, Math.round(unit.maxHp * factor));
  return { ...unit, maxHp, hp: maxHp, armor: Math.round(unit.armor * armor), reflectShare: armor };
}

// A duel of the attacker's character (`attacker`: { character, equipped,
// name }) with the rival's (`defender`), from the server's `seed`: the same
// characters and seed give the same fight. A fight may end one-sided or go
// on and on (two healers): after duel.maxMoves moves of both sides together
// the judge ends it, and the one with the bigger share of its HP left wins,
// or it is a draw when the shares differ by duel.drawMargin at most; the
// log then ends with the judge's words. `result` is the attacker's: 'win',
// 'loss' or 'draw'; `fight` is for the playback (src/client/arena.js), as a
// report's fight. `record: false` skips the log (the simulation).
/**
 * @param {{ attacker: Fighter, defender: Fighter, seed: string | number }} duelists
 * @param {Content} content
 * @param {{ record?: boolean }} [options]
 */
export function arenaDuel({ attacker, defender, seed }, content, { record = true } = {}) {
  const { duel, texts } = arenaRules(content);
  /** @type {[number, number]} */
  const levels = [attacker.character.level, defender.character.level];
  const factor = duelHpFactor(...levels, content) * thirdFormHp([attacker.character, defender.character], content);
  const shape = { factor, armor: duelArmorShare(...levels, content) };
  const ally = duelist(attacker, 'a0', 'ally', shape, content);
  const enemy = duelist(defender, 'e0', 'enemy', shape, content);
  // combat.js is not checked yet.
  const fight = simulateFight(/** @type {any} */ ({ allies: [ally], enemies: [enemy], rng: createRng(`arena:${seed}`), content, record, maxActions: duel.maxMoves }));
  /** @param {Record<string, any>} unit */
  const left = (unit) => Math.max(0, fight.units.find((/** @type {{ id: string }} */ one) => one.id === unit.id)?.hp ?? 0) / unit.maxHp;
  const shares = { attacker: left(ally), defender: left(enemy) };
  const limit = fight.won === null;
  /** @type {Result} */
  let result;
  if (!limit) result = fight.won ? 'win' : 'loss';
  else if (Math.abs(shares.attacker - shares.defender) <= duel.drawMargin) result = 'draw';
  else result = shares.attacker > shares.defender ? 'win' : 'loss';
  /** @type {Record<string, any>[]} */
  const events = [...fight.events];
  if (limit && record) {
    const ahead = result === 'win' ? ally : enemy;
    events.push({
      t: (events.at(-1)?.t ?? 0) + 1,
      kind: 'limit',
      text: say(texts, result === 'draw' ? 'limitDraw' : 'limitWin', 0, { moves: duel.maxMoves, name: ahead.name }),
    });
  }
  return {
    result,
    limit,
    moves: fight.actions,
    shares,
    hpFactor: factor,
    fight: {
      allies: [combatantView(ally, enemy.level, content)],
      enemies: [combatantView(enemy, ally.level, content)],
      events,
      won: result === 'win' ? true : result === 'loss' ? false : null,
      ...(result === 'draw' && { draw: true }),
    },
  };
}

// The score a side of `rating` is expected to make against `other`, as in
// chess (Elo): 0.5 for two equal ratings, more against a weaker rival.
/**
 * @param {number} rating
 * @param {number} other
 * @param {Content} content
 * @returns {number}
 */
export const expectedScore = (rating, other, content) => 1 / (1 + 10 ** ((other - rating) / arenaRules(content).rating.scale));

// How a fight moves both ratings: K times the score made less the one
// expected (a win against a stronger rival brings more), the attacker's
// with rating.attackK, the defender's with rating.defenceK (a defence moves
// it less, 762 A), rounded, never below rating.floor. `result` is the
// attacker's.
/**
 * @param {number} attackerRating
 * @param {number} defenderRating
 * @param {Result} result
 * @param {Content} content
 * @returns {{ attacker: number, defender: number }}
 */
export function ratingChanges(attackerRating, defenderRating, result, content) {
  const { attackK, defenceK, floor } = arenaRules(content).rating;
  const miss = SCORES[result] - expectedScore(attackerRating, defenderRating, content);
  /**
   * @param {number} rating
   * @param {number} change
   */
  const moved = (rating, change) => Math.max(floor, rating + Math.round(change)) - rating;
  return { attacker: moved(attackerRating, attackK * miss), defender: moved(defenderRating, -defenceK * miss) };
}

// What a fight with a rival would bring the attacker's rating: a win, a
// loss and a draw.
/**
 * @param {number} rating
 * @param {number} rivalRating
 * @param {Content} content
 * @returns {Record<Result, number>}
 */
export function ratingStakes(rating, rivalRating, content) {
  return /** @type {Record<Result, number>} */ (Object.fromEntries((/** @type {Result[]} */ (Object.keys(SCORES))).map((result) => [result, ratingChanges(rating, rivalRating, result, content).attacker])));
}

// The rivals offered: rivals.count of the `candidates` (the server's,
// nearest ratings first, at most rivals.pool of them, none of the player's
// own account), drawn with `seed`, the highest rating first. Those in
// `recent` (the rival of the fight just fought, or the rivals offered
// before "Losuj innych", 874) come in only to fill the places no other
// candidate is left for, so a new draw brings every other one there is.
/**
 * @template {{ id: number, rating: number }} T
 * @param {T[]} candidates
 * @param {string | number} seed
 * @param {Content} content
 * @param {number[]} [recent]
 * @returns {T[]}
 */
export function drawRivals(candidates, seed, content, recent = []) {
  const { count } = arenaRules(content).rivals;
  const rng = createRng(`arena-rivals:${seed}`);
  /**
   * @param {T[]} list
   * @param {number} many
   */
  const draw = (list, many) => {
    const left = [...list];
    /** @type {T[]} */
    const picked = [];
    while (picked.length < many && left.length > 0) picked.push(...left.splice(rng.int(0, left.length - 1), 1));
    return picked;
  };
  const fresh = draw(candidates.filter((one) => !recent.includes(one.id)), count);
  const again = draw(candidates.filter((one) => recent.includes(one.id)), count - fresh.length);
  return [...fresh, ...again].sort((a, b) => b.rating - a.rating || a.id - b.id);
}

// A duel's fight (arenaDuel's `fight`, the attacker's character among the
// allies) as its defender watches it (875): the defender's character among
// the allies at the bottom of the playback, the attacker's among the foes
// at the top, and the result the defender's own, a won defence a victory.
// The events name the two by their ids, which stay as they are.
/**
 * @param {{ allies: Record<string, any>[], enemies: Record<string, any>[], won: boolean | null } & Record<string, any>} fight
 */
export function defenderFight(fight) {
  /** @param {Record<string, any>} unit */
  const turned = (unit) => ({ ...unit, side: unit.side === 'ally' ? 'enemy' : 'ally' });
  return { ...fight, allies: fight.enemies.map(turned), enemies: fight.allies.map(turned), won: fight.won === null ? null : !fight.won };
}

// The day of the fights (from Polish midnight) and the week of the table
// (from Monday, Polish midnight), as the narrator's quests have them.
// quests.js is not checked yet: its periods are typed here.
/** @typedef {{ key: string, startsAt: number, endsAt: number }} Period */
/**
 * @param {number} now
 * @param {Content} content
 * @returns {Period}
 */
export const arenaDay = (now, content) => /** @type {Period} */ (questPeriod('daily', now, content));
/**
 * @param {number} now
 * @param {Content} content
 * @returns {Period}
 */
export const arenaWeek = (now, content) => /** @type {Period} */ (questPeriod('weekly', now, content));

// What is left today of `perDay` uses counted by the Polish day: `day` is
// the day of the last use and `used` how many fell on it. A use of a later
// day leaves none (laterPeriod in quests.js): a request still of the day
// gone fights no more and writes no day back (the code review, 12.11.2026).
/**
 * @param {number} perDay
 * @param {string | null | undefined} day
 * @param {number | null | undefined} used
 * @param {number} now
 * @param {Content} content
 */
const leftToday = (perDay, day, used, now, content) => {
  const today = arenaDay(now, content).key;
  if (laterPeriod(day, today)) return 0;
  return Math.max(0, perDay - (day === today ? (used ?? 0) : 0));
};

// The fights left today of a record ({ day, fights }: the day of the last
// fight and how many fell on it).
/**
 * @param {{ day?: string | null, fights?: number | null } | null | undefined} record
 * @param {number} now
 * @param {Content} content
 * @returns {number}
 */
export const fightsLeft = (record, now, content) => leftToday(arenaRules(content).fightsPerDay, record?.day, record?.fights, now, content);

// The draws of other rivals ("Losuj innych", 874) left today of a record
// ({ reroll_day, rerolls }: the day of the last draw and how many fell on
// it), rivals.rerollsPerDay a day.
/**
 * @param {{ reroll_day?: string | null, rerolls?: number | null } | null | undefined} record
 * @param {number} now
 * @param {Content} content
 * @returns {number}
 */
export const rerollsLeft = (record, now, content) => leftToday(arenaRules(content).rivals.rerollsPerDay, record?.reroll_day, record?.rerolls, now, content);

// The season around `now`: a month (Polish time), numbered so that the next
// month is one more, and when it ends.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {{ index: number, endsAt: number }}
 */
export function arenaSeason(now, content) {
  const { key, endsAt } = /** @type {Period} */ (questPeriod('monthly', now, content));
  const [year, month] = key.split('-').map(Number);
  return { index: year * 12 + month - 1, endsAt };
}

// The share of the way back to rating.start a rating keeps after `months`
// new seasons: each moves it season.share of the way (762 A: halfway).
/**
 * @param {number} months
 * @param {Content} content
 * @returns {number}
 */
export const seasonFactor = (months, content) => (1 - arenaRules(content).season.share) ** months;

// A rating after `months` new seasons.
/**
 * @param {number} rating
 * @param {number} months
 * @param {Content} content
 * @returns {number}
 */
export function seasonRating(rating, months, content) {
  const { start } = arenaRules(content).rating;
  return start + rounded((rating - start) * seasonFactor(months, content));
}

// The reward of a place on a week's table for a character of `level`: the
// first tier the place is within (upTo; the last, without it, for the rest
// of the table), its Punkty Systemu and gold.base + gold.perLevel × level.
/** @typedef {{ upTo?: number, systemPoints: number, gold: { base: number, perLevel: number } }} Tier A tier of the week's rewards. */
/**
 * @param {number} place
 * @param {number} level
 * @param {Content} content
 * @returns {{ systemPoints: number, gold: number } | null}
 */
export function arenaReward(place, level, content) {
  /** @type {Tier | undefined} */
  const tier = arenaRules(content).rewards.find((/** @type {Tier} */ one) => one.upTo === undefined || place <= one.upTo);
  return tier ? { systemPoints: tier.systemPoints, gold: tier.gold.base + tier.gold.perLevel * level } : null;
}

// The tiers of the rewards with the places each covers ({ from, to }; `to`
// null for the rest of the table), for a character of `level`.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ from: number, to: number | null, systemPoints: number, gold: number }[]}
 */
export function arenaRewardTiers(level, content) {
  let from = 1;
  return arenaRules(content).rewards.map((/** @type {Tier} */ tier) => {
    const places = { from, to: tier.upTo ?? null };
    from = (tier.upTo ?? from) + 1;
    return { ...places, systemPoints: tier.systemPoints, gold: tier.gold.base + tier.gold.perLevel * level };
  });
}
