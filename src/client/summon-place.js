// Where a summon's card stands in a fight's playback (arena.js summonPlace).
// A summon takes the foes' blows meant for its summoner, so it stands ahead
// of it: in the first free field ahead, the nearest first; with every field
// ahead taken, in the one with the fewest cards, the nearest of equals (the
// Pradruid's four stand two by two, not three in one column, 21.11.2026).
// The summoner's own field takes one too, before the summoner, where it has
// fewer cards than every field ahead (the author, 1270, 26.11.2026): the
// Ojciec Puszczy's five summons stand two, two and two beside it, not three
// in its middle column, and the board is a card lower.

/**
 * The field a summon's card goes to: an index into `ahead` (how many cards
 * each field ahead of its summoner holds, the nearest first), or
 * `ahead.length` for the summoner's own field (`own` cards; null when it has
 * none to offer), or -1 when there is no field at all.
 * @param {number[]} ahead
 * @param {number | null} own
 * @returns {number}
 */
export function summonField(ahead, own) {
  const free = ahead.indexOf(0);
  if (free >= 0) return free;
  const counts = own === null ? ahead : [...ahead, own];
  let best = -1;
  counts.forEach((count, index) => {
    if (best < 0 || count < counts[best]) best = index;
  });
  return best;
}
