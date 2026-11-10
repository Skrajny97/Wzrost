// Favourite items (the author, 10.11.2026: "Do tego opcja dodawania do
// ulubionych, by przypadkiem nie rozebrać czegoś na później."): a star in
// the item card, bag and worn items alike. A favourite is not taken apart on
// the Stół rozbiórki (alone or with "Rozbierz kilka") nor sold to the
// scrapper: by hand, by the handful, or when the bag overflows after an
// exploration or a Wieża, which then takes the weakest of the others. It
// stays the owner's mark: a list of the ids of its items on the character
// (characters.favorites), so an item that leaves the character (the
// Targowisko, the Skrzynia Konta, a Wymiana) is no longer anyone's
// favourite, and the id of an item gone is ignored. The server holds to it,
// not only the page.

import { assertion, atomically, sameVersion } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// The ids the character marked, as stored; one of an item it no longer has
// is ignored, as each check asks about one of its own items.
export function favoriteIds(row) {
  try {
    const list = JSON.parse(row.favorites ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => Number.isSafeInteger(id)) : []);
  } catch {
    return new Set();
  }
}

// What the page says when a favourite is refused, by what was asked.
const REFUSALS = {
  salvage: 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go rozebrać.',
  sell: 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go sprzedać.',
  discard: 'Ulubiony przedmiot: zdejmij gwiazdkę, żeby go wyrzucić.',
};

export const favoriteRefusal = (action) => new ApiError(409, 'favorite', REFUSALS[action]);

// Refuses `action` (salvage, sell, discard) on any of `items` the
// character marked.
export function requireUnmarked(player, action, ...items) {
  const marked = favoriteIds(player.row);
  if (items.some((item) => item && marked.has(item.id))) throw favoriteRefusal(action);
}

// The head of a batch that fails it while one of `ids` is among the
// favourites of character `characterId` as written then: the star and a
// sale tapped at the same moment (atomic.js).
export const unmarked = (db, characterId, ids) =>
  assertion(
    db,
    'NOT EXISTS (SELECT 1 FROM characters, json_each(characters.favorites) AS marked WHERE characters.id = ? AND marked.value IN (SELECT value FROM json_each(?)))',
    [characterId, JSON.stringify(ids)],
  );

// The characters row's favourites without the items of `?` (a JSON list of
// ids), for a statement that moves those items off the character in the
// same batch: a favourite no longer once it leaves, also where it keeps its
// id (a Wymiana) or a new item could get the same id back.
export const withoutFavorites = "(SELECT COALESCE(json_group_array(value), '[]') FROM json_each(characters.favorites) WHERE value NOT IN (SELECT value FROM json_each(?)))";

// POST /api/items/:id/favorite { favorite: true | false }: the star of one
// of the character's items, in the bag or worn, at any time. The ids of
// items gone drop out of the list as it is written.
export async function markFavorite(context) {
  const { session, player } = await requirePlayer(context);
  const item = player.items.find((candidate) => String(candidate.id) === context.params.id);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  const body = await readJson(context.request);
  if (typeof body.favorite !== 'boolean') throw new ApiError(400, 'invalid_favorite', 'Nieprawidłowy format danych.');
  const owned = new Set(player.items.map((one) => one.id));
  const kept = [...favoriteIds(player.row)].filter((id) => owned.has(id) && id !== item.id);
  const list = body.favorite ? [...kept, item.id] : kept;
  const db = context.env.DB;
  await atomically(db, [
    sameVersion(db, player.row),
    db.prepare('UPDATE characters SET favorites = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(list), player.row.id),
  ]);
  return json({ favorite: body.favorite, character: characterView(await loadPlayer(db, session.userId), context.now) });
}
