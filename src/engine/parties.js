// @ts-check
// The class levels of a Drużyna (src/server/parties.js): its members' class
// levels differ by at most parties.classSpread (the author: "Rozpiętość
// poziomu klas w Drużynie maks 5 lvl musi być też by nie było za dużego
// carrowania", and "niech nie będzie możliwości w ogole bycia w drużynie z
// kimś o rozpiętości lvli wyzszej niz 5"). An invitation and a joining keep
// to it, and one whose level grows out of it leaves the party.

/** @typedef {Record<string, any>} Content */
/** @typedef {{ classLevel: number }} Member */

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
