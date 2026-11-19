// @ts-check
// The goods of the Skrzynia Konta (src/server/chest.js; mock-ups 843, the
// author, 12.11.2026: „Skrzynia Konta powinna pozwalać przekładać też
// mikstury, rośliny, wszystko, nawet zasoby, ale miec kłódkę i być
// zablokowana do 20 poziomu postaci”): potions, herbs, materials, minerals
// and the camp's resources, any number of them, kept by the character that
// put them in. Which pieces go where, as the Encyklopedia counts them: a
// character's own pieces come back to it as its own, and those it had got
// from others (`traded`, as foreign_stacks counts them) as got from others;
// every piece of another character's is got from others.

/** @typedef {{ id: number, characterId: number, count: number, traded: number }} ChestRow The pieces of one good one character put in (characterId 0: of a character no longer there), `traded` of them got from others. */
/** @typedef {{ row: ChestRow, count: number, traded: number, gone: boolean }} ChestTake The pieces a take moves out of one row: `count` of them, `traded` of those got from others, and whether the row is left empty. */

// The kinds of goods, in the order the chest shows them (as the screen
// shows the character's own: the camp's resources, potions, herbs,
// materials, the Stół rozbiórki's parts, minerals, the scrolls, the
// Spiżarnia's fish, crops and dishes, and Talia Systemu's cards). Gold
// stays with the character. The parts since 0.3.90 (a player, poz. 48,
// through the author, 16.11.2026: „będzie możliwość wkładnia do skrzyni
// konta części potrzebnych do wytwarzania ekwipunku?”; the author: „Raczej
// tak”). The cards (CARD_GOODS) since the mock-ups of 19.11.2026.
export const CHEST_GOODS = ['resource', 'potion', 'herb', 'material', 'part', 'mineral', 'scroll', 'pantry', 'card', 'effect-card'];

// Talia Systemu's cards as goods (a player, poz. 33, in the game's chat:
// „możliwość wymiany kartami talii między postaciami. Wypadła mi fajna ale
// nie na głównej tylko pobocznym alcie i trochę smutek.”; the author,
// 19.11.2026: „mądre pomysły”, and: „przenoszenie kart Talii to powinno być
// w Skrzyni Konta, powinno się móc nimi też handlować i wymieniać miedzy
// graczami”): a creature's card (`card`, its id the creature's) and an
// effect card (`effect-card`, the effect card's id), moved by their copies
// through the Skrzynia Konta, the Targowisko and the Wymiana. A character's
// copies are its card's level (cardLevel in cards.js, up to the top level;
// copies past it stay with it, to be moved on).
export const CARD_GOODS = ['card', 'effect-card'];

// A character's copies of a card after a move (cardAfter): `held` as its
// row keeps them ({ copies, traded }: `traded` of them came from others,
// which the Encyklopedia leaves out; 0 copies when it has none), `given`
// copies leave it, those from others first, and `got` arrive, `foreign` of
// them from others. Copies 0: the card leaves its collection. Unlike goods
// (tradedLeaving), whose find the Encyklopedia keeps once made, a card
// counts there only while the character holds a copy of its own, so the
// copies from others go first: a character that found the card keeps it in
// its Encyklopedia as long as any of its own is held. No copy from others
// becomes its own by this: they leave marked so (`foreign` of the move).
/**
 * @param {{ copies: number, traded: number }} held
 * @param {number} given
 * @param {number} [got]
 * @param {number} [foreign]
 * @returns {{ copies: number, traded: number }}
 */
export function cardAfter(held, given, got = 0, foreign = got) {
  const copies = held.copies - given + got;
  const traded = held.traded - Math.min(held.traded, given) + foreign;
  return { copies, traded: Math.max(0, Math.min(traded, copies)) };
}

// Of `count` pieces leaving a stack of `held`, `traded` of which were got
// from others, how many are such: the own pieces go first, as when an order
// of the Stół rozbiórki takes a stack (crafting.js), so what came from
// others stays left out of the Encyklopedia as long as any of it is held.
/**
 * @param {number} traded
 * @param {number} held
 * @param {number} count
 * @returns {number}
 */
export const tradedLeaving = (traded, held, count) => Math.max(0, Math.min(traded, held) - (held - count));

// `count` pieces of one good taken out of the chest by the character
// `characterId`, from its `rows` (the oldest first): the character's own
// pieces first, then the others' in their order. `foreign`: the pieces it
// gets as got from others, all of the others' and its own that it had got
// from others itself. Null when the chest holds fewer.
/**
 * @param {ChestRow[]} rows
 * @param {number} characterId
 * @param {number} count
 * @returns {{ takes: ChestTake[], foreign: number } | null}
 */
export function chestTakes(rows, characterId, count) {
  const held = rows.reduce((sum, row) => sum + row.count, 0);
  if (!Number.isSafeInteger(count) || count < 1 || count > held) return null;
  const order = [...rows.filter((row) => row.characterId === characterId), ...rows.filter((row) => row.characterId !== characterId)];
  /** @type {ChestTake[]} */
  const takes = [];
  let left = count;
  let foreign = 0;
  for (const row of order) {
    if (left === 0) break;
    const taken = Math.min(row.count, left);
    if (taken <= 0) continue;
    const traded = tradedLeaving(row.traded, row.count, taken);
    takes.push({ row, count: taken, traded, gone: taken === row.count });
    foreign += row.characterId === characterId ? traded : taken;
    left -= taken;
  }
  return { takes, foreign };
}
