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
// character has met.

import { generateItem, itemView } from './items.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

// The bases of the slots the workshop makes, in the data's order.
export const craftableBases = (content) => content.bases.filter((base) => content.workshop.parts[base.slot]);

// The profession level a base's pattern opens at: the first base of a family
// at once, a later one (classLevel) from laterPatternLevel.
export const patternLevel = (base, content) => (base.classLevel ? content.workshop.laterPatternLevel : 1);

// The patterns the System shows at a level of the crafting profession.
export const knownPatterns = (level, content) => craftableBases(content).filter((base) => patternLevel(base, content) <= level);

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

// The minutes of one item of a rarity at a level: rarityTime times longer
// for each rarity up, and each level takes speedPerLevel of the first
// level's time off, down to `fastest` of it.
export function itemMinutes(rarityId, level, content) {
  const { itemMinutes: minutes, rarityTime, speedPerLevel, fastest } = content.workshop;
  return minutes * rarityTime ** (rarityStep(rarityId, content) - 1) * Math.max(fastest, 1 - speedPerLevel * (level - 1));
}

// An order of `count` items in whole minutes, rounded up (and to a
// thousandth first, as brewMinutes does).
export const orderMinutes = (count, rarityId, level, content) => Math.ceil(Math.round(count * itemMinutes(rarityId, level, content) * 1000) / 1000);

// What `count` items of a base and rarity take: the parts of the rarity, by
// id, and the camp's resources, by id: stone per part and rarity step for
// anything, and as much of `extra` per part and step in wood or iron ore for
// the families made of them.
export function craftCost(base, rarityId, count, content) {
  const { parts, resources } = content.workshop;
  const each = parts[base.slot];
  const step = rarityStep(rarityId, content);
  const family = base.family ?? base.id;
  const extra = Object.entries(resources.families).find(([, families]) => families.includes(family))?.[0];
  return {
    parts: { [content.partsByRarity[rarityId].id]: each * count },
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

// The `count` items of an order, one after another from the seed: whether
// each came out and, if so, the item. An order stopped early keeps the
// draws of the items it made.
export function craftItems({ baseId, rarityId, count, level, professionLevel, met = [], seed }, content) {
  const rng = createRng(seed);
  const chance = craftChance(rarityId, professionLevel, content);
  const area = metNames(met, content);
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const made = rng.chance(chance);
    results.push(made ? { made, item: generateItem({ baseId, level, rarityId, area }, rng, content) } : { made });
  }
  return results;
}

// The report of an order: a line about the workshop from the seed, the
// items made and those that failed, the profession's new levels with their
// stats and the patterns and rarities the System opened with them, and the
// character's XP. `stopped`: the player called the character back before
// the end.
export function workshopReport({ base, rarityId, results, minutes, startedAt, endsAt, seed, stopped, before, after, character, xp, work }, content) {
  const { workshop } = content;
  const texts = workshop.texts;
  const profession = content.professionsById[workshop.profession];
  const opened = (level) => level > before.level && level <= after.level;
  const patterns = craftableBases(content).filter((candidate) => opened(patternLevel(candidate, content)));
  const rarities = workshop.rarities.filter((rarity) => opened(rarity.level));
  const made = results.filter((result) => result.made).map((result) => result.item);
  const failed = results.length - made.length;
  return {
    kind: 'items',
    placeName: workshop.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    base: { id: base.id, name: base.name },
    rarity: { id: rarityId, name: content.raritiesById[rarityId].name },
    items: made.map((item) => itemView(item, content)),
    failed,
    made: made.length > 0 ? say(texts, 'made', 0, { items: countList({ [base.id]: made.length }, content.basesById) }) : null,
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
