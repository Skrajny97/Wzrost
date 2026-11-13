// @ts-check
// Jubilerstwo (data/professions.json: jewelcrafting and minerals): the
// character makes rings, amulets and talismans in the Systemowa Szlifiernia
// the way Rzemieślnictwo makes the rest of the gear (workshop.js, 537 A). The
// profession's level shows the patterns (a later base of a family from
// laterPatternLevel, and not before its class level) and the gems: a gem of
// a rarity gives a jewel that rarity, and each jewel also takes the ore of
// its rarity's setting (536 A). It takes time and may fail: a failed jewel
// loses its gem and gives its ore back, as a failed item of the Warsztat
// loses its parts and gives the camp's resources back. A jewel has the
// character's level and affixes named by the creatures the character has
// met. Jubilerstwo also sets a gem in an item (538 A): one gem in an item,
// raising all its numbers by the gem's bonus (items.js), a new gem
// destroying the one before. A gem is cut and set from the level of
// Jubilerstwo at which Górnictwo finds it (mining.js).

import { gemView, generateItem, itemName, itemView } from './items.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';
import { metNames } from './workshop.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Base An item base (data/item-bases.json). */
/** @typedef {Record<string, any>} Mineral An ore or a gem (data/professions.json: minerals). */
/** @typedef {Record<string, any>} Item An item, as items.js makes it. */
/** @typedef {{ made: boolean, item?: Item }} JewelResult One jewel of an order: whether it came out, and the item if so. */

// The bases of the slots Jubilerstwo makes (its `ores`), in the data's order.
/**
 * @param {Content} content
 * @returns {Base[]}
 */
export const jewelBases = (content) => content.bases.filter((/** @type {Base} */ base) => content.jewelcrafting.ores[base.slot]);

// The profession level a base's pattern opens at, as in the Warsztat: the
// first base of a family at once, a later one from laterPatternLevel, and
// not before the class level it asks for.
/**
 * @param {Base} base
 * @param {Content} content
 * @returns {number}
 */
export const jewelPatternLevel = (base, content) => (base.classLevel ? Math.max(content.jewelcrafting.laterPatternLevel, base.classLevel) : 1);

// Whether the character knows a jewel's pattern: by the profession's level,
// or learned by taking such a jewel apart (`learned`, base ids, the same list
// as the Warsztat's), as in the Warsztat (the author: "Rozbieranie
// przedmiotów jak pierścienie czy talizmany też powinny dawać dostępy do
// wyższych tierów jeśli chodzi o jubilerstwo tak jak w Rzemiośle jest").
/**
 * @param {Base} base
 * @param {number} level
 * @param {string[]} learned
 * @param {Content} content
 */
export const knowsJewelPattern = (base, level, learned, content) => jewelPatternLevel(base, content) <= level || learned.includes(base.id);

// The patterns the character knows at a level of Jubilerstwo.
/**
 * @param {number} level
 * @param {string[]} learned
 * @param {Content} content
 */
export const knownJewelPatterns = (level, learned, content) => jewelBases(content).filter((base) => knowsJewelPattern(base, level, learned, content));

// The pattern a jewel taken apart teaches, or null: its base's, if the
// profession's first level does not show it already and the character has
// not learned it yet (patternFrom in workshop.js for the Warsztat).
/**
 * @param {Item} item
 * @param {string[]} learned
 * @param {Content} content
 * @returns {string | null}
 */
export function jewelPatternFrom(item, learned, content) {
  const base = content.basesById[item.base];
  return base && content.jewelcrafting.ores[base.slot] && jewelPatternLevel(base, content) > 1 && !learned.includes(base.id) ? base.id : null;
}

// The gem that gives jewellery a rarity, and the ore its setting takes.
/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {Mineral | undefined}
 */
export const gemOf = (rarityId, content) => content.minerals.find((/** @type {Mineral} */ mineral) => mineral.kind === 'gem' && mineral.rarity === rarityId);
/**
 * @param {string} rarityId
 * @param {Content} content
 * @returns {Mineral | undefined}
 */
export const oreOf = (rarityId, content) => content.minerals.find((/** @type {Mineral} */ mineral) => mineral.kind === 'ore' && mineral.for.includes(rarityId));

// The gems a level of Jubilerstwo cuts and sets: those Górnictwo finds by
// the same level of its own.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Mineral[]}
 */
export const knownGems = (level, content) => content.minerals.filter((/** @type {Mineral} */ mineral) => mineral.kind === 'gem' && mineral.level <= level);

// The chance a jewel of a rarity comes out at a level: every level adds
// chancePerLevel, up to maxChance, unless the rarity always comes out.
/**
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function jewelChance(rarityId, level, content) {
  const { chances, chancePerLevel, maxChance } = content.jewelcrafting;
  const chance = chances[rarityId];
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
const pace = (level, content) => Math.max(content.jewelcrafting.fastest, 1 - content.jewelcrafting.speedPerLevel * (level - 1));

// Minutes rounded up to whole ones (and to a thousandth first, as the
// Warsztat's orders).
/** @param {number} minutes */
const wholeMinutes = (minutes) => Math.ceil(Math.round(minutes * 1000) / 1000);

// The minutes of one jewel of a rarity at a level: rarityTime times longer
// for each rarity up, at the level's pace; and an order of `count` in whole
// minutes.
/**
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function jewelMinutes(rarityId, level, content) {
  const { itemMinutes, rarityTime } = content.jewelcrafting;
  return itemMinutes * rarityTime ** (rarityStep(rarityId, content) - 1) * pace(level, content);
}
/**
 * @param {number} count
 * @param {string} rarityId
 * @param {number} level
 * @param {Content} content
 */
export const jewelOrderMinutes = (count, rarityId, level, content) => wholeMinutes(count * jewelMinutes(rarityId, level, content));

// What `count` jewels of a base and rarity take, by mineral id: a gem of
// the rarity each, and the ore of its setting, as much as the slot takes.
/**
 * @param {Base} base
 * @param {string} rarityId A rarity that has a gem and an ore.
 * @param {number} count
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function jewelCost(base, rarityId, count, content) {
  const gem = /** @type {Mineral} */ (gemOf(rarityId, content));
  const ore = /** @type {Mineral} */ (oreOf(rarityId, content));
  return { [gem.id]: count, [ore.id]: content.jewelcrafting.ores[base.slot] * count };
}

// The `count` jewels of an order, one after another from the seed: whether
// each came out and, if so, the item, of the gem's rarity at the
// character's level, with affixes named by the creatures met. An order
// stopped early keeps the draws of the jewels it made.
/**
 * @param {{ baseId: string, rarityId: string, count: number, level: number, professionLevel: number, met?: string[], seed: string }} order
 * @param {Content} content
 * @returns {JewelResult[]}
 */
export function craftJewels({ baseId, rarityId, count, level, professionLevel, met = [], seed }, content) {
  const rng = createRng(seed);
  const chance = jewelChance(rarityId, professionLevel, content);
  const area = metNames(met, content);
  /** @type {JewelResult[]} */
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const made = rng.chance(chance);
    results.push(made ? { made, item: generateItem({ baseId, level, rarityId, area }, rng, content) } : { made });
  }
  return results;
}

// The minutes of setting a gem at a level of Jubilerstwo: setting.minutes
// for the commonest gem, rarityTime times longer for each rarity up, at the
// level's pace, in whole minutes.
/**
 * @param {string} gemId
 * @param {number} level
 * @param {Content} content
 */
export function setMinutes(gemId, level, content) {
  const { minutes, rarityTime } = content.jewelcrafting.setting;
  return wholeMinutes(minutes * rarityTime ** (rarityStep(content.mineralsById[gemId].rarity, content) - 1) * pace(level, content));
}

// Whether a gem is weaker than the one set now in an item or the Rdzeń
// (`current`, its id; none for an empty one): it raises the numbers less
// (setBonus). A weaker gem never takes the place of a stronger one (the
// author, 13.11.2026: „Trzeba uniemożliwić oprawianie niższym - słabszym
// kamieniem niż aktualnie jest w przedmiocie”). A gem the data no longer
// knows is weaker than none.
/**
 * @param {string} gemId
 * @param {string | null | undefined} current
 * @param {Content} content
 * @returns {boolean}
 */
export function weakerGem(gemId, current, content) {
  const now = current ? content.mineralsById[current] : undefined;
  const next = content.mineralsById[gemId];
  return Boolean(now && next && next.setBonus < now.setBonus);
}

// The gem one rarity up from a gem (Kwarc → Agat → … → Diament), or null
// for the rarest and for a mineral that is no gem.
/**
 * @param {string} gemId
 * @param {Content} content
 * @returns {Mineral | null}
 */
export function nextGem(gemId, content) {
  const gem = content.mineralsById[gemId];
  if (gem?.kind !== 'gem') return null;
  const step = rarityStep(gem.rarity, content);
  const up = content.minerals.filter((/** @type {Mineral} */ mineral) => mineral.kind === 'gem' && rarityStep(mineral.rarity, content) > step);
  up.sort((/** @type {Mineral} */ a, /** @type {Mineral} */ b) => rarityStep(a.rarity, content) - rarityStep(b.rarity, content));
  return up[0] ?? null;
}

// The przemiana of gems (913, the author 13.11.2026: „zrób droższą
// przemianę (chociaż 10 słabszych kamieni na lepszy)”): `count` times
// transmute.cost gems of one kind give `count` gems one rarity up, at once,
// with no work. Only into a gem the System shows at the level of
// Jubilerstwo (as its setting). Why it cannot be done, or null.
/**
 * @param {{ gemId: string, count: unknown, have: number, level: number }} ask
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function transmuteBlock({ gemId, count, have, level }, content) {
  const gem = content.mineralsById[gemId];
  if (gem?.kind !== 'gem') return { code: 'unknown_gem', message: 'Nie ma takiego kamienia.' };
  const next = nextGem(gemId, content);
  if (!next) return { code: 'top_gem', message: `${gem.name} to najrzadszy kamień. Nie ma go w co przemienić.` };
  if (next.level > level) return { code: 'locked', message: say(content.jewelcrafting.texts, 'hidden', 0, { level: next.level }) };
  if (!Number.isInteger(count) || /** @type {number} */ (count) < 1) return { code: 'invalid_count', message: 'Podaj, ile przemian.' };
  const cost = content.jewelcrafting.transmute.cost;
  if (have < /** @type {number} */ (count) * cost) return { code: 'no_minerals', message: `Brakuje: ${gem.name} (potrzeba ${/** @type {number} */ (count) * cost}).` };
  return null;
}

// The minerals after `count` przemiany of a gem: transmute.cost of it fewer
// for each, and one gem one rarity up more (a mineral at none goes away).
/**
 * @param {Record<string, number>} minerals
 * @param {string} gemId
 * @param {number} count
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function transmuteGems(minerals, gemId, count, content) {
  const next = /** @type {Mineral} */ (nextGem(gemId, content));
  const left = { ...minerals, [gemId]: (minerals[gemId] ?? 0) - count * content.jewelcrafting.transmute.cost, [next.id]: (minerals[next.id] ?? 0) + count };
  if (left[gemId] <= 0) delete left[gemId];
  return left;
}

// The report of a work in the Szlifiernia: a line about the place from the
// seed, whether the player called it back early, the profession's new levels
// with their stats and the patterns and gems the System opened with them,
// and the character's XP; and then for an order of jewellery the jewels made
// and those that failed, or for a gem set (`set`: the gem, the item after
// it, or null when the item was gone and the gem came back, and the gem
// that was in it before). `learned`: the patterns the character learned by
// taking jewels apart, which a new level does not reveal again.
/**
 * @typedef {object} JewelWork A finished work of the Szlifiernia, as the server hands it over.
 * @property {Base} [base] The pattern of an order of jewellery (none for a gem set).
 * @property {string} [rarityId] The rarity of the order's jewels.
 * @property {JewelResult[]} [results] The order's jewels.
 * @property {{ gem: string, item?: Item | null, core?: boolean, replaced?: string | null }} [set] A gem set instead of an order: in an item, or in the Rdzeń (`core`).
 * @property {string[]} [learned]
 * @property {number} minutes
 * @property {number} startedAt
 * @property {number} endsAt
 * @property {string} seed
 * @property {boolean} [stopped]
 * @property {{ level: number }} before The profession before the work.
 * @property {{ level: number, xp: number, gained?: number }} after The profession after it (workProfession).
 * @property {{ level: number } & Record<string, any>} character The character before the work.
 * @property {number} xp
 * @property {{ level: number, timePoints: number, messages: string[] } & Record<string, any>} work The character's gains (workGains).
 */
/**
 * @param {JewelWork} done
 * @param {Content} content
 */
export function jewelReport({ base, rarityId, results = [], set, learned = [], minutes, startedAt, endsAt, seed, stopped, before, after, character, xp, work }, content) {
  const { jewelcrafting } = content;
  const texts = jewelcrafting.texts;
  const profession = content.professionsById[jewelcrafting.profession];
  /** @param {number} level */
  const opened = (level) => level > before.level && level <= after.level;
  const patterns = jewelBases(content).filter((candidate) => opened(jewelPatternLevel(candidate, content)) && !learned.includes(candidate.id));
  /** @type {Mineral[]} */
  const gems = content.minerals.filter((/** @type {Mineral} */ mineral) => mineral.kind === 'gem' && opened(mineral.level));
  const report = {
    kind: 'jewels',
    placeName: jewelcrafting.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: patterns.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...(patterns.length > 0 ? [say(texts, 'revealed', 0, { patterns: patterns.map((candidate) => candidate.name).join(', ') })] : []),
      ...gems.map((gem, index) => say(texts, 'gem', index, { gem: gem.name })),
      ...work.messages,
    ],
  };
  if (set) {
    const gem = content.mineralsById[set.gem];
    const replaced = (set.item || set.core) && set.replaced ? content.mineralsById[set.replaced] : null;
    // A gem set in the Rdzeń (core.js) names it as the item.
    const target = set.core ? (content.slotsById.core?.name ?? null) : set.item ? itemName(set.item, content) : null;
    return {
      ...report,
      set: {
        gem: gemView(gem.id, content),
        item: set.item ? itemView(set.item, content) : null,
        ...(set.core && { core: true }),
        text: target ? say(texts, 'set', 0, { gem: gem.name, item: target }) : say(texts, 'missing', 0, { gem: gem.name }),
        replaced: replaced ? say(texts, 'replaced', 0, { gem: replaced.name }) : null,
      },
    };
  }
  const pattern = /** @type {Base} */ (base);
  const made = results.filter((result) => result.made).map((result) => /** @type {Item} */ (result.item));
  const failed = results.length - made.length;
  return {
    ...report,
    base: { id: pattern.id, name: pattern.name },
    rarity: { id: rarityId, name: content.raritiesById[/** @type {string} */ (rarityId)].name },
    items: made.map((item) => itemView(item, content)),
    failed,
    made: made.length > 0 ? say(texts, 'made', 0, { items: countList({ [pattern.id]: made.length }, content.basesById) }) : null,
    // Where the jewels made wait: the Przechowalnia, out of the bag (842).
    stored: made.length > 0 ? say(texts, 'stored', 0) : null,
    failedText: failed > 0 ? say(texts, 'failed', 0, { items: countList({ [pattern.id]: failed }, content.basesById) }) : null,
  };
}
