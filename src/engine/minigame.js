// @ts-check
// The mini-game at a work's report (data/professions.json: minigame; 1006,
// accepted by the author on 16.11.2026, A with his note: „niech będzie tak
// jak tutaj, ale niech szybko leci ten znacznik”): before the report of a
// finished work is claimed, a marker runs to and fro along a bar, and the
// player taps while it is in the green zone, three tries, each zone
// narrower. Each hit adds to the work's result: a share more of the herbs,
// potions, minerals, fish, crops or dishes (5% for one, 10% for two, 20%
// for three), or for the Warsztat and the Szlifiernia percentage points of
// the chance of an item a rarity higher. The zones come from the work's
// seed and the marker's place from the time since the game began on the
// server, so the server finds the hits from the times of the taps alone.

import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ center: number, width: number }} Zone A try's green zone: its middle and its width, as shares of the bar. */
/** @typedef {{ period: number, zones: Zone[], tries: number }} Challenge A work's mini-game: the marker's time to and fro (ms) and each try's zone. */

// The works with a mini-game, by their activity's kind.
export const MINIGAME_KINDS = ['herbs', 'potions', 'items', 'minerals', 'jewels', 'fish', 'crops', 'dishes'];

// The works whose mini-game raises the chance of a rarity higher, not the
// count of what they bring.
const RARITY_KINDS = new Set(['items', 'jewels']);

// A work's mini-game from its seed: each try's zone somewhere along the bar,
// whole within it.
/**
 * @param {unknown} seed
 * @param {Content} content
 * @returns {Challenge}
 */
export function minigameChallenge(seed, content) {
  const rules = content.minigame;
  const rng = createRng(`${seed}:minigame`);
  const edge = 0.04;
  const zones = rules.zones.map((/** @type {number} */ width) => ({ center: rng.float(width / 2 + edge, 1 - width / 2 - edge), width }));
  return { period: rules.period, zones, tries: rules.tries };
}

// The marker's place along the bar (0 at the left, 1 at the right) `ms`
// after the game began: from the left to the right and back in each period.
/**
 * @param {number} ms
 * @param {{ period: number }} challenge
 * @returns {number}
 */
export function markerAt(ms, { period }) {
  const phase = (((ms % period) + period) % period) / period;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

// Whether a tap `ms` after the game began hits the zone of a try.
/**
 * @param {number} ms
 * @param {Zone} zone
 * @param {{ period: number }} challenge
 */
export const tapHits = (ms, zone, challenge) => Math.abs(markerAt(ms, challenge) - zone.center) <= zone.width / 2;

// The hits of the taps (`taps`: ms after the game began, one a try), the
// game having gone on for `elapsed` ms by the claim: a tap counts only in
// order, after the one before, and not later than the game could have gone
// on (with the data's tolerance for the clocks); the first one out of that
// ends the game.
/**
 * @param {unknown} taps
 * @param {Challenge} challenge
 * @param {number} elapsed
 * @param {Content} content
 * @returns {number}
 */
export function minigameHits(taps, challenge, elapsed, content) {
  if (!Array.isArray(taps)) return 0;
  const tolerance = content.minigame.tolerance;
  let hits = 0;
  let last = -1;
  for (const [index, tap] of taps.slice(0, challenge.tries).entries()) {
    if (typeof tap !== 'number' || !Number.isFinite(tap) || tap <= last || tap < 0 || tap > elapsed + tolerance) break;
    last = tap;
    if (tapHits(tap, challenge.zones[index], challenge)) hits += 1;
  }
  return hits;
}

// What the hits give a work of `kind`: `share`, the share more of what it
// brings, or `luck`, the percentage points more of a rarity higher (the
// Warsztat's and the Szlifiernia's); and the bonus in words for its report.
/**
 * @param {string} kind
 * @param {number} hits
 * @param {Content} content
 * @returns {{ hits: number, tries: number, share: number, luck: number, bonus: string | null }}
 */
export function minigameResult(kind, hits, content) {
  const rules = content.minigame;
  const rarity = RARITY_KINDS.has(kind);
  const share = rarity ? 0 : (rules.shares[hits] ?? 0);
  const luck = rarity ? (rules.rarity[hits] ?? 0) : 0;
  const value = rarity ? Math.round(luck * 100) : Math.round(share * 100);
  const bonus = value > 0 ? rules.kinds[kind].bonus.replace('{value}', String(value)) : null;
  return { hits, tries: rules.tries, share, luck, bonus };
}

// The pieces a share more of what a work found adds, by id: the whole part
// of each count's share, and its fraction by chance, from the work's seed.
/**
 * @param {Record<string, number>} found
 * @param {number} share
 * @param {unknown} seed
 * @returns {Record<string, number>}
 */
export function minigameExtra(found, share, seed) {
  /** @type {Record<string, number>} */
  const extra = {};
  if (!(share > 0)) return extra;
  const rng = createRng(`${seed}:minigame-extra`);
  for (const [id, count] of Object.entries(found)) {
    const exact = count * share;
    const whole = Math.floor(exact);
    const more = whole + (rng.next() < exact - whole ? 1 : 0);
    if (more > 0) extra[id] = more;
  }
  return extra;
}

// A report's line of its mini-game: the hits and what they gave.
/**
 * @param {{ hits: number, tries: number, bonus: string | null }} result
 * @param {Content} content
 * @returns {string}
 */
export function minigameLine({ hits, tries, bonus }, content) {
  const texts = content.minigame.texts;
  return bonus ? texts.line[0].replace('{hits}', String(hits)).replace('{tries}', String(tries)).replace('{bonus}', bonus) : texts.none[0];
}
