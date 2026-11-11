// @ts-check
// The daily Upominek between friends (data/community.json): what it gives,
// rolled once when it is sent. `rolls` are two numbers from 0 to 1 from the
// server: the first picks gold or a resource, the second which resource.

/** @typedef {{ base: number, perLevel: number }} Rate An amount: base plus so much per level. */

/**
 * @param {number} level The sender's character level.
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
