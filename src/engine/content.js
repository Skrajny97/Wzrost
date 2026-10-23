// Turns the raw data files into lookups used by the engine. Pure: the caller
// loads the JSON (the Worker bundles it, tools read it from disk).

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

// Each region is split into inner regions (areas) of a few levels. An area is
// what a character explores: it has its own levels and encounters, and takes
// the safety, trait and elite of its region.
function areasOf(region) {
  return region.areas.map((area) => ({
    ...area,
    tough: area.tough ?? [],
    regionId: region.id,
    regionName: region.name,
    land: region.land,
    safe: region.safe,
    trait: region.trait,
    elite: region.elite,
    resources: area.resources ?? region.resources,
  }));
}

export function buildContent(raw) {
  const { prefixes, suffixes } = raw.affixes;
  const regions = raw.regions.map((region) => ({ ...region, areas: areasOf(region) }));
  const areas = regions.flatMap((region) => region.areas);
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
    regions,
    regionsById: byId(regions),
    areas,
    areasById: byId(areas),
    balance: raw.balance,
    texts: raw.texts,
    unlocks: raw.unlocks,
    unlocksById: byId(raw.unlocks),
    resources: raw.resources,
    resourcesById: byId(raw.resources),
    buildings: raw.buildings,
    buildingsById: byId(raw.buildings),
  };
}
