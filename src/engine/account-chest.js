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
// materials, minerals). Gold stays with the character.
export const CHEST_GOODS = ['resource', 'potion', 'herb', 'material', 'mineral'];

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
