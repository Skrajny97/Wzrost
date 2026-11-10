// Items: a base plus affixes that share a stat budget set by the item level
// and rarity. The base always gets the budget of the lowest rarity, so a rarer
// item is never weaker at its core; the affixes share what the rarity adds.
// Names follow the Gladiatus pattern "Prefix Base Suffix", with the prefix
// agreeing with the base's grammatical gender. The names of the affixes come
// from the creatures living where the item was found, and only name them:
// what an affix gives rolls the same anywhere. The Kowadło in the camp
// upgrades an item from +1 to +10, which raises all of its numbers.

import { rarityNeedView } from './crafting.js';
import { budget, weaponDamage } from './formulas.js';
import { say, word } from './text.js';

// `affixIds` picks the affixes instead of rolling them (tests, simulations).
// `area` is the inner region the item was found in: its creatures name the
// affixes (nameAffixes). Without one, an affix goes by its own creature.
export function generateItem({ baseId, level, rarityId = 'common', element, affixIds, area }, rng, content) {
  const base = content.basesById[baseId];
  const rarity = content.raritiesById[rarityId];
  const tuning = content.balance.items;
  const baseShare = budget(level, content.rarities[0].budget, content.balance);
  const share = affixShare(level, rarityId, content);

  const item = { base: base.id, slot: base.slot, level, rarity: rarity.id, affixes: [] };
  // A later base of a family is stronger by a flat bonus drawn once
  // (`bonus` in data/item-bases.json), so its lead stays the same at any
  // item level instead of growing with it.
  const bonus = base.bonus ? rng.int(base.bonus.min, base.bonus.max) : 0;
  if (base.kind === 'weapon') {
    const average = weaponDamage(baseShare, base.damageFactor, content.balance);
    const min = Math.max(1, Math.round(average * (1 - base.variance))) + bonus;
    item.damage = { min, max: Math.max(min, Math.round(average * (1 + base.variance)) + bonus) };
    if (base.elements) item.element = element ?? rng.pick(base.elements);
  } else if (base.kind === 'armor') {
    item.armor = Math.max(1, Math.round(baseShare * tuning.armorPerBudget * base.armorFactor)) + bonus;
  } else {
    const value = Math.max(1, Math.round(baseShare * tuning.statPerBudget * base.statFactor)) + bonus;
    item.implicit = { stat: base.stat, value };
  }

  if (affixIds) {
    for (const id of affixIds.slice(0, rarity.affixes)) {
      const affix = content.affixesById[id];
      const kind = content.prefixes.includes(affix) ? 'prefix' : 'suffix';
      item.affixes.push({ id, kind, stat: affix.stat, value: affixValue(affix.stat, share, tuning) });
    }
    if (area) nameAffixes(item.affixes, area, rng);
    return item;
  }

  let kind = rng.chance(0.5) ? 'prefix' : 'suffix';
  const used = new Set();
  for (let i = 0; i < rarity.affixes; i++) {
    const pool = (kind === 'prefix' ? content.prefixes : content.suffixes).filter((affix) => !used.has(affix.id));
    const affix = rng.weighted(pool);
    used.add(affix.id);
    item.affixes.push({ id: affix.id, kind, stat: affix.stat, value: affixValue(affix.stat, share, tuning) });
    kind = kind === 'prefix' ? 'suffix' : 'prefix';
  }
  if (area) nameAffixes(item.affixes, area, rng);
  return item;
}

// Each affix gets a creature of the place to name it (`monster`), after the
// numbers are drawn, so they stay as they would be anywhere: a prefix one
// with an adjective, a suffix any. A creature names one affix of an item
// while others are left, so there is no "Lisi Hełm Lisa". With no creature
// for its kind (only creatures without an adjective met, in the Warsztat)
// the affix keeps its own word (the code review: it threw).
function nameAffixes(affixes, area, rng) {
  const named = new Set();
  for (const affix of affixes) {
    const names = area.affixNames[affix.kind];
    if (names.length === 0) continue;
    const fresh = names.filter((name) => !named.has(name.monster));
    affix.monster = rng.pick(fresh.length > 0 ? fresh : names).monster;
    named.add(affix.monster);
  }
}

// The budget each affix of an item gets: what its rarity adds to the base's,
// shared among the rarity's affixes.
export function affixShare(level, rarityId, content) {
  const rarity = content.raritiesById[rarityId];
  if (rarity.affixes === 0) return 0;
  return (budget(level, rarity.budget, content.balance) - budget(level, content.rarities[0].budget, content.balance)) / rarity.affixes;
}

// What an affix of a stat gives at a share of the budget.
export function affixValue(stat, share, tuning) {
  const perBudget =
    stat === 'armor' ? tuning.armorPerBudget : stat.startsWith('resist.') ? tuning.resistancePerBudget : tuning.statPerBudget;
  return Math.max(1, Math.round(share * perBudget));
}

// `bonus` raises every rarity with affixes (the elite's chest), `unique`
// those from balance.hunt.uniqueLengthFrom up, unique and rarer, on a long
// exploration (482 B: "max +10%").
export function rollRarity(rng, content, bonus = 1, unique = 1) {
  const from = content.rarities.findIndex((rarity) => rarity.id === content.balance.hunt.uniqueLengthFrom);
  const raised = new Set(unique !== 1 && from >= 0 ? content.rarities.slice(from).map((rarity) => rarity.id) : []);
  return rng.weighted(content.rarities, (rarity) => rarity.dropWeight * (rarity.affixes > 0 ? bonus : 1) * (raised.has(rarity.id) ? unique : 1)).id;
}

// A family holds the bases of one kind of item, a category in the game, as
// in Metin2: the first for anyone, the next from a class level on
// (`classLevel`), each with its own picture and stronger numbers, all with
// the affixes of their rarity. A base names its family (`family` in
// data/item-bases.json) unless it is the family's first base, which goes by
// its own id. (`category` there is the kind of damage of a weapon.)
export const baseFamily = (base) => base.family ?? base.id;

// Weapons, off-hands and the armour of the head and chest belong to classes
// (weapons, offhands and armor in classes.json, by family); what no class
// lists, such as gloves, boots and jewellery, fits anyone. Returns the
// classes that can use a base, or null for all.
const GEAR = ['weapons', 'offhands', 'armor'];

export function baseClasses(baseId, content) {
  const family = baseFamily(content.basesById[baseId]);
  const classes = content.classes.filter((cls) => GEAR.some((key) => cls[key].includes(family)));
  return classes.length > 0 ? classes.map((cls) => cls.id) : null;
}

// The class level a base asks for (1 when it asks for none).
export const baseClassLevel = (baseId, content) => content.basesById[baseId].classLevel ?? 1;

// Whether a class can use a base: by its class, and, when the class level is
// given, by the level the base asks for.
export const canUse = (baseId, classId, content, classLevel) =>
  (baseClasses(baseId, content)?.includes(classId) ?? true) && (classLevel === undefined || classLevel >= baseClassLevel(baseId, content));

// Why a character of `classId` at `classLevel` cannot wear `item` now, as
// the Postać's "Załóż" refuses it (src/server/inventory.js): its slot is
// still locked ('slot_locked'), its class cannot use the base
// ('wrong_class'), or the base's Tier asks for a higher class level
// ('class_level'), whatever the item's own level; null when it can. The
// Targowisko's "Dla mnie" and the slot's list of items to wear (the author,
// 10.11.2026) ask the same.
export function equipBlock(item, classId, classLevel, content) {
  if (content.slotsById[item.slot]?.locked) return 'slot_locked';
  if (!canUse(item.base, classId, content)) return 'wrong_class';
  if (!canUse(item.base, classId, content, classLevel)) return 'class_level';
  return null;
}

// Loot favours the slots the character has empty, only ever holds what its
// class can use, and while it has no weapon a weapon is always one of its
// class. It picks a family, as often as if each had one base, and then one
// of the family's bases that ask for a class level up to `maxClassLevel`
// (on an exploration the top level of the place, in the weekly chest the
// class level; none given: the first base only), so a family with more bases
// drops no more often. `filled` is the set of slots already covered (worn,
// or found earlier in the same hunt); found items are added. `rarityId`
// gives the rarity instead of a roll (the weekly quest chest), and `area`
// the place whose creatures name the affixes (generateItem). With
// `otherClassShare` that share of the items is for another class instead
// (otherClassFamily), once the character has a weapon.
export function randomItem(level, rng, content, { rarityBonus = 1, uniqueBonus = 1, filled, classId, maxClassLevel = 1, rarityId, area, otherClassShare = 0 } = {}) {
  let family;
  let own = true;
  if (filled && classId && !filled.has('weapon')) {
    family = rng.pick(content.classesById[classId].weapons);
  } else if (classId && otherClassShare > 0 && rng.chance(otherClassShare)) {
    family = otherClassFamily(classId, rng, content);
    own = false;
  } else {
    const weight = content.balance.items.emptySlotWeight;
    const firsts = content.bases.filter((candidate) => baseFamily(candidate) === candidate.id && (!classId || canUse(candidate.id, classId, content)));
    family = rng.weighted(firsts, (candidate) => (filled && !filled.has(candidate.slot) ? weight : 1)).id;
  }
  const bases = content.bases.filter((candidate) => baseFamily(candidate) === family && baseClassLevel(candidate.id, content) <= maxClassLevel);
  // Only a real choice draws, so loot without one stays as it was.
  const base = bases.length === 1 ? bases[0] : rng.pick(bases);
  if (own) filled?.add(base.slot);
  return generateItem({ baseId: base.id, level, rarityId: rarityId ?? rollRarity(rng, content, rarityBonus, uniqueBonus), area }, rng, content);
}

// The family of an item for another class than `classId`: one of the other
// classes, as often each, and a family it uses and `classId` does not, for
// trading it or taking it apart in the Warsztat.
function otherClassFamily(classId, rng, content) {
  const other = rng.pick(content.classes.filter((cls) => cls.id !== classId)).id;
  const firsts = content.bases.filter((base) => baseFamily(base) === base.id && canUse(base.id, other, content));
  const theirs = firsts.filter((base) => !canUse(base.id, classId, content));
  return rng.pick(theirs.length > 0 ? theirs : firsts).id;
}

// What the scrapper or Jagna pays for `count` pieces at `unit` gold a
// piece: rounded down, so selling one piece at a time never pays more than
// selling them all at once (the author: "Powinno się móc tez sprzedać
// pojedyncze sztuki tego co mam u Zielarki a nie tylko wszystko"); at least
// a coin (every good is worth 2 gold or more a piece, so the coin never
// pays a piece above its worth).
export const saleGold = (unit, count) => Math.max(1, Math.floor(unit * count + 1e-9));

// Gold from the scrapper: level × goldPerLevel × the rarity's multiplier, and
// for an upgraded item a share of the gold its upgrades cost (sellRefund).
// `bonus`: the share the camp adds to the scrapper's prices (Skup złomu). It
// raises the item's own price only, so an upgrade never pays for itself. An
// item made upgraded in the Warsztat (`crafted`) cost no gold for the
// upgrades it came with, so only those of the Kowadło above them count.
export function sellPrice(item, content, bonus = 0) {
  const rarity = content.raritiesById[item.rarity];
  const price = Math.max(1, Math.round(item.level * content.balance.items.sellGoldPerLevel * rarity.sell * (1 + bonus)));
  let spent = 0;
  for (let target = (item.crafted?.upgrade ?? 0) + 1; target <= (item.upgrade ?? 0); target += 1) spent += itemUpgradeCost(item, target, content).gold;
  return price + Math.round(spent * content.balance.upgrades.sellRefund);
}

// When the bag holds more than its places, the scrapper buys the weakest
// items: those the class cannot use first, upgraded ones and those with a
// gem set in them (Jubilerstwo) last, then by rarity
// and level, a new find before an item already in the bag (it has an id).
// An item the owner marked as a favourite (`favorites`, the ids of its
// items; the author, 10.11.2026: "Do tego opcja dodawania do ulubionych, by
// przypadkiem nie rozebrać czegoś na później") is never sold: the weakest of
// the others go in its place, and with no other left the bag stays fuller
// than its places.
// Returns the indices of the items to sell.
export function bagOverflow(items, capacity, classId, content, favorites = new Set()) {
  const extra = items.length - capacity;
  if (extra <= 0) return [];
  const usable = (item) => (canUse(item.base, classId, content) ? 1 : 0);
  const upgraded = (item) => (item.upgrade > 0 || item.gem ? 1 : 0);
  const kept = (item) => (item.id === undefined ? 0 : 1);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.id === undefined || !favorites.has(item.id))
    .sort(
      (a, b) =>
        usable(a.item) - usable(b.item) ||
        upgraded(a.item) - upgraded(b.item) ||
        itemRank(a.item, content) - itemRank(b.item, content) ||
        kept(a.item) - kept(b.item) ||
        a.index - b.index,
    )
    .slice(0, extra)
    .map(({ index }) => index);
}

// An affix's word in a name: from the creature that named it, and on an item
// found before creatures of the place named affixes, from the affix's own
// creature, or its text (the five resistances named after no creature).
function affixWord(affix, gender, content) {
  const { monster = content.affixesById[affix.id].monster, kind } = affix;
  if (monster === undefined) return content.affixesById[affix.id].text;
  const name = content.affixNamesByMonster[monster];
  return kind === 'prefix' ? name.prefix[gender] : name.suffix;
}

export function itemName(item, content) {
  const base = content.basesById[item.base];
  const prefix = item.affixes.find((affix) => affix.kind === 'prefix');
  const suffix = item.affixes.find((affix) => affix.kind === 'suffix');
  return [prefix && affixWord(prefix, base.gender, content), base.name, suffix && affixWord(suffix, base.gender, content)]
    .filter(Boolean)
    .join(' ');
}

export function propertyName(stat, content) {
  if (stat === 'armor') return word(content, 'Pancerz');
  if (stat.startsWith('resist.')) return content.elementsById[stat.slice('resist.'.length)].resistance;
  return content.statsById[stat].name;
}

// The numbers of an item as it works: upgraded on the Kowadło, then raised
// by the gem set in it.
export function upgradedItem(item, content) {
  return withGemBonus(upgradeNumbers(item, content), content);
}

// The numbers of an upgraded item: each level of upgrade adds bonusPerLevel
// of every base number (damage, armor, stats), rounded, and at least
// minGainPerLevel to a weapon's damage and to anything else's armor. An item
// without armor of its own, like a talisman, gets that armor from the
// upgrade alone (the author: "może dawać chociaż +1 do pancerza przy każdym
// ulepszeniu"), so no level of upgrade leaves the numbers as they were.
function upgradeNumbers(item, content) {
  const level = item.upgrade ?? 0;
  if (!level) return item;
  const { bonusPerLevel, minGainPerLevel } = content.balance.upgrades;
  const factor = 1 + bonusPerLevel * level;
  const scale = (value) => Math.round(value * factor);
  const least = minGainPerLevel * level;
  const upgraded = { ...item, affixes: item.affixes.map((affix) => ({ ...affix, value: scale(affix.value) })) };
  if (item.damage) {
    const min = Math.max(scale(item.damage.min), item.damage.min + least);
    upgraded.damage = { min, max: Math.max(min, scale(item.damage.max), item.damage.max + least) };
  } else {
    upgraded.armor = Math.max(scale(item.armor ?? 0), (item.armor ?? 0) + least);
  }
  if (item.implicit) upgraded.implicit = { ...item.implicit, value: scale(item.implicit.value) };
  return upgraded;
}

// A gem set in an item (Jubilerstwo, jewelcraft.js) raises every number of it
// by the gem's setBonus (538 A: "Kamień podnosi wszystkie statystyki
// przedmiotu o procent"), each by at least 1, as an upgrade adds at least
// something: the damage, the armor, the implicit stat and every affix. A gem
// the game no longer has adds nothing.
function withGemBonus(item, content) {
  const bonus = item.gem ? content.mineralsById[item.gem]?.setBonus : 0;
  if (!bonus) return item;
  const raise = (value) => (value > 0 ? value + Math.max(1, Math.round(value * bonus)) : value);
  const raised = { ...item, affixes: item.affixes.map((affix) => ({ ...affix, value: raise(affix.value) })) };
  if (item.damage) {
    const min = raise(item.damage.min);
    raised.damage = { min, max: Math.max(min, raise(item.damage.max)) };
  }
  if (item.armor) raised.armor = raise(item.armor);
  if (item.implicit) raised.implicit = { ...item.implicit, value: raise(item.implicit.value) };
  return raised;
}

// A gem as an item's card shows it: its name, its bonus and the colour of
// its rarity, with its line on the card and what that line means, shown on a
// tap (the author: "jak kliknę w ten kwarc to powinno mi pokazywać co to
// znaczy", data/professions.json jewelcrafting.texts); null for none, or for
// a gem the game no longer has.
export function gemView(gemId, content) {
  const gem = gemId ? content.mineralsById[gemId] : null;
  if (!gem) return null;
  const words = { gem: gem.name, percent: Math.round(gem.setBonus * 100) };
  const texts = content.jewelcrafting.texts;
  return {
    id: gem.id,
    name: gem.name,
    bonus: gem.setBonus,
    color: content.raritiesById[gem.rarity].color,
    line: say(texts, 'gemLine', 0, words),
    help: say(texts, 'gemHelp', 0, words),
  };
}

export const maxUpgrade = (content) => content.balance.upgrades.chances.length;

// The price of upgrading to `target`: gold and iron ore, more for a higher
// item level, a rarer item and each level further.
export function itemUpgradeCost(item, target, content) {
  const tuning = content.balance.upgrades;
  const factor = content.raritiesById[item.rarity].budget * tuning.costGrowth ** (target - 1);
  return {
    gold: Math.max(1, Math.round(item.level * tuning.goldPerItemLevel * factor)),
    'iron-ore': Math.max(1, Math.round((tuning.oreBase + item.level * tuning.orePerItemLevel) * factor)),
  };
}

// The chance of an upgrade to `target`, `factor` times as large in a week
// that raises (or lowers) it (upgrade, weeks.js; the week of the try, which
// the server gives), at most certain.
export const upgradeChance = (target, content, factor = 1) => {
  const chance = content.balance.upgrades.chances[target - 1];
  return factor === 1 ? chance : Math.min(1, chance * factor);
};

// A Kowadło price with `discount` of its gold off, at least one gold.
const discounted = (cost, discount) => (discount > 0 ? { ...cost, gold: Math.max(1, Math.round(cost.gold * (1 - discount))) } : cost);

// The materials an upgrade to `target` also takes from materialFrom on (the
// author: "Wyższe ulepszenia biorą też materiał rzadkości przedmiotu"):
// pieces of materials of the item's rarity, any of them added up (481 B:
// piecesOfRarity in crafting.js), 1 piece at materialFrom and one more at
// every level after it; null below it.
export function upgradeMaterials(item, target, content) {
  const from = content.balance.upgrades.materialFrom;
  return target >= from ? { rarity: item.rarity, count: target - from + 1 } : null;
}

// From breakFrom on, a failed upgrade may also break the item.
export function breakChance(current, content) {
  const tuning = content.balance.upgrades;
  return current >= tuning.breakFrom ? tuning.breakChance : 0;
}

// One try at the next level, with the server's random numbers. A failure takes
// the payment and one level (none below +0), and from breakFrom on may break
// the item instead. `warded`: a Zwój ochronny from the Warsztat lies on the
// Kowadło, and a break is a failure (`saved`), with its lost level too.
// `steady`: a Zwój utrwalenia lies there, and a failure keeps the level
// (`kept`; the author's of 4.11.2026). The draws are the same either way.
// `week`: the factor of the week's upgrade chance (upgradeChance).
export function rollUpgrade(item, rng, content, { warded = false, steady = false, week = 1 } = {}) {
  const current = item.upgrade ?? 0;
  if (rng.chance(upgradeChance(current + 1, content, week))) return { result: 'success', upgrade: current + 1 };
  const kept = steady && current > 0;
  const failure = { result: 'failure', upgrade: kept ? current : Math.max(0, current - 1), ...(kept && { kept: true }) };
  if (rng.chance(breakChance(current, content))) return warded ? { ...failure, saved: true } : { result: 'broken', upgrade: current };
  return failure;
}

// What the item card shows about upgrading: the level, the highest one the
// Kowadło allows (`cap`, its level), and the next level with its price,
// chances and the item's numbers after it. With the character's `stock` of
// materials, the materials the next level takes come as the pages show
// them: the pieces held and those it would take (rarityNeedView).
// `discount`: the share of the gold the Bractwo Kowali takes off (590), the
// ore and the materials as they are. `week`: the factor of the week's
// upgrade chance (upgradeChance).
export function upgradeView(item, cap, content, stock = null, discount = 0, week = 1) {
  const level = item.upgrade ?? 0;
  const max = maxUpgrade(content);
  const reach = Math.min(cap, max);
  const target = level + 1;
  const need = target <= reach ? upgradeMaterials(item, target, content) : null;
  return {
    level,
    cap: reach,
    max,
    next:
      target <= reach
        ? {
            level: target,
            cost: discounted(itemUpgradeCost(item, target, content), discount),
            materials: need && stock ? rarityNeedView(stock, need, content) : need,
            chance: upgradeChance(target, content, week),
            breakChance: breakChance(level, content),
            properties: itemProperties({ ...item, upgrade: target }, content),
          }
        : null,
  };
}

export function itemProperties(raw, content) {
  const item = upgradedItem(raw, content);
  const lines = [];
  if (item.damage) {
    const base = content.basesById[item.base];
    const kind =
      base.category === 'physical' ? word(content, 'fizyczne') : word(content, 'magiczne, {element}', { element: content.elementsById[item.element].name });
    lines.push(word(content, 'Obrażenia: {min}–{max} ({kind})', { min: item.damage.min, max: item.damage.max, kind }));
  }
  // An item's own armor comes first; the armor an upgrade gives an item
  // without any, like a talisman, after its stats.
  const armor = item.armor ? word(content, 'Pancerz: +{armor}', { armor: item.armor }) : null;
  if (armor && raw.armor) lines.push(armor);
  for (const { stat, value } of [...(item.implicit ? [item.implicit] : []), ...item.affixes]) {
    lines.push(`${propertyName(stat, content)}: +${value}`);
  }
  if (armor && !raw.armor) lines.push(armor);
  // The Zaklinaczka's zaklęcie żywiołu (settlement.js).
  if (item.imbue?.share) {
    lines.push(word(content, 'Zaklęcie żywiołu: {percent}% obrażeń jako {element}', { percent: Math.round(item.imbue.share * 100), element: content.elementsById[item.imbue.element].name }));
  }
  if (item.imbue?.stat) lines.push(word(content, 'Zaklęcie żywiołu: {stat} +{value}', { stat: propertyName(item.imbue.stat, content), value: item.imbue.value }));
  return lines;
}

// The item's numbers one by one, for setting it beside another: its damage
// by the average of its range, then its armor and each stat (an item's own
// armor, its implicit and its affixes added up by stat).
export function itemLines(raw, content) {
  const item = upgradedItem(raw, content);
  const lines = [];
  if (item.damage) {
    lines.push({ id: 'damage', label: word(content, 'Obrażenia'), value: (item.damage.min + item.damage.max) / 2, text: `${item.damage.min}–${item.damage.max}` });
  }
  const stats = new Map(item.armor ? [['armor', item.armor]] : []);
  for (const { stat, value } of [...(item.implicit ? [item.implicit] : []), ...item.affixes, ...(item.imbue?.stat ? [item.imbue] : [])]) {
    stats.set(stat, (stats.get(stat) ?? 0) + value);
  }
  for (const [stat, value] of stats) lines.push({ id: stat, label: propertyName(stat, content), value, text: `+${value}` });
  return lines;
}

// Higher rarity first, then higher level: used to pick the best find of a hunt.
export function itemRank(item, content) {
  return content.rarities.findIndex((rarity) => rarity.id === item.rarity) * 1000 + item.level;
}

// Finds that go straight into empty slots: for each slot nothing is worn in,
// the best item found for it that the class can use. Returns their indices in
// `items`, in order.
export function autoEquip(equipped, items, content, classId, classLevel) {
  const worn = new Set(equipped.map((item) => item.slot));
  const best = new Map();
  items.forEach((item, index) => {
    if (worn.has(item.slot) || (classId && !canUse(item.base, classId, content, classLevel))) return;
    const chosen = best.get(item.slot);
    if (chosen === undefined || itemRank(item, content) > itemRank(items[chosen], content)) best.set(item.slot, index);
  });
  return [...best.values()].sort((a, b) => a - b);
}

// `upgradeCap`: the level of the camp's Kowadło, for the upgrade part of the
// item card; left out where the card cannot upgrade (a report). `materials`:
// the character's stock, which pays for the upgrades (upgradeView);
// `anvilWeek`, the factor of the week's upgrade chance.
export function itemView(item, content, { sellBonus = 0, upgradeCap, materials = null, anvilDiscount = 0, anvilWeek = 1 } = {}) {
  const rarity = content.raritiesById[item.rarity];
  const classIds = baseClasses(item.base, content);
  const classLevel = baseClassLevel(item.base, content);
  // Its Tier, as the Encyklopedia sorts the bases (encyclopedia.json:
  // "Tier III" from class level 25), on the card (the author: "Mozesz
  // dopisywać Tiery do przedmiotów").
  const tier = content.encyclopedia.tiers.findLast((one) => one.classLevel <= classLevel);
  return {
    name: itemName(item, content),
    base: item.base,
    slot: item.slot,
    slotName: content.slotsById[item.slot].name,
    level: item.level,
    tier: tier?.name ?? null,
    upgrade: item.upgrade ?? 0,
    rarity: rarity.id,
    rarityName: rarity.name,
    color: rarity.color,
    properties: itemProperties(item, content),
    lines: itemLines(item, content),
    // null: any class can use it.
    classIds,
    classNames: classIds && classIds.map((id) => content.classesById[id].name),
    // The class level it is worn from by its Tier, wherever it came from, or
    // null when it asks for none.
    classLevel: classLevel > 1 ? classLevel : null,
    price: sellPrice(item, content, sellBonus),
    // The gem set in it in Jubilerstwo, which its numbers above include.
    ...(gemView(item.gem, content) ? { gem: gemView(item.gem, content) } : {}),
    // Got in a Wymiana, or from another character through the Skrzynia
    // Konta: worn from its own level on (src/server/inventory.js).
    ...(item.traded ? { traded: true } : {}),
    ...(item.chest ? { chest: true } : {}),
    ...(upgradeCap === undefined ? {} : { anvil: upgradeView(item, upgradeCap, content, materials, anvilDiscount, anvilWeek) }),
  };
}
