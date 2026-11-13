// @ts-check
// The residents of the Osada at their card tables (904 B; data/cards.json,
// `residents`; DECISIONS.md, "Karty z innymi graczami, z mieszkańcami Osady
// i z nowych źródeł", point 5). Pure, as the rest of Talia Systemu
// (cards.js): the server keeps the matches and gives the seeds.
//
// Nine residents play at their own places, each with a deck of its own
// style, between Szczęsny's tiers: two between each two of them, and one
// stronger than his top tier (`after`, the tier each one beats). A match is
// staked, for a stake between the neighbouring tiers' (`stake` times the
// stakes' base) and among the day's ten staked matches with Szczęsny's, or
// training, as at his table. A staked win gives twice the stake and a draw
// the stake back; the first staked win over a resident gives a card of its
// deck the character has not got, and every later one a chance of one
// (`chance`): the one picker of every source (pickCard), so first a card it
// has not got, never one at its top level.

import { cardFrom, cardRules, hostTiers, stakeBase } from './cards.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} ResidentTable A resident's table: its deck, place among the tiers, stake and words (data/cards.json, residents.tables). */

// The residents' tables, as the data lists them; none where the game has
// no cards or no residents' tables.
/**
 * @param {Content} content
 * @returns {ResidentTable[]}
 */
export const residentTables = (content) => cardRules(content)?.residents?.tables ?? [];

// A resident's table by its id, or null.
/**
 * @param {unknown} id
 * @param {Content} content
 * @returns {ResidentTable | null}
 */
export const residentTable = (id, content) => (typeof id === 'string' ? (residentTables(content).find((table) => table.id === id) ?? null) : null);

// A table's stake at a character level: its `stake` times the base of the
// stakes, as a tier's (tierStake), whole.
/**
 * @param {ResidentTable} table
 * @param {number} level
 * @param {Content} content
 */
export const residentStake = (table, level, content) => Math.round(table.stake * stakeBase(level, content));

// The creatures of a table's deck, in the data's order.
/**
 * @param {ResidentTable} table
 * @returns {string[]}
 */
export const residentDeck = (table) => table.cards.map((/** @type {{ monster: string }} */ card) => card.monster);

// Whether a table is stronger than Szczęsny's top tier (the one above them all).
/**
 * @param {ResidentTable} table
 * @param {Content} content
 */
export const aboveTiers = (table, content) => table.after >= hostTiers(content).length;

// The card a staked win at a table gives (904 B), drawn from the match's
// seed: at the first staked win over the resident always one, at a later
// one with the residents' chance; a card of the deck the character has not
// got first (`owned` holds those it has), else one below its top level
// (`maxed` holds those at it). Null when none comes or none is left. Both
// draws are always made, as a source's (cardFrom).
/**
 * @param {{ table: ResidentTable, first: boolean, seed: string, owned?: Iterable<string>, maxed?: Iterable<string> }} win
 * @param {Content} content
 * @returns {string | null}
 */
export function residentWinCard({ table, first, seed, owned = [], maxed = [] }, content) {
  const chance = first ? 1 : (cardRules(content).residents?.chance ?? 0);
  return cardFrom(residentDeck(table), createRng(`${seed}:resident-card`), { chance, owned, maxed });
}

// What a table's cards are to the character: how many of them it has not
// got, and whether any can still come (one below its top level).
/**
 * @param {ResidentTable} table
 * @param {Map<string, number>} collection the copies the character has, by card
 * @param {Content} content
 * @returns {{ missing: number, left: number }}
 */
export function residentCardsLeft(table, collection, content) {
  const top = cardRules(content).stats.maxLevel;
  const deck = residentDeck(table);
  return { missing: deck.filter((id) => !collection.has(id)).length, left: deck.filter((id) => (collection.get(id) ?? 0) < top).length };
}
