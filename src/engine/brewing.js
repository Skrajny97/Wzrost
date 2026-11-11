// @ts-check
// Alchemia (data/professions.json: brewing and potions): the character brews
// potions in the Systemowa Pracownia, one recipe at a time, with no fights
// and no risk. The profession's level shows the recipes and makes each potion
// quicker; a few rare recipes the Osada's herbalist teaches besides, at a
// standing of the relation with her or of the reputation with her
// brotherhood (recipeTaught). The herbs for all the potions are taken at the
// start, and the seed saved then decides which potions come out twice. Stopped early, a brewing keeps the potions done
// and gives back the herbs for the rest. Potions stack in the bag as herbs
// do, and the work gives the character the little XP gathering gives
// (professions.js).

import { gradeSteps } from './crafting.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, level: number, herbs: Record<string, number>, taught?: string }} Recipe A potion of data/professions.json, as a recipe. */
/** @typedef {{ id: string, points: number }} Standing */
/** @typedef {{ relations?: Record<string, number>, reputation?: Record<string, number> } | null | undefined} SettlementPoints */

// The standing from which the herbalist teaches a rare recipe (121 A:
// "zaufanym zdradza rzadkie receptury"; `taught`), or null for a recipe of
// the System.
/**
 * @param {Recipe} potion
 * @param {Content} content
 * @returns {Standing | null}
 */
export const recipeStanding = (potion, content) => (potion.taught ? (content.settlement?.standings.find((/** @type {Standing} */ standing) => standing.id === potion.taught) ?? null) : null);

// The points that count for the herbalist's rare recipes in a character's
// Osada (`settlement`: its relations with the residents and its reputation
// with the brotherhoods, as stored, { relations: { herbalist: 720 },
// reputation: { herbalists: 300 } }): the most of those her `teaching`
// lists, the relation with her and the reputation of the Bractwo Zielarzy
// (682 A and C: whichever reaches a standing first). Relations and
// reputation share the same standings.
/**
 * @param {SettlementPoints} settlement
 * @param {Content} content
 * @returns {number}
 */
export function teachingPoints(settlement, content) {
  /** @type {{ kind: string, id: string }[]} */
  const teaching = content.settlement?.herbalist?.teaching ?? [];
  return Math.max(0, ...teaching.map(({ kind, id }) => (kind === 'relation' ? settlement?.relations : settlement?.reputation)?.[id] ?? 0));
}

// Whether the character may know a recipe beside its level: one of the
// System always, a rare one once the herbalist has taught it, that is once
// the points that count for it (teachingPoints) have reached its standing.
// Brewing and drinking it still wait for its level, as with any recipe.
/**
 * @param {Recipe} potion
 * @param {SettlementPoints} settlement
 * @param {Content} content
 */
export function recipeTaught(potion, settlement, content) {
  if (!potion.taught) return true;
  const standing = recipeStanding(potion, content);
  return standing !== null && teachingPoints(settlement, content) >= standing.points;
}

// The recipes the System shows at a level of the brewing profession, and of
// the herbalist's rare ones those she has taught (recipeTaught).
/**
 * @param {number} level
 * @param {Content} content
 * @param {SettlementPoints} [settlement]
 * @returns {Recipe[]}
 */
export const knownPotions = (level, content, settlement = {}) => content.potions.filter((/** @type {Recipe} */ potion) => potion.level <= level && recipeTaught(potion, settlement, content));

// The minutes of one potion at a level: each level takes speedPerLevel of
// the first level's time off, down to `fastest` of it, and the Bractwo
// Zielarzy (589 B, brewFaster) `faster` of what is left.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function potionMinutes(level, content, faster = 0) {
  const { potionMinutes: minutes, speedPerLevel, fastest } = content.brewing;
  return minutes * Math.max(fastest, 1 - speedPerLevel * (level - 1)) * (1 - faster);
}

// A brewing of `count` potions in whole minutes, rounded up (and to a
// thousandth first, so 10 × 9.9 stays 99).
/**
 * @param {number} count
 * @param {number} level
 * @param {Content} content
 */
export const brewMinutes = (count, level, content, faster = 0) => Math.ceil(Math.round(count * potionMinutes(level, content, faster) * 1000) / 1000);

// The most potions of a recipe brewed at once: as many as the longest
// brewing allows and the herbs in the bag suffice for.
/**
 * @param {Recipe} potion
 * @param {number} level
 * @param {Record<string, number>} herbs
 * @param {Content} content
 */
export function mostPotions(potion, level, herbs, content, faster = 0) {
  const { maxMinutes } = content.brewing;
  let count = Math.floor(maxMinutes / potionMinutes(level, content, faster));
  while (count > 0 && brewMinutes(count, level, content, faster) > maxMinutes) count -= 1;
  for (const [id, need] of Object.entries(potion.herbs)) count = Math.min(count, Math.floor((herbs[id] ?? 0) / need));
  return count;
}

// The herbs `count` potions of a recipe take, by id.
/**
 * @param {Recipe} potion
 * @param {number} count
 * @returns {Record<string, number>}
 */
export const potionHerbs = (potion, count) => Object.fromEntries(Object.entries(potion.herbs).map(([id, need]) => [id, need * count]));

// The potions of a brewing of `count` over `minutes` done after `elapsed`
// ms: they come one after another, evenly.
/**
 * @param {number} count
 * @param {number} minutes
 * @param {number} elapsed
 */
export const potionsDone = (count, minutes, elapsed) => Math.min(count, Math.max(0, Math.floor((count * elapsed) / (minutes * 60000))));

// The potions of `count` brewed: each has bonusChance of one more, drawn by
// the seed in order, so a brewing stopped early keeps the draws of the
// potions it made.
/**
 * @param {{ count: number, seed: unknown, extraChance?: number }} brewing
 * @param {Content} content
 */
export function brewPotions({ count, seed, extraChance = 0 }, content) {
  const rng = createRng(seed);
  let bonus = 0;
  for (let index = 0; index < count; index += 1) {
    if (rng.chance(Math.min(1, content.brewing.bonusChance + extraChance))) bonus += 1;
  }
  return { count: count + bonus, bonus };
}

// What a catalyst of a rarer grade than its species adds to every potion's
// chance of an extra one (proposal 3: "Rzadszy materiał daje szansę na
// dodatkową miksturę"): catalystStep a grade.
/**
 * @param {string | null | undefined} key
 * @param {Content} content
 * @returns {number}
 */
export const catalystChance = (key, content) => (key ? gradeSteps(key, content) * content.brewing.catalystStep : 0);

// What the scrapper pays for a potion, before the camp's Skup złomu:
// priceFactor times the price of its herbs.
/**
 * @param {Recipe} potion
 * @param {Content} content
 * @returns {number}
 */
export const potionPrice = (potion, content) =>
  content.brewing.priceFactor * Object.entries(potion.herbs).reduce((sum, [id, need]) => sum + content.herbsById[id].price * need, 0);

// The report of a brewing: a line about the workshop from the seed, the
// potions made, the lucky ones among them and those the full bag lost, the
// profession's new levels with their stats and the recipes the System
// revealed with them (of the herbalist's rare ones only those she has
// taught, by the character's Osada, `settlement`), and the character's XP.
// `stopped`: the player called the character back before the end.
/**
 * @param {Record<string, any>} brewing
 * @param {Content} content
 */
export function brewingReport({ potion, minutes, startedAt, endsAt, seed, made, stored, lost, stopped, before, after, character, xp, work, settlement = {} }, content) {
  const texts = content.brewing.texts;
  const profession = content.professionsById[content.brewing.profession];
  /** @type {Recipe[]} */
  const revealed = content.potions.filter((/** @type {Recipe} */ candidate) => candidate.level > before.level && candidate.level <= after.level && recipeTaught(candidate, settlement, content));
  /** @param {number} count */
  const list = (count) => countList({ [potion.id]: count }, content.potionsById);
  const lostCount = lost[potion.id] ?? 0;
  return {
    kind: 'potions',
    placeName: content.brewing.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    potion: { id: potion.id, name: potion.name, count: made.count, bonus: made.bonus, stored: stored[potion.id] ?? 0, lost: lostCount },
    brewed: say(texts, 'brewed', 0, { potions: list(made.count) }),
    lucky: made.bonus > 0 ? say(texts, 'lucky', 0, { potions: list(made.bonus) }) : null,
    lost: lostCount > 0 ? say(texts, 'lost', 0, { potions: list(lostCount) }) : null,
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((candidate, index) => say(texts, 'revealed', index, { potion: candidate.name })),
      ...work.messages,
    ],
  };
}
