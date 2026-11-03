// Turns the raw data files into lookups used by the engine. Pure: the caller
// loads the JSON (the Worker bundles it, tools read it from disk).

// A lookup without the object prototype, so an id from a request such as
// "constructor" or "toString" finds nothing in it (the code review: free stat
// points through `{"points": {"constructor": 1}}`).
const lookup = (entries) => Object.assign(Object.create(null), Object.fromEntries(entries));
const byId = (list) => lookup(list.map((item) => [item.id, item]));

// The evolutions with their stage: 1 for the first, chosen at the first
// class level of balance.progression.classEvolutionLevels, 2 for the second
// form that grows out of one (`from`), at the second.
function stagedEvolutions(raw) {
  const list = raw.evolutions?.evolutions ?? [];
  const byOwnId = new Map(list.map((evolution) => [evolution.id, evolution]));
  const stageOf = (evolution) => (evolution.from && byOwnId.has(evolution.from) ? stageOf(byOwnId.get(evolution.from)) + 1 : 1);
  return list.map((evolution) => ({ ...evolution, stage: stageOf(evolution) }));
}

// The rules of each stage's skills and points: the first evolution's, then
// the second forms' (data/evolutions.json, secondForms).
function stageRules(raw) {
  if (!raw.evolutions) return [];
  const { skillMaxLevel, lastPointClassLevel, pointsPerClassLevel, secondForms } = raw.evolutions;
  return [{ skillMaxLevel, lastPointClassLevel, pointsPerClassLevel }, ...(secondForms ? [secondForms] : [])];
}

// The evolutions' skills with what they take from their evolution: its class
// and name (as a path), the class level of its stage and that stage's top
// skill level.
function evolutionSkills(raw, evolutions, stages) {
  if (!raw.evolutions) return [];
  const byOwnId = byId(evolutions);
  const levels = raw.balance.progression.classEvolutionLevels;
  return raw.evolutions.skills.map((skill) => {
    const evolution = byOwnId[skill.evolution];
    const stage = evolution?.stage ?? 1;
    return {
      ...skill,
      classId: evolution?.classId,
      path: evolution?.name,
      classLevel: levels[stage - 1],
      maxLevel: stages[stage - 1]?.skillMaxLevel ?? raw.evolutions.skillMaxLevel,
      rarity: 'epic',
    };
  });
}

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
  const evolutions = stagedEvolutions(raw);
  const stages = stageRules(raw);
  const evolved = evolutionSkills(raw, evolutions, stages);
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
    affixNamesByMonster: lookup(names.map((name) => [name.monster, name])),
    // The creatures, and the foes of the events' fights (events.json), who
    // fight the same way but live in no region and have no Bestiariusz.
    monstersById: byId([...raw.monsters, ...(raw.events?.foes ?? [])]),
    // The events' foes alone: people, whom the Bestiariusz and the quests
    // leave out.
    eventFoesById: byId(raw.events?.foes ?? []),
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
    // rozbiórki makes from materials and from taken-apart items, one per rarity.
    materials: raw.materials.materials,
    materialsById: byId(raw.materials.materials),
    materialsByMonster: lookup(raw.materials.materials.map((material) => [material.monster, material])),
    parts: raw.materials.parts,
    partsById: byId(raw.materials.parts),
    partsByRarity: lookup(raw.materials.parts.map((part) => [part.rarity, part])),
    appearances: raw.appearances ?? [],
    appearancesById: byId(raw.appearances ?? []),
    // The skin tones of the portrait and the one a new character starts with.
    skins: raw.skins?.skins ?? [],
    skinsById: byId(raw.skins?.skins ?? []),
    defaultSkin: raw.skins?.default,
    // The narrator's daily and weekly quests (quests.js).
    quests: raw.quests,
    // The skills the classes choose from (skills.js), and the class
    // evolutions with their own skills (evolutions.js), known by id with the
    // rest: each evolution skill takes its class, the class level of its
    // evolution's stage and that stage's top skill level. The evolutions,
    // the first ones and their second forms, carry their stage.
    skills: raw.skills ?? [],
    skillsById: byId([...(raw.skills ?? []), ...evolved]),
    evolutions,
    evolutionsById: byId(evolutions),
    evolutionSkills: evolved,
    // The first evolution's skills and points (evolutionRules) and every
    // stage's, the second forms' after them (evolutionStages).
    evolutionRules: stages[0] ?? null,
    evolutionStages: stages,
    evolutionTexts: raw.evolutions?.texts ?? null,
    evolutionPlace: raw.evolutions?.place ?? null,
    // The gift codes typed in the settings (gift-codes.js); only their
    // texts go to the page.
    giftCodes: raw['gift-codes']?.codes ?? [],
    giftTexts: raw['gift-codes']?.texts ?? null,
    // A code's rewards moved by the author's word from one character of an
    // account to another (giftMovePair, src/server/gift-codes.js).
    giftMoves: raw['gift-codes']?.moves ?? [],
    // The professions, the System's words over them, the herbs gathered in
    // them, the gathering and the texts of their reports (professions.js),
    // and the brewing with its potions (brewing.js).
    professions: raw.professions?.professions ?? [],
    professionsById: byId(raw.professions?.professions ?? []),
    professionRules: raw.professions?.rules,
    professionsIntro: raw.professions?.intro,
    // The Awatar Systemu (src/server/avatar.js).
    avatar: raw.professions?.avatar,
    // The chat of the Społeczność tab (src/server/chat.js).
    chat: raw.chat,
    // The Społeczność's list, Ranking, Znajomi and Upominek (community.json).
    community: raw.community,
    gathering: raw.professions?.gathering,
    herbs: raw.professions?.herbs ?? [],
    herbsById: byId(raw.professions?.herbs ?? []),
    professionTexts: raw.professions?.texts,
    brewing: raw.professions?.brewing,
    potions: raw.professions?.potions ?? [],
    potionsById: byId(raw.professions?.potions ?? []),
    // How potions are drunk on explorations (potions.js).
    potionUse: raw.professions?.potionUse,
    // The gear Rzemieślnictwo makes (workshop.js).
    workshop: raw.professions?.workshop,
    // The events at the end of an exploration (events.js).
    events: raw.events ?? null,
    eventsById: byId(raw.events?.list ?? []),
    // The Encyklopedia's tabs, tiers, chests and trophies (encyclopedia.js).
    encyclopedia: raw.encyclopedia ?? null,
    // The Osada: its places, residents, brotherhoods, standings, board of
    // orders, Zaklinaczka and Pustelnik (settlement.js).
    settlement: raw.settlement ?? null,
    // The Wieże Systemu (towers.js).
    towers: raw.towers ?? null,
    // The players' Gildie (src/server/guilds.js).
    guilds: raw.guilds ?? null,
    // The Sklep Systemu's cosmetics (cosmetics.js) and the words of its page.
    cosmetics: raw.cosmetics?.items ?? [],
    cosmeticsById: byId(raw.cosmetics?.items ?? []),
    cosmeticTexts: raw.cosmetics?.texts ?? null,
    residentsById: byId(raw.settlement?.residents ?? []),
  };
}
