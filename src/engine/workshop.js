// @ts-check
// Rzemieślnictwo (data/professions.json: workshop): the character makes gear
// in the Systemowy Warsztat, one pattern at a time, from parts of the item's
// rarity and the camp's resources: stone for anything, and wood or iron ore
// for the families made of them. The profession's level shows the patterns
// (a later base of a family from laterPatternLevel, and not before its class
// level) and the rarities, raises the chance each item comes out and makes
// each one quicker. All that an order takes goes at the start. A failed item
// loses its parts and gives its resources back; stopped early, the order
// keeps the items done and gives back all the rest. A made item is the loot
// of its base and rarity at the character's level, with affixes named by the
// creatures the character has met. From the upgrades' levels of the
// profession on, a made item may come out upgraded already, and from the
// scroll's level the character also makes Zwoje ochronne for the Kowadło out
// of parts. Taking apart an item of a pattern not shown yet teaches it at
// once (the author: "rozbiórka pozwoli po prostu łatwiej i szybciej uzyskać
// dostęp").

import { generateItem, itemName, itemView } from './items.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, slot: string, family?: string, classLevel?: number } & Record<string, any>} Base An item base (data/item-bases.json). */
/** @typedef {{ level: number, upgrade: number, chance: number, perLevel: number, max: number }} UpgradeTier A tier of the upgrades a made item may come with. */
/** @typedef {{ minutes: number, part: string, parts: number } & Record<string, any>} Scroll A scroll the Warsztat makes for the Kowadło. */
/** @typedef {{ made: boolean, item?: Record<string, any> }} Made An item of an order: made or failed. */
/** @typedef {import('./rng.js').Rng} Rng */

// The bases of the slots the workshop makes, in the data's order.
/**
 * @param {Content} content
 * @returns {Base[]}
 */
export const craftableBases = (content) => content.bases.filter((/** @type {Base} */ base) => content.workshop.parts[base.slot]);

// The profession level a base's pattern opens at: the first base of a family
// at once, a later one from laterPatternLevel, and not before the class level
// it asks for (classLevel), so the bases of class level 25 open at the 25th.
/**
 * @param {Base} base
 * @param {Content} content
 * @returns {number}
 */
export const patternLevel = (base, content) => (base.classLevel ? Math.max(content.workshop.laterPatternLevel, base.classLevel) : 1);

// Whether the character knows a base's pattern: by the profession's level,
// or learned by taking such an item apart (`learned`, base ids).
/**
 * @param {Base} base
 * @param {number} level
 * @param {string[]} learned
 * @param {Content} content
 * @returns {boolean}
 */
export const knowsPattern = (base, level, learned, content) => patternLevel(base, content) <= level || learned.includes(base.id);

// The patterns the character knows at a level of the crafting profession.
/**
 * @param {number} level
 * @param {string[]} learned
 * @param {Content} content
 * @returns {Base[]}
 */
export const knownPatterns = (level, learned, content) => craftableBases(content).filter((base) => knowsPattern(base, level, learned, content));

// The pattern an item taken apart teaches, or null: its base's, if the
// Warsztat makes such items, the profession's first level does not show it
// already and the character has not learned it yet.
/**
 * @param {{ base: string }} item
 * @param {string[]} learned
 * @param {Content} content
 * @returns {string | null}
 */
export function patternFrom(item, learned, content) {
  const base = content.basesById[item.base];
  return base && content.workshop.parts[base.slot] && patternLevel(base, content) > 1 && !learned.includes(base.id) ? base.id : null;
}

// The rarities a level of the profession makes, in order.
/** @typedef {{ id: string, level: number, chance: number }} CraftRarity A rarity the Warsztat makes. */
/**
 * @param {number} level
 * @param {Content} content
 * @returns {CraftRarity[]}
 */
export const craftRarities = (level, content) => content.workshop.rarities.filter((/** @type {CraftRarity} */ rarity) => rarity.level <= level);

// The chance an item of a rarity comes out at a level: every level adds
// chancePerLevel, up to maxChance, unless the rarity always comes out.
/**
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function craftChance(rarityId, level, content) {
  const { rarities, chancePerLevel, maxChance } = content.workshop;
  const { chance } = /** @type {CraftRarity} */ (rarities.find((/** @type {CraftRarity} */ rarity) => rarity.id === rarityId));
  return chance >= 1 ? 1 : Math.min(maxChance, chance + chancePerLevel * (level - 1));
}

// A rarity's step: 1 for common, 2 for rare and so on.
/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {number}
 */
const rarityStep = (rarityId, content) => content.rarities.findIndex((/** @type {{ id: string }} */ rarity) => rarity.id === rarityId) + 1;

// The share of the first level's time a level takes: each level takes
// speedPerLevel of it off, down to `fastest` of it.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
const pace = (level, content) => Math.max(content.workshop.fastest, 1 - content.workshop.speedPerLevel * (level - 1));

// The minutes of one item of a rarity at a level: rarityTime times longer
// for each rarity up, at the level's pace, and `faster` of them less with the
// Bractwo Kowali (590).
/**
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 * @param {number} [faster]
 * @returns {number}
 */
export function itemMinutes(rarityId, level, content, faster = 0) {
  const { itemMinutes: minutes, rarityTime } = content.workshop;
  return minutes * rarityTime ** (rarityStep(rarityId, content) - 1) * pace(level, content) * (1 - faster);
}

// Minutes rounded up to whole ones (and to a thousandth first, as
// brewMinutes does).
/** @param {number} minutes */
const wholeMinutes = (minutes) => Math.ceil(Math.round(minutes * 1000) / 1000);

// An order of `count` items in whole minutes.
/**
 * @param {number} count
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 * @param {number} [faster]
 * @returns {number}
 */
export const orderMinutes = (count, rarityId, level, content, faster = 0) => wholeMinutes(count * itemMinutes(rarityId, level, content, faster));

// The minutes of one scroll for the Kowadło at a level, and of an order of
// `count`, as faster with the Bractwo Kowali as the items: the Zwój
// ochronny, or the one given (`scroll`, e.g. the Zwój utrwalenia).
/**
 * @param {number} level
 * @param {Content} content
 * @param {number} [faster]
 * @param {Scroll} [scroll]
 * @returns {number}
 */
export const scrollMinutes = (level, content, faster = 0, scroll = content.workshop.scroll) => scroll.minutes * pace(level, content) * (1 - faster);
/**
 * @param {number} count
 * @param {number} level
 * @param {Content} content
 * @param {number} [faster]
 * @param {Scroll} [scroll]
 * @returns {number}
 */
export const scrollOrderMinutes = (count, level, content, faster = 0, scroll = content.workshop.scroll) => wholeMinutes(count * scrollMinutes(level, content, faster, scroll));

// The parts one item of a base takes at an item level: those of its slot and
// one more for every partsLevelStep levels, so the parts for an item always
// cost more at the Skup złomu than the dealer pays for it (test/workshop.test.js).
/**
 * @param {Base} base
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const craftParts = (base, level, content) => content.workshop.parts[base.slot] + Math.floor(level / content.workshop.partsLevelStep);

// What `count` items of a base and rarity at an item level take: the parts
// of the rarity (craftParts), by id, and the camp's resources, by id: stone
// per part of the slot and rarity step for anything, and as much of `extra`
// per part of the slot and step in wood or iron ore for the families made of
// them.
/**
 * @param {Base} base
 * @param {string} rarityId
 * @param {number} count
 * @param {number} level
 * @param {Content} content
 * @returns {{ parts: Record<string, number>, resources: Record<string, number> }}
 */
export function craftCost(base, rarityId, count, level, content) {
  const { parts, resources } = content.workshop;
  const each = parts[base.slot];
  const step = rarityStep(rarityId, content);
  const family = base.family ?? base.id;
  const extra = Object.entries(/** @type {Record<string, string[]>} */ (resources.families)).find(([, families]) => families.includes(family))?.[0];
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
/**
 * @param {string[]} met
 * @param {Content} content
 * @returns {{ affixNames: { prefix: Record<string, any>[], suffix: Record<string, any>[] } } | null}
 */
export function metNames(met, content) {
  /** @type {Record<string, any>[]} */
  const names = Object.values(content.affixNamesByMonster).filter((/** @type {{ monster: string }} */ name) => met.includes(name.monster));
  return names.length > 0 ? { affixNames: { prefix: names.filter((name) => name.prefix), suffix: names } } : null;
}

// What scrolls take: the scroll's parts for each, the Zwój ochronny's or
// the given one's.
/**
 * @param {number} count
 * @param {Content} content
 * @param {Scroll} [scroll]
 * @returns {{ parts: Record<string, number> }}
 */
export const scrollCost = (count, content, scroll = content.workshop.scroll) => ({ parts: { [scroll.part]: scroll.parts * count } });

// The parts' exchange (`exchange` of workshop): `rate` parts of a rarity
// for one of the next, at once and without the character's work (the
// author: "natychmiastowa opcja wymiany Ścinek na Rzemienie itd. w jakichś
// adekwatnych ilościach typu 10 Ścinek = 1 Rzemień"). The part a part is
// had for and how many of it one takes; null for the commonest part.
/**
 * @param {string} partId
 * @param {Content} content
 * @returns {{ partId: string, rate: number } | null}
 */
export function partSource(partId, content) {
  const index = content.rarities.findIndex((/** @type {{ id: string }} */ rarity) => rarity.id === content.partsById[partId]?.rarity);
  if (index < 1) return null;
  return { partId: content.partsByRarity[content.rarities[index - 1].id].id, rate: content.workshop.exchange.rate };
}

// Why `count` parts of a kind cannot be had now for parts a rarity lower,
// or null: `parts` is what the character has, by id.
/**
 * @param {{ parts: Record<string, number>, partId: unknown, count: unknown }} order
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function partExchangeBlock({ parts, partId, count }, content) {
  const source = typeof partId === 'string' && Object.hasOwn(content.partsById, partId) ? partSource(partId, content) : null;
  if (!source) return { code: 'invalid_part', message: 'Tych części System nie wymienia.' };
  if (!content.workshop.exchange.counts.includes(count)) return { code: 'invalid_count', message: 'System nie wymienia tylu części naraz.' };
  const given = /** @type {number} */ (count) * source.rate;
  if ((parts[source.partId] ?? 0) < given) return { code: 'not_enough', message: `Brakuje części: ${content.partsById[source.partId].name} (potrzeba ${given}).` };
  return null;
}

// A tier's chance at a level of the profession: from its level on, growing
// perLevel a level, up to max.
/**
 * @param {UpgradeTier} tier
 * @param {number} level
 */
const tierChance = (tier, level) => Math.min(tier.max, tier.chance + tier.perLevel * (level - tier.level));

// The upgrades a made item may come with at a level, from +1 up, each with
// the chance an item comes out with just that one: the highest is tried
// first, and the first that falls stays. None below the first tier's level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ upgrade: number, chance: number }[]}
 */
export function craftUpgrades(level, content) {
  /** @type {UpgradeTier[]} */
  const open = content.workshop.upgrades.filter((/** @type {UpgradeTier} */ tier) => tier.level <= level);
  /** @type {{ upgrade: number, chance: number }[]} */
  const chances = [];
  let rest = 1;
  for (const tier of open.reverse()) {
    const chance = tierChance(tier, level);
    chances.unshift({ upgrade: tier.upgrade, chance: rest * chance });
    rest *= 1 - chance;
  }
  return chances;
}

// The chances a made item comes out one rarity or two above the ordered one,
// by luck alone (the author: "5% na poziom rzadkości wyższej niż oczekiwana,
// 1% na dwa poziomy wyżej. Rośnie wraz z levelem Profesji co 20 lvli o 1%
// obydwa wskaźniki"), and `extra` on the one rarity up with the Bractwo
// Kowali (590).
/**
 * @param {number} level
 * @param {Content} content
 * @param {number} [extra]
 * @returns {{ oneUp: number, twoUp: number }}
 */
export function craftLuck(level, content, extra = 0) {
  const { oneUp, twoUp, everyLevels, perStep } = content.workshop.luck;
  const bonus = perStep * Math.floor(level / everyLevels);
  return { oneUp: oneUp + bonus + extra, twoUp: twoUp + bonus };
}

// The rarity a made item comes out with: one draw for both chances of
// craftLuck, never above the last rarity.
/**
 * @param {string} rarityId
 * @param {number} level
 * @param {Rng} rng
 * @param {Content} content
 * @param {number} [extra]
 * @returns {string}
 */
function luckyRarity(rarityId, level, rng, content, extra = 0) {
  const { oneUp, twoUp } = craftLuck(level, content, extra);
  const roll = rng.next();
  const steps = roll < twoUp ? 2 : roll < twoUp + oneUp ? 1 : 0;
  const index = Math.min(content.rarities.length - 1, rarityStep(rarityId, content) - 1 + steps);
  return content.rarities[index].id;
}

// The upgrade one made item comes with, drawn as craftUpgrades tells: no
// draw at all below the first tier's level.
/**
 * @param {number} level
 * @param {Rng} rng
 * @param {Content} content
 * @returns {number}
 */
function rollCraftUpgrade(level, rng, content) {
  for (const tier of /** @type {UpgradeTier[]} */ (content.workshop.upgrades.filter((/** @type {UpgradeTier} */ each) => each.level <= level)).reverse()) {
    if (rng.chance(tierChance(tier, level))) return tier.upgrade;
  }
  return 0;
}

// The `count` items of an order, one after another from the seed: whether
// each came out and, if so, the item, of the ordered rarity or a luckier one,
// upgraded or not. A made item keeps the parts it took, their rarity and the
// upgrade it came with (`crafted`) for the scrapper's price and the Stół
// rozbiórki. An order stopped early keeps the draws of the items it made.
// `luck`: the Bractwo Kowali's extra chance of one rarity up, kept with the
// order when it was given (590).
/**
 * @param {{ baseId: string, rarityId: string, count: number, level: number, professionLevel: number, met?: string[], seed: string | number, luck?: number }} order
 * @param {Content} content
 * @returns {Made[]}
 */
export function craftItems({ baseId, rarityId, count, level, professionLevel, met = [], seed, luck = 0 }, content) {
  const rng = createRng(seed);
  const chance = craftChance(rarityId, professionLevel, content);
  const area = metNames(met, content);
  const parts = craftParts(content.basesById[baseId], level, content);
  /** @type {Made[]} */
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const made = rng.chance(chance);
    if (!made) {
      results.push({ made });
      continue;
    }
    // items.js is not checked yet.
    const item = generateItem(/** @type {any} */ ({ baseId, level, rarityId: luckyRarity(rarityId, professionLevel, rng, content, luck), area }), rng, content);
    const upgrade = rollCraftUpgrade(professionLevel, rng, content);
    results.push({ made, item: { ...item, ...(upgrade > 0 && { upgrade }), crafted: { parts, rarity: rarityId, upgrade } } });
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
/**
 * @param {{
 *   base: { id: string, name: string },
 *   rarityId?: string | null,
 *   results: Made[],
 *   scrolls?: number,
 *   learned?: string[],
 *   minutes: number,
 *   startedAt: number,
 *   endsAt: number,
 *   seed: string | number,
 *   stopped?: boolean,
 *   before: { level: number, xp: number, gained?: number },
 *   after: { level: number, xp: number, gained?: number },
 *   character: { level: number } & Record<string, any>,
 *   xp: number,
 *   work: { level: number, timePoints: number, messages: string[] } & Record<string, any>,
 * }} order
 * @param {Content} content
 */
export function workshopReport({ base, rarityId, results, scrolls, learned = [], minutes, startedAt, endsAt, seed, stopped, before, after, character, xp, work }, content) {
  const { workshop } = content;
  const texts = workshop.texts;
  const profession = content.professionsById[workshop.profession];
  /** @param {number} level */
  const opened = (level) => level > before.level && level <= after.level;
  const patterns = craftableBases(content).filter((candidate) => opened(patternLevel(candidate, content)) && !learned.includes(candidate.id));
  /** @type {CraftRarity[]} */
  const rarities = workshop.rarities.filter((/** @type {CraftRarity} */ rarity) => opened(rarity.level));
  const made = /** @type {Record<string, any>[]} */ (results.filter((result) => result.made).map((result) => result.item));
  const lucky = rarityId ? made.filter((item) => item.rarity !== rarityId) : [];
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
    items: made.map((item) => itemView(/** @type {any} */ (item), content)),
    ...(scrolls !== undefined && { scrolls }),
    failed,
    made: madeCount > 0 ? say(texts, 'made', 0, { items: countList({ [base.id]: madeCount }, { [base.id]: base }) }) : null,
    failedText: failed > 0 ? say(texts, 'failed', 0, { items: countList({ [base.id]: failed }, content.basesById) }) : null,
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: patterns.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...lucky.map((item) => say(texts, 'lucky', 0, { item: itemName(/** @type {any} */ (item), content), rarity: content.raritiesById[item.rarity].name })),
      ...professionLevelLines(profession, before, after, content),
      ...(patterns.length > 0 ? [say(texts, 'revealed', 0, { patterns: patterns.map((candidate) => candidate.name).join(', ') })] : []),
      ...rarities.map((rarity, index) => say(texts, 'rarity', index, { rarity: content.raritiesById[rarity.id].name })),
      ...work.messages,
    ],
  };
}
