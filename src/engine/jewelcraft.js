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

// The bases of the slots Jubilerstwo makes (its `ores`), in the data's order.
export const jewelBases = (content) => content.bases.filter((base) => content.jewelcrafting.ores[base.slot]);

// The profession level a base's pattern opens at, as in the Warsztat: the
// first base of a family at once, a later one from laterPatternLevel, and
// not before the class level it asks for.
export const jewelPatternLevel = (base, content) => (base.classLevel ? Math.max(content.jewelcrafting.laterPatternLevel, base.classLevel) : 1);

// The patterns a level of Jubilerstwo knows.
export const knownJewelPatterns = (level, content) => jewelBases(content).filter((base) => jewelPatternLevel(base, content) <= level);

// The gem that gives jewellery a rarity, and the ore its setting takes.
export const gemOf = (rarityId, content) => content.minerals.find((mineral) => mineral.kind === 'gem' && mineral.rarity === rarityId);
export const oreOf = (rarityId, content) => content.minerals.find((mineral) => mineral.kind === 'ore' && mineral.for.includes(rarityId));

// The gems a level of Jubilerstwo cuts and sets: those Górnictwo finds by
// the same level of its own.
export const knownGems = (level, content) => content.minerals.filter((mineral) => mineral.kind === 'gem' && mineral.level <= level);

// The chance a jewel of a rarity comes out at a level: every level adds
// chancePerLevel, up to maxChance, unless the rarity always comes out.
export function jewelChance(rarityId, level, content) {
  const { chances, chancePerLevel, maxChance } = content.jewelcrafting;
  const chance = chances[rarityId];
  return chance >= 1 ? 1 : Math.min(maxChance, chance + chancePerLevel * (level - 1));
}

// A rarity's step: 1 for common, 2 for rare and so on.
const rarityStep = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId) + 1;

// The share of the first level's time a level takes: each level takes
// speedPerLevel of it off, down to `fastest` of it.
const pace = (level, content) => Math.max(content.jewelcrafting.fastest, 1 - content.jewelcrafting.speedPerLevel * (level - 1));

// Minutes rounded up to whole ones (and to a thousandth first, as the
// Warsztat's orders).
const wholeMinutes = (minutes) => Math.ceil(Math.round(minutes * 1000) / 1000);

// The minutes of one jewel of a rarity at a level: rarityTime times longer
// for each rarity up, at the level's pace; and an order of `count` in whole
// minutes.
export function jewelMinutes(rarityId, level, content) {
  const { itemMinutes, rarityTime } = content.jewelcrafting;
  return itemMinutes * rarityTime ** (rarityStep(rarityId, content) - 1) * pace(level, content);
}
export const jewelOrderMinutes = (count, rarityId, level, content) => wholeMinutes(count * jewelMinutes(rarityId, level, content));

// What `count` jewels of a base and rarity take, by mineral id: a gem of
// the rarity each, and the ore of its setting, as much as the slot takes.
export function jewelCost(base, rarityId, count, content) {
  return { [gemOf(rarityId, content).id]: count, [oreOf(rarityId, content).id]: content.jewelcrafting.ores[base.slot] * count };
}

// The `count` jewels of an order, one after another from the seed: whether
// each came out and, if so, the item, of the gem's rarity at the
// character's level, with affixes named by the creatures met. An order
// stopped early keeps the draws of the jewels it made.
export function craftJewels({ baseId, rarityId, count, level, professionLevel, met = [], seed }, content) {
  const rng = createRng(seed);
  const chance = jewelChance(rarityId, professionLevel, content);
  const area = metNames(met, content);
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
export function setMinutes(gemId, level, content) {
  const { minutes, rarityTime } = content.jewelcrafting.setting;
  return wholeMinutes(minutes * rarityTime ** (rarityStep(content.mineralsById[gemId].rarity, content) - 1) * pace(level, content));
}

// The report of a work in the Szlifiernia: a line about the place from the
// seed, whether the player called it back early, the profession's new levels
// with their stats and the patterns and gems the System opened with them,
// and the character's XP; and then for an order of jewellery the jewels made
// and those that failed, or for a gem set (`set`: the gem, the item after
// it, or null when the item was gone and the gem came back, and the gem
// that was in it before).
export function jewelReport({ base, rarityId, results = [], set, minutes, startedAt, endsAt, seed, stopped, before, after, character, xp, work }, content) {
  const { jewelcrafting } = content;
  const texts = jewelcrafting.texts;
  const profession = content.professionsById[jewelcrafting.profession];
  const opened = (level) => level > before.level && level <= after.level;
  const patterns = jewelBases(content).filter((candidate) => opened(jewelPatternLevel(candidate, content)));
  const gems = content.minerals.filter((mineral) => mineral.kind === 'gem' && opened(mineral.level));
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
    const replaced = set.item && set.replaced ? content.mineralsById[set.replaced] : null;
    return {
      ...report,
      set: {
        gem: gemView(gem.id, content),
        item: set.item ? itemView(set.item, content) : null,
        text: set.item ? say(texts, 'set', 0, { gem: gem.name, item: itemName(set.item, content) }) : say(texts, 'missing', 0, { gem: gem.name }),
        replaced: replaced ? say(texts, 'replaced', 0, { gem: replaced.name }) : null,
      },
    };
  }
  const made = results.filter((result) => result.made).map((result) => result.item);
  const failed = results.length - made.length;
  return {
    ...report,
    base: { id: base.id, name: base.name },
    rarity: { id: rarityId, name: content.raritiesById[rarityId].name },
    items: made.map((item) => itemView(item, content)),
    failed,
    made: made.length > 0 ? say(texts, 'made', 0, { items: countList({ [base.id]: made.length }, content.basesById) }) : null,
    failedText: failed > 0 ? say(texts, 'failed', 0, { items: countList({ [base.id]: failed }, content.basesById) }) : null,
  };
}
