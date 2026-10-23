// Turns the raw data files into lookups used by the engine. Pure: the caller
// loads the JSON (the Worker bundles it, tools read it from disk).

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

export function buildContent(raw) {
  const { prefixes, suffixes } = raw.affixes;
  return {
    stats: raw.stats,
    statIds: raw.stats.map((stat) => stat.id),
    statsById: byId(raw.stats),
    elements: raw.elements,
    elementsById: byId(raw.elements),
    effectsById: byId(raw.effects),
    rarities: raw.rarities,
    raritiesById: byId(raw.rarities),
    slots: raw.slots,
    slotsById: byId(raw.slots),
    classes: raw.classes,
    classesById: byId(raw.classes),
    bases: raw['item-bases'],
    basesById: byId(raw['item-bases']),
    prefixes,
    suffixes,
    affixesById: byId([...prefixes, ...suffixes]),
    monstersById: byId(raw.monsters),
    regions: raw.regions,
    regionsById: byId(raw.regions),
    balance: raw.balance,
    texts: raw.texts,
    unlocks: raw.unlocks,
    unlocksById: byId(raw.unlocks),
  };
}
