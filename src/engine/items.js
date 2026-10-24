// Items: a base plus affixes that share a stat budget set by the item level
// and rarity. The base always gets the budget of the lowest rarity, so a rarer
// item is never weaker at its core; the affixes share what the rarity adds.
// Names follow the Gladiatus pattern "Prefix Base Suffix", with the prefix
// agreeing with the base's grammatical gender. The Kowadło in the camp
// upgrades an item from +1 to +10, which raises all of its numbers.

import { budget, weaponDamage } from './formulas.js';

// `affixIds` picks the affixes instead of rolling them (tests, simulations).
export function generateItem({ baseId, level, rarityId = 'common', element, affixIds }, rng, content) {
  const base = content.basesById[baseId];
  const rarity = content.raritiesById[rarityId];
  const tuning = content.balance.items;
  const total = budget(level, rarity.budget, content.balance);
  const baseShare = budget(level, content.rarities[0].budget, content.balance);
  const affixShare = rarity.affixes > 0 ? (total - baseShare) / rarity.affixes : 0;

  const item = { base: base.id, slot: base.slot, level, rarity: rarity.id, affixes: [] };
  if (base.kind === 'weapon') {
    const average = weaponDamage(baseShare, base.damageFactor, content.balance);
    const min = Math.max(1, Math.round(average * (1 - base.variance)));
    item.damage = { min, max: Math.max(min, Math.round(average * (1 + base.variance))) };
    if (base.elements) item.element = element ?? rng.pick(base.elements);
  } else if (base.kind === 'armor') {
    item.armor = Math.max(1, Math.round(baseShare * tuning.armorPerBudget * base.armorFactor));
  } else {
    const value = Math.max(1, Math.round(baseShare * tuning.statPerBudget * base.statFactor));
    item.implicit = { stat: base.stat, value };
  }

  if (affixIds) {
    for (const id of affixIds.slice(0, rarity.affixes)) {
      const affix = content.affixesById[id];
      const kind = content.prefixes.includes(affix) ? 'prefix' : 'suffix';
      item.affixes.push({ id, kind, stat: affix.stat, value: affixValue(affix.stat, affixShare, tuning) });
    }
    return item;
  }

  let kind = rng.chance(0.5) ? 'prefix' : 'suffix';
  const used = new Set();
  for (let i = 0; i < rarity.affixes; i++) {
    const pool = (kind === 'prefix' ? content.prefixes : content.suffixes).filter((affix) => !used.has(affix.id));
    const affix = rng.weighted(pool);
    used.add(affix.id);
    item.affixes.push({ id: affix.id, kind, stat: affix.stat, value: affixValue(affix.stat, affixShare, tuning) });
    kind = kind === 'prefix' ? 'suffix' : 'prefix';
  }
  return item;
}

function affixValue(stat, share, tuning) {
  const perBudget =
    stat === 'armor' ? tuning.armorPerBudget : stat.startsWith('resist.') ? tuning.resistancePerBudget : tuning.statPerBudget;
  return Math.max(1, Math.round(share * perBudget));
}

export function rollRarity(rng, content, bonus = 1) {
  return rng.weighted(content.rarities, (rarity) => rarity.dropWeight * (rarity.affixes > 0 ? bonus : 1)).id;
}

// Weapons and off-hands belong to classes (classes.json); everything else
// fits anyone. Returns the classes that can use a base, or null for all.
export function baseClasses(baseId, content) {
  const base = content.basesById[baseId];
  const key = base.slot === 'weapon' ? 'weapons' : base.slot === 'offhand' ? 'offhands' : null;
  return key && content.classes.filter((cls) => cls[key].includes(baseId)).map((cls) => cls.id);
}

export const canUse = (baseId, classId, content) => baseClasses(baseId, content)?.includes(classId) ?? true;

// Loot favours the slots the character has empty, only ever holds weapons and
// off-hands of its class, and while it has no weapon a weapon is always one of
// its class. `filled` is the set of slots already covered (worn, or found
// earlier in the same hunt); found items are added.
export function randomItem(level, rng, content, { rarityBonus = 1, filled, classId } = {}) {
  let base;
  if (filled && classId && !filled.has('weapon')) {
    base = content.basesById[rng.pick(content.classesById[classId].weapons)];
  } else {
    const weight = content.balance.items.emptySlotWeight;
    const bases = classId ? content.bases.filter((candidate) => canUse(candidate.id, classId, content)) : content.bases;
    base = rng.weighted(bases, (candidate) => (filled && !filled.has(candidate.slot) ? weight : 1));
  }
  filled?.add(base.slot);
  return generateItem({ baseId: base.id, level, rarityId: rollRarity(rng, content, rarityBonus) }, rng, content);
}

// Gold from the scrapper: level × goldPerLevel × the rarity's multiplier.
// `bonus`: the share the camp adds to the scrapper's prices (Stół złomiarza).
export function sellPrice(item, content, bonus = 0) {
  const rarity = content.raritiesById[item.rarity];
  return Math.max(1, Math.round(item.level * content.balance.items.sellGoldPerLevel * rarity.sell * (1 + bonus)));
}

// When the bag holds more than its places, the scrapper buys the weakest
// items: those the class cannot use first, upgraded ones last, then by rarity
// and level, a new find before an item already in the bag (it has an id).
// Returns the indices of the items to sell.
export function bagOverflow(items, capacity, classId, content) {
  const extra = items.length - capacity;
  if (extra <= 0) return [];
  const usable = (item) => (canUse(item.base, classId, content) ? 1 : 0);
  const upgraded = (item) => (item.upgrade > 0 ? 1 : 0);
  const kept = (item) => (item.id === undefined ? 0 : 1);
  return items
    .map((item, index) => ({ item, index }))
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

export function itemName(item, content) {
  const base = content.basesById[item.base];
  const prefix = item.affixes.find((affix) => affix.kind === 'prefix');
  const suffix = item.affixes.find((affix) => affix.kind === 'suffix');
  return [
    prefix && content.affixesById[prefix.id].forms[base.gender],
    base.name,
    suffix && content.affixesById[suffix.id].text,
  ]
    .filter(Boolean)
    .join(' ');
}

export function propertyName(stat, content) {
  if (stat === 'armor') return 'Pancerz';
  if (stat.startsWith('resist.')) return content.elementsById[stat.slice('resist.'.length)].resistance;
  return content.statsById[stat].name;
}

// The numbers of an upgraded item: each level of upgrade adds bonusPerLevel
// of every base number (damage, armor, stats), rounded.
export function upgradedItem(item, content) {
  const level = item.upgrade ?? 0;
  if (!level) return item;
  const factor = 1 + content.balance.upgrades.bonusPerLevel * level;
  const scale = (value) => Math.round(value * factor);
  const upgraded = { ...item, affixes: item.affixes.map((affix) => ({ ...affix, value: scale(affix.value) })) };
  if (item.damage) {
    const min = scale(item.damage.min);
    upgraded.damage = { min, max: Math.max(min, scale(item.damage.max)) };
  }
  if (item.armor) upgraded.armor = scale(item.armor);
  if (item.implicit) upgraded.implicit = { ...item.implicit, value: scale(item.implicit.value) };
  return upgraded;
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

export const upgradeChance = (target, content) => content.balance.upgrades.chances[target - 1];

// From breakFrom on, a failed upgrade may also break the item.
export function breakChance(current, content) {
  const tuning = content.balance.upgrades;
  return current >= tuning.breakFrom ? tuning.breakChance : 0;
}

// One try at the next level, with the server's random numbers. A failure takes
// the payment and one level (none below +0), and from breakFrom on may break
// the item instead.
export function rollUpgrade(item, rng, content) {
  const current = item.upgrade ?? 0;
  if (rng.chance(upgradeChance(current + 1, content))) return { result: 'success', upgrade: current + 1 };
  if (rng.chance(breakChance(current, content))) return { result: 'broken', upgrade: current };
  return { result: 'failure', upgrade: Math.max(0, current - 1) };
}

// What the item card shows about upgrading: the level, the highest one the
// Kowadło allows (`cap`, its level), and the next level with its price,
// chances and the item's numbers after it.
export function upgradeView(item, cap, content) {
  const level = item.upgrade ?? 0;
  const max = maxUpgrade(content);
  const reach = Math.min(cap, max);
  const target = level + 1;
  return {
    level,
    cap: reach,
    max,
    next:
      target <= reach
        ? {
            level: target,
            cost: itemUpgradeCost(item, target, content),
            chance: upgradeChance(target, content),
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
      base.category === 'physical' ? 'fizyczne' : `magiczne, ${content.elementsById[item.element].name}`;
    lines.push(`Obrażenia: ${item.damage.min}–${item.damage.max} (${kind})`);
  }
  if (item.armor) lines.push(`Pancerz: +${item.armor}`);
  for (const { stat, value } of [...(item.implicit ? [item.implicit] : []), ...item.affixes]) {
    lines.push(`${propertyName(stat, content)}: +${value}`);
  }
  return lines;
}

// Higher rarity first, then higher level: used to pick the best find of a hunt.
export function itemRank(item, content) {
  return content.rarities.findIndex((rarity) => rarity.id === item.rarity) * 1000 + item.level;
}

// Finds that go straight into empty slots: for each slot nothing is worn in,
// the best item found for it that the class can use. Returns their indices in
// `items`, in order.
export function autoEquip(equipped, items, content, classId) {
  const worn = new Set(equipped.map((item) => item.slot));
  const best = new Map();
  items.forEach((item, index) => {
    if (worn.has(item.slot) || (classId && !canUse(item.base, classId, content))) return;
    const chosen = best.get(item.slot);
    if (chosen === undefined || itemRank(item, content) > itemRank(items[chosen], content)) best.set(item.slot, index);
  });
  return [...best.values()].sort((a, b) => a - b);
}

// `upgradeCap`: the level of the camp's Kowadło, for the upgrade part of the
// item card; left out where the card cannot upgrade (a report).
export function itemView(item, content, { sellBonus = 0, upgradeCap } = {}) {
  const rarity = content.raritiesById[item.rarity];
  const classIds = baseClasses(item.base, content);
  return {
    name: itemName(item, content),
    base: item.base,
    slot: item.slot,
    slotName: content.slotsById[item.slot].name,
    level: item.level,
    upgrade: item.upgrade ?? 0,
    rarity: rarity.id,
    rarityName: rarity.name,
    color: rarity.color,
    properties: itemProperties(item, content),
    // null: any class can use it.
    classIds,
    classNames: classIds && classIds.map((id) => content.classesById[id].name),
    price: sellPrice(item, content, sellBonus),
    ...(upgradeCap === undefined ? {} : { anvil: upgradeView(item, upgradeCap, content) }),
  };
}
