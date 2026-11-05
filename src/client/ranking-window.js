// The rows the Ranking shows (the author: 318 A): the first TOP places, then
// the character's own with AROUND above and below it, or all of them under
// "Pokaż całą listę". A gap (null, "…") stands only where places are left
// out, and never for one place alone, which shows instead (players on the
// chat: „W Rankingu między miejscem 10, a 11 pojawiło się pole z "..." na
// środku”). `mine` is the index of the character's own row, -1 for none.
export const TOP = 10;
export const AROUND = 2;

export function rankingWindow(rows, mine, whole = false) {
  if (whole || rows.length <= TOP + AROUND * 2 + 1) return rows;
  if (mine - AROUND <= TOP + 1) return rows.slice(0, Math.max(TOP, mine + AROUND + 1));
  return [...rows.slice(0, TOP), null, ...rows.slice(mine - AROUND, mine + AROUND + 1)];
}
