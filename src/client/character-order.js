// The order of the account's characters on this device (the author,
// 20.11.2026: „W karcie postaci daj możliwość tez przenoszenia jak na czacie
// zakładek tych kółek od zmiany postaci, żeby sobie ustawić jak komu
// wygodnie”), kept as the chat's channels are (chat-order.js): the
// characters' ids, in localStorage. The busts over the Postać tab slide into
// it (screens/character.js), and the choice of a character shows it too
// (screens/select.js). A character not in it, as a new one, comes after
// those that are, in the game's order (the order they were made in); one
// gone from the account drops out, and one deleted on this device leaves
// the order at once. The ids of characters not on the account signed in
// stay, so another account on the same device keeps its own order. A
// private window or cleared site data gives the game's order back.
const KEY = 'insight.characterOrder';

// Characters' ids: whole numbers above 0, each once.
const validIds = (list) => [...new Set(list.filter((id) => Number.isSafeInteger(id) && id > 0))];

// The ids in a text kept. Anything else, a text broken or of another shape,
// is left out.
export function readOrder(text) {
  let order;
  try {
    order = JSON.parse(text ?? '[]');
  } catch {
    return [];
  }
  return Array.isArray(order) ? validIds(order) : [];
}

// The account's characters ({ id }, in the game's order) in `order`: those
// in it first, in its order, then the others in the game's order.
export function inOrder(characters, order) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return characters
    .map((character, index) => ({ character, rank: rank.get(character.id) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ character }) => character);
}

// The order kept after a slide: the account's characters' ids as they now
// stand, then those of `order` not among them (another account's), in
// their order.
export function slidOrder(ids, order) {
  const shown = new Set(ids);
  return [...ids, ...order.filter((id) => !shown.has(id))];
}

// `order` without a character deleted: a character made later that takes
// its id (the game's ids go on from the highest) comes at the end.
export const withoutCharacter = (order, id) => order.filter((one) => one !== id);

export function characterOrder() {
  try {
    return readOrder(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

function setCharacterOrder(ids) {
  try {
    if (ids.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Not kept: the game's order stays.
  }
}

// The account's characters in the order kept on this device.
export const orderedCharacters = (characters) => inOrder(characters, characterOrder());

// The order a slide left (the ids of the account's characters as they now
// stand, numbers or their texts from the page), kept on this device.
export function keepCharacterOrder(ids) {
  setCharacterOrder(slidOrder(validIds(ids.map(Number)), characterOrder()));
}

// A character deleted on this device leaves the order kept.
export function forgetCharacter(id) {
  const order = characterOrder();
  if (order.includes(id)) setCharacterOrder(withoutCharacter(order, id));
}
