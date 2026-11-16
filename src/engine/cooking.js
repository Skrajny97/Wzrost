// @ts-check
// Gotowanie (data/professions.json: cooking and dishes; 999.3-999.5 v2,
// accepted by the author on 16.11.2026, the dishes of 1003): the character
// cooks dishes in the Systemowa Kuchnia as it brews potions in the Pracownia
// (brewing.js): a recipe and how many, its fish and crops taken from the
// Spiżarnia and its herbs from the bag at the start, one dish after
// another, each level faster, and past the mastery a chance of a dish
// twice. The dishes go to the Spiżarnia, and the innkeeper buys them.
//
// A dish chosen as the character sets out on an exploration is eaten (the
// meal, 999.5 v2: „Potrawa działa przez 4 godziny wypraw: wyprawa
// 4-godzinna zużywa ją całą, a krótsze wyprawy zużywają jej czas po kolei,
// aż minie 4 godziny”): its bonuses (999.4) work through meal.minutes of
// explorations, each using up its own length of them; an exploration longer
// than what is left gets them for that share of its time. The better dishes
// join two or three bonuses, the finest four, of seven kinds (the author,
// 16.11.2026: „Trzeba troche lepsze te bonusy dać i niech się łączą w
// lepszych potrawach większą roznorodnosc tez trzeba”).

import { countList, masteryChance, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ kind: string, value: number }} Bonus A meal's bonus: its kind and how much (a share in percent, or percentage points for `rare`). */
/** @typedef {{ id: string, name: string, level: number, ingredients: Record<string, number>, bonuses: Bonus[], description: string }} Dish A dish of data/professions.json. */
/** @typedef {{ dish: string, left: number }} Meal The meal a character has eaten: its dish, and the minutes of explorations it still works for. */

// The recipes the System shows at a level of Gotowanie.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Dish[]}
 */
export const knownDishes = (level, content) => content.dishes.filter((/** @type {Dish} */ dish) => dish.level <= level);

// The minutes of one dish at a level: each level takes speedPerLevel of the
// first level's time off, down to `fastest` of it, as a potion's.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function dishMinutes(level, content) {
  const { dishMinutes: minutes, speedPerLevel, fastest } = content.cooking;
  return minutes * Math.max(fastest, 1 - speedPerLevel * (level - 1));
}

// A cooking of `count` dishes in whole minutes, rounded up (and to a
// thousandth first, so 10 × 9.9 stays 99).
/**
 * @param {number} count
 * @param {number} level
 * @param {Content} content
 */
export const cookMinutes = (count, level, content) => Math.ceil(Math.round(count * dishMinutes(level, content) * 1000) / 1000);

// The most dishes of a recipe cooked at once: as many as the longest
// cooking allows and the ingredients (`stock`: the Spiżarnia's and the
// bag's herbs, by id) suffice for.
/**
 * @param {Dish} dish
 * @param {number} level
 * @param {Record<string, number>} stock
 * @param {Content} content
 */
export function mostDishes(dish, level, stock, content) {
  const { maxMinutes } = content.cooking;
  let count = Math.floor(maxMinutes / dishMinutes(level, content));
  while (count > 0 && cookMinutes(count, level, content) > maxMinutes) count -= 1;
  for (const [id, need] of Object.entries(dish.ingredients)) count = Math.min(count, Math.floor((stock[id] ?? 0) / need));
  return count;
}

// The ingredients `count` dishes of a recipe take, by id.
/**
 * @param {Dish} dish
 * @param {number} count
 * @returns {Record<string, number>}
 */
export const dishIngredients = (dish, count) => Object.fromEntries(Object.entries(dish.ingredients).map(([id, need]) => [id, need * count]));

// The dishes of a cooking of `count` over `minutes` done after `elapsed`
// ms: one after another, evenly, as potions (brewing.js, potionsDone; not
// imported, as brewing.js comes round to hunt.js, which needs this module).
/**
 * @param {number} count
 * @param {number} minutes
 * @param {number} elapsed
 */
export const dishesDone = (count, minutes, elapsed) => Math.min(count, Math.max(0, Math.floor((count * elapsed) / (minutes * 60000))));

// The chance of every dish cooked at a level of Gotowanie to come out
// twice: bonusChance, and past the mastery's level what the mastery adds.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const cookChance = (level, content) => (content.cooking.bonusChance ?? 0) + masteryChance(content.cooking, level);

// The dishes of `count` cooked at a `level` of Gotowanie: each has its
// chance of one more, drawn by the seed in order, so a cooking stopped
// early keeps the draws of the dishes it made.
/**
 * @param {{ count: number, seed: unknown, level?: number }} cooking
 * @param {Content} content
 */
export function cookDishes({ count, seed, level = 1 }, content) {
  const rng = createRng(seed);
  const chance = Math.min(1, cookChance(level, content));
  let bonus = 0;
  for (let index = 0; index < count; index += 1) {
    if (chance > 0 && rng.chance(chance)) bonus += 1;
  }
  return { count: count + bonus, bonus };
}

// What the innkeeper pays for a dish: the Spiżarnia's price (content.js,
// pantryOf), priceFactor times its ingredients'.
/**
 * @param {Dish} dish
 * @param {Content} content
 * @returns {number}
 */
export const dishPrice = (dish, content) => content.pantryById[dish.id]?.price ?? 0;

// A dish's bonuses in words: "+12% XP z wyprawy, +10% szansy na skrzynię
// wśród znalezisk" (cooking.bonuses).
/**
 * @param {{ bonuses: Bonus[] }} dish
 * @param {Content} content
 * @returns {string}
 */
export const mealBonusText = (dish, content) => dish.bonuses.map((bonus) => content.cooking.bonuses[bonus.kind].replace('{value}', String(bonus.value))).join(', ');

// The meal a character has eaten, as the row keeps it, or null once it is
// used up (or its dish is gone from the data).
/**
 * @param {unknown} stored
 * @param {Content} content
 * @returns {Meal | null}
 */
export function mealOf(stored, content) {
  const meal = /** @type {Record<string, any> | null} */ (typeof stored === 'string' ? JSON.parse(stored) : stored);
  if (!meal || typeof meal.dish !== 'string' || !content.dishesById[meal.dish] || !(meal.left > 0)) return null;
  return { dish: meal.dish, left: meal.left };
}

// A dish eaten now: its bonus for meal.minutes of explorations.
/**
 * @param {string} dishId
 * @param {Content} content
 * @returns {Meal}
 */
export const freshMeal = (dishId, content) => ({ dish: dishId, left: content.cooking.meal.minutes });

// An exploration of `minutes` setting out with the meal: what it gets
// (`bonus`: the dish's bonuses, the share of its time the meal covers, its
// minutes of the meal, and `last` when it uses the meal up), and the meal
// after it, or null once used up.
/**
 * @param {Meal | null} meal
 * @param {number} minutes
 * @param {Content} content
 * @returns {{ bonus: { dish: string, bonuses: Bonus[], share: number, minutes: number, last?: boolean } | null, after: Meal | null }}
 */
export function mealUse(meal, minutes, content) {
  if (!meal || minutes <= 0) return { bonus: null, after: meal };
  const dish = content.dishesById[meal.dish];
  const used = Math.min(meal.left, minutes);
  const left = meal.left - used;
  return {
    bonus: { dish: dish.id, bonuses: dish.bonuses, share: used / minutes, minutes: used, ...(left <= 0 && { last: true }) },
    after: left > 0 ? { dish: dish.id, left } : null,
  };
}

// "1 h 30 min", "45 min", "4 h": a meal's time, the same in both languages.
/** @param {number} minutes */
export function mealTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return [hours > 0 && `${hours} h`, rest > 0 && `${rest} min`].filter(Boolean).join(' ') || '0 min';
}

// An exploration report's line of its meal: the dish, the time of this
// exploration it worked for and its bonus, and when it is used up, that a
// new one waits for the next exploration; null without a meal.
/**
 * @param {Record<string, any>} hunt
 * @param {Content} content
 * @returns {string | null}
 */
export function mealLine(hunt, content) {
  const meal = hunt.meal;
  const dish = meal && content.cooking ? content.dishesById[meal.dish] : null;
  if (!dish) return null;
  const line = say(content.cooking.texts, 'mealLine', 0, { dish: dish.name, time: mealTime(meal.minutes), bonus: mealBonusText(dish, content) });
  return meal.last ? `${line} ${say(content.cooking.texts, 'mealOver', 0)}` : line;
}

// What a meal's bonuses do on an exploration (simulateHunt): the shares
// more of its XP, gold, materials, card chances, resources and chance of a
// chest among the finds, and the percentage points more of a rarer item,
// each by the share of the time it covers; all nothing without one.
/**
 * @param {{ bonuses?: Bonus[], share: number } | null | undefined} meal
 * @returns {{ xp: number, gold: number, materials: number, rare: number, cards: number, resources: number, chests: number }}
 */
export function mealEffects(meal) {
  const effects = { xp: 0, gold: 0, materials: 0, rare: 0, cards: 0, resources: 0, chests: 0 };
  if (!meal) return effects;
  const share = Math.min(1, Math.max(0, meal.share));
  for (const bonus of meal.bonuses ?? []) {
    if (bonus.kind in effects) effects[/** @type {keyof typeof effects} */ (bonus.kind)] += (bonus.value / 100) * share;
  }
  return effects;
}

// The report of a cooking: a line about the kitchen from the seed, the
// dishes made and the lucky ones among them, whether it was stopped, the
// profession's new levels with their stats and the recipes the System
// revealed with them, and the character's XP.
/**
 * @param {Record<string, any>} cooking
 * @param {Content} content
 */
export function cookingReport({ dish, minutes, startedAt, endsAt, seed, made, stopped, before, after, character, xp, work }, content) {
  const texts = content.cooking.texts;
  const profession = content.professionsById[content.cooking.profession];
  /** @type {Dish[]} */
  const revealed = content.dishes.filter((/** @type {Dish} */ candidate) => candidate.level > before.level && candidate.level <= after.level);
  /** @param {number} count */
  const list = (count) => countList({ [dish.id]: count }, content.dishesById);
  return {
    kind: 'dishes',
    placeName: content.cooking.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    dish: { id: dish.id, name: dish.name, count: made.count, bonus: made.bonus, meal: mealBonusText(dish, content) },
    cooked: say(texts, 'cooked', 0, { dishes: list(made.count) }),
    lucky: made.bonus > 0 ? say(texts, 'lucky', 0, { dishes: list(made.bonus) }) : null,
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((candidate, index) => say(texts, 'revealed', index, { dish: candidate.name })),
      ...work.messages,
    ],
  };
}
