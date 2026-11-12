// @ts-check
// Punkty Sławy of the characters (data/fame.json; src/server/fame.js keeps
// them; the author, 10.11.2026: „Przydałyby się Punkty Sławy dla postaci,
// gdzieś jako osobny moduł, zdobywane przez wszelakie aktywności, opisane.
// Niech trójka graczy z najwyższą aktywnością dostaje proporcjonalnie jakieś
// nagrody.”; „to mają być powtarzalne rzeczy czyli Wieże nie wchodzą, ale
// tygodniowo liczone git”; „760 A”). A character gathers them in a week
// (from Monday, midnight in Poland, as the weekly quests and the guilds'
// Sława) for what it does again and again: what each action brings is
// worked out here, from the numbers of the data. The Wieże and a Portal's
// new stage bring none: they are progress, not something to do again.

import { questPeriod } from './quests.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, points: number, minutes?: number, from?: number, weekly?: number }} FameSource A source of data/fame.json. */
/** @typedef {{ sources: FameSource[], rewards: { places: number, pool: number } }} FameRules data/fame.json. */
/** @typedef {{ characterId: number, userId: number, points: number }} FameRow */

/**
 * @param {Content} content
 * @returns {FameRules}
 */
const rules = (content) => content.fame;

// A source of Punkty Sławy by its id (data/fame.json `sources`).
/**
 * @param {string} id
 * @param {Content} content
 * @returns {FameSource}
 */
export function fameSource(id, content) {
  const source = rules(content).sources.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown fame source: ${id}`);
  return source;
}

// The points a source gives at once (an elite, a sweep, a sale…).
/**
 * @param {string} id
 * @param {Content} content
 */
export const famePointsOf = (id, content) => fameSource(id, content).points;

// The week of Punkty Sławy around `now`: its key (the date of its Monday on
// the Polish clock), its start and its end, as the weekly quests have it.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {{ key: string, startsAt: number, endsAt: number }}
 */
export const fameWeek = (now, content) => questPeriod('weekly', now, content);

// The week before the one around `now`.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {{ key: string, startsAt: number, endsAt: number }}
 */
export const famePreviousWeek = (now, content) => questPeriod('weekly', fameWeek(now, content).startsAt - 1, content);

// Points for each full `minutes` of a source counted by time.
/**
 * @param {string} id
 * @param {number} minutes
 * @param {Content} content
 */
const byTime = (id, minutes, content) => {
  const source = fameSource(id, content);
  return Math.floor(Math.max(0, minutes) / /** @type {number} */ (source.minutes)) * source.points;
};

// An exploration whose report is claimed, a Drużyna's trip too (each
// member's own report): its minutes, and each elite and champion beaten on
// it. A lost one (a faint, faintForfeit) brings nothing at all.
/**
 * @param {{ forfeit?: boolean, fights: Record<string, any>[] }} hunt
 * @param {number} minutes
 * @param {Content} content
 */
export function huntFame(hunt, minutes, content) {
  if (hunt.forfeit) return 0;
  /** @param {string} kind */
  const beaten = (kind) => hunt.fights.filter((fight) => fight.won === true && fight[kind]).length;
  return byTime('explore', minutes, content) + beaten('elite') * famePointsOf('elite', content) + beaten('champion') * famePointsOf('champion', content);
}

// A profession's work whose report is claimed, `minutes` of it; the Awatar
// Systemu's work counts a quarter (its own source, by the hour).
/**
 * @param {number} minutes
 * @param {boolean} avatar
 * @param {Content} content
 */
export const workFame = (minutes, avatar, content) => byTime(avatar ? 'avatar' : 'work', minutes, content);

// The narrator's quests of a period (daily, weekly, monthly) whose rewards
// are claimed.
/**
 * @param {string} periodId
 * @param {number} count
 * @param {Content} content
 */
export const questFame = (periodId, count, content) => count * famePointsOf(periodId, content);

// A try on the Kowadło (rollUpgrade): one that came off, more from the
// level of upgrade-high on (the game's own "od +5": the try to +5 and up).
/**
 * @param {{ result: string, upgrade: number }} outcome
 * @param {Content} content
 */
export function upgradeFame(outcome, content) {
  if (outcome.result !== 'success') return 0;
  const high = fameSource('upgrade-high', content);
  return outcome.upgrade >= /** @type {number} */ (high.from) ? high.points : famePointsOf('upgrade', content);
}

// The pool shared in proportion to the points, rounded so the shares make
// the pool exactly (the largest remainder method): each its whole part,
// then one more for the largest remainders, of two as large the higher
// place first. Whole numbers all the way, so no rounding of fractions
// decides. `points` (whole) in the order of the places.
/**
 * @param {number[]} points
 * @param {number} pool
 * @returns {number[]}
 */
export function fameShares(points, pool) {
  const total = points.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || pool <= 0) return points.map(() => 0);
  const rests = points.map((value) => (value * pool) % total);
  const shares = points.map((value, index) => (value * pool - rests[index]) / total);
  let left = pool - shares.reduce((sum, value) => sum + value, 0);
  const order = points.map((_, index) => index).sort((a, b) => rests[b] - rests[a] || a - b);
  for (const index of order) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}

// The rewarded of a week from its standings (`rows`: { characterId,
// userId, points }, best first): the best characters of `places` different
// accounts, an account's other characters left out (the author speaks of
// „trójka graczy”), only with points; each with its place and its share of
// the pool.
/**
 * @template {FameRow} T
 * @param {T[]} rows
 * @param {Content} content
 * @returns {(T & { place: number, share: number })[]}
 */
export function fameWinners(rows, content) {
  const { places, pool } = rules(content).rewards;
  const accounts = new Set();
  /** @type {T[]} */
  const best = [];
  for (const row of rows) {
    if (best.length >= places) break;
    if (!(row.points > 0) || accounts.has(row.userId)) continue;
    accounts.add(row.userId);
    best.push(row);
  }
  const shares = fameShares(
    best.map((row) => row.points),
    pool,
  );
  return best.map((row, index) => ({ ...row, place: index + 1, share: shares[index] }));
}
