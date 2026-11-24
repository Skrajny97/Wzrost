// @ts-check
// The class levels of a Drużyna (src/server/parties.js): its members' class
// levels differ by at most parties.classSpread (the author: "Rozpiętość
// poziomu klas w Drużynie maks 5 lvl musi być też by nie było za dużego
// carrowania", and "niech nie będzie możliwości w ogole bycia w drużynie z
// kimś o rozpiętości lvli wyzszej niz 5"); since 18.11.2026 10 (the author:
// "Rozszerz możliwość zapraszania do drużyny do 10 poziomów klasy. Niech to
// będzie uzależnione tylko od poziomu klasy"). An invitation and a joining
// keep to it, and one whose level grows out of it leaves the party.
//
// And the shared report of a Drużyna's trip (24.11.2026; the author: „niech
// lider odbiera raport za wszystkich, niech wszyscy mają wspólny”): each
// member's part, what it got (partyPartView), the same list in every
// member's report (src/server/hunts.js, claimTrip).

import { materialView } from './crafting.js';
import { itemView } from './items.js';

/** @typedef {Record<string, any>} Content */
/** @typedef {{ classLevel: number }} Member */
/**
 * @typedef {{ id: number, name: string, result: string, forfeit?: boolean, xp: number, classXp?: number, penalty: number, gold: number, timePoints: number,
 *   levelBefore: number, levelAfter: number, classLevelBefore: number, classLevelAfter: number, items: Record<string, any>[], worn?: number[], sold?: number[],
 *   lost?: number[], materials?: Record<string, number>, resources?: Record<string, number>, potionsUsed?: Record<string, number>, cards?: string[], packs?: number }} PartyPart
 *   One member's part of a trip as its claim computes it, in no language yet:
 *   its result, XP, gold, Time Points and levels, the items found (`worn`:
 *   the indices of those worn at once into an empty slot, `sold`: bought by
 *   the scrapper, `lost`: those the full bag had no place for), the
 *   materials by stack, the camp's resources, the potions drunk, by id, and
 *   Talia Systemu's cards the creatures left (their creatures' ids) and
 *   packs of cards.
 */

// One member's part of a Drużyna's shared report in the words of `content`'s
// language: so each member reads every part in its own language.
/**
 * @param {PartyPart} part
 * @param {Content} content
 */
export function partyPartView(part, content) {
  const worn = new Set(part.worn ?? []);
  const sold = new Set(part.sold ?? []);
  const lost = new Set(part.lost ?? []);
  return {
    id: part.id,
    name: part.name,
    result: part.result,
    ...(part.forfeit && { forfeit: true }),
    xp: part.xp,
    classXp: part.classXp ?? part.xp,
    penalty: part.penalty,
    gold: part.gold,
    timePoints: part.timePoints,
    levelBefore: part.levelBefore,
    levelAfter: part.levelAfter,
    classLevelBefore: part.classLevelBefore,
    classLevelAfter: part.classLevelAfter,
    items: part.items.map((item, index) => ({
      ...itemView(item, content),
      ...(worn.has(index) && { worn: true }),
      ...(sold.has(index) && { sold: true }),
      ...(lost.has(index) && { lost: true }),
    })),
    materials: Object.entries(part.materials ?? {}).map(([key, count]) => materialView(key, count, content)),
    resources: part.resources ?? {},
    potions: Object.entries(part.potionsUsed ?? {})
      .filter(([id, count]) => content.potionsById[id] && count > 0)
      .map(([id, count]) => ({ name: content.potionsById[id].name, count })),
    // A card is its creature's name (cards.js: cardView), a pack its own.
    cards: [
      ...(part.cards ?? []).filter((id) => content.monstersById[id]).map((id) => content.monstersById[id].name),
      ...Array.from({ length: part.packs ?? 0 }, () => content.cards?.texts?.packName).filter(Boolean),
    ],
  };
}

/** @param {Content} content @returns {number} */
const spreadOf = (content) => content.balance.parties.classSpread;

// The class levels a character joining members of `levels` may have: from
// the highest less the spread to the lowest plus it.
/** @param {number[]} levels @param {Content} content */
export function partyRange(levels, content) {
  const spread = spreadOf(content);
  return { from: Math.max(1, Math.max(...levels) - spread), to: Math.min(...levels) + spread };
}

// Who of a party stays when class levels have grown apart: the leader, then
// each member in the party's order whose class level keeps those staying
// within the spread; the others (`apart`) leave. Members are
// { classLevel, ... }.
/**
 * @template {Member} T
 * @param {Member} leader
 * @param {T[]} members
 * @param {Content} content
 * @returns {{ fit: T[], apart: T[] }}
 */
export function partyFit(leader, members, content) {
  const spread = spreadOf(content);
  const fit = [];
  const apart = [];
  let low = leader.classLevel;
  let high = leader.classLevel;
  for (const member of members) {
    if (Math.max(high, member.classLevel) - Math.min(low, member.classLevel) <= spread) {
      fit.push(member);
      low = Math.min(low, member.classLevel);
      high = Math.max(high, member.classLevel);
    } else apart.push(member);
  }
  return { fit, apart };
}
