// The class levels of a Drużyna (src/server/parties.js): its members' class
// levels differ by at most parties.classSpread (the author: "Rozpiętość
// poziomu klas w Drużynie maks 5 lvl musi być też by nie było za dużego
// carrowania"). An invitation and a joining keep to it, and as the members'
// levels grow apart, a party's trip takes only those it fits.

const spreadOf = (content) => content.balance.parties.classSpread;

// The class levels a character joining members of `levels` may have: from
// the highest less the spread to the lowest plus it.
export function partyRange(levels, content) {
  const spread = spreadOf(content);
  return { from: Math.max(1, Math.max(...levels) - spread), to: Math.min(...levels) + spread };
}

// Who goes on a party's trip with its leader: of the members free now, in
// the party's order, each whose class level keeps those going within the
// spread; the others (`gap`) stay in the party, as the busy ones do.
// Members are { classLevel, ... }.
export function partyGoers(leader, free, content) {
  const spread = spreadOf(content);
  const going = [];
  const gap = [];
  let low = leader.classLevel;
  let high = leader.classLevel;
  for (const member of free) {
    if (Math.max(high, member.classLevel) - Math.min(low, member.classLevel) <= spread) {
      going.push(member);
      low = Math.min(low, member.classLevel);
      high = Math.max(high, member.classLevel);
    } else gap.push(member);
  }
  return { going, gap };
}
