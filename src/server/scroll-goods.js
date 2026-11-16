// The scrolls as goods (1061; the author, 16.11.2026: „zrób tak żeby zwoje
// tez można było wystawiać na sprzedaż, wymieniać i wszystko na targowisku
// i wszędzie”): the Kowadło's Zwój ochronny and Zwój utrwalenia
// (data/professions.json, workshop) and the Zwój Niepamięci
// (data/settlement.json, hermit.scroll) go to the Targowisko, the Wymiana,
// the Skrzynia Konta and the Prośby Gildii as herbs or minerals do. Each is
// kept in a number column of the characters row of its own (scrolls,
// steady_scrolls, oblivion_scrolls), not in a JSON column of stacks, so the
// goods' code reads, adds and takes them through these. They take no room
// in the bag, and the Encyklopedia has none of them.

import { content } from './content.js';

// The column each scroll is kept in, by its id.
export const SCROLL_COLUMNS = { 'ward-scroll': 'scrolls', 'steady-scroll': 'steady_scrolls', 'oblivion-scroll': 'oblivion_scrolls' };

// The scrolls the game has, each with its id, name and description in the
// request's language.
export const scrollGoods = () => [content().workshop?.scroll, content().workshop?.steadyScroll, content().settlement?.hermit?.scroll].filter((scroll) => scroll && Object.hasOwn(SCROLL_COLUMNS, scroll.id));

export const scrollById = (id) => (typeof id === 'string' ? (scrollGoods().find((scroll) => scroll.id === id) ?? null) : null);

// The scrolls a row holds, by id, none of those it has none of.
export function scrollsOf(row) {
  return Object.fromEntries(
    scrollGoods()
      .map((scroll) => [scroll.id, row[SCROLL_COLUMNS[scroll.id]] ?? 0])
      .filter(([, count]) => count > 0),
  );
}

// How many of one scroll a row holds.
export const scrollHeld = (row, id) => (Object.hasOwn(SCROLL_COLUMNS, id) ? (row[SCROLL_COLUMNS[id]] ?? 0) : 0);

// The SET part of an UPDATE of the characters row that adds `adds` (by id;
// a count below 0 takes), each column changed by itself, so a change made
// meanwhile elsewhere stays: ", scrolls = scrolls + ?", with its binds.
export function scrollAdds(adds) {
  const entries = Object.entries(adds ?? {}).filter(([id, count]) => count !== 0 && Object.hasOwn(SCROLL_COLUMNS, id));
  return { sql: entries.map(([id]) => `, ${SCROLL_COLUMNS[id]} = ${SCROLL_COLUMNS[id]} + ?`).join(''), binds: entries.map(([, count]) => count) };
}

// The SQL condition that the character `characterId` still holds `counts`
// (by id), with its binds; "1" for none.
export function scrollsEnough(characterId, counts) {
  const entries = Object.entries(counts ?? {}).filter(([id, count]) => count > 0 && Object.hasOwn(SCROLL_COLUMNS, id));
  if (entries.length === 0) return { sql: '1', binds: [] };
  return {
    sql: entries.map(([id]) => `(SELECT ${SCROLL_COLUMNS[id]} FROM characters WHERE id = ?) >= ?`).join(' AND '),
    binds: entries.flatMap(([, count]) => [characterId, count]),
  };
}
