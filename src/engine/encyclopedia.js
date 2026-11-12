// @ts-check
// The Encyklopedia (DECISIONS.md, "Encyklopedia"): what a character has got
// so far, in tabs and tiers, each entry with where to get it
// (data/encyclopedia.json). Its record (`discovered`, characters.discovered)
// keeps a key for what the character has held: "item:sword" with the best
// rarity got (the rarity's index + 1), "potion:…", "herb:…", "part:…",
// "mineral:…" (Górnictwo's gems and ores) and "material:wolf-pelt:rare" for
// each grade of a material, each 1. A full
// set of items, or a count of discoveries reached, opens a chest once
// (`claimed`, by the chest's id). A material held in the grade of its
// species and the trophy's grades above it is a trophy: blows against its
// creature hit harder.

import { recipeStanding } from './brewing.js';
import { knownStack } from './crafting.js';
import { areaDangers } from './hunt.js';
import { baseClasses, baseClassLevel } from './items.js';
import { jewelBases, jewelPatternLevel } from './jewelcraft.js';
import { professionState } from './professions.js';
import { shopLevelFor } from './shop.js';
import { say } from './text.js';
import { craftableBases, partSource, patternLevel } from './workshop.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Entry An entry of the game's data: a rarity, a tier, a creature's material… */
/** @typedef {Record<string, number>} Discovered The record of discoveries by key (characters.discovered). */
/** @typedef {{ items?: Entry[], potions?: Record<string, number>, herbs?: Record<string, number>, materials?: Record<string, number>, parts?: Record<string, number>, minerals?: Record<string, number> }} Held What a character holds. */
/** @typedef {{ id: string, tier: number, name: string, bases: string[] }} ItemSet A set of item bases, with a chest. */
/** @typedef {{ id: string, tab: string, chest: any, set?: ItemSet, count?: number }} Chest A chest of the Encyklopedia. */
/** @typedef {Chest & { have: number, need: number, opened: boolean, ready: boolean }} ChestState A chest with how far it is. */
/** @typedef {{ areas: Entry[], maxLevel: number }} Range Where a creature lives. */
/** @typedef {{ level: number, classLevel: number, professions: Record<string, any> }} Levels A character's levels. */

/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {number}
 */
const rarityIndex = (rarityId, content) => content.rarities.findIndex((/** @type {Entry} */ rarity) => rarity.id === rarityId);
/**
 * @param {Content} content
 * @param {string} key
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
const text = (content, key, vars) => say(content.encyclopedia.texts, key, 0, vars);
/**
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
const levels = (from, to) => (from === to ? `${from}` : `${from}–${to}`);

// The keys of what a character holds now: its items, worn or in the bag
// (each base with the best rarity among them), and its potions, herbs,
// grades of materials, parts and minerals.
/**
 * @param {Held} held
 * @param {Content} content
 * @returns {Discovered}
 */
export function heldDiscoveries({ items = [], potions = {}, herbs = {}, materials = {}, parts = {}, minerals = {} }, content) {
  /** @type {Discovered} */
  const found = {};
  for (const item of items) {
    if (!Object.hasOwn(content.basesById, item.base)) continue;
    const key = `item:${item.base}`;
    found[key] = Math.max(found[key] ?? 0, rarityIndex(item.rarity, content) + 1);
  }
  for (const [kind, held, known] of [
    ['potion', potions, content.potionsById],
    ['herb', herbs, content.herbsById],
    ['part', parts, content.partsById],
    ['mineral', minerals, content.mineralsById],
  ]) {
    for (const [id, count] of Object.entries(held)) if (count > 0 && Object.hasOwn(known, id)) found[`${kind}:${id}`] = 1;
  }
  for (const [key, count] of Object.entries(materials)) if (count > 0 && knownStack(key, content)) found[`material:${key}`] = 1;
  return found;
}

// The discoveries of what the character holds by its own doing (the
// author: "postac sama musi wytworzyć przedmiot albo zdobyć żeby zaliczylo w
// Encyklopedii"): no item got in a Wymiana or from another character
// through the Skrzynia Konta (data.traded, data.chest), and of each stack of
// potions, herbs, materials and minerals only what is over the pieces got
// in a trade.
// `foreign` holds those pieces by key ("herb:comfrey": 2), used up first;
// it comes back with what is still held of them.
/**
 * @param {Held} held
 * @param {Record<string, number>} foreign
 * @param {Content} content
 * @returns {{ found: Discovered, foreign: Record<string, number> }}
 */
export function ownDiscoveries({ items = [], potions = {}, herbs = {}, materials = {}, parts = {}, minerals = {} }, foreign, content) {
  /** @type {Record<string, number>} */
  const left = {};
  /**
   * @param {string} kind
   * @param {Record<string, number>} held
   */
  const own = (kind, held) =>
    Object.fromEntries(
      Object.entries(held).map(([id, count]) => {
        const traded = Math.min(foreign[`${kind}:${id}`] ?? 0, count);
        if (traded > 0) left[`${kind}:${id}`] = traded;
        return [id, count - traded];
      }),
    );
  const found = heldDiscoveries(
    {
      items: items.filter((item) => !item.traded && !item.chest),
      potions: own('potion', potions),
      herbs: own('herb', herbs),
      materials: own('material', materials),
      parts,
      minerals: own('mineral', minerals),
    },
    content,
  );
  return { found, foreign: left };
}

// The record with what is held now added, or null when nothing is new.
/**
 * @param {Discovered} stored
 * @param {Discovered} held
 * @returns {Discovered | null}
 */
export function mergeDiscoveries(stored, held) {
  /** @type {Discovered | null} */
  let merged = null;
  for (const [key, value] of Object.entries(held)) {
    if ((Object.hasOwn(stored, key) ? stored[key] : 0) >= value) continue;
    merged ??= { ...stored };
    merged[key] = value;
  }
  return merged;
}

// The tier of a level (a potion's, a herb's, a creature's): the first that
// reaches it, else the last.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function levelTier(level, content) {
  const { tiers } = content.encyclopedia;
  const index = tiers.findIndex((/** @type {Entry} */ tier) => level <= tier.upTo);
  return index < 0 ? tiers.length - 1 : index;
}

// The tier of an item base, by the class level it is worn from.
/**
 * @param {string} baseId
 * @param {Content} content
 * @returns {number}
 */
export const baseTier = (baseId, content) => content.encyclopedia.tiers.findIndex((/** @type {Entry} */ tier) => tier.classLevel === baseClassLevel(baseId, content));

// Where each creature lives: its inner regions in the order of the game, and
// the highest level it comes at.
/**
 * @param {Content} content
 * @returns {Map<string, Range>}
 */
function creatureRanges(content) {
  /** @type {Map<string, Range>} */
  const ranges = new Map();
  for (const region of content.regions) {
    for (const area of region.areas) {
      for (const danger of areaDangers(area, content)) {
        const range = ranges.get(danger.monsterId) ?? { areas: [], maxLevel: 0 };
        range.areas.push(area);
        range.maxLevel = Math.max(range.maxLevel, danger.maxLevel);
        ranges.set(danger.monsterId, range);
      }
    }
  }
  return ranges;
}

// The grades of a material a trophy asks for: its species' and the next
// ones, trophy.grades in all, as far as the rarities go.
/**
 * @param {string} materialId
 * @param {Content} content
 * @returns {string[]}
 */
export function trophyGrades(materialId, content) {
  const start = rarityIndex(content.materialsById[materialId].rarity, content);
  const end = Math.min(content.rarities.length, start + content.encyclopedia.trophy.grades);
  return content.rarities.slice(start, end).map((/** @type {Entry} */ rarity) => rarity.id);
}

/**
 * @param {Entry} material
 * @param {Discovered} discovered
 * @param {Content} content
 * @returns {boolean}
 */
const hasTrophy = (material, discovered, content) => trophyGrades(material.id, content).every((rarityId) => discovered[`material:${material.id}:${rarityId}`]);

// The bonus to the damage dealt to each creature whose trophy the character
// has, by the creature's id; `only`, if given, keeps those creatures.
/**
 * @param {Discovered} discovered
 * @param {Content} content
 * @param {string[] | null} [only]
 * @returns {Record<string, number>}
 */
export function trophyBonuses(discovered, content, only = null) {
  /** @type {Record<string, number>} */
  const bonuses = {};
  for (const material of content.materials) {
    if (only && !only.includes(material.monster)) continue;
    if (hasTrophy(material, discovered, content)) bonuses[material.monster] = content.encyclopedia.trophy.damage;
  }
  return bonuses;
}

// Built once for each content, as the game's data does not change while it
// runs (the code review: the sets and the chests were built anew for every
// character view). What comes back is shared: callers only read it.
/**
 * @template T
 * @param {(content: Content) => T} build
 * @returns {(content: Content) => T}
 */
const once = (build) => {
  /** @type {WeakMap<Content, T>} */
  const built = new WeakMap();
  return (content) => {
    if (!built.has(content)) built.set(content, build(content));
    return /** @type {T} */ (built.get(content));
  };
};

// The item sets: in every tier one for each class, of the bases it wears,
// and one of the bases for all ("Dodatki").
export const itemSets = once((content) => {
  /** @type {ItemSet[]} */
  const sets = [];
  content.encyclopedia.tiers.forEach((/** @type {Entry} */ tier, /** @type {number} */ index) => {
    /** @type {Entry[]} */
    const bases = content.bases.filter((/** @type {Entry} */ base) => baseTier(base.id, content) === index);
    for (const cls of content.classes) {
      const own = bases.filter((base) => baseClasses(base.id, content)?.includes(cls.id));
      if (own.length > 0) sets.push({ id: `items:${index + 1}:${cls.id}`, tier: index, name: cls.name, bases: own.map((base) => base.id) });
    }
    const shared = bases.filter((base) => baseClasses(base.id, content) === null);
    if (shared.length > 0) sets.push({ id: `items:${index + 1}:accessories`, tier: index, name: text(content, 'accessories'), bases: shared.map((base) => base.id) });
  });
  return sets;
});

// What counts for a tab's thresholds: discovered entries (a material by
// any of its grades).
/** @type {Record<string, (discovered: Discovered, content: Content) => number>} */
const TALLIES = {
  potions: (discovered, content) => content.potions.filter((/** @type {Entry} */ potion) => discovered[`potion:${potion.id}`]).length,
  herbs: (discovered, content) => content.herbs.filter((/** @type {Entry} */ herb) => discovered[`herb:${herb.id}`]).length,
  materials: (discovered, content) =>
    content.materials.filter((/** @type {Entry} */ material) => content.rarities.some((/** @type {Entry} */ rarity) => discovered[`material:${material.id}:${rarity.id}`])).length,
  parts: (discovered, content) => content.parts.filter((/** @type {Entry} */ part) => discovered[`part:${part.id}`]).length,
  minerals: (discovered, content) => content.minerals.filter((/** @type {Entry} */ mineral) => discovered[`mineral:${mineral.id}`]).length,
};

// Every chest of the Encyklopedia: the item sets with the chest of their
// tier, and each tab's thresholds with its chests in turn.
export const encyclopediaChests = once((content) => {
  const { chests, milestones } = content.encyclopedia;
  /** @param {number} index */
  const chestAt = (index) => chests[Math.min(index, chests.length - 1)];
  /** @type {Chest[]} */
  const all = [
    ...itemSets(content).map((set) => ({ id: set.id, tab: 'items', set, chest: chestAt(set.tier) })),
    ...Object.entries(milestones).flatMap(([tab, counts]) => counts.map((/** @type {number} */ count, /** @type {number} */ step) => ({ id: `${tab}:${count}`, tab, count, chest: chestAt(step) }))),
  ];
  return all;
});

// How far a chest's list is: what is discovered of it and what it asks for.
// `tally` counts a tab's discoveries.
/**
 * @param {Chest} entry
 * @param {Discovered} discovered
 * @param {(tab: string) => number} tally
 * @returns {{ have: number, need: number }}
 */
function chestProgress(entry, discovered, tally) {
  if (entry.set) return { have: entry.set.bases.filter((id) => discovered[`item:${id}`]).length, need: entry.set.bases.length };
  const count = /** @type {number} */ (entry.count);
  return { have: Math.min(count, tally(entry.tab)), need: count };
}

// The chests with how far each is, whether it is ready to open and whether
// it is open already. Each tab's discoveries are counted once.
/**
 * @param {Discovered} discovered
 * @param {string[]} claimed
 * @param {Content} content
 * @returns {ChestState[]}
 */
export function chestStates(discovered, claimed, content) {
  /** @type {Record<string, number>} */
  const tallies = {};
  /** @param {string} tab */
  const tally = (tab) => (tallies[tab] ??= TALLIES[tab](discovered, content));
  return encyclopediaChests(content).map((entry) => {
    const { have, need } = chestProgress(entry, discovered, tally);
    const opened = claimed.includes(entry.id);
    return { ...entry, have, need, opened, ready: !opened && have >= need };
  });
}

/**
 * @param {Discovered} discovered
 * @param {string[]} claimed
 * @param {Content} content
 * @returns {number}
 */
export const readyChests = (discovered, claimed, content) => chestStates(discovered, claimed, content).filter((entry) => entry.ready).length;

// A chest to open by its id: { chest } with what is inside, or { code } of
// why not.
/**
 * @param {string} id
 * @param {Discovered} discovered
 * @param {string[]} claimed
 * @param {Content} content
 * @returns {{ code: string, entry?: ChestState, chest?: undefined } | { chest: any, entry: ChestState, code?: undefined }}
 */
export function encyclopediaChest(id, discovered, claimed, content) {
  const entry = chestStates(discovered, claimed, content).find((candidate) => candidate.id === id);
  if (!entry) return { code: 'no_chest' };
  if (entry.opened) return { code: 'opened' };
  if (!entry.ready) return { code: 'not_ready', entry };
  return { chest: entry.chest, entry };
}

// The tiers of a tab as headings: "Tier II · od 10. poziomu klasy".
/**
 * @param {Content} content
 * @param {boolean} byClassLevel
 * @returns {{ index: number, name: string, range: string }[]}
 */
function tierHeadings(content, byClassLevel) {
  const { tiers } = content.encyclopedia;
  return tiers.map((/** @type {Entry} */ tier, /** @type {number} */ index) => ({
    index,
    name: tier.name,
    range: byClassLevel
      ? index === 0
        ? text(content, 'tierItemsFirst')
        : text(content, 'tierItems', { level: tier.classLevel })
      : text(content, 'tierLevels', { from: index === 0 ? 1 : tiers[index - 1].upTo + 1, to: tier.upTo }),
  }));
}

// The first inner region whose levels reach `level`, for loot of a later
// base.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Entry | null}
 */
const firstAreaTo = (level, content) =>
  content.regions.flatMap((/** @type {Entry} */ region) => region.areas).find((/** @type {Entry} */ area) => area.maxLevel >= level) ?? null;

// `patterns` and `jewels`: the bases the Warsztat and the Szlifiernia make
// (their ids).
/**
 * @param {import('./workshop.js').Base} base
 * @param {Discovered} discovered
 * @param {Content} content
 * @param {Set<string>} patterns
 * @param {Set<string>} jewels
 */
function itemEntry(base, discovered, content, patterns, jewels) {
  const best = discovered[`item:${base.id}`] ?? 0;
  const classes = baseClasses(base.id, content);
  const classLevel = baseClassLevel(base.id, content);
  const area = classLevel > 1 ? firstAreaTo(classLevel, content) : null;
  const names = classes?.map((/** @type {string} */ id) => content.classesById[id].name).join(', ');
  return {
    id: base.id,
    found: best > 0,
    name: best > 0 ? base.name : text(content, 'unknown'),
    slot: content.slotsById[base.slot]?.name ?? base.slot,
    slotId: base.slot,
    rarity: best > 0 ? content.rarities[best - 1].id : null,
    sources: [
      area ? text(content, 'itemDrop', { area: area.name, levels: levels(area.minLevel, area.maxLevel) }) : text(content, 'itemDropAny'),
      classes ? text(content, classes.length > 1 ? 'itemClasses' : 'itemClass', { classes: names }) : text(content, 'itemAnyClass'),
      classLevel > 1 && text(content, 'itemWear', { level: classLevel }),
      patterns.has(base.id) && text(content, 'itemPattern', { level: patternLevel(base, content) }),
      jewels.has(base.id) && text(content, 'itemJewelPattern', { level: jewelPatternLevel(base, content) }),
      best > 0 && text(content, 'itemBest', { rarity: content.rarities[best - 1].name }),
    ].filter(Boolean),
  };
}

// A potion's entry: where its recipe comes from (a rare one of the
// herbalist's from a standing of the relation with her, 121 A), and once
// discovered its herbs and catalyst.
/**
 * @param {import('./brewing.js').Recipe & Record<string, any>} potion
 * @param {Discovered} discovered
 * @param {Content} content
 */
function potionEntry(potion, discovered, content) {
  const found = Boolean(discovered[`potion:${potion.id}`]);
  const herbs = Object.entries(potion.herbs).map(([id, count]) => `${count} × ${content.herbsById[id].name}`);
  const standing = recipeStanding(potion, content);
  return {
    id: potion.id,
    found,
    name: found ? potion.name : text(content, 'unknown'),
    level: potion.level,
    description: found ? potion.description : null,
    sources: [
      text(content, 'potionRecipe', { level: potion.level }),
      standing && text(content, 'potionTaught', { standing: standing.name }),
      found && text(content, 'potionHerbs', { herbs: herbs.join(', ') }),
      found && potion.catalyst && text(content, 'potionCatalyst', { material: content.materialsById[potion.catalyst].name }),
    ].filter(Boolean),
  };
}

// The herbs an event of an exploration may give (events.json, anywhere in
// its outcomes).
/**
 * @param {Content} content
 * @returns {Set<string>}
 */
function eventHerbs(content) {
  /** @type {Set<string>} */
  const found = new Set();
  /**
   * @param {any} value
   * @returns {void}
   */
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && value.herbs && typeof value.herbs === 'object') for (const id of Object.keys(value.herbs)) found.add(id);
    for (const child of Object.values(value)) walk(child);
  };
  walk(content.events?.list ?? []);
  return found;
}

/**
 * @param {Entry} herb
 * @param {Discovered} discovered
 * @param {Content} content
 * @param {Set<string>} fromEvents
 */
function herbEntry(herb, discovered, content, fromEvents) {
  const found = Boolean(discovered[`herb:${herb.id}`]);
  return {
    id: herb.id,
    found,
    name: found ? herb.name : text(content, 'unknown'),
    level: herb.level,
    description: found ? herb.description : null,
    sources: [text(content, 'herbGather', { level: herb.level }), fromEvents.has(herb.id) && text(content, 'herbEvent')].filter(Boolean),
  };
}

/**
 * @param {Entry} material
 * @param {Discovered} discovered
 * @param {Set<string>} met
 * @param {Content} content
 * @param {Range} range
 */
function materialEntry(material, discovered, met, content, range) {
  /** @type {Entry[]} */
  const grades = content.rarities.filter((/** @type {Entry} */ rarity) => discovered[`material:${material.id}:${rarity.id}`]);
  const found = grades.length > 0;
  const monster = content.monstersById[material.monster];
  const trophy = trophyGrades(material.id, content);
  const won = hasTrophy(material, discovered, content);
  const percent = Math.round(content.encyclopedia.trophy.damage * 100);
  /** @param {string[]} ids */
  const gradeNames = (ids) => ids.map((id) => content.raritiesById[id].name).join(', ');
  return {
    id: material.id,
    found,
    name: found ? material.name : text(content, 'unknown'),
    rarity: material.rarity,
    monsterId: material.monster,
    grades: grades.map((rarity) => rarity.id),
    trophy: { grades: trophy, won },
    description: found ? material.description : null,
    sources: [
      text(content, 'materialDrop', {
        monster: met.has(material.monster) ? monster.name : text(content, 'unknown'),
        areas: range.areas.map((area) => area.name).join(', '),
      }),
      found && text(content, 'materialGrades', { grades: gradeNames(grades.map((rarity) => rarity.id)) }),
      won ? text(content, 'trophyWon', { percent, monster: monster.name }) : text(content, 'trophyNeeds', { grades: gradeNames(trophy), percent }),
    ].filter(Boolean),
  };
}

/**
 * @param {Entry} part
 * @param {Discovered} discovered
 * @param {Content} content
 */
function partEntry(part, discovered, content) {
  const found = Boolean(discovered[`part:${part.id}`]);
  const source = partSource(part.id, content);
  const shop = shopLevelFor(part.rarity, content);
  return {
    id: part.id,
    found,
    name: found ? part.name : text(content, 'unknown'),
    rarity: part.rarity,
    description: found ? part.description : null,
    sources: [
      text(content, 'partTable'),
      source && text(content, 'partExchange', { rate: source.rate, part: content.partsById[source.partId].name }),
      shop && text(content, 'partShop', { level: shop }),
    ].filter(Boolean),
  };
}

// A gem or an ore of Górnictwo: where it is dug from, from which level of
// Jubilerstwo it is cut and set (its `level` too), and what a gem gives
// jewellery and an item it is set in, or which jewellery an ore sets.
/**
 * @param {Entry} mineral
 * @param {Discovered} discovered
 * @param {Content} content
 */
function mineralEntry(mineral, discovered, content) {
  const found = Boolean(discovered[`mineral:${mineral.id}`]);
  /** @param {string[]} ids */
  const rarityNames = (ids) => ids.map((id) => content.raritiesById[id].name).join(', ');
  return {
    id: mineral.id,
    found,
    name: found ? mineral.name : text(content, 'unknown'),
    rarity: mineral.rarity ?? mineral.for[0],
    level: mineral.level,
    description: found ? mineral.description : null,
    sources: [
      text(content, 'mineralMine', { level: mineral.level }),
      text(content, 'mineralCraft', { level: mineral.level }),
      found && mineral.kind === 'gem' && text(content, 'mineralGem', { rarity: content.raritiesById[mineral.rarity].name, percent: Math.round(mineral.setBonus * 100) }),
      found && mineral.kind === 'ore' && text(content, 'mineralOre', { rarities: rarityNames(mineral.for) }),
    ].filter(Boolean),
  };
}

// The tier a character is in on each tab, to unfold first: items by its
// class level, potions, herbs and minerals by the level of their profession,
// and materials by its level. None without `levels`.
/**
 * @param {Levels | null} levels
 * @param {Content} content
 * @returns {Record<string, number>}
 */
function currentTiers(levels, content) {
  if (!levels) return {};
  const { tiers } = content.encyclopedia;
  /** @param {string} id */
  const profession = (id) => professionState(levels.professions, id).level;
  return {
    items: tiers.reduce((/** @type {number} */ found, /** @type {Entry} */ tier, /** @type {number} */ index) => (levels.classLevel >= tier.classLevel ? index : found), 0),
    potions: levelTier(profession(content.brewing.profession), content),
    herbs: levelTier(profession(content.gathering.profession), content),
    minerals: levelTier(profession(content.mining.profession), content),
    materials: levelTier(levels.level, content),
  };
}

// The Encyklopedia as a character sees it: each tab with its tiers of
// entries (a stranger as "???" with only where to get it), how many are
// discovered, and the chests; the tier the character is in is `current`.
// `met` is the creatures met (characters.met), `levels` the character's
// { level, classLevel, professions }.
/**
 * @param {{ discovered: Discovered, claimed: string[], met: string[], levels?: Levels | null }} character
 * @param {Content} content
 */
export function encyclopediaView({ discovered, claimed, met, levels = null }, content) {
  const metSet = new Set(met);
  const current = currentTiers(levels, content);
  const chests = chestStates(discovered, claimed, content);
  /** @param {ChestState} entry */
  const chestView = (entry) => ({
    id: entry.id,
    name: entry.set?.name ?? null,
    count: entry.count ?? null,
    tier: entry.set ? entry.set.tier : null,
    have: entry.have,
    need: entry.need,
    ready: entry.ready,
    opened: entry.opened,
    chest: entry.chest,
  });
  const patterns = new Set(craftableBases(content).map((base) => base.id));
  const jewels = new Set(jewelBases(content).map((base) => base.id));
  const ranges = creatureRanges(content);
  const fromEvents = eventHerbs(content);
  // A level past the last tier with entries, as a profession above the 100th
  // (825) on the potions, herbs and minerals, is in that last one.
  /**
   * @param {any[]} entries
   * @param {(entry: any) => number} tierOf
   * @param {{ index: number, name: string, range: string }[]} headings
   * @param {string} tab
   */
  const byTier = (entries, tierOf, headings, tab) => {
    const tiers = headings.map((heading) => ({ ...heading, entries: entries.filter((entry) => tierOf(entry) === heading.index) })).filter((tier) => tier.entries.length > 0);
    const at = current[tab] === undefined ? undefined : Math.min(current[tab], tiers.at(-1)?.index ?? current[tab]);
    return tiers.map(({ entries: own, ...tier }) => ({ ...tier, current: tier.index === at, entries: own }));
  };
  /** @param {{ found: boolean }[]} entries */
  const count = (entries) => ({ found: entries.filter((entry) => entry.found).length, all: entries.length });

  /** @type {(ReturnType<typeof itemEntry> & { tier: number })[]} */
  const items = content.bases.map((/** @type {import('./workshop.js').Base} */ base) => ({ ...itemEntry(base, discovered, content, patterns, jewels), tier: baseTier(base.id, content) }));
  const potions = [...content.potions].sort((a, b) => a.level - b.level).map((potion) => potionEntry(potion, discovered, content));
  const herbs = [...content.herbs].sort((a, b) => a.level - b.level).map((herb) => herbEntry(herb, discovered, content, fromEvents));
  /** @type {{ entry: ReturnType<typeof materialEntry>, maxLevel: number }[]} */
  const ranged = content.materials.map((/** @type {Entry} */ material) => {
    const range = ranges.get(material.monster) ?? { areas: [], maxLevel: 1 };
    return { entry: materialEntry(material, discovered, metSet, content, range), maxLevel: range.maxLevel };
  });
  const materials = ranged.sort((a, b) => a.maxLevel - b.maxLevel).map(({ entry, maxLevel }) => ({ ...entry, tier: levelTier(maxLevel, content) }));
  const parts = [...content.parts].sort((a, b) => rarityIndex(a.rarity, content) - rarityIndex(b.rarity, content)).map((part) => partEntry(part, discovered, content));
  const minerals = [...content.minerals].sort((a, b) => a.level - b.level).map((mineral) => mineralEntry(mineral, discovered, content));

  /** @param {string} tab */
  const tabChests = (tab) => chests.filter((entry) => entry.tab === tab).map(chestView);
  return {
    tabs: content.encyclopedia.tabs,
    items: {
      ...count(items),
      tiers: byTier(items, (entry) => entry.tier, tierHeadings(content, true), 'items').map((tier) => ({
        ...tier,
        sets: itemSets(content)
          .filter((set) => set.tier === tier.index)
          .map((set) => ({ ...chestView(/** @type {ChestState} */ (chests.find((entry) => entry.id === set.id))), bases: set.bases })),
      })),
      note: text(content, 'itemOtherClasses', { level: content.balance.items.otherClass.fromLevel }),
    },
    potions: { ...count(potions), tiers: byTier(potions, (entry) => levelTier(entry.level, content), tierHeadings(content, false), 'potions'), chests: tabChests('potions') },
    herbs: { ...count(herbs), tiers: byTier(herbs, (entry) => levelTier(entry.level, content), tierHeadings(content, false), 'herbs'), chests: tabChests('herbs') },
    materials: {
      ...count(materials),
      trophies: materials.filter((entry) => entry.trophy.won).length,
      tiers: byTier(materials, (entry) => entry.tier, tierHeadings(content, false), 'materials'),
      chests: tabChests('materials'),
    },
    parts: { ...count(parts), entries: parts, chests: tabChests('parts') },
    minerals: { ...count(minerals), tiers: byTier(minerals, (entry) => levelTier(entry.level, content), tierHeadings(content, false), 'minerals'), chests: tabChests('minerals') },
  };
}
