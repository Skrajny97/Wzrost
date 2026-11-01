// The Garbarnia in the Osada (the author's 325 A: "Niech sprzedaje i
// skupuje skóry (drożej) na podobieństwo Jagny / To troche ułatwi dodatkowo
// sprawę tym, którym braknie pare materiałów do Zleceń w Osadzie", and then
// "Niech Garbarnia zajmuje się nie tylko skórami ale wszystkimi materiałami
// włącznie z łuskami żmii i podobnymi"): the tanner buys the materials of
// ordinary creatures, at any rarity, for more than the scrapper, and sells
// them, more of them and cheaper with a better relation, as Jagna does
// herbs; each at its species' own rarity. Elites' and champions' trophies
// are not his.

import { knownStack, ordinaryMaterial, parseStack, stackKey } from './crafting.js';
import { buyCeiling } from './market.js';
import { relationDiscount, standingOf } from './settlement.js';

const tuning = (content) => content.settlement.tannery;

// Whether a stack of materials ("viper-scales:rare") is one the tanner
// trades in: an ordinary creature's material, at any rarity.
export function tannerTakes(key, content) {
  return knownStack(key, content) && ordinaryMaterial(parseStack(key).materialId, content);
}

// What the tanner pays over the scrapper's price with the camp's Skup złomu,
// by the standing of the relation with him (as Jagna, 121 A).
export function tanneryPremium(points, content) {
  const { premium } = tuning(content);
  return premium[Math.min(standingOf(points, content).index, premium.length - 1)];
}

// His materials in the order he offers them, as stacks of their species'
// rarity: the commonest first, and within a rarity as the data has them.
function offered(content) {
  const rank = (id) => content.rarities.findIndex((rarity) => rarity.id === content.materialsById[id].rarity);
  return content.materials
    .filter((material) => ordinaryMaterial(material.id, content))
    .map((material, index) => ({ id: material.id, index }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index)
    .map(({ id }) => stackKey(id, content.materialsById[id].rarity));
}

// The materials the tanner sells at `points` of the relation with him: the
// first `stock` share of them (the last standing all), each `margin` above
// the most anyone pays for it, less the standing's discount (287 A), as
// Jagna's herbs. `next` names the standing that adds more, with them.
export function tanneryStock(points, content) {
  const { stock, margin } = tuning(content).sell;
  const standing = standingOf(points, content);
  const all = offered(content);
  const countAt = (index) => Math.ceil(stock[Math.min(index, stock.length - 1)] * all.length);
  const count = countAt(standing.index);
  const more = standing.next ? all.slice(count, countAt(standing.index + 1)) : [];
  const discount = relationDiscount(points, content);
  return {
    goods: all.slice(0, count).map((key) => ({ key, price: Math.ceil(buyCeiling({ kind: 'material', key }, content) * margin * (1 - discount)) })),
    next: more.length > 0 ? { standing: standing.next.name, goods: more } : null,
  };
}
