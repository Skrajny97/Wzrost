// @ts-check
// Gift codes (data/gift-codes.json; DECISIONS.md, "Kod podarunkowy"): a code
// typed in the settings gives its rewards to the character, once per account,
// until the code expires. The server says which codes the account has used
// and what time it is.

import { nameInText } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ systemPoints?: number, timePoints?: number, gold?: number, resources?: Record<string, number> }} Rewards */
/** @typedef {{ id: string, code: string, from?: string, until: string, for?: string, rewards: Rewards }} GiftCode A code of data/gift-codes.json. */
/** @typedef {{ id: number, userId: number, key: string }} CodeCharacter */

// A code as typed, the way the codes are written: capitals and digits, no
// spaces or dashes.
/** @param {unknown} typed */
export const normalCode = (typed) =>
  String(typed ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// The gift of a typed code, or why there is none: `unknown`, `expired`, or
// `used` when the account (`used`: the ids of its codes) has it already. A
// code given to one character (`for`: the key of its name, which the server
// works out, characterKey in src/server/gift-codes.js) is unknown to every
// other one; the same code can be given that way to several characters, one
// entry each (the author: "na stałe może być ten kod, ale dostępny tylko dla
// danej konkretnej postaci i tylko na moje polecenie"). A code with `from`
// is unknown before that moment, like the 11 November code "1111".
/**
 * @param {unknown} typed
 * @param {number} now
 * @param {string[]} used
 * @param {Content} content
 * @param {string | null} [characterKey]
 * @returns {{ gift: GiftCode, reason?: undefined } | { reason: 'unknown' | 'expired' | 'used', gift?: undefined }}
 */
export function giftCodeOf(typed, now, used, content, characterKey = null) {
  const code = normalCode(typed);
  /** @param {GiftCode} each */
  const known = (each) => each.code === code && (!each.for || each.for === characterKey) && (!each.from || now >= Date.parse(each.from));
  /** @type {GiftCode[]} */
  const gifts = code ? content.giftCodes.filter(known) : [];
  if (gifts.length === 0) return { reason: 'unknown' };
  const open = gifts.filter((each) => now < Date.parse(each.until));
  if (open.length === 0) return { reason: 'expired' };
  const gift = open.find((each) => !used.includes(each.id));
  if (!gift) return { reason: 'used' };
  return { gift };
}

// The rewards in words: "Punkty Systemu +100, Punkty Czasu +100, złoto
// +1000, drewno +100…" (in English the resources with their capitals,
// "Wood +100": nameInText).
/**
 * @param {Rewards} rewards
 * @param {Content} content
 */
export function giftRewardsText(rewards, content) {
  const texts = content.giftTexts;
  /** @type {string[]} */
  const parts = [];
  if (rewards.systemPoints) parts.push(`${texts.systemPoints} +${rewards.systemPoints}`);
  if (rewards.timePoints) parts.push(`${texts.timePoints} +${rewards.timePoints}`);
  if (rewards.gold) parts.push(`${texts.gold} +${rewards.gold}`);
  for (const [id, amount] of Object.entries(rewards.resources ?? {})) parts.push(`${nameInText(content.resourcesById[id].name, content)} +${amount}`);
  return parts.join(', ');
}

// The resources after a gift (`resources`: the character's stock by id).
/**
 * @param {Record<string, number>} resources
 * @param {Rewards} rewards
 * @returns {Record<string, number>}
 */
export function withGiftResources(resources, rewards) {
  const next = { ...resources };
  for (const [id, amount] of Object.entries(rewards.resources ?? {})) next[id] = (next[id] ?? 0) + amount;
  return next;
}

// The two characters of a code's rewards moved by the author's word
// (content.giftMoves): `characters` are { id, userId, key } with the key of
// each name worked out by the server (looseKey in src/server/gift-codes.js),
// `used` the { userId, characterId, giftId } of the codes taken. The giving
// character must be the one that took the code, and the receiving one on the
// same account; anything else, or more than one such pair, moves nothing.
/**
 * @param {{ from: string, to: string, gift: string }} move
 * @param {CodeCharacter[]} characters
 * @param {{ userId: number, characterId: number, giftId: string }[]} used
 */
export function giftMovePair(move, characters, used) {
  /** @type {{ from: CodeCharacter, to: CodeCharacter }[]} */
  const pairs = [];
  for (const from of characters.filter((one) => one.key === move.from)) {
    const took = used.some((one) => one.userId === from.userId && one.characterId === from.id && one.giftId === move.gift);
    if (!took) continue;
    for (const to of characters.filter((one) => one.key === move.to && one.userId === from.userId && one.id !== from.id)) pairs.push({ from, to });
  }
  if (pairs.length === 1) return pairs[0];
  return { reason: pairs.length === 0 ? 'missing' : 'ambiguous' };
}
