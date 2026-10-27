// Turns the raw data files into lookups used by the engine. Pure: the caller
// loads the JSON (the Worker bundles it, tools read it from disk).

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

// Each region is split into inner regions (areas) of a few levels. An area is
// what a character explores: it has its own levels and encounters, and takes
// the safety and trait of its region, and its elite unless it has its own.
// The region's champion lives in one area only.
function areasOf(region) {
  return region.areas.map((area) => ({
    ...area,
    tough: area.tough ?? [],
    regionId: region.id,
    regionName: region.name,
    land: region.land,
    safe: region.safe,
    trait: region.trait,
    elite: area.elite ?? region.elite,
    champion: area.champion ?? null,
    resources: area.resources ?? region.resources,
  }));
}

// The creatures living in an area, as on its list of dangers (areaDangers):
// those of its encounters, its elite and its champion.
const creaturesOf = (area) =>
  new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters).concat(area.elite ?? [], area.champion ?? []));

export function buildContent(raw) {
  const { prefixes, suffixes, names } = raw.affixes;
  // An item found in an area takes the names of its affixes from the
  // creatures living there: a prefix from those with an adjective, a suffix
  // from any of them.
  const affixNames = (creatures) => {
    const here = names.filter((name) => creatures.has(name.monster));
    return { prefix: here.filter((name) => name.prefix), suffix: here };
  };
  const regions = raw.regions.map((region) => ({
    ...region,
    areas: areasOf(region).map((area) => ({ ...area, affixNames: affixNames(creaturesOf(area)) })),
  }));
  const areas = regions.flatMap((region) => region.areas);
  return {
    stats: raw.stats,
    statIds: raw.stats.map((stat) => stat.id),
    statsById: byId(raw.stats),
    elements: raw.elements,
    elementsById: byId(raw.elements),
    effects: raw.effects,
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
    affixNamesByMonster: Object.fromEntries(names.map((name) => [name.monster, name])),
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
    // The camp's own level (camp.json) builds like a building, so it is found
    // by its id too, but it has no plot on the board.
    camp: raw.camp,
    buildingsById: byId([...raw.buildings, ...(raw.camp ? [raw.camp] : [])]),
    // What creatures leave (one material each) and the parts the Stół
    // rzemieślniczy makes from materials and from taken-apart items, one per rarity.
    materials: raw.materials.materials,
    materialsById: byId(raw.materials.materials),
    materialsByMonster: Object.fromEntries(raw.materials.materials.map((material) => [material.monster, material])),
    parts: raw.materials.parts,
    partsById: byId(raw.materials.parts),
    partsByRarity: Object.fromEntries(raw.materials.parts.map((part) => [part.rarity, part])),
    appearances: raw.appearances ?? [],
    appearancesById: byId(raw.appearances ?? []),
    // The narrator's daily and weekly quests (quests.js).
    quests: raw.quests,
    // The skills the classes choose from (skills.js).
    skills: raw.skills ?? [],
    skillsById: byId(raw.skills ?? []),
    // The professions, the herbs gathered in them, the gathering and the
    // texts of their reports (professions.js), and the brewing with its
    // potions (brewing.js).
    professions: raw.professions?.professions ?? [],
    professionsById: byId(raw.professions?.professions ?? []),
    professionRules: raw.professions?.rules,
    gathering: raw.professions?.gathering,
    herbs: raw.professions?.herbs ?? [],
    herbsById: byId(raw.professions?.herbs ?? []),
    professionTexts: raw.professions?.texts,
    brewing: raw.professions?.brewing,
    potions: raw.professions?.potions ?? [],
    potionsById: byId(raw.professions?.potions ?? []),
    // How potions are drunk on explorations (potions.js).
    potionUse: raw.professions?.potionUse,
  };
}
