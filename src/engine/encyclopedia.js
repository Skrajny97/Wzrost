// The Encyklopedia (DECISIONS.md, "Encyklopedia"): what a character has got
// so far, in tabs and tiers, each entry with where to get it
// (data/encyclopedia.json). Its record (`discovered`, characters.discovered)
// keeps a key for what the character has held: "item:sword" with the best
// rarity got (the rarity's index + 1), "potion:…", "herb:…", "part:…" and
// "material:wolf-pelt:rare" for each grade of a material, each 1. A full
// set of items, or a count of discoveries reached, opens a chest once
// (`claimed`, by the chest's id). A material held in the grade of its
// species and the trophy's grades above it is a trophy: blows against its
// creature hit harder.

import { knownStack } from './crafting.js';
import { areaDangers } from './hunt.js';
import { baseClasses, baseClassLevel } from './items.js';
import { shopLevelFor } from './shop.js';
import { say } from './text.js';
import { craftableBases, partSource, patternLevel } from './workshop.js';

const rarityIndex = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId);
const text = (content, key, vars) => say(content.encyclopedia.texts, key, 0, vars);
const levels = (from, to) => (from === to ? `${from}` : `${from}–${to}`);

// The keys of what a character holds now: its items, worn or in the bag
// (each base with the best rarity among them), and its potions, herbs,
// grades of materials and parts.
export function heldDiscoveries({ items = [], potions = {}, herbs = {}, materials = {}, parts = {} }, content) {
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
  ]) {
    for (const [id, count] of Object.entries(held)) if (count > 0 && Object.hasOwn(known, id)) found[`${kind}:${id}`] = 1;
  }
  for (const [key, count] of Object.entries(materials)) if (count > 0 && knownStack(key, content)) found[`material:${key}`] = 1;
  return found;
}

// The record with what is held now added, or null when nothing is new.
export function mergeDiscoveries(stored, held) {
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
export function levelTier(level, content) {
  const { tiers } = content.encyclopedia;
  const index = tiers.findIndex((tier) => level <= tier.upTo);
  return index < 0 ? tiers.length - 1 : index;
}

// The tier of an item base, by the class level it is worn from.
export const baseTier = (baseId, content) => content.encyclopedia.tiers.findIndex((tier) => tier.classLevel === baseClassLevel(baseId, content));

// Where each creature lives: its inner regions in the order of the game, and
// the highest level it comes at.
function creatureRanges(content) {
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
export function trophyGrades(materialId, content) {
  const start = rarityIndex(content.materialsById[materialId].rarity, content);
  const end = Math.min(content.rarities.length, start + content.encyclopedia.trophy.grades);
  return content.rarities.slice(start, end).map((rarity) => rarity.id);
}

const hasTrophy = (material, discovered, content) => trophyGrades(material.id, content).every((rarityId) => discovered[`material:${material.id}:${rarityId}`]);

// The bonus to the damage dealt to each creature whose trophy the character
// has, by the creature's id; `only`, if given, keeps those creatures.
export function trophyBonuses(discovered, content, only = null) {
  const bonuses = {};
  for (const material of content.materials) {
    if (only && !only.includes(material.monster)) continue;
    if (hasTrophy(material, discovered, content)) bonuses[material.monster] = content.encyclopedia.trophy.damage;
  }
  return bonuses;
}

// The item sets: in every tier one for each class, of the bases it wears,
// and one of the bases for all ("Dodatki").
export function itemSets(content) {
  const sets = [];
  content.encyclopedia.tiers.forEach((tier, index) => {
    const bases = content.bases.filter((base) => baseTier(base.id, content) === index);
    for (const cls of content.classes) {
      const own = bases.filter((base) => baseClasses(base.id, content)?.includes(cls.id));
      if (own.length > 0) sets.push({ id: `items:${index + 1}:${cls.id}`, tier: index, name: cls.name, bases: own.map((base) => base.id) });
    }
    const shared = bases.filter((base) => baseClasses(base.id, content) === null);
    if (shared.length > 0) sets.push({ id: `items:${index + 1}:accessories`, tier: index, name: text(content, 'accessories'), bases: shared.map((base) => base.id) });
  });
  return sets;
}

// What counts for a tab's thresholds: discovered entries (a material by
// any of its grades).
const TALLIES = {
  potions: (discovered, content) => content.potions.filter((potion) => discovered[`potion:${potion.id}`]).length,
  herbs: (discovered, content) => content.herbs.filter((herb) => discovered[`herb:${herb.id}`]).length,
  materials: (discovered, content) =>
    content.materials.filter((material) => content.rarities.some((rarity) => discovered[`material:${material.id}:${rarity.id}`])).length,
  parts: (discovered, content) => content.parts.filter((part) => discovered[`part:${part.id}`]).length,
};

// Every chest of the Encyklopedia: the item sets with the chest of their
// tier, and each tab's thresholds with its chests in turn.
export function encyclopediaChests(content) {
  const { chests, milestones } = content.encyclopedia;
  const chestAt = (index) => chests[Math.min(index, chests.length - 1)];
  return [
    ...itemSets(content).map((set) => ({ id: set.id, tab: 'items', set, chest: chestAt(set.tier) })),
    ...Object.entries(milestones).flatMap(([tab, counts]) => counts.map((count, step) => ({ id: `${tab}:${count}`, tab, count, chest: chestAt(step) }))),
  ];
}

// How far a chest's list is: what is discovered of it and what it asks for.
function chestProgress(entry, discovered, content) {
  if (entry.set) return { have: entry.set.bases.filter((id) => discovered[`item:${id}`]).length, need: entry.set.bases.length };
  return { have: Math.min(entry.count, TALLIES[entry.tab](discovered, content)), need: entry.count };
}

// The chests with how far each is, whether it is ready to open and whether
// it is open already.
export function chestStates(discovered, claimed, content) {
  return encyclopediaChests(content).map((entry) => {
    const { have, need } = chestProgress(entry, discovered, content);
    const opened = claimed.includes(entry.id);
    return { ...entry, have, need, opened, ready: !opened && have >= need };
  });
}

export const readyChests = (discovered, claimed, content) => chestStates(discovered, claimed, content).filter((entry) => entry.ready).length;

// A chest to open by its id: { chest } with what is inside, or { code } of
// why not.
export function encyclopediaChest(id, discovered, claimed, content) {
  const entry = chestStates(discovered, claimed, content).find((candidate) => candidate.id === id);
  if (!entry) return { code: 'no_chest' };
  if (entry.opened) return { code: 'opened' };
  if (!entry.ready) return { code: 'not_ready', entry };
  return { chest: entry.chest, entry };
}

// The tiers of a tab as headings: "Tier II · od 10. poziomu klasy".
function tierHeadings(content, byClassLevel) {
  const { tiers } = content.encyclopedia;
  return tiers.map((tier, index) => ({
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
const firstAreaTo = (level, content) => content.regions.flatMap((region) => region.areas).find((area) => area.maxLevel >= level) ?? null;

function itemEntry(base, discovered, content, patterns) {
  const best = discovered[`item:${base.id}`] ?? 0;
  const classes = baseClasses(base.id, content);
  const classLevel = baseClassLevel(base.id, content);
  const area = classLevel > 1 ? firstAreaTo(classLevel, content) : null;
  const names = classes?.map((id) => content.classesById[id].name).join(', ');
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
      best > 0 && text(content, 'itemBest', { rarity: content.rarities[best - 1].name }),
    ].filter(Boolean),
  };
}

function potionEntry(potion, discovered, content) {
  const found = Boolean(discovered[`potion:${potion.id}`]);
  const herbs = Object.entries(potion.herbs).map(([id, count]) => `${count} × ${content.herbsById[id].name}`);
  return {
    id: potion.id,
    found,
    name: found ? potion.name : text(content, 'unknown'),
    level: potion.level,
    description: found ? potion.description : null,
    sources: [
      text(content, 'potionRecipe', { level: potion.level }),
      found && text(content, 'potionHerbs', { herbs: herbs.join(', ') }),
      found && potion.catalyst && text(content, 'potionCatalyst', { material: content.materialsById[potion.catalyst].name }),
    ].filter(Boolean),
  };
}

// The herbs an event of an exploration may give (events.json, anywhere in
// its outcomes).
function eventHerbs(content) {
  const found = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && value.herbs && typeof value.herbs === 'object') for (const id of Object.keys(value.herbs)) found.add(id);
    for (const child of Object.values(value)) walk(child);
  };
  walk(content.events?.list ?? []);
  return found;
}

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

function materialEntry(material, discovered, met, content, range) {
  const grades = content.rarities.filter((rarity) => discovered[`material:${material.id}:${rarity.id}`]);
  const found = grades.length > 0;
  const monster = content.monstersById[material.monster];
  const trophy = trophyGrades(material.id, content);
  const won = hasTrophy(material, discovered, content);
  const percent = Math.round(content.encyclopedia.trophy.damage * 100);
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

// The Encyklopedia as a character sees it: each tab with its tiers of
// entries (a stranger as "???" with only where to get it), how many are
// discovered, and the chests. `met` is the creatures met (characters.met).
export function encyclopediaView({ discovered, claimed, met }, content) {
  const metSet = new Set(met);
  const chests = chestStates(discovered, claimed, content);
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
  const ranges = creatureRanges(content);
  const fromEvents = eventHerbs(content);
  const byTier = (entries, tierOf, headings) =>
    headings.map((heading) => ({ ...heading, entries: entries.filter((entry) => tierOf(entry) === heading.index) })).filter((tier) => tier.entries.length > 0);
  const count = (entries) => ({ found: entries.filter((entry) => entry.found).length, all: entries.length });

  const items = content.bases.map((base) => ({ ...itemEntry(base, discovered, content, patterns), tier: baseTier(base.id, content) }));
  const potions = [...content.potions].sort((a, b) => a.level - b.level).map((potion) => potionEntry(potion, discovered, content));
  const herbs = [...content.herbs].sort((a, b) => a.level - b.level).map((herb) => herbEntry(herb, discovered, content, fromEvents));
  const materials = content.materials
    .map((material) => {
      const range = ranges.get(material.monster) ?? { areas: [], maxLevel: 1 };
      return { entry: materialEntry(material, discovered, metSet, content, range), maxLevel: range.maxLevel };
    })
    .sort((a, b) => a.maxLevel - b.maxLevel)
    .map(({ entry, maxLevel }) => ({ ...entry, tier: levelTier(maxLevel, content) }));
  const parts = [...content.parts].sort((a, b) => rarityIndex(a.rarity, content) - rarityIndex(b.rarity, content)).map((part) => partEntry(part, discovered, content));

  const tabChests = (tab) => chests.filter((entry) => entry.tab === tab).map(chestView);
  return {
    tabs: content.encyclopedia.tabs,
    items: {
      ...count(items),
      tiers: byTier(items, (entry) => entry.tier, tierHeadings(content, true)).map((tier) => ({
        ...tier,
        sets: itemSets(content)
          .filter((set) => set.tier === tier.index)
          .map((set) => ({ ...chestView(chests.find((entry) => entry.id === set.id)), bases: set.bases })),
      })),
      note: text(content, 'itemOtherClasses', { level: content.balance.items.otherClass.fromLevel }),
    },
    potions: { ...count(potions), tiers: byTier(potions, (entry) => levelTier(entry.level, content), tierHeadings(content, false)), chests: tabChests('potions') },
    herbs: { ...count(herbs), tiers: byTier(herbs, (entry) => levelTier(entry.level, content), tierHeadings(content, false)), chests: tabChests('herbs') },
    materials: {
      ...count(materials),
      trophies: materials.filter((entry) => entry.trophy.won).length,
      tiers: byTier(materials, (entry) => entry.tier, tierHeadings(content, false)),
      chests: tabChests('materials'),
    },
    parts: { ...count(parts), entries: parts, chests: tabChests('parts') },
  };
}
