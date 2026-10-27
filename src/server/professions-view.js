// The professions as the page draws them, and the herbs and potions in the
// bag. Kept apart from professions.js, which needs characters.js, so that
// characters.js can draw the view without a loop between the two.

import {
  baseClasses,
  craftChance,
  craftCost,
  craftableBases,
  fightKind,
  gatheringMinutes,
  herbSlots,
  herbsPerHour,
  isUnlocked,
  itemMinutes,
  mostPotions,
  patternLevel,
  potionMinutes,
  potionPrice,
  professionStatBonus,
  professionState,
  professionXpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import { professionsOn } from './features.js';
import { say } from '../engine/text.js';

// The herbs and the potions the character carries, by id, as the row keeps
// them.
export const herbsOf = (row) => JSON.parse(row.herbs ?? '{}');
export const potionsOf = (row) => JSON.parse(row.potions ?? '{}');

// The herbs in the bag, one entry for each herb, with the scrapper's price of
// one at the camp's Skup złomu (sellBonus). The page splits them into stacks.
export function bagHerbs(row, sellBonus) {
  const herbs = herbsOf(row);
  return content.herbs
    .filter((herb) => (herbs[herb.id] ?? 0) > 0)
    .map((herb) => ({
      id: herb.id,
      name: herb.name,
      description: herb.description,
      count: herbs[herb.id],
      price: herb.price * (1 + sellBonus),
    }));
}

// The potions in the bag, as the herbs: one entry for each, with the
// scrapper's price of one, and how it is used (potions.js): `heal` and
// `mana` work by themselves in fights and go along on explorations, a
// healing and a speed potion can be drunk from the bag (`drink`).
export function bagPotions(row, sellBonus) {
  const potions = potionsOf(row);
  return content.potions
    .filter((potion) => (potions[potion.id] ?? 0) > 0)
    .map((potion) => ({
      id: potion.id,
      name: potion.name,
      description: potion.description,
      count: potions[potion.id],
      price: potionPrice(potion, content) * (1 + sellBonus),
      fight: fightKind(potion),
      drink: Boolean(potion.effect.heal || potion.effect.speed),
    }));
}

// The Profesje tab: each profession with its level and the stats it gave;
// the gathering of Zielarstwo: its place, the slider, how many herbs at
// once, and each herb, known or hidden by the System; and the brewing of
// Alchemia: its place, a potion's minutes and each recipe, known (with its
// herbs and the most potions at once) or hidden; and the Warsztat of
// Rzemieślnictwo: its place, the slots with their patterns, known (with what
// one item takes) or hidden, and the rarities. Null while the professions
// are hidden in this deployment or not unlocked yet.
export function professionsView(row) {
  if (!professionsOn() || !isUnlocked('professions', row.level, content)) return null;
  const professions = JSON.parse(row.professions ?? '{}');
  const herbs = herbsOf(row);
  const potions = potionsOf(row);
  const { gathering, brewing, workshop } = content;
  const gatherer = professionState(professions, gathering.profession);
  const brewer = professionState(professions, brewing.profession);
  const crafter = professionState(professions, workshop.profession);
  const hidden = content.professionTexts.hidden;
  return {
    list: content.professions.map((profession) => {
      const { level, xp } = professionState(professions, profession.id);
      return {
        id: profession.id,
        name: profession.name,
        kind: profession.kind,
        description: profession.description,
        soon: Boolean(profession.soon),
        level,
        xp,
        xpToNext: level < profession.maxLevel ? professionXpToNext(profession, level) : 0,
        maxLevel: profession.maxLevel,
        stats: profession.stats.map((stat) => ({ id: stat, name: content.statsById[stat].name, bonus: professionStatBonus(profession, level) })),
      };
    }),
    gathering: {
      professionId: gathering.profession,
      place: gathering.place,
      minutes: gatheringMinutes(content),
      spread: gathering.spread,
      // How many herbs at once now, and from which levels more.
      slots: herbSlots(gatherer.level, content),
      slotLevels: gathering.slots,
      stack: content.professionRules.stack,
      herbs: content.herbs.map((herb) =>
        herb.level <= gatherer.level
          ? {
              id: herb.id,
              name: herb.name,
              description: herb.description,
              level: herb.level,
              perHour: herbsPerHour(herb, gatherer.level, content),
              count: herbs[herb.id] ?? 0,
            }
          : { id: herb.id, level: herb.level, hidden: true, hint: say({ hidden }, 'hidden', 0, { level: herb.level }) },
      ),
    },
    // Potions on explorations: the healing mark to choose from, and how
    // many fights (and so potions of a kind) each length has.
    potionUse: {
      healBelow: content.potionUse.healBelow,
      healBelowChoices: content.potionUse.healBelowChoices,
      fightsByMinutes: content.balance.hunt.fightsByMinutes,
    },
    brewing: {
      professionId: brewing.profession,
      place: brewing.place,
      // One potion's minutes at this level; a brewing of n takes n of them,
      // rounded up to a whole minute (brewMinutes).
      potionMinutes: potionMinutes(brewer.level, content),
      maxMinutes: brewing.maxMinutes,
      bonusChance: brewing.bonusChance,
      recipes: content.potions.map((potion) =>
        potion.level <= brewer.level
          ? {
              id: potion.id,
              name: potion.name,
              description: potion.description,
              level: potion.level,
              herbs: Object.entries(potion.herbs).map(([id, need]) => ({ id, name: content.herbsById[id].name, need, have: herbs[id] ?? 0 })),
              count: potions[potion.id] ?? 0,
              most: mostPotions(potion, brewer.level, herbs, content),
            }
          : { id: potion.id, level: potion.level, hidden: true, hint: say(brewing.texts, 'hidden', 0, { level: potion.level }) },
      ),
    },
    workshop: workshopView(crafter.level),
  };
}

// The Warsztat at a level of Rzemieślnictwo. What one item of a pattern
// takes is told for common gear: the parts of the rarity chosen, and the
// resources times the rarity's step (craftCost). A rarity's minutes are of
// one item at this level; an order of n takes n of them, rounded up to a
// whole minute (orderMinutes).
function workshopView(level) {
  const { workshop } = content;
  const hint = (from) => say(workshop.texts, 'hidden', 0, { level: from });
  const bases = craftableBases(content);
  return {
    professionId: workshop.profession,
    place: workshop.place,
    maxCount: workshop.maxCount,
    // The slots in the order of the parts they take, the weapon first.
    slots: Object.keys(workshop.parts)
      .map((id) => content.slotsById[id])
      .map((slot) => ({
        id: slot.id,
        name: slot.name,
        patterns: bases
          .filter((base) => base.slot === slot.id)
          .map((base) => {
            const from = patternLevel(base, content);
            if (from > level) return { id: base.id, level: from, hidden: true, hint: hint(from) };
            const one = craftCost(base, 'common', 1, content);
            const classIds = baseClasses(base.id, content);
            return {
              id: base.id,
              name: base.name,
              level: from,
              parts: Object.values(one.parts)[0],
              resources: Object.entries(one.resources).map(([id, amount]) => ({ id, name: content.resourcesById[id].name, amount })),
              classNames: classIds && classIds.map((id) => content.classesById[id].name),
              classLevel: base.classLevel ?? null,
            };
          }),
      })),
    rarities: workshop.rarities.map((rarity) => {
      const { name, color } = content.raritiesById[rarity.id];
      const part = content.partsByRarity[rarity.id];
      return {
        id: rarity.id,
        name,
        color,
        level: rarity.level,
        step: content.rarities.findIndex((candidate) => candidate.id === rarity.id) + 1,
        part: { id: part.id, name: part.name },
        ...(rarity.level <= level
          ? { chance: craftChance(rarity.id, level, content), itemMinutes: itemMinutes(rarity.id, level, content) }
          : { hidden: true, hint: hint(rarity.level) }),
      };
    }),
  };
}
