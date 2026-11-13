// @ts-check
// The Arena's "Karty" (data/settlement.json, arena.cards; src/server/card-arena.js;
// DECISIONS.md, "Karty z innymi graczami, z mieszkańcami Osady i z nowych
// źródeł", 900 A): matches of Talia Systemu (cards.js) with the decks other
// players saved, the rival's deck played by the server as Szczęsny plays
// his higher tiers, its hero card with it (rivalSkill in cards.js), and
// for laying its cards first the defending deck's Atak and Życie raised by
// rules.defenceBonus (915 B: newMatch's boost). The player's own saved deck
// defends it the same way while it is away.
//
// Everything else mirrors the duels of the Arena (pvp-arena.js): a card
// rating of its own from rating.start, moved as in chess (Elo), the
// attacker's by attackK and the defender's by the smaller defenceK, never
// below rating.floor; matchesPerDay matches a Polish day, each counted at
// its start; three rivals of a similar rating, drawn anew with "Losuj
// innych" a few times a day; the week's table, frozen on Monday at Polish
// midnight, with rewards of rewards.share of the duels' (the author's 900 A:
// half); the season a month. What a match puts at stake is fixed at its
// start (cardRatingStakes) and moves the ratings at its end. Pure: the
// server gives the time and the seeds.

import { cardStats, cardType } from './cards.js';
import { arenaDay, arenaReward, arenaRewardTiers } from './pvp-arena.js';
import { laterPeriod } from './quests.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {'win' | 'loss' | 'draw'} CardOutcome A match's result for its attacker, as the Arena counts it. */
/** @typedef {{ id: string, level: number }} DeckCard A card of a deck: its creature and its level. */
/** @typedef {{ systemPoints: number, gold: number }} CardReward */

/**
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const cardArenaRules = (content) => content.settlement?.arena?.cards ?? null;

// A match's score for its rating: a win, a loss and a draw.
/** @type {Record<CardOutcome, number>} */
const SCORES = { win: 1, loss: 0, draw: 0.5 };
/** @type {CardOutcome[]} */
const OUTCOMES = ['win', 'loss', 'draw'];

// A match's end as the Arena counts it, from the engine's result of the
// player's side (newMatch, playTurn): won, lost or drawn.
/**
 * @param {string | null} result
 * @returns {CardOutcome | null}
 */
export const cardArenaOutcome = (result) => (result === 'won' ? 'win' : result === 'lost' ? 'loss' : result === 'drawn' ? 'draw' : null);

// Half away from zero, as SQLite's ROUND, so a season's move of the ratings
// comes out the same in the engine and in the server's SQL.
/** @param {number} value */
const rounded = (value) => Math.sign(value) * Math.round(Math.abs(value));

// The score a side of `rating` is expected to make against `other`, as in
// chess: 0.5 for two equal ratings, more against a weaker rival.
/**
 * @param {number} rating
 * @param {number} other
 * @param {Content} content
 */
export const cardExpectedScore = (rating, other, content) => 1 / (1 + 10 ** ((other - rating) / cardArenaRules(content)?.rating.scale));

// How a match moves both card ratings: K times the score made less the one
// expected, the attacker's by rating.attackK and the defender's (its deck
// played for it) by rating.defenceK, rounded, never below rating.floor; as
// the duels' (ratingChanges in pvp-arena.js), with the card rating's own
// numbers. `result` is the attacker's.
/**
 * @param {number} attackerRating
 * @param {number} defenderRating
 * @param {CardOutcome} result
 * @param {Content} content
 * @returns {{ attacker: number, defender: number }}
 */
export function cardRatingChanges(attackerRating, defenderRating, result, content) {
  const { attackK, defenceK, floor } = cardArenaRules(content)?.rating;
  const miss = SCORES[result] - cardExpectedScore(attackerRating, defenderRating, content);
  /**
   * @param {number} rating
   * @param {number} change
   */
  const moved = (rating, change) => Math.max(floor, rating + Math.round(change)) - rating;
  return { attacker: moved(attackerRating, attackK * miss), defender: moved(defenderRating, -defenceK * miss) };
}

// What a match with a rival puts at stake, fixed at its start: each
// result's move of the attacker's rating and of the defender's.
/**
 * @param {number} attackerRating
 * @param {number} defenderRating
 * @param {Content} content
 * @returns {{ attacker: Record<CardOutcome, number>, defender: Record<CardOutcome, number> }}
 */
export function cardRatingStakes(attackerRating, defenderRating, content) {
  const moves = OUTCOMES.map((result) => cardRatingChanges(attackerRating, defenderRating, result, content));
  /** @param {'attacker' | 'defender'} side */
  const of = (side) => /** @type {Record<CardOutcome, number>} */ (Object.fromEntries(OUTCOMES.map((result, index) => [result, moves[index][side]])));
  return { attacker: of('attacker'), defender: of('defender') };
}

// A deck's strength, as the rivals show it (900 A): the Atak and Życie of
// its cards at their levels, all summed.
/**
 * @param {DeckCard[]} cards
 * @param {Content} content
 */
export const deckStrength = (cards, content) =>
  cards.reduce((sum, card) => {
    const { attack, life } = cardStats(card.id, card.level, content);
    return sum + attack + life;
  }, 0);

// How many cards of each type a deck has, in the order of the types, each
// with its name and icon.
/**
 * @param {DeckCard[]} cards
 * @param {Content} content
 * @returns {{ id: string, name: string, icon: string, count: number }[]}
 */
export const deckTypeCounts = (cards, content) =>
  content.cards.types.map((/** @type {{ id: string, name: string, icon: string }} */ type) => ({
    id: type.id,
    name: type.name,
    icon: type.icon,
    count: cards.filter((card) => cardType(card.id, content) === type.id).length,
  }));

// What is left today of `perDay` uses counted by the Polish day, as the
// duels count theirs: `day` the day of the last use, `used` how many fell
// on it; a use of a later day leaves none (a request still of the day gone
// starts no match and writes no day back).
/**
 * @param {number} perDay
 * @param {string | null | undefined} day
 * @param {number | null | undefined} used
 * @param {number} now
 * @param {Content} content
 */
function leftToday(perDay, day, used, now, content) {
  const today = arenaDay(now, content).key;
  if (laterPeriod(day, today)) return 0;
  return Math.max(0, perDay - (day === today ? (used ?? 0) : 0));
}

// The matches left today of a record ({ day, matches }: the day of the
// last match started and how many started on it).
/**
 * @param {{ day?: string | null, matches?: number | null } | null | undefined} record
 * @param {number} now
 * @param {Content} content
 */
export const cardMatchesLeft = (record, now, content) => leftToday(cardArenaRules(content)?.matchesPerDay, record?.day, record?.matches, now, content);

// The draws of other rivals ("Losuj innych") left today of a record
// ({ reroll_day, rerolls }).
/**
 * @param {{ reroll_day?: string | null, rerolls?: number | null } | null | undefined} record
 * @param {number} now
 * @param {Content} content
 */
export const cardRerollsLeft = (record, now, content) => leftToday(cardArenaRules(content)?.rivals.rerollsPerDay, record?.reroll_day, record?.rerolls, now, content);

// The rivals offered: rivals.count of the `candidates` (the server's,
// nearest card ratings first, at most rivals.pool of them, each with a
// deck, none of the player's own account), drawn with `seed`, the highest
// rating first. Those in `recent` (the rival just played, or those offered
// before "Losuj innych") come in only to fill the places no other
// candidate is left for, as in the duels (drawRivals).
/**
 * @template {{ id: number, rating: number }} T
 * @param {T[]} candidates
 * @param {string | number} seed
 * @param {Content} content
 * @param {number[]} [recent]
 * @returns {T[]}
 */
export function drawCardRivals(candidates, seed, content, recent = []) {
  const { count } = cardArenaRules(content)?.rivals;
  const rng = createRng(`card-arena-rivals:${seed}`);
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

// The share of the way back to rating.start a card rating keeps after
// `months` new seasons, each moving it season.share of the way.
/**
 * @param {number} months
 * @param {Content} content
 */
export const cardSeasonFactor = (months, content) => (1 - cardArenaRules(content)?.season.share) ** months;

// A card rating after `months` new seasons.
/**
 * @param {number} rating
 * @param {number} months
 * @param {Content} content
 */
export function cardSeasonRating(rating, months, content) {
  const { start } = cardArenaRules(content)?.rating;
  return start + rounded((rating - start) * cardSeasonFactor(months, content));
}

// A reward of the duels' table as the card table gives it: rewards.share of
// its Punkty Systemu and gold, each rounded (half up: 12.5 Punktów is 13).
/**
 * @param {CardReward} reward
 * @param {Content} content
 * @returns {CardReward}
 */
function shareOf({ systemPoints, gold }, content) {
  const { share } = cardArenaRules(content)?.rewards;
  return { systemPoints: Math.round(systemPoints * share), gold: Math.round(gold * share) };
}

// The reward of a place on a week's card table for a character of `level`:
// the duels' reward of that place (arenaReward), at rewards.share.
/**
 * @param {number} place
 * @param {number} level
 * @param {Content} content
 * @returns {CardReward | null}
 */
export function cardArenaReward(place, level, content) {
  const reward = arenaReward(place, level, content);
  return reward && shareOf(reward, content);
}

// The tiers of the card table's rewards with the places each covers, for a
// character of `level`: the duels' tiers at rewards.share.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ from: number, to: number | null, systemPoints: number, gold: number }[]}
 */
export const cardArenaRewardTiers = (level, content) => arenaRewardTiers(level, content).map((tier) => ({ ...tier, ...shareOf(tier, content) }));
