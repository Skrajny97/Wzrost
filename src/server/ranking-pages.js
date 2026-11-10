// The Ranking's pages (the author, 10.11.2026: „Ranking max 50 postaci +
// przewijanie listy na dalsze pozycje strona po stronie”): the Ranking
// postaci (community.js) and the guilds' one (guild-fame.js) answer one page
// at a time, at most `page` rows (data/community.json, ranking.page) from
// `offset`, with how many there are in all, so the page turns them over with
// "‹ Poprzednie" and "Następne ›" and opens the one that holds the
// character's own place ("Moje miejsce").

import { content } from './content.js';

// The page a request asks for (?offset=…&limit=…): a whole offset from 0,
// and a whole limit from 1 to the page's size, which is also what a request
// without one gets.
export function askedPage(url) {
  const params = new URL(url).searchParams;
  const size = content().community.ranking.page;
  const whole = (name) => {
    const value = Number(params.get(name));
    return params.get(name) !== null && Number.isSafeInteger(value) ? value : null;
  };
  const limit = whole('limit');
  const offset = whole('offset');
  return { offset: offset !== null && offset >= 0 ? offset : 0, limit: limit !== null && limit >= 1 && limit <= size ? limit : size };
}

// The offset of the last page of `total` rows, `limit` a page: a page asked
// for past the end (the list got shorter meanwhile) shows that one instead.
export const lastOffset = (total, limit) => (total > 0 ? Math.floor((total - 1) / limit) * limit : 0);
