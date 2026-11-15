// @ts-check
// The time in the game (993 A; the author, 15.11.2026: „Chcemy też dodać
// funkcję liczenia czasu aktywności w grze i nagradzania gracza Punktami
// Czasu za sam czas spędzony w grze jako takiej, nawet na oglądaniu ekranu i
// klikaniu.”): a minute with the game on the screen, counted by the server
// once a minute at most (balance.json timePoints.play.gapSeconds apart), is
// worth a Punkt Czasu for every timePoints.play.minutes of them, up to
// timePoints.play.daily a narrator's day. The page counts the minute while
// it is in front and touched in the last idleMinutes (src/client/play-time.js).

import { questPeriod } from './quests.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ day: string, minutes: number, at: number }} PlayTime The day's minutes and the last one counted. */

// The points a day's minutes are worth, up to the day's limit.
/**
 * @param {number} minutes
 * @param {{ minutes: number, daily: number }} rules
 */
const pointsOf = (minutes, rules) => Math.min(rules.daily, Math.floor(minutes / rules.minutes));

// One more minute in the game, unless one was counted less than gapSeconds
// ago (two pages, or two devices, count once); a new day starts from 0.
// `gained`: the Punkty Czasu it is worth.
/**
 * @param {PlayTime | null} stored
 * @param {number} now
 * @param {Content} content
 * @returns {{ play: PlayTime | null, gained: number, counted: boolean }}
 */
export function playMinute(stored, now, content) {
  const rules = content.balance.timePoints.play;
  if (stored && now >= stored.at && now - stored.at < rules.gapSeconds * 1000) return { play: stored, gained: 0, counted: false };
  const day = questPeriod('daily', now, content).key;
  const before = stored?.day === day ? stored.minutes : 0;
  const minutes = before + 1;
  return { play: { day, minutes, at: now }, gained: pointsOf(minutes, rules) - pointsOf(before, rules), counted: true };
}

// The page's view of today: the points the time in the game gave, the day's
// limit, the minutes counted, and after how many minutes untouched the page
// stops counting.
/**
 * @param {PlayTime | null} stored
 * @param {number} now
 * @param {Content} content
 */
export function playView(stored, now, content) {
  const rules = content.balance.timePoints.play;
  const minutes = stored && stored.day === questPeriod('daily', now, content).key ? stored.minutes : 0;
  return { points: pointsOf(minutes, rules), daily: rules.daily, minutes, idleMinutes: rules.idleMinutes };
}
