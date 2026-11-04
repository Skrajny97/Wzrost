// The professions as the page draws them, and the herbs and potions in the
// bag. Kept apart from professions.js, which needs characters.js, so that
// characters.js can draw the view without a loop between the two.

import {
  baseClasses,
  carryLimit,
  catalystChance,
  craftChance,
  craftCost,
  craftLuck,
  craftUpgrades,
  craftableBases,
  fightKind,
  gatheringMinutes,
  gemOf,
  herbSlots,
  herbsPerHour,
  isUnlocked,
  itemMinutes,
  jewelBases,
  jewelChance,
  jewelMinutes,
  jewelPatternLevel,
  materialView,
  mineralsPerHour,
  miningMinutes,
  mostPotions,
  oreOf,
  parseStack,
  partSource,
  patternLevel,
  potionMinutes,
  potionPrice,
  professionOpen,
  professionStatBonus,
  professionState,
  professionUnlockLevel,
  professionXpToNext,
  scrollMinutes,
  setMinutes,
  timedKind,
  veinGoldPerHour,
} from '../engine/index.js';
import { content } from './content.js';
import { craftingOn, professionsOn } from './features.js';
import { perkOf } from './perks.js';
import { say } from '../engine/text.js';

// The herbs and the potions the character carries, by id, as the row keeps
// them.
export const herbsOf = (row) => JSON.parse(row.herbs ?? '{}');
export const potionsOf = (row) => JSON.parse(row.potions ?? '{}');
// The gems and ores of Górnictwo, by id, which take no room in the bag.
export const mineralsOf = (row) => JSON.parse(row.minerals ?? '{}');

// A mineral's colour: a gem's rarity's, an ore's that of the first rarity
// whose jewellery it sets.
const mineralColor = (mineral) => content.raritiesById[mineral.rarity ?? mineral.for[0]].color;

// The minerals in the bag, one entry for each, with the scrapper's price of
// one at the camp's Skup złomu (sellBonus), as the herbs; a gem with the
// rarity it gives jewellery and its bonus when set.
export function bagMinerals(row, sellBonus) {
  const minerals = mineralsOf(row);
  return content.minerals
    .filter((mineral) => (minerals[mineral.id] ?? 0) > 0)
    .map((mineral) => ({
      id: mineral.id,
      kind: mineral.kind,
      name: mineral.name,
      description: mineral.description,
      count: minerals[mineral.id],
      price: mineral.price * (1 + sellBonus),
      color: mineralColor(mineral),
      ...(mineral.kind === 'gem'
        ? { rarityName: content.raritiesById[mineral.rarity].name, bonus: mineral.setBonus }
        : { rarityNames: mineral.for.map((id) => content.raritiesById[id].name) }),
    }));
}

// A recipe's catalyst (proposal 3: "Wybrane mikstury biorą jeden materiał
// stwora"): the material, and the grades of it the character has, each with
// its chance of an extra potion, the commonest first.
function catalystView(potion, materials) {
  if (!potion.catalyst) return null;
  const material = content.materialsById[potion.catalyst];
  const index = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
  return {
    id: material.id,
    name: material.name,
    stacks: Object.entries(materials)
      .filter(([key]) => parseStack(key).materialId === material.id)
      .map(([key, count]) => ({ ...materialView(key, count, content), chance: content.brewing.bonusChance + catalystChance(key, content) }))
      .sort((a, b) => index(a.rarity) - index(b.rarity)),
  };
}

// Whether the character knows the recipe of a potion: only then may it use
// one, so a potion got in a Wymiana waits for its recipe, and for the
// Alchemia itself (the author: "Jeśli gracz w wyniku wymiany wejdzie w
// posiadanie mikstury jakiejś przed odblokowaniem jej receptury albo w ogóle
// nawet Profesji Alchemii to nie może jej użyć").
export function potionKnown(row, potion) {
  if (!professionsOn() || !isUnlocked('professions', row.level, content)) return false;
  const alchemy = content.professions.find((profession) => profession.id === content.brewing.profession);
  const { level } = professionState(JSON.parse(row.professions ?? '{}'), alchemy.id);
  return professionOpen(alchemy, row.level, content) && potion.level <= level;
}

// The potions the character carries whose recipes it knows.
export const knownPotionsOf = (row) => Object.fromEntries(Object.entries(potionsOf(row)).filter(([id]) => content.potionsById[id] && potionKnown(row, content.potionsById[id])));

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
// `mana`, `cure` or `revive` work by themselves in fights and go along on
// explorations (`carry` of them at most, null for one each fight), a healing
// potion and a potion for a time can be drunk from the bag (`drink`, with
// its `verb`).
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
      carry: carryLimit(potion, null),
      drink: Boolean(potion.effect.heal || timedKind(potion)),
      verb: potion.verb ?? 'Wypij',
      known: potionKnown(row, potion),
    }));
}

// The Profesje tab: the System's words at its top, each profession with its
// level and the stats it gave;
// the gathering of Zielarstwo: its place, the slider, how many herbs at
// once, and each herb, known or hidden by the System; and the brewing of
// Alchemia: its place, a potion's minutes and each recipe, known (with its
// herbs and the most potions at once) or hidden; and the Warsztat of
// Rzemieślnictwo: its place, the slots with their patterns, known (with what
// one item takes) or hidden, and the rarities, once Rzemieślnictwo opens.
// Null while the professions are hidden in this deployment or not unlocked
// yet.
export function professionsView(row) {
  if (!professionsOn() || !isUnlocked('professions', row.level, content)) return null;
  const professions = JSON.parse(row.professions ?? '{}');
  const herbs = herbsOf(row);
  const potions = potionsOf(row);
  const materials = JSON.parse(row.materials ?? '{}');
  const { gathering, brewing, workshop } = content;
  const gatherer = professionState(professions, gathering.profession);
  const brewer = professionState(professions, brewing.profession);
  const crafter = professionState(professions, workshop.profession);
  const hidden = content.professionTexts.hidden;
  return {
    // The System's words at the top of the tab.
    intro: content.professionsIntro,
    list: content.professions.map((profession) => {
      const { level, xp } = professionState(professions, profession.id);
      return {
        id: profession.id,
        name: profession.name,
        kind: profession.kind,
        description: profession.description,
        // Rzemieślnictwo waits locked where it is switched off.
        soon: Boolean(profession.soon) || (profession.id === workshop.profession && !craftingOn()),
        // A profession that opens later than the tab waits for its level.
        locked: !professionOpen(profession, row.level, content),
        unlockLevel: professionUnlockLevel(profession, content),
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
              catalyst: catalystView(potion, materials),
              count: potions[potion.id] ?? 0,
              most: mostPotions(potion, brewer.level, herbs, content),
            }
          : { id: potion.id, level: potion.level, hidden: true, hint: say(brewing.texts, 'hidden', 0, { level: potion.level }) },
      ),
    },
    workshop: craftingOn() && professionOpen(content.professionsById[workshop.profession], row.level, content) ? workshopView(crafter.level, row) : null,
    // The squares' rows on the tab, gathering over crafting.
    rows: content.professionRows,
    // Górnictwo and Jubilerstwo, from their level (25 for both).
    mining: professionOpen(content.professionsById[content.mining.profession], row.level, content)
      ? miningView(professionState(professions, content.mining.profession).level, row)
      : null,
    jewelcrafting: professionOpen(content.professionsById[content.jewelcrafting.profession], row.level, content)
      ? jewelView(professionState(professions, content.jewelcrafting.profession).level, row)
      : null,
  };
}

// The Systemowa Kopalnia at a level of Górnictwo: its place, the slider, the
// gold of the veins an hour at the character's level, the words under "Jak
// to działa?", and each mineral, known (with how many an hour and in the
// bag) or hidden by the System.
function miningView(level, row) {
  const { mining } = content;
  const minerals = mineralsOf(row);
  const percent = (share) => String(Math.round(share * 100));
  return {
    professionId: mining.profession,
    place: mining.place,
    minutes: miningMinutes(content),
    spread: mining.spread,
    veinsPerHour: mining.veins.perHour,
    goldPerHour: veinGoldPerHour(row.level, content),
    about: mining.about.map((_, index) => say(mining, 'about', index, { yield: percent(mining.yieldPerLevel), share: percent(mining.veins.share) })),
    minerals: content.minerals.map((mineral) =>
      mineral.level <= level
        ? {
            id: mineral.id,
            kind: mineral.kind,
            name: mineral.name,
            level: mineral.level,
            color: mineralColor(mineral),
            perHour: mineralsPerHour(mineral, level, content),
            count: minerals[mineral.id] ?? 0,
          }
        : { id: mineral.id, kind: mineral.kind, level: mineral.level, hidden: true, hint: say(mining.texts, 'hidden', 0, { level: mineral.level }) },
    ),
  };
}

// The Systemowa Szlifiernia at a level of Jubilerstwo: its place and the
// words under "Jak to działa?"; the slots with their patterns, known or
// hidden; each rarity with its gem and ore (and how many the character has),
// and, once its gem is known, the chance and the minutes of one jewel; and
// the gems to set, with their bonus and the minutes of setting one, or the
// level the System shows them at. A pattern learned by taking a jewel apart
// is known before its level (`learned`), as in the Warsztat.
function jewelView(level, row) {
  const { jewelcrafting } = content;
  const minerals = mineralsOf(row);
  const learned = JSON.parse(row.patterns ?? '[]');
  const hint = (from) => say(jewelcrafting.texts, 'hidden', 0, { level: from });
  const bases = jewelBases(content);
  const owned = (mineral) => ({ id: mineral.id, name: mineral.name, have: minerals[mineral.id] ?? 0 });
  return {
    professionId: jewelcrafting.profession,
    place: jewelcrafting.place,
    maxCount: jewelcrafting.maxCount,
    about: jewelcrafting.about,
    slots: Object.keys(jewelcrafting.ores).map((slotId) => ({
      id: slotId,
      name: content.slotsById[slotId].name,
      ores: jewelcrafting.ores[slotId],
      patterns: bases
        .filter((base) => base.slot === slotId)
        .map((base) => {
          const from = jewelPatternLevel(base, content);
          const taught = from > level && learned.includes(base.id);
          if (from > level && !taught) return { id: base.id, level: from, hidden: true, hint: hint(from) };
          return { id: base.id, name: base.name, level: from, classLevel: base.classLevel ?? null, ...(taught && { learned: true }) };
        }),
    })),
    rarities: content.rarities.map((rarity) => {
      const gem = gemOf(rarity.id, content);
      return {
        id: rarity.id,
        name: rarity.name,
        color: rarity.color,
        level: gem.level,
        gem: owned(gem),
        ore: owned(oreOf(rarity.id, content)),
        ...(gem.level <= level ? { chance: jewelChance(rarity.id, level, content), itemMinutes: jewelMinutes(rarity.id, level, content) } : { hidden: true, hint: hint(gem.level) }),
      };
    }),
    gems: content.minerals
      .filter((mineral) => mineral.kind === 'gem')
      .map((gem) =>
        gem.level <= level
          ? { id: gem.id, name: gem.name, color: mineralColor(gem), bonus: gem.setBonus, have: minerals[gem.id] ?? 0, minutes: setMinutes(gem.id, level, content) }
          : { id: gem.id, level: gem.level, hidden: true, hint: hint(gem.level) },
      ),
  };
}

// The Warsztat at a level of Rzemieślnictwo, for the character's row. What
// one item of a pattern takes is told for common gear at the character's
// level: the parts of the rarity chosen, and the resources times the
// rarity's step (craftCost). A rarity's minutes are of one item at this
// level; an order of n takes n of them, rounded up to a whole minute
// (orderMinutes). A pattern learned by taking an item apart is known before
// its level (`learned`). Then the upgrades a made item may come with, and
// the Zwoje ochronne: what one takes, its minutes and those the character
// has, or the level the System shows them at. The minutes and the luck are
// the character's own, with the Bractwo Kowali's perks (590).
function workshopView(level, row) {
  const { workshop } = content;
  const faster = perkOf(row, 'workshopFaster');
  const hint = (from) => say(workshop.texts, 'hidden', 0, { level: from });
  const bases = craftableBases(content);
  const learned = JSON.parse(row.patterns ?? '[]');
  // A scroll for the Kowadło as the Warsztat shows it: what one takes, its
  // minutes and those the character has, or the level it opens at.
  const scrollView = (scroll, owned) => {
    const part = content.partsById[scroll.part];
    return {
      id: scroll.id,
      name: scroll.name,
      description: scroll.description,
      level: scroll.level,
      owned,
      ...(scroll.level <= level
        ? { part: { id: part.id, name: part.name }, parts: scroll.parts, minutes: scrollMinutes(level, content, faster, scroll) }
        : { hidden: true, hint: hint(scroll.level) }),
    };
  };
  return {
    professionId: workshop.profession,
    place: workshop.place,
    maxCount: workshop.maxCount,
    upgrades: craftUpgrades(level, content),
    // The chances of an item one or two rarities above the ordered one.
    luck: craftLuck(level, content, perkOf(row, 'workshopLuck')),
    upgradesFrom: workshop.upgrades[0].level,
    // Parts of a rarity for one of the next, at once (exchangeParts): each
    // part with the one it is had for.
    exchange: {
      ...workshop.exchange,
      parts: content.parts.map((part) => ({ id: part.id, from: partSource(part.id, content)?.partId })).filter((part) => part.from),
    },
    scroll: scrollView(workshop.scroll, row.scrolls),
    // The Zwój utrwalenia (the author's of 4.11.2026, 599 B).
    steadyScroll: scrollView(workshop.steadyScroll, row.steady_scrolls ?? 0),
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
            const taught = from > level && learned.includes(base.id);
            if (from > level && !taught) return { id: base.id, level: from, hidden: true, hint: hint(from) };
            const one = craftCost(base, 'common', 1, row.level, content);
            const classIds = baseClasses(base.id, content);
            return {
              id: base.id,
              name: base.name,
              level: from,
              parts: Object.values(one.parts)[0],
              resources: Object.entries(one.resources).map(([id, amount]) => ({ id, name: content.resourcesById[id].name, amount })),
              classNames: classIds && classIds.map((id) => content.classesById[id].name),
              classLevel: base.classLevel ?? null,
              ...(taught && { learned: true }),
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
          ? { chance: craftChance(rarity.id, level, content), itemMinutes: itemMinutes(rarity.id, level, content, faster) }
          : { hidden: true, hint: hint(rarity.level) }),
      };
    }),
  };
}
