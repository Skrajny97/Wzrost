// The Ranking's pages (the author, 10.11.2026: „Ranking max 50 postaci +
// przewijanie listy na dalsze pozycje strona po stronie”), from a page the
// server answered (src/server/ranking-pages.js: `offset`, `limit` and
// `total`) and the own place among all, or none: the places it shows
// (`from`–`to`, none on an empty list), the offsets of the page before and
// after it (null at either end), and that of the page that holds the own
// place, for "Moje miejsce" (null without one).
export function rankingPage({ offset, limit, total, place = null }) {
  return {
    from: total > 0 ? offset + 1 : 0,
    to: Math.min(total, offset + limit),
    previous: offset > 0 ? Math.max(0, offset - limit) : null,
    next: offset + limit < total ? offset + limit : null,
    mine: place ? Math.floor((place - 1) / limit) * limit : null,
  };
}
