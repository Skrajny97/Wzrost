// Rzemieślnictwo (data/professions.json: workshop): the character makes gear
// in the Systemowy Warsztat, one pattern at a time, from parts of the item's
// rarity and the camp's resources: stone for anything, and wood or iron ore
// for the families made of them. The profession's level shows the patterns
// (the later base of a family from laterPatternLevel on) and the rarities,
// raises the chance each item comes out and makes each one quicker. All
// that an order takes goes at the start. A failed item loses its parts and
// gives its resources back; stopped early, the order keeps the items done
// and gives back all the rest. A made item is the loot of its base and
// rarity at the character's level, with affixes named by the creatures the
// character has met. From the upgrades' levels of the profession on, a
// made item may come out upgraded already, and from the scroll's level the
// character also makes Zwoje ochronne for the Kowadło out of parts. Taking
// apart an item of a pattern not shown yet teaches it at once (the author:
// "rozbiórka pozwoli po prostu łatwiej i szybciej uzyskać dostęp").

import { generateItem, itemView } from './items.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

// The bases of the slots the workshop makes, in the data's order.
export const craftableBases = (content) => content.bases.filter((base) => content.workshop.parts[base.slot]);

// The profession level a base's pattern opens at: the first base of a family
// at once, a later one (classLevel) from laterPatternLevel.
export const patternLevel = (base, content) => (base.classLevel ? content.workshop.laterPatternLevel : 1);

// Whether the character knows a base's pattern: by the profession's level,
// or learned by taking such an item apart (`learned`, base ids).
export const knowsPattern = (base, level, learned, content) => patternLevel(base, content) <= level || learned.includes(base.id);

// The patterns the character knows at a level of the crafting profession.
export const knownPatterns = (level, learned, content) => craftableBases(content).filter((base) => knowsPattern(base, level, learned, content));

// The pattern an item taken apart teaches, or null: its base's, if the
// Warsztat makes such items, the profession's first level does not show it
// already and the character has not learned it yet.
export function patternFrom(item, learned, content) {
  const base = content.basesById[item.base];
  return base && content.workshop.parts[base.slot] && patternLevel(base, content) > 1 && !learned.includes(base.id) ? base.id : null;
}

// The rarities a level of the profession makes, in order.
export const craftRarities = (level, content) => content.workshop.rarities.filter((rarity) => rarity.level <= level);

// The chance an item of a rarity comes out at a level: every level adds
// chancePerLevel, up to maxChance, unless the rarity always comes out.
export function craftChance(rarityId, level, content) {
  const { rarities, chancePerLevel, maxChance } = content.workshop;
  const { chance } = rarities.find((rarity) => rarity.id === rarityId);
  return chance >= 1 ? 1 : Math.min(maxChance, chance + chancePerLevel * (level - 1));
}

// A rarity's step: 1 for common, 2 for rare and so on.
const rarityStep = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId) + 1;

// The share of the first level's time a level takes: each level takes
// speedPerLevel of it off, down to `fastest` of it.
const pace = (level, content) => Math.max(content.workshop.fastest, 1 - content.workshop.speedPerLevel * (level - 1));

// The minutes of one item of a rarity at a level: rarityTime times longer
// for each rarity up, at the level's pace.
export function itemMinutes(rarityId, level, content) {
  const { itemMinutes: minutes, rarityTime } = content.workshop;
  return minutes * rarityTime ** (rarityStep(rarityId, content) - 1) * pace(level, content);
}

// Minutes rounded up to whole ones (and to a thousandth first, as
// brewMinutes does).
const wholeMinutes = (minutes) => Math.ceil(Math.round(minutes * 1000) / 1000);

// An order of `count` items in whole minutes.
export const orderMinutes = (count, rarityId, level, content) => wholeMinutes(count * itemMinutes(rarityId, level, content));

// The minutes of one Zwój ochronny at a level, and of an order of `count`.
export const scrollMinutes = (level, content) => content.workshop.scroll.minutes * pace(level, content);
export const scrollOrderMinutes = (count, level, content) => wholeMinutes(count * scrollMinutes(level, content));

// The parts one item of a base takes at an item level: those of its slot and
// one more for every partsLevelStep levels, so the parts for an item always
// cost more at the Skup złomu than the dealer pays for it (test/workshop.test.js).
export const craftParts = (base, level, content) => content.workshop.parts[base.slot] + Math.floor(level / content.workshop.partsLevelStep);

// What `count` items of a base and rarity at an item level take: the parts
// of the rarity (craftParts), by id, and the camp's resources, by id: stone
// per part of the slot and rarity step for anything, and as much of `extra`
// per part of the slot and step in wood or iron ore for the families made of
// them.
export function craftCost(base, rarityId, count, level, content) {
  const { parts, resources } = content.workshop;
  const each = parts[base.slot];
  const step = rarityStep(rarityId, content);
  const family = base.family ?? base.id;
  const extra = Object.entries(resources.families).find(([, families]) => families.includes(family))?.[0];
  return {
    parts: { [content.partsByRarity[rarityId].id]: craftParts(base, level, content) * count },
    resources: {
      ...(resources.stone > 0 && { stone: resources.stone * each * step * count }),
      ...(extra && resources.extra > 0 && { [extra]: resources.extra * each * step * count }),
    },
  };
}

// The creatures the character has met name the affixes of what it makes: a
// place of them, as generateItem takes one, or null before any.
export function metNames(met, content) {
  const names = Object.values(content.affixNamesByMonster).filter((name) => met.includes(name.monster));
  return names.length > 0 ? { affixNames: { prefix: names.filter((name) => name.prefix), suffix: names } } : null;
}

// What Zwoje ochronne take: the scroll's parts for each.
export const scrollCost = (count, content) => ({ parts: { [content.workshop.scroll.part]: content.workshop.scroll.parts * count } });

// A tier's chance at a level of the profession: from its level on, growing
// perLevel a level, up to max.
const tierChance = (tier, level) => Math.min(tier.max, tier.chance + tier.perLevel * (level - tier.level));

// The upgrades a made item may come with at a level, from +1 up, each with
// the chance an item comes out with just that one: the highest is tried
// first, and the first that falls stays. None below the first tier's level.
export function craftUpgrades(level, content) {
  const open = content.workshop.upgrades.filter((tier) => tier.level <= level);
  const chances = [];
  let rest = 1;
  for (const tier of open.reverse()) {
    const chance = tierChance(tier, level);
    chances.unshift({ upgrade: tier.upgrade, chance: rest * chance });
    rest *= 1 - chance;
  }
  return chances;
}

// The upgrade one made item comes with, drawn as craftUpgrades tells: no
// draw at all below the first tier's level.
function rollCraftUpgrade(level, rng, content) {
  for (const tier of content.workshop.upgrades.filter((each) => each.level <= level).reverse()) {
    if (rng.chance(tierChance(tier, level))) return tier.upgrade;
  }
  return 0;
}

// The `count` items of an order, one after another from the seed: whether
// each came out and, if so, the item, upgraded or not. A made item keeps the
// parts it took and the upgrade it came with (`crafted`) for the scrapper's
// price and the Stół rozbiórki. An order stopped early keeps the draws of
// the items it made.
export function craftItems({ baseId, rarityId, count, level, professionLevel, met = [], seed }, content) {
  const rng = createRng(seed);
  const chance = craftChance(rarityId, professionLevel, content);
  const area = metNames(met, content);
  const parts = craftParts(content.basesById[baseId], level, content);
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const made = rng.chance(chance);
    if (!made) {
      results.push({ made });
      continue;
    }
    const item = generateItem({ baseId, level, rarityId, area }, rng, content);
    const upgrade = rollCraftUpgrade(professionLevel, rng, content);
    results.push({ made, item: { ...item, ...(upgrade > 0 && { upgrade }), crafted: { parts, upgrade } } });
  }
  return results;
}

// The report of an order: a line about the workshop from the seed, the
// items made and those that failed, the profession's new levels with their
// stats and the patterns and rarities the System opened with them, and the
// character's XP. `stopped`: the player called the character back before
// the end. An order of Zwoje ochronne has the scroll for its `base`, no
// rarity and no results, but the `scrolls` made. `learned`: the patterns the
// character learned by taking items apart, which a new level does not
// reveal again.
export function workshopReport({ base, rarityId, results, scrolls, learned = [], minutes, startedAt, endsAt, seed, stopped, before, after, character, xp, work }, content) {
  const { workshop } = content;
  const texts = workshop.texts;
  const profession = content.professionsById[workshop.profession];
  const opened = (level) => level > before.level && level <= after.level;
  const patterns = craftableBases(content).filter((candidate) => opened(patternLevel(candidate, content)) && !learned.includes(candidate.id));
  const rarities = workshop.rarities.filter((rarity) => opened(rarity.level));
  const made = results.filter((result) => result.made).map((result) => result.item);
  const failed = results.length - made.length;
  const madeCount = scrolls ?? made.length;
  return {
    kind: 'items',
    placeName: workshop.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    base: { id: base.id, name: base.name },
    rarity: rarityId ? { id: rarityId, name: content.raritiesById[rarityId].name } : null,
    items: made.map((item) => itemView(item, content)),
    ...(scrolls !== undefined && { scrolls }),
    failed,
    made: madeCount > 0 ? say(texts, 'made', 0, { items: countList({ [base.id]: madeCount }, { [base.id]: base }) }) : null,
    failedText: failed > 0 ? say(texts, 'failed', 0, { items: countList({ [base.id]: failed }, content.basesById) }) : null,
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: patterns.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...(patterns.length > 0 ? [say(texts, 'revealed', 0, { patterns: patterns.map((candidate) => candidate.name).join(', ') })] : []),
      ...rarities.map((rarity, index) => say(texts, 'rarity', index, { rarity: content.raritiesById[rarity.id].name })),
      ...work.messages,
    ],
  };
}
