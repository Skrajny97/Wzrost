// @ts-check
// The Kącina: opiekun tygodnia (the author's 1201 A, accepted on the review
// page on 19.11.2026; data/guilds.json `shrine`; src/server/guild-shrine.js):
// a Slavic shrine in every guild's Siedziba, standing from the start with no
// levels. Each week `offer` of its gods are offered, in the order of the
// list, which moves on by `offer` places every week (with four gods each
// rests one week in four); each member votes once for one of them until
// Sunday's end. As the next week starts the god with the most votes wins;
// in a tie the one the leader voted for, and when the leader voted for none
// of them, the one that reached that many votes first; with no votes the
// guild has no patron that week. The patron gives every member its effects
// for the whole week, as a week of the year's (weeks.js, marked `patron`),
// and that week `domainShare` of the guild's Próby board comes from its
// domain (drawTrialBoard in guild-trials.js). Pure: the server gives the
// week and the votes.

import { weekEffectsText } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, genitive: string, title: string, effects: import('./weeks.js').WeekEffect[], domain: string[], domainText: string }} God A god of the Kącina (data/guilds.json, shrine.gods). */
/** @typedef {{ characterId: number, god: string, at: number }} Vote A member's vote of a week. */

const DAY = 86400000;

/**
 * @param {Content} content
 * @returns {{ id: string, name: string, offer: number, domainShare: number, gods: God[] }}
 */
const rules = (content) => content.guilds.shrine;

/** @param {Content} content */
export const shrineGods = (content) => rules(content).gods;

// The god of an id, or null.
/**
 * @param {string | null | undefined} id
 * @param {Content} content
 * @returns {God | null}
 */
export const shrineGod = (id, content) => (id ? (rules(content).gods.find((god) => god.id === id) ?? null) : null);

// The number of a week from its key, the date of its Monday ("2026-11-16"):
// the weeks since the Monday of 5 January 1970.
/** @param {string} key */
export function weekNumber(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) - 4 * DAY) / (7 * DAY));
}

// The ids of the gods offered in the week of `key`: `offer` of them, from
// the place the week's number moves the list to, in the list's order.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {string[]}
 */
export function offeredGods(key, content) {
  const { gods, offer } = rules(content);
  const count = gods.length;
  const take = Math.min(offer, count);
  const start = (((weekNumber(key) * take) % count) + count) % count;
  const chosen = new Set(Array.from({ length: take }, (_, index) => (start + index) % count));
  return gods.filter((_, index) => chosen.has(index)).map((god) => god.id);
}

// The votes of a week counted for the gods `offered` (other votes left
// out): each god's votes and the moment its last one came.
/**
 * @param {Vote[]} votes
 * @param {string[]} offered
 * @returns {Map<string, { count: number, last: number }>}
 */
export function voteCounts(votes, offered) {
  const counts = new Map(offered.map((id) => [id, { count: 0, last: 0 }]));
  for (const vote of votes) {
    const tally = counts.get(vote.god);
    if (!tally) continue;
    tally.count += 1;
    tally.last = Math.max(tally.last, vote.at);
  }
  return counts;
}

// The god that wins a week's vote, or null with no votes: the most votes;
// of those tied, the one the leader (`leaderId`) voted for, else the one
// that reached that many votes first (its last vote the earliest), else the
// first in the list.
/**
 * @param {Vote[]} votes
 * @param {number | null} leaderId
 * @param {string[]} offered
 * @returns {string | null}
 */
export function patronWinner(votes, leaderId, offered) {
  const counts = voteCounts(votes, offered);
  const most = Math.max(0, ...[...counts.values()].map((tally) => tally.count));
  if (most === 0) return null;
  const tied = offered.filter((id) => counts.get(id)?.count === most);
  const leader = votes.find((vote) => vote.characterId === leaderId)?.god;
  if (leader && tied.includes(leader)) return leader;
  return tied.reduce((best, id) => ((counts.get(id)?.last ?? 0) < (counts.get(best)?.last ?? 0) ? id : best));
}

// A patron's effects as a week's (weeks.js), each marked with its god, so a
// report tells them apart from the week's own; none without a patron.
/**
 * @param {string | null | undefined} godId
 * @param {Content} content
 * @returns {import('./weeks.js').WeekEffect[]}
 */
export function patronEffects(godId, content) {
  const god = shrineGod(godId, content);
  return god ? god.effects.map((effect) => ({ ...effect, patron: god.id })) : [];
}

// What a god gives, in words: "+5% XP z walk", or long, "o 5% więcej XP z
// walk" (weeks.js).
/**
 * @param {God} god
 * @param {Content} content
 * @param {boolean} [short]
 */
export const godBonusText = (god, content, short = true) => weekEffectsText(god.effects, content, short);

// The kinds of the Próby of a god's domain, or none.
/**
 * @param {string | null | undefined} godId
 * @param {Content} content
 * @returns {string[]}
 */
export const godDomain = (godId, content) => shrineGod(godId, content)?.domain ?? [];
