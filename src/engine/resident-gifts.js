// Gifts for the Osada's residents and presents from friends (the author's
// 818.1 and 818.2, 11.11.2026; data/settlement.json `gifts`). Once a
// narrator's day the character may give each resident one piece of what
// they like (`kind`: herbs to Jagna and Sambor, ores to Żelisław, gems to
// Wiedana, the ordinary creatures' materials the Garbarnia trades in to
// Wszebor, potions to Zbylut) or, to the others, gold: goldPerLevel for
// each level of the character. A gift raises the relation by
// relation[step]: the first for gold and the commonest pieces, more for a
// rarer piece (giftStep). A resident at the standing `from` (Przyjaciel)
// leaves a small present once a narrator's week (`weekly`): goods of their
// trade the character already knows, drawn from the seed and the week so it
// is the same all week, or gold, or Punkty Czasu.
//
// Kept in the Osada as `gifts`: { given: { [resident]: day }, taken:
// { [resident]: week } }, the narrator's day of the last gift to each
// resident and the narrator's week of the last present taken from each.

import { knownPotions, potionPrice } from './brewing.js';
import { materialPrice, ordinaryMaterial, parseStack, stackKey } from './crafting.js';
import { knownHerbs } from './professions.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { orderGoods, standingOf } from './settlement.js';
import { tannerTakes } from './tannery.js';

const rules = (content) => content.settlement.gifts;

// The column of the characters row each kind of gift is taken from.
export const GIFT_COLUMNS = { herb: 'herbs', potion: 'potions', ore: 'minerals', gem: 'minerals', material: 'materials' };

// A resident's entry in the data ({ resident, kind, weekly }), or null.
export const residentGift = (residentId, content) => rules(content)?.residents.find((entry) => entry.resident === residentId) ?? null;

// Whether a stack's `key` is a piece of `kind`: a herb, a potion, a mineral
// of that kind (an ore or a gem), or a material the tanner takes (an
// ordinary creature's, at any rarity; no elite's or champion's trophy).
export function giftLiked(kind, key, content) {
  if (typeof key !== 'string') return false;
  if (kind === 'herb') return Object.hasOwn(content.herbsById, key);
  if (kind === 'potion') return Object.hasOwn(content.potionsById, key);
  if (kind === 'ore' || kind === 'gem') return Object.hasOwn(content.mineralsById, key) && content.mineralsById[key].kind === kind;
  if (kind === 'material') return tannerTakes(key, content);
  return false;
}

// What the scrapper pays for a piece, before the camp's Skup bonus.
function piecePrice(kind, key, content) {
  if (kind === 'herb') return content.herbsById[key].price;
  if (kind === 'potion') return potionPrice(content.potionsById[key], content);
  if (kind === 'ore' || kind === 'gem') return content.mineralsById[key].price;
  return materialPrice(parseStack(key).rarityId, content);
}

// The scrapper's price of the cheapest piece of a kind.
function cheapest(kind, content) {
  if (kind === 'herb') return Math.min(...content.herbs.map((herb) => herb.price));
  if (kind === 'potion') return Math.min(...content.potions.map((potion) => potionPrice(potion, content)));
  if (kind === 'ore' || kind === 'gem') return Math.min(...content.minerals.filter((mineral) => mineral.kind === kind).map((mineral) => mineral.price));
  return materialPrice(content.rarities[0].id, content);
}

// How much rarer a piece is than the commonest of its kind: a step for each
// doubling of the scrapper's price over the cheapest piece's. A gem's or a
// material's step is its rarity's, as their price doubles with the rarity.
export function giftStep(kind, key, content) {
  const base = cheapest(kind, content);
  const price = piecePrice(kind, key, content);
  let step = 0;
  while (price >= base * 2 ** (step + 1)) step += 1;
  return step;
}

// The relation a gift gives: relation[step] of the piece, the last number
// for anything rarer; gold gives the first.
export function giftRelation(kind, key, content) {
  const { relation } = rules(content);
  const step = kind === 'gold' ? 0 : giftStep(kind, key, content);
  return relation[Math.min(step, relation.length - 1)];
}

// The gold of a gift at the character's level.
export const goldGift = (level, content) => Math.round(rules(content).goldPerLevel * level);

// The pieces of `kind` among the character's goods (`held`: its herbs,
// potions, minerals and materials, each { key: count }), each with its step
// and the relation it gives, the commonest first.
export function giftGoods(kind, held, content) {
  const column = GIFT_COLUMNS[kind];
  if (!column) return [];
  return Object.entries(held[column] ?? {})
    .filter(([key, count]) => count > 0 && giftLiked(kind, key, content))
    .map(([key, count]) => ({ key, count, step: giftStep(kind, key, content), relation: giftRelation(kind, key, content) }))
    .sort((a, b) => a.step - b.step);
}

// Whether the character gave the resident a gift on the narrator's day of
// `now` (`gifts` as the Osada keeps them).
export const givenToday = (gifts, residentId, now, content) => gifts?.given?.[residentId] === questPeriod('daily', now, content).key;

// The gifts as kept after one to the resident on the day of `now`.
export const withGiven = (gifts, residentId, now, content) => ({ ...gifts, given: { ...gifts?.given, [residentId]: questPeriod('daily', now, content).key } });

// The gifts as kept after the present of `week` taken from the resident.
export const withTaken = (gifts, residentId, week) => ({ ...gifts, taken: { ...gifts?.taken, [residentId]: week } });

// The goods a friend's present of `kind` is drawn from, as keys: as a
// companion's gift of the week, the herbs the character's Zielarstwo knows
// and the potions its Alchemia knows (before the profession opens, those
// of its first level), and the materials of the ordinary creatures it has
// met, at their species' rarity.
function presentGoods(kind, character, content) {
  if (kind === 'material') {
    const keys = new Set();
    for (const monsterId of character.met ?? []) {
      const material = content.materialsByMonster[monsterId];
      if (material && ordinaryMaterial(material.id, content)) keys.add(stackKey(material.id, material.rarity));
    }
    return [...keys];
  }
  const known = orderGoods(character, content)
    .filter((good) => good.kind === kind)
    .map((good) => good.key);
  if (known.length > 0) return known;
  if (kind === 'herb') return knownHerbs(1, content).map((herb) => herb.id);
  if (kind === 'potion') return knownPotions(1, content).map((potion) => potion.id);
  return [];
}

// The present a resident at the standing `from` or above (`points` of the
// relation with them) leaves this narrator's week: { week, kind, key,
// count } of goods (key for herbs, potions and materials), of gold or of
// Punkty Czasu; null below that standing, once taken this week, or with
// nothing to give. Drawn from the seed, the resident and the week, so it is
// the same all week.
export function friendPresent(residentId, { character, points, gifts, seed }, now, content) {
  const weekly = residentGift(residentId, content)?.weekly;
  if (!weekly) return null;
  const from = content.settlement.standings.findIndex((standing) => standing.id === rules(content).from);
  if (standingOf(points, content).index < from) return null;
  const week = questPeriod('weekly', now, content).key;
  if (gifts?.taken?.[residentId] === week) return null;
  if (weekly.kind === 'gold') return { week, kind: 'gold', count: Math.round(weekly.perLevel * character.level) };
  if (weekly.kind === 'time-points') return { week, kind: 'time-points', count: weekly.count };
  const goods = presentGoods(weekly.kind, character, content);
  if (goods.length === 0) return null;
  const rng = createRng(`${seed}:present:${residentId}:${week}`);
  const key = rng.pick(goods);
  const count = rng.int(weekly.min, weekly.max) + Math.floor((weekly.perTenLevels ?? 0) * Math.floor(character.level / 10));
  return { week, kind: weekly.kind, key, count };
}
