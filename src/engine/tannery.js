// The Garbarnia in the Osada (the author's 325 A: "Niech sprzedaje i
// skupuje skóry (drożej) na podobieństwo Jagny / To troche ułatwi dodatkowo
// sprawę tym, którym braknie pare materiałów do Zleceń w Osadzie"): the
// tanner buys hides for more than the scrapper and sells them, more of them
// and cheaper with a better relation, as Jagna does herbs. The hides are the
// creatures' materials data/settlement.json lists (tannery.hides), at any
// rarity; he sells each at its species' own.

import { knownStack, parseStack, stackKey } from './crafting.js';
import { buyCeiling } from './market.js';
import { relationDiscount, standingOf } from './settlement.js';

const tuning = (content) => content.settlement.tannery;

// Whether a stack of materials ("wolf-pelt:rare") is one the tanner trades
// in: a hide of his list, at any rarity.
export function isHide(key, content) {
  return knownStack(key, content) && tuning(content).hides.includes(parseStack(key).materialId);
}

// What the tanner pays over the scrapper's price with the camp's Skup złomu,
// by the standing of the relation with him (as Jagna, 121 A).
export function tanneryPremium(points, content) {
  const { premium } = tuning(content);
  return premium[Math.min(standingOf(points, content).index, premium.length - 1)];
}

// His hides in the order he offers them, as stacks of their species'
// rarity: the commonest first, and within a rarity as his list has them.
function offered(content) {
  const rank = (id) => content.rarities.findIndex((rarity) => rarity.id === content.materialsById[id].rarity);
  return tuning(content)
    .hides.map((id, index) => ({ id, index }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index)
    .map(({ id }) => stackKey(id, content.materialsById[id].rarity));
}

// The hides the tanner sells at `points` of the relation with him: the
// first `stock` of them, each `margin` above the most anyone pays for it,
// less the standing's discount (287 A), as Jagna's herbs. `next` names the
// standing that adds more, with them.
export function tanneryStock(points, content) {
  const { stock, margin } = tuning(content).sell;
  const standing = standingOf(points, content);
  const countAt = (index) => stock[Math.min(index, stock.length - 1)];
  const hides = offered(content);
  const count = countAt(standing.index);
  const more = standing.next ? hides.slice(count, countAt(standing.index + 1)) : [];
  const discount = relationDiscount(points, content);
  return {
    hides: hides.slice(0, count).map((key) => ({ key, price: Math.ceil(buyCeiling({ kind: 'material', key }, content) * margin * (1 - discount)) })),
    next: more.length > 0 ? { standing: standing.next.name, hides: more } : null,
  };
}
