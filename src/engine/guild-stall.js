// @ts-check
// Znaki Gildii i Kram (1202 A; data/guilds.json `stall`;
// src/server/guild-stall.js; DECISIONS.md, "Znaki Gildii i Kram"): each
// point of Sława a member brings its guild gives it a Znak Gildii, its own
// for good; in the Kram Gildii, for members only, it buys with them what it
// needs, each good with its limit a week (or once, for good): a pack of
// cards, a Zwój ochronny, an item of its class for the slot it chooses (as
// from a champion's chest), the title "Strażnik Sztandaru" and the frame of
// the portrait with the guild's banner. Pure: the Znaki, the purchases and
// the seed are the server's.

import { championItemRarity } from './hunt.js';
import { baseClassLevel, baseFamily, canUse, generateItem } from './items.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, price: number, weekly?: number, achievement?: string, cosmetic?: string }} StallGood A good of data/guilds.json `stall.goods`. */

/**
 * The goods of the Kram, in their order.
 * @param {Content} content
 * @returns {StallGood[]}
 */
export const stallGoods = (content) => content.guilds.stall.goods;

/**
 * @param {unknown} id
 * @param {Content} content
 * @returns {StallGood | null}
 */
export const stallGood = (id, content) => (typeof id === 'string' ? (stallGoods(content).find((good) => good.id === id) ?? null) : null);

/**
 * The slots an item of the Kram may be for: every slot but those still
 * locked (the Rdzeń), each with something of the class's gear (`key`).
 * @param {string} key
 * @param {Content} content
 * @returns {string[]}
 */
export function stallSlots(key, content) {
  return content.slots
    .filter((/** @type {{ id: string, locked?: boolean }} */ slot) => !slot.locked)
    .map((/** @type {{ id: string }} */ slot) => slot.id)
    .filter((/** @type {string} */ slot) => slotFamilies(slot, key, content).length > 0);
}

// The families of a slot the class's gear (`key`) wears: their first bases.
/**
 * @param {string} slot
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
function slotFamilies(slot, key, content) {
  return content.bases.filter((/** @type {Record<string, any>} */ base) => baseFamily(base) === base.id && base.slot === slot && canUse(base.id, key, content));
}

/**
 * The Znaki a character may spend: those of the weeks credited and of the
 * weeks counted live, less those spent, never below none.
 * @param {{ earned: number, live: number, spent: number }} marks
 * @returns {number}
 */
export const marksLeft = ({ earned, live, spent }) => Math.max(0, Math.floor(earned + live - spent));

/**
 * Why a character cannot buy the good `id` now, as a code, or null when it
 * can: `unknown_good`, `limit` (the week's limit bought, or a good of once
 * bought already), `owned` (the title or the frame it has),
 * `too_few_marks` and, for an item, `invalid_slot` (`slot` not one it may
 * choose). `bought`: how many of it the character bought this week (of a
 * good of once, ever).
 * @param {{ id: unknown, slot?: unknown, marks: number, bought: number, owned: boolean, key: string }} buy
 * @param {Content} content
 * @returns {string | null}
 */
export function stallBlock({ id, slot, marks, bought, owned, key }, content) {
  const good = stallGood(id, content);
  if (!good) return 'unknown_good';
  if (owned) return 'owned';
  if (bought >= (good.weekly ?? 1)) return 'limit';
  if (good.id === 'item' && !(typeof slot === 'string' && stallSlots(key, content).includes(slot))) return 'invalid_slot';
  if (marks < good.price) return 'too_few_marks';
  return null;
}

/**
 * The Kram's item: of the class's gear (`key`) for the slot chosen, one the
 * character may wear (its class level), at its level, of a champion's
 * rarity, as the champion's chest gives it. The same seed, the same item.
 * Null for a slot of nothing of the gear.
 * @param {{ level: number, key: string, classLevel: number, slot: string, seed: unknown }} wish
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export function stallItem({ level, key, classLevel, slot, seed }, content) {
  const families = slotFamilies(slot, key, content);
  if (families.length === 0) return null;
  const rng = createRng(`guild-stall:${seed}`);
  const family = families.length === 1 ? families[0].id : rng.pick(families).id;
  const bases = content.bases.filter((/** @type {Record<string, any>} */ base) => baseFamily(base) === family && baseClassLevel(base.id, content) <= Math.max(1, classLevel));
  const base = bases.length === 1 ? bases[0] : rng.pick(bases);
  return generateItem({ baseId: base.id, level, rarityId: championItemRarity(level, rng, content) }, rng, content);
}
