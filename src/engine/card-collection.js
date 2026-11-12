// @ts-check
// Talia Systemu's collection (data/cards.json; DECISIONS.md, "Talia Systemu:
// gra karciana w Salonie Gier", points 26 and 27): the Encyklopedia's
// "Karty", every card by its land, and the collection's bonus. Pure: the
// server reads the collection (the copies won of each card) and gives it.
//
// A land's cards are those whose first home is in it (cardHomes), so every
// card is in one land; no creature lives in two lands. Their order is the
// Bestiariusz's: the ordinary creatures in the order of their places, then
// the elites and the champion.
//
// The collection's bonus (`bonuses.collection`, 884 A): for every `every`
// different cards a share more of the XP and gold of the explorations, up
// to `max` (cardExplorationBonus, simulateHunt's `cards`); off at 0.

import { cardHomes, cardKind, cardRules, cardView, isCard } from './cards.js';
import { areaDangers } from './hunt.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ regionId: string, name: string, minLevel: number, maxLevel: number, cards: string[] }} CardLand A land's cards, in the Bestiariusz's order. */

const KIND_ORDER = { ordinary: 0, elite: 1, champion: 2 };

/** @type {WeakMap<Content, CardLand[]>} */
const landsBuilt = new WeakMap();

// Each land's cards, in the game's order of the lands.
/**
 * @param {Content} content
 * @returns {CardLand[]}
 */
export function cardLands(content) {
  const built = landsBuilt.get(content);
  if (built) return built;
  const homes = [...cardHomes(content)];
  /** @type {CardLand[]} */
  const lands = content.regions
    .map((/** @type {Record<string, any>} */ region) => ({
      regionId: region.id,
      name: region.name,
      minLevel: region.minLevel,
      maxLevel: region.maxLevel,
      cards: homes
        .filter(([, home]) => home.regionId === region.id)
        .map(([id], index) => ({ id, index, kind: KIND_ORDER[cardKind(id, content)] }))
        .sort((a, b) => a.kind - b.kind || a.index - b.index)
        .map((one) => one.id),
    }))
    .filter((/** @type {CardLand} */ land) => land.cards.length > 0);
  landsBuilt.set(content, lands);
  return lands;
}

/** @type {WeakMap<Content, Map<string, string[]>>} */
const placesBuilt = new WeakMap();

// The places each card's creature lives in, by name, in the game's order.
/**
 * @param {Content} content
 * @returns {Map<string, string[]>}
 */
function cardPlaces(content) {
  const built = placesBuilt.get(content);
  if (built) return built;
  /** @type {Map<string, string[]>} */
  const places = new Map();
  for (const region of content.regions) {
    for (const area of region.areas) {
      for (const danger of areaDangers(area, content)) {
        const names = places.get(danger.monsterId) ?? [];
        if (!names.includes(area.name)) names.push(area.name);
        places.set(danger.monsterId, names);
      }
    }
  }
  placesBuilt.set(content, places);
  return places;
}

/**
 * @param {Content} content
 * @returns {{ every: number, xp: number, gold: number, max: number }}
 */
function collectionRule(content) {
  const rule = cardRules(content)?.bonuses?.collection ?? {};
  return { every: rule.every ?? 0, xp: Math.max(0, rule.xp ?? 0), gold: Math.max(0, rule.gold ?? 0), max: rule.max ?? Infinity };
}

// The explorations' bonus of a collection of `count` different cards: a
// share more of their XP and of their gold for every `every` cards, each up
// to `max`; none while the data has it off (0).
/**
 * @param {number} count
 * @param {Content} content
 * @returns {{ xp: number, gold: number }}
 */
export function cardExplorationBonus(count, content) {
  const { every, xp, gold, max } = collectionRule(content);
  if (!(every > 0)) return { xp: 0, gold: 0 };
  const steps = Math.floor(Math.max(0, count) / every);
  return { xp: Math.min(max, steps * xp), gold: Math.min(max, steps * gold) };
}

// A share as a percent for a text: 0.05 → 5, 0.015 → 1.5.
/** @param {number} share */
const percentOf = (share) => Math.round(share * 1000) / 10;

// The Encyklopedia's "Karty": the collection's count and its bonus's lines
// (while the data has it on: the rule, what it gives now and the next
// threshold with the cards missing for it), then each land's cards with its
// count. A card of the collection comes as on the Salon's table, at its
// level, with its copies and the sheet's lines: its type and what it beats,
// its level, its copies, where it lives and its chance on an exploration; a
// card not found yet only by its creature, for its shadow.
/**
 * @param {Map<string, number>} collection the copies won of each card
 * @param {Content} content
 */
export function cardCollectionView(collection, content) {
  const rules = cardRules(content);
  const texts = rules.texts.collection;
  /** @param {string} key @param {Record<string, unknown>} [vars] */
  const line = (key, vars = {}) => say(texts, key, 0, vars);
  const { maxLevel } = rules.stats;
  const all = cardHomes(content).size;
  const found = [...collection.keys()].filter((id) => isCard(id, content)).length;
  const places = cardPlaces(content);
  const regions = new Map(content.regions.map((/** @type {Record<string, any>} */ region) => [region.id, region]));

  /** @param {string} id @param {number} copies */
  const ownCard = (id, copies) => {
    const card = cardView(id, copies, content);
    const type = rules.types.find((/** @type {Record<string, any>} */ one) => one.id === card.type);
    const beats = rules.types.find((/** @type {Record<string, any>} */ one) => one.id === type?.target);
    const home = cardHomes(content).get(id);
    const top = card.level >= maxLevel;
    return {
      ...card,
      found: true,
      copies,
      meta: line('meta', { rarity: card.rarityName, kind: texts.kinds[card.kind] ?? '' }),
      details: [
        line('type', { type: card.typeName, beats: beats?.name ?? '', percent: percentOf(rules.typeBonus) }),
        line('level', { level: card.level, max: maxLevel, attack: card.attack, life: card.life }),
        top ? line('copiesTop', { copies }) : line('copies', { copies, next: card.level + 1 }),
        line('places', { land: regions.get(home?.regionId)?.name ?? '', places: (places.get(id) ?? []).join(', ') }),
        !top && line('chance', { percent: percentOf(rules.drops[card.kind] ?? 0) }),
      ].filter(Boolean),
    };
  };

  /** @type {string[]} */
  const bonus = [];
  // The way to the next threshold, for its bar: from the last one reached.
  /** @type {{ from: number, to: number } | null} */
  let threshold = null;
  const rule = collectionRule(content);
  if (rule.every > 0 && (rule.xp > 0 || rule.gold > 0)) {
    const now = cardExplorationBonus(found, content);
    bonus.push(line('bonusNow', { xp: percentOf(now.xp), gold: percentOf(now.gold) }));
    const next = (Math.floor(found / rule.every) + 1) * rule.every;
    const better = cardExplorationBonus(next, content);
    if (next <= all && (better.xp > now.xp || better.gold > now.gold)) {
      bonus.push(line('bonusNext', { next, cards: next - found }));
      threshold = { from: next - rule.every, to: next };
    } else bonus.push(line('bonusTop'));
    bonus.push(line('bonusRule', { every: rule.every, xp: percentOf(rule.xp), gold: percentOf(rule.gold), max: percentOf(Math.min(rule.max, Math.floor(all / rule.every) * Math.max(rule.xp, rule.gold))) }));
  }
  return {
    found,
    all,
    summary: line('summary', { found, all }),
    note: line('note'),
    unknown: line('unknown'),
    bonus,
    threshold,
    lands: cardLands(content).map((land) => {
      const have = land.cards.filter((id) => collection.has(id)).length;
      return {
        id: land.regionId,
        name: land.name,
        minLevel: land.minLevel,
        maxLevel: land.maxLevel,
        found: have,
        all: land.cards.length,
        count: line('land', { found: have, all: land.cards.length }),
        cards: land.cards.map((id) => (collection.has(id) ? ownCard(id, /** @type {number} */ (collection.get(id))) : { id, found: false })),
      };
    }),
  };
}
