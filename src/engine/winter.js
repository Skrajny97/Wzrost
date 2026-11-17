// @ts-check
// Szczodre Gody (1044; the author's 1028, decisions of 17.11.2026 in
// DECISIONS.md; data/winter.json): from the 1st to the 24th of December, one
// reward a day for coming into the game, each character its own calendar
// (as the series of days, 1029); a day missed is lost (1044.1a A), and the
// 24th gives the winter set (1044.2 B). The winter camp stands from the 1st
// to the 31st of December, with the decorations of the days taken (1044.3).
// The day is the Polish one, from midnight, as the daily quests' (the key of
// questPeriod('daily') in quests.js: 'YYYY-MM-DD').
//
// Stored state (characters.winter): {"period": "2026-12", "taken": [days]},
// the days of the calendar of that period taken; another period's count for
// nothing.

import { explorationGold } from './mining.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ period: string, day: number }} WinterToday */

/**
 * @param {string} key
 * @returns {[number, number, number]}
 */
const dateOf = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  return [year, month, day];
};

// Today's place in the calendar on the Polish day `key`: the period the
// days are kept under and today's day, or null outside the calendar's days.
// `test` (the test version's switch, WINTER "test") plays every day as a
// day of a calendar of that month, those after its last as its last, so
// the calendar can be tried before December.
/**
 * @param {string} key
 * @param {{ month: number, first: number, last: number }} calendar
 * @param {boolean} [test]
 * @returns {WinterToday | null}
 */
export function winterToday(key, calendar, test = false) {
  const [year, month, day] = dateOf(key);
  if (test) return { period: `test-${year}-${month}`, day: Math.min(Math.max(day, calendar.first), calendar.last) };
  if (month !== calendar.month || day < calendar.first || day > calendar.last) return null;
  return { period: `${year}-${month}`, day };
}

// The period of the winter camp on the Polish day `key` (the same as the
// calendar's of that month), or null outside its days. On test, every day.
/**
 * @param {string} key
 * @param {{ month: number, first: number, last: number }} camp
 * @param {boolean} [test]
 * @returns {string | null}
 */
export function winterCampPeriod(key, camp, test = false) {
  const [year, month, day] = dateOf(key);
  if (test) return `test-${year}-${month}`;
  return month === camp.month && day >= camp.first && day <= camp.last ? `${year}-${month}` : null;
}

// The days of `period` the character took, from its stored state.
/**
 * @param {unknown} stored
 * @param {string} period
 * @returns {number[]}
 */
export function winterTaken(stored, period) {
  const state = /** @type {{ period?: unknown, taken?: unknown } | null} */ (stored && typeof stored === 'object' ? stored : null);
  if (!state || state.period !== period || !Array.isArray(state.taken)) return [];
  return state.taken.filter((day) => Number.isInteger(day));
}

// What one day of the calendar gives a character of `level`: the gold of
// its minutes of exploring at that level, rounded to goldRound (at least
// that much), its Punkty Czasu, Punkty Systemu and packs of cards, a potion
// (id and count), a scroll's id, a decoration's id and the cosmetics of the
// winter set.
/**
 * @param {Record<string, any>} rule
 * @param {number} level
 * @param {Content} content
 */
export function winterReward(rule, level, content) {
  const { goldRound } = content.winter.calendar;
  return {
    gold: rule.goldMinutes ? Math.max(goldRound, Math.round((explorationGold(level, content) * rule.goldMinutes) / 60 / goldRound) * goldRound) : 0,
    timePoints: rule.timePoints ?? 0,
    systemPoints: rule.systemPoints ?? 0,
    packs: rule.packs ?? 0,
    potion: rule.potion ? { id: rule.potion, count: rule.count ?? 1 } : null,
    scroll: rule.scroll ?? null,
    decoration: rule.decoration ?? null,
    /** @type {string[]} */
    cosmetics: rule.cosmetics ?? [],
  };
}

// The calendar as the window shows it on `today`: today's day, whether its
// reward is taken, and every day with its reward and how it stands (taken,
// missed, today or later).
/**
 * @param {unknown} stored
 * @param {WinterToday} today
 * @param {number} level
 * @param {Content} content
 */
export function winterCalendar(stored, today, level, content) {
  const { days, first } = content.winter.calendar;
  const taken = winterTaken(stored, today.period);
  return {
    today: today.day,
    taken: taken.includes(today.day),
    days: days.map((/** @type {Record<string, any>} */ rule, /** @type {number} */ index) => {
      const day = first + index;
      const state = taken.includes(day) ? 'taken' : day < today.day ? 'missed' : day === today.day ? 'today' : 'later';
      return { day, state, ...winterReward(rule, level, content) };
    }),
  };
}

// The state stored once today's reward is taken.
/**
 * @param {unknown} stored
 * @param {WinterToday} today
 */
export function winterTakenState(stored, today) {
  const taken = winterTaken(stored, today.period);
  return { period: today.period, taken: [...new Set([...taken, today.day])].sort((a, b) => a - b) };
}

// The decorations standing in the winter camp of `period`: those of the
// days taken, by id, in the calendar's order.
/**
 * @param {unknown} stored
 * @param {string} period
 * @param {Content} content
 * @returns {string[]}
 */
export function winterDecorations(stored, period, content) {
  const { days, first } = content.winter.calendar;
  const taken = winterTaken(stored, period);
  return days.flatMap((/** @type {Record<string, any>} */ rule, /** @type {number} */ index) => (rule.decoration && taken.includes(first + index) ? [rule.decoration] : []));
}

// The winter quests (1044.4; data/winter.json, quests): on every day of the
// winter camp three quests by the daily ones, in a tab of the narrator's
// quests of their own: fir branches from the explorations (one a
// minutesPerPiece minutes of exploring), a carp from Rybołówstwo (any fish
// before the carp's level) and a dish from Gotowanie. Each gives its Punkty
// Czasu and the gold of its minutes of exploring; all of the day's open ones
// a card pack. A profession's quest is closed until the character has the
// profession, and the chest waits only for the open ones. Stored with the
// calendar (characters.winter.quests): {"key": day, "minutes", "fish",
// "dishes", "claimed": [ids], "chest": true}; another day's count for
// nothing.

/** @typedef {{ key: string, minutes: number, fish: number, dishes: number, claimed: string[], chest: boolean }} WinterQuests */
/** @typedef {{ fishingOpen: boolean, cookingOpen: boolean, carpOpen: boolean, fishingLevel: number, cookingLevel: number }} WinterFacts */

/**
 * @param {unknown} stored
 * @param {string} key
 * @returns {WinterQuests}
 */
export function winterQuestsOf(stored, key) {
  const quests = /** @type {Record<string, any> | null} */ (stored && typeof stored === 'object' ? /** @type {Record<string, any>} */ (stored).quests : null);
  const count = (/** @type {unknown} */ value) => (Number.isInteger(value) && /** @type {number} */ (value) > 0 ? /** @type {number} */ (value) : 0);
  if (!quests || quests.key !== key) return { key, minutes: 0, fish: 0, dishes: 0, claimed: [], chest: false };
  return {
    key,
    minutes: count(quests.minutes),
    fish: count(quests.fish),
    dishes: count(quests.dishes),
    claimed: Array.isArray(quests.claimed) ? quests.claimed.filter((id) => typeof id === 'string') : [],
    chest: quests.chest === true,
  };
}

// The stored state with the day's gains added: minutes of exploring, fish
// counted for the fish quest, dishes cooked.
/**
 * @param {unknown} stored
 * @param {string} key
 * @param {{ minutes?: number, fish?: number, dishes?: number }} gains
 */
export function winterQuestsGain(stored, key, { minutes = 0, fish = 0, dishes = 0 }) {
  const quests = winterQuestsOf(stored, key);
  const base = stored && typeof stored === 'object' ? stored : {};
  return { ...base, quests: { ...quests, minutes: quests.minutes + minutes, fish: quests.fish + fish, dishes: quests.dishes + dishes } };
}

// The day's winter quests of a character of `level`: each with its words'
// key, its count, progress, whether done, claimed or closed, and its rewards
// (gold, Punkty Czasu); and the chest, ready once every open quest is done.
/**
 * @param {unknown} stored
 * @param {string} key
 * @param {WinterFacts} facts
 * @param {number} level
 * @param {Content} content
 */
export function winterQuestList(stored, key, facts, level, content) {
  const state = winterQuestsOf(stored, key);
  const { goldRound } = content.winter.calendar;
  const gold = (/** @type {number} */ minutes) => (minutes ? Math.max(goldRound, Math.round((explorationGold(level, content) * minutes) / 60 / goldRound) * goldRound) : 0);
  const quests = content.winter.quests.list.map((/** @type {Record<string, any>} */ rule) => {
    const closed = (rule.kind === 'fish' && !facts.fishingOpen) || (rule.kind === 'cook' && !facts.cookingOpen);
    const reached = rule.kind === 'explore' ? Math.floor(state.minutes / rule.minutesPerPiece) : rule.kind === 'fish' ? state.fish : state.dishes;
    const progress = closed ? 0 : Math.min(rule.count, reached);
    return {
      id: rule.id,
      kind: rule.kind,
      count: rule.count,
      progress,
      done: !closed && progress >= rule.count,
      claimed: state.claimed.includes(rule.id),
      closed,
      // Before the carp's level any fish counts.
      anyFish: rule.kind === 'fish' && !facts.carpOpen,
      minutesPerPiece: rule.minutesPerPiece ?? null,
      gold: gold(rule.goldMinutes),
      timePoints: rule.timePoints,
    };
  });
  const open = quests.filter((/** @type {{ closed: boolean }} */ quest) => !quest.closed);
  return {
    quests,
    chest: { packs: content.winter.quests.chest.packs, ready: open.length > 0 && open.every((/** @type {{ done: boolean }} */ quest) => quest.done), opened: state.chest },
  };
}

// The stored state with a quest's reward or the chest taken.
/**
 * @param {unknown} stored
 * @param {string} key
 * @param {{ quest?: string, chest?: boolean }} taken
 */
export function winterQuestsTaken(stored, key, { quest, chest = false }) {
  const quests = winterQuestsOf(stored, key);
  const base = stored && typeof stored === 'object' ? stored : {};
  return { ...base, quests: { ...quests, claimed: quest ? [...new Set([...quests.claimed, quest])] : quests.claimed, chest: quests.chest || chest } };
}
