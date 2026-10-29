// Gift codes (data/gift-codes.json; DECISIONS.md, "Kod podarunkowy"): a code
// typed in the settings gives its rewards to the character, once per account,
// until the code expires. The server says which codes the account has used
// and what time it is.

// A code as typed, the way the codes are written: capitals and digits, no
// spaces or dashes.
export const normalCode = (typed) =>
  String(typed ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// The gift of a typed code, or why there is none: `unknown`, `expired`, or
// `used` when the account (`used`: the ids of its codes) has it already.
export function giftCodeOf(typed, now, used, content) {
  const code = normalCode(typed);
  const gift = code ? content.giftCodes.find((each) => each.code === code) : null;
  if (!gift) return { reason: 'unknown' };
  if (now >= Date.parse(gift.until)) return { reason: 'expired' };
  if (used.includes(gift.id)) return { reason: 'used' };
  return { gift };
}

// The rewards in words: "Punkty Systemu +100, Punkty Czasu +100, złoto
// +1000, drewno +100…".
export function giftRewardsText(rewards, content) {
  const texts = content.giftTexts;
  const parts = [];
  if (rewards.systemPoints) parts.push(`${texts.systemPoints} +${rewards.systemPoints}`);
  if (rewards.timePoints) parts.push(`${texts.timePoints} +${rewards.timePoints}`);
  if (rewards.gold) parts.push(`${texts.gold} +${rewards.gold}`);
  for (const [id, amount] of Object.entries(rewards.resources ?? {})) parts.push(`${content.resourcesById[id].name.toLowerCase()} +${amount}`);
  return parts.join(', ');
}

// The resources after a gift (`resources`: the character's stock by id).
export function withGiftResources(resources, rewards) {
  const next = { ...resources };
  for (const [id, amount] of Object.entries(rewards.resources ?? {})) next[id] = (next[id] ?? 0) + amount;
  return next;
}
