// @ts-check
// Andrzejki: Wieczór wróżb (1082 C, 1083 C, 1084 A and B; the author's
// decisions of 18.11.2026 in DECISIONS.md; data/winter.json, `andrzejki`).
// On the evening of 29 November, from 18:00, the wax poured through a key
// sets into a shape, and on 30 November one of three cups hides a wax
// figurine: each evening a character tells its fortune once. One of eight
// omens, each a premium of `value` percent for `hours` hours to one kind of
// the weeks' effects (weeks.js: XP or gold from fights, the chance of an
// item, materials, the professions' XP, herbs, the pace of rest, reputation)
// and a small reward at once. With the omen comes one of the fortunes'
// words (`fortunes`, the author's, 24.11.2026: „Takie skierowane do gracza
// nie do postaci nawet”), drawn from the same seed. A fortune on both
// evenings of a year gives the portrait's background and the achievement
// with its title. The day is the Polish one, as the daily quests'
// (questPeriod('daily') in quests.js).
//
// Stored state (characters.andrzejki): {"2026-11-29": {"omen": "dragon",
// "kind": "wax", "at": 1795…, "line": 17}, …}, the fortunes told, by the
// Polish day; `line` is the place of the words in `fortunes`, missing in a
// fortune told before they came.

import { explorationGold } from './mining.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, kind: string, reward: { timePoints?: number, goldMinutes?: number, packs?: number } }} Omen */
/** @typedef {{ month: number, days: { day: number, from: number, kind: string }[], hours: number, value: number, goldRound: number, omens: Omen[], fortunes?: string[] }} AndrzejkiRules */
/** @typedef {{ omen: string, kind: string, at: number, cup?: number, line?: number }} Fortune */
/** @typedef {{ key: string, kind: string, opensAt: number, endsAt: number }} Evening */

const HOUR = 3600000;

// The fortune evening of the Polish day `day` (questPeriod's key, start and
// end) at `now`, or null: its key, its kind (wax or cups), when it opens and
// ends. `test` (the test version's switch, ANDRZEJKI "test") plays every day
// as one of the evenings, from midnight: an odd day as the wax, an even one
// as the cups, so both can be tried before November.
/**
 * @param {{ key: string, startsAt: number, endsAt: number }} day
 * @param {number} now
 * @param {AndrzejkiRules} rules
 * @param {boolean} [test]
 * @returns {Evening | null}
 */
export function andrzejkiEvening(day, now, rules, test = false) {
  const [, month, date] = day.key.split('-').map(Number);
  const evening = test ? rules.days[(date + 1) % rules.days.length] : month === rules.month ? rules.days.find((one) => one.day === date) : undefined;
  if (!evening) return null;
  const opensAt = test ? day.startsAt : day.startsAt + evening.from * HOUR;
  return now >= opensAt && now < day.endsAt ? { key: day.key, kind: evening.kind, opensAt, endsAt: day.endsAt } : null;
}

// A fortune drawn from the server's seed (the character, the evening and,
// among the cups, the one chosen): its omen first, as before the words came,
// then the place of its words in `fortunes` (`line`), or null without them.
/**
 * @param {string} seed
 * @param {AndrzejkiRules} rules
 * @returns {{ omen: Omen, line: number | null }}
 */
export function drawFortune(seed, rules) {
  const rng = createRng(seed);
  const omen = rng.pick(rules.omens);
  const count = rules.fortunes?.length ?? 0;
  return { omen, line: count > 0 ? rng.int(0, count - 1) : null };
}

// The words of a fortune told: those at its `line` in `fortunes`, or null
// for a fortune told before the words came (or a line no longer there).
/**
 * @param {Fortune | null | undefined} fortune
 * @param {AndrzejkiRules} rules
 * @returns {string | null}
 */
export function fortuneWords(fortune, rules) {
  const line = fortune?.line;
  return typeof line === 'number' && Number.isInteger(line) ? (rules.fortunes?.[line] ?? null) : null;
}

// The omens of the fortunes told whose premium still runs at `now`: each as
// an effect of the weeks ({ kind, value }) with its omen's id, and until
// when it runs.
/**
 * @param {Record<string, Fortune> | null} stored
 * @param {number} now
 * @param {AndrzejkiRules} rules
 * @returns {{ kind: string, value: number, omen: string, until: number }[]}
 */
export function omenEffects(stored, now, rules) {
  return Object.values(stored ?? {}).flatMap((fortune) => {
    const omen = rules.omens.find((one) => one.id === fortune.omen);
    const until = fortune.at + rules.hours * HOUR;
    return omen && fortune.at <= now && now < until ? [{ kind: omen.kind, value: rules.value, omen: omen.id, until }] : [];
  });
}

// What an omen gives at once to a character of `level`: its Punkty Czasu,
// the gold of its minutes of exploring at that level (rounded to goldRound,
// as the winter calendar's) and its packs of cards.
/**
 * @param {Omen} omen
 * @param {number} level
 * @param {AndrzejkiRules} rules
 * @param {Content} content
 * @returns {{ timePoints: number, gold: number, packs: number }}
 */
export function omenReward(omen, level, rules, content) {
  const { timePoints = 0, goldMinutes = 0, packs = 0 } = omen.reward;
  const gold = goldMinutes ? Math.max(rules.goldRound, Math.round((explorationGold(level, content) * goldMinutes) / 60 / rules.goldRound) * rules.goldRound) : 0;
  return { timePoints, gold, packs };
}

// Whether the fortunes of the year of `key` were told on both evenings (one
// of each kind): the portrait's background and the achievement come then.
/**
 * @param {Record<string, Fortune> | null} stored
 * @param {string} key
 * @param {AndrzejkiRules} rules
 * @returns {boolean}
 */
export function bothEvenings(stored, key, rules) {
  const year = key.slice(0, 4);
  const kinds = new Set(Object.entries(stored ?? {}).filter(([day]) => day.slice(0, 4) === year).map(([, fortune]) => fortune.kind));
  return rules.days.every((evening) => kinds.has(evening.kind));
}

// The fortunes kept with a new one: those of the year of `key` (the older
// years' go) and today's.
/**
 * @param {Record<string, Fortune> | null} stored
 * @param {string} key
 * @param {Fortune} fortune
 * @returns {Record<string, Fortune>}
 */
export function withFortune(stored, key, fortune) {
  const year = key.slice(0, 4);
  return { ...Object.fromEntries(Object.entries(stored ?? {}).filter(([day]) => day.slice(0, 4) === year)), [key]: fortune };
}
