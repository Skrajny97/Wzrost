// @ts-check
// What makes an attack on the Bestia Gildii or a strażnik of the Wyprawa
// Gildii hit harder or softer (data/guilds.json `classDay`, `rally` and
// `undercut`; src/server/guild-strike.js; DECISIONS.md, "Klasa dnia",
// "Róg zbiórki" and "Podcięcie i cios"), all accepted by the author on the
// review page on 19.11.2026:
//   - the classes of the day (1197): two base classes a Polish day, from
//     one weekly schedule for the whole game, with all their evolutions,
//     whose attacks hit `power` times as hard;
//   - the guild's rally (1199 A): for its hour, every member's attacks hit
//     `power` times as hard;
//   - "Cios" or "Podcięcie" (1203): a podcięcie hits `power` times as hard
//     (half), and each of the next `uses` Cios of other players' members
//     hits `bonus` times as hard.
// The three multiply. The Bestia and the strażnicy have `hp` times the HP
// for each of them that has it (strikeHpGrowth), so a guild attacking as
// before ends in about the time it did. Pure: the time and the server's
// state come in.

import { trialDay } from './guild-trials.js';
import { questPeriod } from './quests.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {'strike' | 'undercut'} StrikeKind "Cios" or "Podcięcie". */

const HOUR = 3600000;

/**
 * @param {Content} content
 * @returns {{ classDay?: { power: number, hp?: number, schedule: string[][] }, rally?: { power: number, minutes: number, aheadHours: number }, undercut?: { power: number, bonus: number, uses: number, hp?: number } }}
 */
const rules = (content) => ({ classDay: content.guilds.classDay, rally: content.guilds.rally, undercut: content.guilds.undercut });

// The base classes of the day at `now` (Polish time, from midnight): the
// weekly schedule's pair for the day of the week, Monday first.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {string[]}
 */
export function classesOfDay(now, content) {
  const schedule = rules(content).classDay?.schedule;
  if (!schedule || schedule.length === 0) return [];
  return schedule[trialDay(now, content) % schedule.length];
}

// Whether a character of the base class `classId` (its evolutions count as
// it) has its day at `now`.
/**
 * @param {string} classId
 * @param {number} now
 * @param {Content} content
 * @returns {boolean}
 */
export const classOfDay = (classId, now, content) => classesOfDay(now, content).includes(classId);

// The days of the week (0 Monday to 6 Sunday) of each base class in the
// weekly schedule, by class id.
/**
 * @param {Content} content
 * @returns {Record<string, number[]>}
 */
export function classDays(content) {
  /** @type {Record<string, number[]>} */
  const days = {};
  for (const [day, classes] of (rules(content).classDay?.schedule ?? []).entries()) {
    for (const classId of classes) (days[classId] ??= []).push(day);
  }
  return days;
}

// How many times its HP the Bestia and the strażnicy have now: the growth
// of each of the three that gives one (classDay.hp, undercut.hp), so a
// guild attacking as before (only Cios, its classes as they are) ends in
// about the time it did, and one that plays its podcięcia well in about the
// time of before.
/**
 * @param {Content} content
 * @returns {number}
 */
export function strikeHpGrowth(content) {
  const { classDay, undercut } = rules(content);
  return (classDay?.hp ?? 1) * (undercut?.hp ?? 1);
}

// How hard one attack hits, as a multiple of a plain one: its class's day
// (`classDay`), the guild's rally on (`rally`), a podcięcie (`kind`
// "undercut") or a Cios strengthened by another member's podcięcie
// (`bonus`); a podcięcie takes no bonus. Rounded to 4 places.
/**
 * @param {{ classDay?: boolean, rally?: boolean, kind?: StrikeKind, bonus?: boolean }} attack
 * @param {Content} content
 * @returns {number}
 */
export function strikePower({ classDay = false, rally = false, kind = 'strike', bonus = false }, content) {
  const tuning = rules(content);
  let power = 1;
  if (classDay && tuning.classDay) power *= tuning.classDay.power;
  if (rally && tuning.rally) power *= tuning.rally.power;
  if (kind === 'undercut' && tuning.undercut) power *= tuning.undercut.power;
  else if (bonus && tuning.undercut) power *= tuning.undercut.bonus;
  return Math.round(power * 10000) / 10000;
}

// The Polish day a rally starting at `at` belongs to (its key, the date),
// one rally a day for a guild.
/**
 * @param {number} at
 * @param {Content} content
 * @returns {string}
 */
export const rallyDay = (at, content) => questPeriod('daily', at, content).key;

// When a rally set at `now` may start: at once ("now") or at any full hour
// after now up to aheadHours ahead, but not on a day that has its rally
// already (`taken`, the days' keys). Each with its day's key.
/**
 * @param {number} now
 * @param {string[]} taken
 * @param {Content} content
 * @returns {{ at: number | 'now', day: string }[]}
 */
export function rallySlots(now, taken, content) {
  const tuning = rules(content).rally;
  if (!tuning) return [];
  const busy = new Set(taken);
  /** @type {{ at: number | 'now', day: string }[]} */
  const slots = [];
  const today = rallyDay(now, content);
  if (!busy.has(today)) slots.push({ at: 'now', day: today });
  const last = now + tuning.aheadHours * HOUR;
  for (let at = Math.floor(now / HOUR) * HOUR + HOUR; at <= last; at += HOUR) {
    const day = rallyDay(at, content);
    if (!busy.has(day)) slots.push({ at, day });
  }
  return slots;
}

// Whether `at`, asked for at `now`, is a start a rally may have: "now", or
// a full hour after now and at most aheadHours ahead.
/**
 * @param {unknown} at
 * @param {number} now
 * @param {Content} content
 * @returns {boolean}
 */
export function rallyStartAllowed(at, now, content) {
  const tuning = rules(content).rally;
  if (!tuning) return false;
  if (at === 'now') return true;
  return typeof at === 'number' && Number.isInteger(at) && at % HOUR === 0 && at > now && at <= now + tuning.aheadHours * HOUR;
}

// A rally's state at `now`: "planned" before its start, "on" during its
// hour, "ended" after.
/**
 * @param {{ startsAt: number, endsAt: number }} rally
 * @param {number} now
 * @returns {'planned' | 'on' | 'ended'}
 */
export const rallyState = ({ startsAt, endsAt }, now) => (now < startsAt ? 'planned' : now < endsAt ? 'on' : 'ended');
