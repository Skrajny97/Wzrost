// The daily Upominek between friends (data/community.json): what it gives,
// rolled once when it is sent. `rolls` are two numbers from 0 to 1 from the
// server: the first picks gold or a resource, the second which resource.

export function giftReward(level, rolls, content) {
  const gift = content.community.gift;
  const amount = ({ base, perLevel }) => Math.max(1, Math.round(base + perLevel * level));
  if (rolls[0] < gift.goldChance) return { timePoints: gift.timePoints, gold: amount(gift.gold), resources: {} };
  const ids = content.resources.map((resource) => resource.id);
  const id = ids[Math.min(ids.length - 1, Math.floor(rolls[1] * ids.length))];
  return { timePoints: gift.timePoints, gold: 0, resources: { [id]: amount(gift.resources) } };
}
