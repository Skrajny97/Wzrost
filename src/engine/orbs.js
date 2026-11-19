// @ts-check
// Kulki Systemu on the exploration board (data/orbs.json; DECISIONS.md,
// „Kulki Systemu na planszy wyprawy (makieta, 19.11.2026)”): a player's idea
// the author approved on one condition, „ale punktów systemu do tych kulek
// nie dodawaj”. While an exploration runs, now and then an orb floats across
// the Walka scene, and a tap catches it. The server alone decides when: the
// moments come from the exploration's seed, and so does each orb's reward,
// from the seed and the orb's number, so a repeated tap or request never
// draws it anew. The fights draw from the seed itself, these from seeds of
// their own (`<seed>:orbs`, `<seed>:orb:<n>`), so no fight changes.

import { ordinaryMaterial, stackKey } from './crafting.js';
import { areaDangers } from './hunt.js';
import { lateRewards } from './progression.js';
import { laterPeriod, questPeriod } from './quests.js';
import { countEvents, createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./combatant.js').Area} Area */
/** @typedef {{ kind: 'gold', gold: number } | { kind: 'time', timePoints: number } | { kind: 'material', material: string, stack: string, amount: number }} OrbReward */

const SECOND = 1000;

// The moments of an exploration's orbs, in ms after its start, in order. On
// average one for minutesPerOrb of its `minutes`, at least one from
// guaranteedFromMinutes on. Its `wait` (ms from its start to its end, shorter
// with a mount) from startGapSeconds on, up to claimSeconds before its end,
// is cut into as many equal parts, each with one orb at a random moment of
// its own where its whole flight fits: no two fly at once, and each can be
// caught before the exploration ends. None where the wait has no room.
/**
 * @param {string} seed
 * @param {number} minutes
 * @param {number} wait
 * @param {Content} content
 * @returns {number[]}
 */
export function orbMoments(seed, minutes, wait, content) {
  const rules = content.orbs;
  if (!rules) return [];
  const rng = createRng(`${seed}:orbs`);
  const drawn = countEvents(minutes / rules.minutesPerOrb, rng);
  const count = minutes >= rules.guaranteedFromMinutes ? Math.max(1, drawn) : drawn;
  const from = rules.startGapSeconds * SECOND;
  const room = wait - from - rules.claimSeconds * SECOND;
  if (count === 0 || room <= 0) return [];
  const part = room / count;
  const free = Math.max(0, part - rules.flightSeconds * SECOND);
  return Array.from({ length: count }, (_, index) => Math.round(from + index * part + rng.float(0, free)));
}

// The materials an orb may give in an inner region: those of its ordinary
// creatures (not its elite's or champion's trophy) of the lowest rarity
// among them, the place's cheapest, in the order of its Bestiariusz.
/**
 * @param {Area} area
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export function orbMaterials(area, content) {
  /** @type {Map<string, Record<string, any>>} */
  const found = new Map();
  for (const danger of areaDangers(area, content)) {
    if (danger.elite || danger.champion) continue;
    const material = content.materialsByMonster[danger.monsterId];
    if (material && ordinaryMaterial(material.id, content)) found.set(material.id, material);
  }
  const rank = (/** @type {Record<string, any>} */ material) => content.rarities.findIndex((/** @type {{ id: string }} */ rarity) => rarity.id === material.rarity);
  const all = [...found.values()];
  const lowest = Math.min(...all.map(rank));
  return all.filter((material) => rank(material) === lowest);
}

// What orb `index` of the exploration of `seed` gives a character of
// `level` in `area`: by the weights of `kinds`, gold (from goldShare[0] to
// goldShare[1] of a find's: rewards.findGoldPerLevel × level), Punkty Czasu
// (timePoints) or one piece of the place's cheapest material (orbMaterials).
// From the late class levels on (lateRewards, by `classLevel`, as every
// late threshold since 0.4.60) a part of the gold, and of the material's
// chance, its rest going to gold; Punkty Czasu as before them, as with the
// exploration's own finds (0.4.46). Never Punkty Systemu.
/**
 * @param {{ seed: string, index: number, level: number, classLevel?: number, area: Area | null | undefined }} orb
 * @param {Content} content
 * @returns {OrbReward}
 */
export function orbReward({ seed, index, level, classLevel = 0, area }, content) {
  const rules = content.orbs;
  const rng = createRng(`${seed}:orb:${index}`);
  const late = lateRewards(classLevel, content);
  const materials = area ? orbMaterials(area, content) : [];
  const material = materials.length > 0 ? rules.kinds.material * late : 0;
  const kinds = [
    { kind: 'gold', weight: rules.kinds.gold + rules.kinds.material - material },
    { kind: 'time', weight: rules.kinds.time },
    { kind: 'material', weight: material },
  ].filter((entry) => entry.weight > 0);
  const { kind } = rng.weighted(kinds);
  if (kind === 'time') return { kind, timePoints: rng.int(rules.timePoints[0], rules.timePoints[1]) };
  if (kind === 'material') {
    const piece = rng.pick(materials);
    return { kind, material: piece.id, stack: stackKey(piece.id, piece.rarity), amount: 1 };
  }
  const [low, high] = rules.goldShare;
  return { kind: 'gold', gold: Math.max(1, Math.round(content.balance.rewards.findGoldPerLevel * level * rng.float(low, high) * late)) };
}

// The orbs a character caught on the day of `now` (the narrator's daily
// quests' day, from midnight Polish time), from its record { day, count }:
// one of an earlier day is none today, and one of a later day leaves none,
// as if all were caught (laterPeriod in quests.js: a request still of the
// day gone catches no more and writes no day back).
/**
 * @param {{ day?: string, count?: number } | null | undefined} stored
 * @param {number} now
 * @param {Content} content
 * @returns {number}
 */
export function orbsCaught(stored, now, content) {
  const today = questPeriod('daily', now, content).key;
  if (laterPeriod(stored?.day, today)) return content.orbs.perDay;
  return stored?.day === today ? (stored.count ?? 0) : 0;
}

// Why the orb of the moment `at` (server time) cannot be caught at `now`,
// or null: caught already (`taken`), not come yet (earlier than
// earlySeconds before it, for the clocks), gone (later than claimSeconds
// after it, for the network), or the day's perDay caught already (`caught`).
/**
 * @param {{ at: number, now: number, taken: boolean, caught: number }} orb
 * @param {Content} content
 * @returns {'claimed' | 'early' | 'gone' | 'limit' | null}
 */
export function orbBlock({ at, now, taken, caught }, content) {
  const rules = content.orbs;
  if (taken) return 'claimed';
  if (now < at - rules.earlySeconds * SECOND) return 'early';
  if (now > at + rules.claimSeconds * SECOND) return 'gone';
  if (caught >= rules.perDay) return 'limit';
  return null;
}
