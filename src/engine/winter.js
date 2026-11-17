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
