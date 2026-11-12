// @ts-check
// The daily Upominek between friends (data/community.json): what it gives,
// rolled once when it is sent. `rolls` are two numbers from 0 to 1 from the
// server: the first picks gold or a resource, the second which resource.

/** @typedef {{ base: number, perLevel: number }} Rate An amount: base plus so much per level. */

// The level an Upominek is rolled for: the receiver's, but no higher than
// the sender's own while the sender is below the level of the players'
// Wymiana (community.json trade.minLevel). A new character of another
// account would otherwise send the main character every day an Upominek of
// the main character's level (the author's 834 A, 12.11.2026: „według
// poziomu nadawcy, nie odbiorcy”); to a receiver below the sender it stays
// the receiver's, so a weaker sender never gives more than a stronger one.
/**
 * @param {number} sender The sender's character level.
 * @param {number} receiver The receiver's character level.
 * @param {{ community: { trade: { minLevel: number } } }} content
 * @returns {number}
 */
export const giftLevel = (sender, receiver, content) => (sender < content.community.trade.minLevel ? Math.min(sender, receiver) : receiver);

/**
 * @param {number} level The level it is rolled for (giftLevel).
 * @param {readonly number[]} rolls
 * @param {{ community: { gift: { goldChance: number, timePoints: number, gold: Rate, resources: Rate } }, resources: readonly { id: string }[] }} content
 * @returns {{ timePoints: number, gold: number, resources: Record<string, number> }}
 */
export function giftReward(level, rolls, content) {
  const gift = content.community.gift;
  /** @param {Rate} rate */
  const amount = ({ base, perLevel }) => Math.max(1, Math.round(base + perLevel * level));
  if (rolls[0] < gift.goldChance) return { timePoints: gift.timePoints, gold: amount(gift.gold), resources: {} };
  const ids = content.resources.map((resource) => resource.id);
  const id = ids[Math.min(ids.length - 1, Math.floor(rolls[1] * ids.length))];
  return { timePoints: gift.timePoints, gold: 0, resources: { [id]: amount(gift.resources) } };
}
