// Checks every game data file against its JSON Schema (data/schemas) and then
// checks references between files, e.g. that regions name existing monsters.
// Run: node tools/validate-data.mjs   (exits with 1 when something is wrong)

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const DATA_DIR = new URL('../data/', import.meta.url);
const CLIENT_DIR = new URL('../src/client/', import.meta.url);
export const DATA_FILES = [
  'stats', 'elements', 'effects', 'rarities', 'slots', 'classes',
  'item-bases', 'affixes', 'monsters', 'regions', 'balance', 'texts', 'unlocks',
  'resources', 'buildings', 'camp', 'music', 'sounds', 'appearances', 'tutorial', 'materials', 'quests', 'skills', 'professions',
];
// Unlocks the code refers to by id.
const REQUIRED_UNLOCKS = ['stats', 'skills', 'professions', 'settlement', 'dungeons', 'core'];
const POSITIONS = ['front', 'middle', 'back'];

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, DATA_DIR), 'utf8'));
}

export function loadData() {
  return Object.fromEntries(DATA_FILES.map((name) => [name, readJson(`${name}.json`)]));
}

export function validateData(data = loadData()) {
  const errors = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const name of DATA_FILES) {
    const validate = ajv.compile(readJson(`schemas/${name}.schema.json`));
    if (!validate(data[name])) {
      for (const error of validate.errors) {
        errors.push(`${name}.json${error.instancePath || ''}: ${error.message}`);
      }
    }
  }
  // References only make sense once every file has the expected shape.
  if (errors.length === 0) errors.push(...checkReferences(data));
  return errors;
}

function uniqueIds(errors, file, list) {
  const ids = new Set();
  for (const item of list) {
    if (ids.has(item.id)) errors.push(`${file}.json: powtórzone id "${item.id}"`);
    ids.add(item.id);
  }
  return ids;
}

function checkReferences(data) {
  const errors = [];
  const stats = uniqueIds(errors, 'stats', data.stats);
  const elements = uniqueIds(errors, 'elements', data.elements);
  const effects = uniqueIds(errors, 'effects', data.effects);
  const rarities = uniqueIds(errors, 'rarities', data.rarities);
  const slots = uniqueIds(errors, 'slots', data.slots);
  const bases = uniqueIds(errors, 'item-bases', data['item-bases']);
  const monsters = uniqueIds(errors, 'monsters', data.monsters);
  uniqueIds(errors, 'regions', data.regions);
  uniqueIds(errors, 'classes', data.classes);
  uniqueIds(errors, 'affixes', [...data.affixes.prefixes, ...data.affixes.suffixes]);
  const unlocks = uniqueIds(errors, 'unlocks', data.unlocks);
  const resources = uniqueIds(errors, 'resources', data.resources);
  uniqueIds(errors, 'buildings', data.buildings);
  for (const id of REQUIRED_UNLOCKS) {
    if (!unlocks.has(id)) errors.push(`unlocks.json: brak wpisu "${id}", którego używa kod gry`);
  }

  const statKeys = (file, owner, map, { all = false } = {}) => {
    for (const key of Object.keys(map)) {
      if (!stats.has(key)) errors.push(`${file}.json: ${owner} ma nieznaną statystykę "${key}"`);
    }
    if (all) {
      for (const stat of stats) {
        if (!(stat in map)) errors.push(`${file}.json: ${owner} nie ma statystyki "${stat}"`);
      }
    }
  };

  for (const effect of data.effects) {
    if (!elements.has(effect.element)) errors.push(`effects.json: ${effect.id} ma nieznany żywioł "${effect.element}"`);
  }

  const rarityAffixes = data.rarities.map((rarity) => rarity.affixes);
  if (rarityAffixes.some((count, i) => i > 0 && count <= rarityAffixes[i - 1])) {
    errors.push('rarities.json: liczba afiksów musi rosnąć z rzadkością');
  }
  // Rarer materials drop less often.
  const chances = data.rarities.map((rarity) => rarity.materialChance);
  if (chances.some((chance, i) => i > 0 && chance > chances[i - 1])) {
    errors.push('rarities.json: materialChance nie może rosnąć z rzadkością');
  }

  // Every creature leaves one material of its own, and every rarity has one
  // part that the Stół rzemieślniczy makes.
  const { materials, parts } = data.materials;
  uniqueIds(errors, 'materials', [...materials, ...parts]);
  for (const material of materials) {
    if (!data.monsters.some((monster) => monster.id === material.monster)) {
      errors.push(`materials.json: ${material.id} ma nieznanego stwora "${material.monster}"`);
    }
    if (!rarities.has(material.rarity)) errors.push(`materials.json: ${material.id} ma nieznaną rzadkość "${material.rarity}"`);
  }
  for (const monster of data.monsters) {
    const count = materials.filter((material) => material.monster === monster.id).length;
    if (count !== 1) errors.push(`materials.json: stwór ${monster.id} ma ${count} materiałów zamiast jednego`);
  }
  for (const rarity of data.rarities) {
    const count = parts.filter((part) => part.rarity === rarity.id).length;
    if (count !== 1) errors.push(`materials.json: rzadkość ${rarity.id} ma ${count} części zamiast jednej`);
  }
  for (const part of parts) {
    if (!rarities.has(part.rarity)) errors.push(`materials.json: część ${part.id} ma nieznaną rzadkość "${part.rarity}"`);
  }

  const basesById = new Map(data['item-bases'].map((base) => [base.id, base]));
  for (const base of data['item-bases']) {
    if (!slots.has(base.slot)) errors.push(`item-bases.json: ${base.id} ma nieznany slot "${base.slot}"`);
    if (base.scaling && !stats.has(base.scaling)) errors.push(`item-bases.json: ${base.id} skaluje się nieznaną statystyką`);
    if (base.stat && !stats.has(base.stat)) errors.push(`item-bases.json: ${base.id} ma nieznaną statystykę "${base.stat}"`);
    for (const element of base.elements ?? []) {
      if (!elements.has(element)) errors.push(`item-bases.json: ${base.id} ma nieznany żywioł "${element}"`);
    }
    // A family (a category in the game, as the talismans) is named by its
    // first base, of the same slot and kind; only its later bases ask for a
    // class level. A later base is a better version: a slightly higher factor
    // than the first base's (up to a fifth more, never a big multiplier) and
    // a flat bonus on top.
    if (base.family !== undefined) {
      const first = basesById.get(base.family);
      const factor = { weapon: 'damageFactor', armor: 'armorFactor', implicit: 'statFactor' }[base.kind];
      if (!first || first.family !== undefined) errors.push(`item-bases.json: ${base.id} ma rodzinę "${base.family}", która nie jest pierwszą bazą kategorii`);
      else if (first.slot !== base.slot || first.kind !== base.kind) errors.push(`item-bases.json: ${base.id} ma inny slot albo rodzaj niż kategoria "${base.family}"`);
      else if (!(base[factor] > first[factor]) || base[factor] > first[factor] * 1.2) {
        errors.push(`item-bases.json: ${base.id} ma mieć trochę wyższy ${factor} niż kategoria "${base.family}" (więcej niż ${first[factor]}, najwyżej o 20%)`);
      }
      if (base.classLevel === undefined) errors.push(`item-bases.json: ${base.id} w kategorii "${base.family}" nie ma poziomu klasy (classLevel)`);
      if (base.bonus === undefined) errors.push(`item-bases.json: ${base.id} w kategorii "${base.family}" nie ma premii (bonus)`);
      else if (base.bonus.max < base.bonus.min) errors.push(`item-bases.json: ${base.id} ma premię z max mniejszym niż min`);
    } else if (base.classLevel !== undefined || base.bonus !== undefined) {
      errors.push(`item-bases.json: ${base.id} jest pierwszą bazą kategorii i nie może wymagać poziomu klasy ani mieć premii`);
    }
  }

  const affixStat = (stat) => stats.has(stat) || stat === 'armor' || (stat.startsWith('resist.') && elements.has(stat.slice(7)));
  for (const affix of [...data.affixes.prefixes, ...data.affixes.suffixes]) {
    if (!affixStat(affix.stat)) errors.push(`affixes.json: ${affix.id} ma nieznaną właściwość "${affix.stat}"`);
  }
  // Affix names come from the creatures of the place an item is found in:
  // every creature has a name for suffixes, some an adjective for prefixes
  // too, and every place has a creature to name a prefix. An affix names an
  // item from before that (no creature stored on it) by its own creature,
  // or by its text.
  const names = new Map();
  for (const name of data.affixes.names) {
    if (!monsters.has(name.monster)) errors.push(`affixes.json: nazwa ma nieznanego stwora "${name.monster}"`);
    if (names.has(name.monster)) errors.push(`affixes.json: stwór ${name.monster} ma więcej niż jedną nazwę`);
    names.set(name.monster, name);
  }
  for (const monster of data.monsters) {
    if (!names.has(monster.id)) errors.push(`affixes.json: stwór ${monster.id} nie ma nazwy do afiksów`);
  }
  for (const affix of data.affixes.prefixes) {
    if (!names.get(affix.monster)?.prefix) errors.push(`affixes.json: przedrostek ${affix.id} ma stwora bez przedrostka "${affix.monster}"`);
  }
  for (const affix of data.affixes.suffixes) {
    if ((affix.monster === undefined) === (affix.text === undefined)) errors.push(`affixes.json: przyrostek ${affix.id} ma mieć stwora albo tekst`);
    else if (affix.monster !== undefined && !names.has(affix.monster)) errors.push(`affixes.json: przyrostek ${affix.id} ma stwora bez nazwy "${affix.monster}"`);
  }
  for (const region of data.regions) {
    for (const area of region.areas) {
      const living = [...area.encounters, ...(area.tough ?? [])].flatMap((encounter) => encounter.monsters).concat(area.elite ?? region.elite ?? [], area.champion ?? []);
      if (!living.some((id) => names.get(id)?.prefix)) errors.push(`affixes.json: w ${area.id} nie żyje żaden stwór z przedrostkiem`);
    }
  }

  for (const cls of data.classes) {
    statKeys('classes', cls.id, cls.baseStats, { all: true });
    statKeys('classes', cls.id, cls.growth);
    statKeys('classes', cls.id, cls.autoPoints);
    const autoSum = Object.values(cls.autoPoints).reduce((sum, value) => sum + value, 0);
    if (autoSum !== data.stats.length) {
      errors.push(`classes.json: ${cls.id} rozdaje ${autoSum} punktów, a poziom daje ${data.stats.length}`);
    }
    for (const id of cls.weapons) {
      const base = basesById.get(id);
      if (!base) errors.push(`classes.json: ${cls.id} ma nieznaną broń "${id}"`);
      else if (base.slot !== 'weapon') errors.push(`classes.json: ${cls.id} ma w broniach "${id}", który nie jest bronią`);
    }
    for (const id of cls.offhands) {
      const base = basesById.get(id);
      if (!base) errors.push(`classes.json: ${cls.id} ma nieznaną drugą rękę "${id}"`);
      else if (base.slot !== 'offhand') errors.push(`classes.json: ${cls.id} ma w drugiej ręce "${id}", który nie pasuje do tego slotu`);
    }
    for (const id of cls.armor) {
      const base = basesById.get(id);
      if (!base) errors.push(`classes.json: ${cls.id} ma nieznany pancerz "${id}"`);
      else if (base.kind !== 'armor' || base.slot === 'offhand') errors.push(`classes.json: ${cls.id} ma w pancerzach "${id}", który nie jest pancerzem`);
    }
  }
  // Skills: of a known class, rarity, effect and element, with the numbers
  // their kind needs and an effect text naming only numbers they have. Each
  // choice (a class at one class level) offers at least two skills.
  const SKILL_NEEDS = {
    strike: ['power'],
    sweep: ['power'],
    heal: ['below', 'heal', 'wisdomPerHp'],
    guard: ['below', 'heal', 'armor', 'turns'],
    buff: ['armor', 'resist', 'damage'],
    coat: ['dotEffect', 'dotChance', 'dotPower', 'dotTicks'],
    shield: ['below', 'pool'],
    evade: ['below', 'dodge', 'counter', 'hits'],
  };
  const classIds = new Set(data.classes.map((cls) => cls.id));
  const effectIds = new Set(data.effects.map((effect) => effect.id));
  const skillChoices = new Map();
  for (const skill of data.skills) {
    const where = `skills.json: ${skill.id}`;
    const params = skill.params;
    if (!classIds.has(skill.classId)) errors.push(`${where} ma nieznaną klasę "${skill.classId}"`);
    if (!rarities.has(skill.rarity)) errors.push(`${where} ma nieznaną rzadkość "${skill.rarity}"`);
    for (const key of SKILL_NEEDS[skill.kind]) {
      if (params[key] === undefined) errors.push(`${where} nie ma liczby "${key}", której potrzebuje rodzaj ${skill.kind}`);
    }
    if (['strike', 'sweep', 'heal'].includes(skill.kind) && skill.cooldown === undefined && !skill.once) errors.push(`${where} nie ma odnowienia (cooldown ani once)`);
    if (skill.cooldown !== undefined && skill.once) errors.push(`${where} ma i odnowienie, i once: zostaw jedno`);
    if (skill.once && !['strike', 'sweep', 'heal'].includes(skill.kind)) errors.push(`${where}: once jest tylko dla strike, sweep i heal, inne rodzaje mają swój rytm`);
    if (params.dotEffect !== undefined && !effectIds.has(params.dotEffect)) errors.push(`${where} ma nieznany efekt "${params.dotEffect}"`);
    if (params.element !== undefined && !elements.has(params.element)) errors.push(`${where} ma nieznany żywioł "${params.element}"`);
    if (params.category !== undefined && !['physical', 'magical'].includes(params.category)) errors.push(`${where} ma nieznany rodzaj obrażeń "${params.category}"`);
    if (params.target !== undefined && params.target !== 'back') errors.push(`${where} ma nieznany cel "${params.target}"`);
    for (const [, name] of skill.effect.matchAll(/\{(\w+)(?:%\.1|%| pp|\.1)?\}/g)) {
      if (!(name in params) && name !== 'cooldown' && name !== 'critPower') errors.push(`${where} ma w opisie skutku nieznaną liczbę "${name}"`);
    }
    const choice = `${skill.classId}, poziom klasy ${skill.classLevel}`;
    skillChoices.set(choice, (skillChoices.get(choice) ?? 0) + 1);
  }
  for (const [choice, count] of skillChoices) {
    if (count < 2) errors.push(`skills.json: wybór (${choice}) ma tylko jedną umiejętność`);
    if (count <= data.balance.skills.paths) errors.push(`skills.json: wybór (${choice}) ma ${count} umiejętności, a postać może poznać ${data.balance.skills.paths}, więc żadna ścieżka się nie zamknie`);
  }
  // A skill's own sound names a skill there is.
  for (const name of Object.keys(data.sounds.effects)) {
    if (name.startsWith('skill-') && !data.skills.some((skill) => `skill-${skill.id}` === name)) errors.push(`sounds.json: effects ma dźwięk "${name}" nieznanej umiejętności`);
  }
  // Each skill's path has its own name within its class.
  const pathNames = new Set();
  for (const skill of data.skills) {
    const key = `${skill.classId}:${skill.path}`;
    if (pathNames.has(key)) errors.push(`skills.json: ścieżka "${skill.path}" powtarza się w klasie ${skill.classId}`);
    pathNames.add(key);
  }

  // Every class has something for each slot its armour fills: a class
  // without a helmet of its own would leave the slot empty for good.
  const armourSlots = new Set(data.classes.flatMap((cls) => cls.armor.map((id) => basesById.get(id)?.slot)));
  for (const cls of data.classes) {
    for (const slot of armourSlots) {
      if (!cls.armor.some((id) => basesById.get(id)?.slot === slot)) errors.push(`classes.json: ${cls.id} nie ma pancerza na slot "${slot}"`);
    }
  }

  const monstersById = new Map(data.monsters.map((monster) => [monster.id, monster]));
  for (const monster of data.monsters) {
    statKeys('monsters', monster.id, monster.stats.base, { all: true });
    statKeys('monsters', monster.id, monster.stats.growth);
    if (!stats.has(monster.attack.scaling)) errors.push(`monsters.json: ${monster.id} skaluje atak nieznaną statystyką`);
    if (monster.attack.element && !elements.has(monster.attack.element)) {
      errors.push(`monsters.json: ${monster.id} ma nieznany żywioł ataku`);
    }
    if (monster.attack.dot && !effects.has(monster.attack.dot.effect)) {
      errors.push(`monsters.json: ${monster.id} nakłada nieznany efekt "${monster.attack.dot.effect}"`);
    }
    for (const element of Object.keys(monster.resistances ?? {})) {
      if (!elements.has(element)) errors.push(`monsters.json: ${monster.id} ma odporność na nieznany żywioł "${element}"`);
    }
  }

  const areaIds = new Set();
  for (const region of data.regions) {
    if (region.minLevel > region.maxLevel) errors.push(`regions.json: ${region.id} ma minLevel większy niż maxLevel`);
    // Inner regions follow one another without gaps and cover the region's levels.
    let next = region.minLevel;
    for (const area of region.areas) {
      if (areaIds.has(area.id) || data.regions.some((other) => other.id === area.id)) {
        errors.push(`regions.json: identyfikator ${area.id} się powtarza`);
      }
      areaIds.add(area.id);
      if (area.minLevel !== next) errors.push(`regions.json: ${area.id} powinien zaczynać się od poziomu ${next}`);
      if (area.minLevel > area.maxLevel) errors.push(`regions.json: ${area.id} ma minLevel większy niż maxLevel`);
      next = area.maxLevel + 1;
      for (const encounter of [...area.encounters, ...(area.tough ?? [])]) {
        for (const id of encounter.monsters) {
          const monster = monstersById.get(id);
          if (!monster) errors.push(`regions.json: ${area.id} ma nieznanego potwora "${id}"`);
          else if (monster.elite) errors.push(`regions.json: ${area.id} ma elitę "${id}" w zwykłym spotkaniu`);
          else if (monster.champion) errors.push(`regions.json: ${area.id} ma czempiona "${id}" w zwykłym spotkaniu`);
        }
      }
      // An inner region's own elite, and the champion, met only there.
      if (area.elite) {
        const own = monstersById.get(area.elite);
        if (!own?.elite) errors.push(`regions.json: elita ${area.id} ("${area.elite}") nie jest znaną elitą`);
      }
      if (area.champion) {
        const champion = monstersById.get(area.champion);
        if (!champion?.champion) errors.push(`regions.json: czempion ${area.id} ("${area.champion}") nie jest znanym czempionem`);
      }
      if (!area.encounters.some((encounter) => (encounter.minLevel ?? 1) <= area.minLevel)) {
        errors.push(`regions.json: ${area.id} nie ma spotkania od swojego pierwszego poziomu`);
      }
    }
    if (next !== region.maxLevel + 1) errors.push(`regions.json: regiony wewnętrzne ${region.id} nie kończą się na poziomie ${region.maxLevel}`);
    for (const id of Object.keys(region.resources)) {
      if (!resources.has(id)) errors.push(`regions.json: ${region.id} ma nieznany zasób "${id}"`);
    }
    const elite = monstersById.get(region.elite);
    if (!elite) errors.push(`regions.json: ${region.id} ma nieznaną elitę "${region.elite}"`);
    else if (!elite.elite) errors.push(`regions.json: elita ${region.id} ("${region.elite}") nie jest oznaczona jako elite`);
    if (region.areas.filter((area) => area.champion).length > 1) errors.push(`regions.json: ${region.id} może mieć czempiona tylko w jednym regionie wewnętrznym`);
  }
  // A creature is an elite or a champion, never both, and every champion has its place.
  for (const monster of data.monsters) {
    if (monster.elite && monster.champion) errors.push(`monsters.json: ${monster.id} nie może być naraz elitą i czempionem`);
    if (monster.champion && !data.regions.some((region) => region.areas.some((area) => area.champion === monster.id))) {
      errors.push(`monsters.json: czempion ${monster.id} nie ma miejsca w regions.json`);
    }
  }

  // A building is paid in gold and resources, from the first level on: the
  // resources come from explorations.
  if (!data.buildings.some((building) => building.effect.kind === 'craftSpeed')) {
    errors.push('buildings.json: brak budynku z craftSpeed (Stół rzemieślniczy), bez którego nie ma przeróbki materiałów');
  }
  // The table takes higher rarities with its first levels, every one in the
  // end, and later levels add extra parts.
  const rarityOrder = data.rarities.map((rarity) => rarity.id);
  for (const building of data.buildings.filter((candidate) => candidate.effect.kind === 'craftSpeed')) {
    const { rarities: caps = [], bonusFromLevel, bonusPerLevel } = building.effect;
    const indexes = caps.map((id) => rarityOrder.indexOf(id));
    if (caps.length === 0 || indexes.includes(-1)) errors.push(`buildings.json: ${building.id} musi mieć rarities ze znanych rzadkości`);
    else if (indexes.some((index, i) => i > 0 && index <= indexes[i - 1])) errors.push(`buildings.json: rarities w ${building.id} muszą rosnąć z poziomem`);
    else if (indexes.at(-1) !== rarityOrder.length - 1) errors.push(`buildings.json: ostatnia z rarities w ${building.id} musi być najwyższą rzadkością`);
    if (caps.length > building.maxLevel) errors.push(`buildings.json: ${building.id} ma więcej rarities niż poziomów`);
    if (!bonusFromLevel || !bonusPerLevel || bonusFromLevel > building.maxLevel) {
      errors.push(`buildings.json: ${building.id} potrzebuje bonusFromLevel (do maxLevel) i bonusPerLevel`);
    }
  }
  // The camp's own levels: a time for each, each longer than the last.
  const campMinutes = data.camp.minutes.levels;
  if (campMinutes.length !== data.camp.maxLevel || campMinutes.some((minutes, i) => i > 0 && minutes <= campMinutes[i - 1])) {
    errors.push(`camp.json: minutes.levels muszą mieć po jednym czasie na poziom (${data.camp.maxLevel}) i rosnąć`);
  }
  if (data.camp.startLevel >= data.camp.maxLevel) errors.push('camp.json: startLevel musi być niższy niż maxLevel');
  if (data.buildings.some((building) => building.id === data.camp.id)) errors.push(`buildings.json: id "${data.camp.id}" należy do obozu`);
  for (const building of data.buildings) {
    const { effect } = building;
    // A list of build times has one for each level, each longer than the last.
    const { levels } = building.minutes;
    if (levels && (levels.length !== building.maxLevel || levels.some((minutes, i) => i > 0 && minutes <= levels[i - 1]))) {
      errors.push(`buildings.json: minutes.levels w ${building.id} muszą mieć po jednym czasie na poziom (${building.maxLevel}) i rosnąć`);
    }
    if (effect.kind === 'production') {
      if (effect.resource !== 'gold' && !resources.has(effect.resource)) errors.push(`buildings.json: ${building.id} wytwarza nieznany zasób "${effect.resource}"`);
      if (!effect.storageHours) errors.push(`buildings.json: ${building.id} wytwarza zasób, ale nie ma storageHours`);
    } else if (effect.resource || effect.storageHours) {
      errors.push(`buildings.json: ${building.id} ma resource albo storageHours, choć niczego nie wytwarza`);
    }
    for (const cost of building.costs) {
      if (cost.resource !== 'gold' && !resources.has(cost.resource)) {
        errors.push(`buildings.json: ${building.id} kosztuje nieznany zasób "${cost.resource}"`);
      }
    }
    for (const id of building.trade?.resources ?? []) {
      if (!resources.has(id)) errors.push(`buildings.json: ${building.id} wymienia złoto na nieznany zasób "${id}"`);
    }
    // The dealer's rarities (every rarity has its part): known ones, never
    // lower than at the level before.
    const shopCaps = (building.shop?.rarities ?? []).map((id) => rarityOrder.indexOf(id));
    if (shopCaps.includes(-1)) errors.push(`buildings.json: ${building.id} sprzedaje części nieznanej rzadkości`);
    else if (shopCaps.some((index, i) => i > 0 && index < shopCaps[i - 1])) errors.push(`buildings.json: rzadkości w sklepie ${building.id} nie mogą maleć z poziomem`);
    if (shopCaps.length > building.maxLevel) errors.push(`buildings.json: ${building.id} ma w sklepie więcej rzadkości niż poziomów`);
  }
  // The fire spirit's trade lives in one building (src/engine/fire.js), and
  // so does the dealer's counter (src/engine/shop.js).
  if (data.buildings.filter((building) => building.trade).length > 1) errors.push('buildings.json: wymianę złota (trade) może mieć tylko jeden budynek');
  if (data.buildings.filter((building) => building.shop).length > 1) errors.push('buildings.json: sprzedaż części (shop) może mieć tylko jeden budynek');

  for (const position of Object.keys(data.balance.combat.targetWeights)) {
    if (!POSITIONS.includes(position)) errors.push(`balance.json: nieznana pozycja "${position}"`);
  }
  const { minMinutes, stepMinutes, maxMinutes, shortHuntMaxMinutes } = data.balance.hunt;
  if (minMinutes > shortHuntMaxMinutes || shortHuntMaxMinutes > maxMinutes) {
    errors.push('balance.json: czasy polowań muszą spełniać minMinutes ≤ shortHuntMaxMinutes ≤ maxMinutes');
  }
  // The slider goes minMinutes, then every multiple of stepMinutes.
  for (const [name, minutes] of [['shortHuntMaxMinutes', shortHuntMaxMinutes], ['maxMinutes', maxMinutes]]) {
    if (minutes !== minMinutes && minutes % stepMinutes !== 0) errors.push(`balance.json: ${name} nie wypada na kroku suwaka (stepMinutes)`);
  }
  // Longer hunts open in steps: each longer than the one before, on the
  // slider, and the last one reaching maxMinutes.
  const steps = data.unlocks.filter((unlock) => unlock.huntMinutes !== undefined).sort((a, b) => a.level - b.level);
  let previous = shortHuntMaxMinutes;
  for (const step of steps) {
    if (step.level === undefined) errors.push(`unlocks.json: ${step.id} z huntMinutes musi mieć poziom`);
    if (step.huntMinutes <= previous) errors.push(`unlocks.json: ${step.id} musi wydłużać eksploracje względem poprzedniego progu`);
    if (step.huntMinutes > maxMinutes || step.huntMinutes % stepMinutes !== 0) errors.push(`unlocks.json: ${step.id} ma czas spoza suwaka`);
    previous = step.huntMinutes;
  }
  if (previous !== maxMinutes) errors.push('unlocks.json: ostatni próg huntMinutes musi odblokować maxMinutes z balance.json');
  const fights = data.balance.hunt.fightsByMinutes;
  if (fights[0][0] > minMinutes) errors.push('balance.json: fightsByMinutes nie obejmuje najkrótszej wyprawy');
  for (let i = 1; i < fights.length; i++) {
    if (fights[i][0] <= fights[i - 1][0] || fights[i][1] < fights[i - 1][1]) errors.push('balance.json: fightsByMinutes musi rosnąć');
  }
  if (monsters.size === 0 || bases.size === 0) errors.push('Brak potworów lub przedmiotów.');

  // Class evolutions: rising class levels within the level cap.
  const evolutions = data.balance.progression.classEvolutionLevels;
  if (evolutions.some((level, i) => i > 0 && level <= evolutions[i - 1])) errors.push('balance.json: classEvolutionLevels musi rosnąć');
  if (evolutions.at(-1) > data.balance.progression.maxLevel) errors.push('balance.json: ewolucja klasy powyżej maxLevel');

  // Music: files that exist, places that are regions, inner regions, the
  // camp or a tab with music (src/client/app.js: the routes' music), and
  // report tracks that exist.
  const tracks = uniqueIds(errors, 'music', data.music.tracks);
  for (const track of data.music.tracks) {
    if (!existsSync(new URL(track.file, CLIENT_DIR))) errors.push(`music.json: brak pliku src/client/${track.file}`);
  }
  if (!tracks.has(data.music.default)) errors.push(`music.json: nieznany utwór domyślny ${data.music.default}`);
  const places = new Set(['camp', 'skills', 'professions', ...data.regions.flatMap((region) => [region.id, ...region.areas.map((area) => area.id)])]);
  for (const [place, track] of Object.entries(data.music.places)) {
    if (!places.has(place)) errors.push(`music.json: nieznane miejsce ${place}`);
    if (!tracks.has(track)) errors.push(`music.json: ${place} ma nieznany utwór ${track}`);
  }
  for (const [result, track] of Object.entries(data.music.reports)) {
    if (!tracks.has(track)) errors.push(`music.json: raport ${result} ma nieznany utwór ${track}`);
  }
  // Combat sounds: files that exist, and weapons and attacks with a known kind.
  const sounds = data.sounds;
  const kinds = new Set([...Object.keys(sounds.sounds), ...sounds.synth]);
  const soundFiles = [
    ...Object.values(sounds.sounds),
    ...Object.values(sounds.effects),
    ...Object.values(sounds.voices).flatMap((voice) => Object.values(voice)),
  ].flatMap((sound) => sound.files);
  for (const file of new Set(soundFiles)) {
    if (!existsSync(new URL(file, CLIENT_DIR))) errors.push(`sounds.json: brak pliku src/client/${file}`);
  }
  for (const base of data['item-bases']) {
    if (base.kind === 'weapon' && !kinds.has(base.sound)) errors.push(`item-bases.json: ${base.id} ma nieznany dźwięk ${base.sound}`);
  }
  for (const monster of data.monsters) {
    if (!kinds.has(monster.attack.sound)) errors.push(`monsters.json: ${monster.id} ma nieznany dźwięk ataku ${monster.attack.sound}`);
  }
  const appearances = uniqueIds(errors, 'appearances', data.appearances);
  if (!appearances.has('male')) errors.push('appearances.json: brak wyglądu male, domyślnego dla dawnych postaci (migrations/0006)');
  for (const id of Object.keys(sounds.voices)) {
    if (!monsters.has(id) && !appearances.has(id)) errors.push(`sounds.json: głos dla nieznanego ${id}`);
  }

  // The new character's supply: resources that exist. The narrator's lines:
  // every one the code knows (the schema's list), each once, with recordings
  // that exist.
  for (const id of Object.keys(data.balance.startingSupply.resources)) {
    if (!resources.has(id)) errors.push(`balance.json: startingSupply ma nieznany zasób "${id}"`);
  }
  const lines = uniqueIds(errors, 'tutorial', data.tutorial.lines);
  const knownLines = readJson('schemas/tutorial.schema.json').properties.lines.items.properties.id.enum;
  for (const id of knownLines) {
    if (!lines.has(id)) errors.push(`tutorial.json: brak kwestii ${id}`);
  }
  // The first steps the skipped introduction plays: a place and a building that exist.
  const { firstSteps } = data.tutorial;
  if (!data.regions.some((region) => region.areas.some((area) => area.id === firstSteps.areaId))) {
    errors.push(`tutorial.json: firstSteps ma nieznane miejsce "${firstSteps.areaId}"`);
  }
  if (!data.buildings.some((building) => building.id === firstSteps.buildingId)) {
    errors.push(`tutorial.json: firstSteps ma nieznany budynek "${firstSteps.buildingId}"`);
  }
  for (const line of data.tutorial.lines) {
    // A card from the author is read by nobody.
    if (line.speaker === 'author' && (line.voice || line.female)) errors.push(`tutorial.json: ${line.id} jest od autora i nie ma nagrania ani wersji żeńskiej`);
    if (line.once && line.kind !== 'lead') errors.push(`tutorial.json: ${line.id} ma once, a to nie kwestia lead`);
    if (line.chapter && !data.tutorial.chapters[line.chapter]) errors.push(`tutorial.json: ${line.id} należy do nieznanej części "${line.chapter}"`);
    // A line told per class has a text for every class, and only for them.
    for (const id of classIds) {
      if (line.classes && !line.classes[id]) errors.push(`tutorial.json: ${line.id} nie ma tekstu dla klasy ${id}`);
    }
    for (const id of Object.keys(line.classes ?? {})) {
      if (!classIds.has(id)) errors.push(`tutorial.json: ${line.id} ma tekst dla nieznanej klasy "${id}"`);
    }
    for (const told of [line, ...Object.values(line.classes ?? {})]) {
      for (const voice of [told.voice, told.female?.voice]) {
        if (voice && !existsSync(new URL(voice, CLIENT_DIR))) errors.push(`tutorial.json: brak pliku src/client/${voice}`);
      }
    }
  }
  errors.push(...checkQuests(data, { resources, rarities }));
  errors.push(...checkProfessions(data, { stats }));
  return errors;
}

// Professions: stats that exist, a gathering profession that gathers, herbs
// known within its levels, the herbs at once from level 1 on and growing, and
// a slider that reaches its longest time in whole steps.
function checkProfessions(data, { stats }) {
  const errors = [];
  const { professions, gathering, herbs } = data.professions;
  const ids = uniqueIds(errors, 'professions', professions);
  uniqueIds(errors, 'professions (zioła)', herbs);
  for (const profession of professions) {
    for (const stat of profession.stats) {
      if (!stats.has(stat)) errors.push(`professions.json: ${profession.id} ma nieznaną statystykę "${stat}"`);
    }
  }
  const gatherer = professions.find((profession) => profession.id === gathering.profession);
  if (!ids.has(gathering.profession) || gatherer.kind !== 'gathering') {
    errors.push(`professions.json: gathering.profession "${gathering.profession}" nie jest profesją zbieracką`);
  } else {
    for (const herb of herbs) {
      if (herb.level > gatherer.maxLevel) errors.push(`professions.json: zioło ${herb.id} wymaga poziomu ${herb.level}, a profesja kończy się na ${gatherer.maxLevel}`);
    }
  }
  if (!herbs.some((herb) => herb.level === 1)) errors.push('professions.json: żadnego zioła nie zna się od 1. poziomu');
  const { slots, minutes } = gathering;
  if (slots[0].level !== 1) errors.push('professions.json: gathering.slots musi zaczynać się od poziomu 1');
  slots.forEach((slot, index) => {
    if (index > 0 && (slot.level <= slots[index - 1].level || slot.herbs <= slots[index - 1].herbs)) {
      errors.push('professions.json: gathering.slots muszą rosnąć z poziomem');
    }
  });
  if (minutes.max < minutes.min || (minutes.max - minutes.min) % minutes.step !== 0) {
    errors.push('professions.json: gathering.minutes.max musi wypadać na kroku suwaka od min');
  }
  return errors;
}

// The quests: a time zone the clock knows, each kind once with what its count
// needs, rewards of resources and parts that exist, and level bands from
// level 1 up with rarities that exist.
function checkQuests(data, { resources, rarities }) {
  const errors = [];
  const { quests } = data;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: quests.timeZone });
  } catch {
    errors.push(`quests.json: nieznana strefa czasu "${quests.timeZone}"`);
  }
  uniqueIds(errors, 'quests', quests.kinds);
  // The note under a period's quests names what its chest gives.
  for (const [periodId, { chest }] of Object.entries(quests.periods)) {
    for (const amount of [chest.timePoints, chest.systemPoints]) {
      if (!chest.text.includes(`+${amount} `)) errors.push(`quests.json: napis skrzyni ${periodId} nie podaje +${amount}`);
    }
  }
  for (const kind of quests.kinds) {
    if (kind.id !== 'kill' && !kind.counted) errors.push(`quests.json: rodzaj ${kind.id} nie ma counted`);
    if (kind.counted && !kind.text.includes('{noun}')) errors.push(`quests.json: tekst rodzaju ${kind.id} nie ma {noun}`);
    if (kind.text.includes('{herb}') !== (kind.id === 'gather')) errors.push(`quests.json: tylko rodzaj gather ma {herb} w tekście`);
    for (const period of ['daily', 'weekly'].filter((each) => kind[each])) {
      const range = kind.id === 'kill' ? kind[period].fights : kind[period].count;
      if (!range) errors.push(`quests.json: rodzaj ${kind.id} nie ma ${kind.id === 'kill' ? 'fights' : 'count'} w ${period}`);
      else if (range[0] > range[1]) errors.push(`quests.json: rodzaj ${kind.id} ma odwrócony zakres w ${period}`);
    }
  }
  for (const id of Object.keys(quests.rewards.resources)) {
    if (!resources.has(id)) errors.push(`quests.json: nagroda z nieznanym zasobem "${id}"`);
  }
  if (!Object.values(quests.rewards.weights).some((weight) => weight > 0)) errors.push('quests.json: żadna nagroda nie ma wagi');
  const parts = new Set(data.materials.parts.map((part) => part.id));
  if (quests.levels[0].fromLevel !== 1) errors.push('quests.json: levels musi zaczynać się od poziomu 1');
  quests.levels.forEach((band, index) => {
    if (index > 0 && band.fromLevel <= quests.levels[index - 1].fromLevel) errors.push('quests.json: fromLevel w levels musi rosnąć');
    if (!parts.has(band.part)) errors.push(`quests.json: nieznana część "${band.part}" od poziomu ${band.fromLevel}`);
    for (const id of Object.keys(band.chestRarities)) {
      if (!rarities.has(id)) errors.push(`quests.json: nieznana rzadkość "${id}" od poziomu ${band.fromLevel}`);
    }
  });
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateData();
  if (errors.length > 0) {
    for (const error of errors) console.log(`::error::${error}`);
    process.exit(1);
  }
  console.log(`Dane gry są poprawne (plików: ${DATA_FILES.length}).`);
}
