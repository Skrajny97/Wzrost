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
  'resources', 'buildings', 'music', 'sounds', 'appearances', 'tutorial',
];
// Unlocks the code refers to by id.
const REQUIRED_UNLOCKS = ['stats', 'skills', 'professions', 'training', 'settlement', 'dungeons', 'core'];
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
  uniqueIds(errors, 'rarities', data.rarities);
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

  const basesById = new Map(data['item-bases'].map((base) => [base.id, base]));
  for (const base of data['item-bases']) {
    if (!slots.has(base.slot)) errors.push(`item-bases.json: ${base.id} ma nieznany slot "${base.slot}"`);
    if (base.scaling && !stats.has(base.scaling)) errors.push(`item-bases.json: ${base.id} skaluje się nieznaną statystyką`);
    if (base.stat && !stats.has(base.stat)) errors.push(`item-bases.json: ${base.id} ma nieznaną statystykę "${base.stat}"`);
    for (const element of base.elements ?? []) {
      if (!elements.has(element)) errors.push(`item-bases.json: ${base.id} ma nieznany żywioł "${element}"`);
    }
  }

  const affixStat = (stat) => stats.has(stat) || stat === 'armor' || (stat.startsWith('resist.') && elements.has(stat.slice(7)));
  for (const affix of [...data.affixes.prefixes, ...data.affixes.suffixes]) {
    if (!affixStat(affix.stat)) errors.push(`affixes.json: ${affix.id} ma nieznaną właściwość "${affix.stat}"`);
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
        }
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
  }

  // A building is paid in gold and resources, from the first level on: the
  // resources come from explorations.
  for (const building of data.buildings) {
    const { effect } = building;
    if (effect.kind === 'production') {
      if (!resources.has(effect.resource)) errors.push(`buildings.json: ${building.id} wytwarza nieznany zasób "${effect.resource}"`);
      if (!effect.storageHours) errors.push(`buildings.json: ${building.id} wytwarza zasób, ale nie ma storageHours`);
    } else if (effect.resource || effect.storageHours) {
      errors.push(`buildings.json: ${building.id} ma resource albo storageHours, choć niczego nie wytwarza`);
    }
    for (const cost of building.costs) {
      if (cost.resource !== 'gold' && !resources.has(cost.resource)) {
        errors.push(`buildings.json: ${building.id} kosztuje nieznany zasób "${cost.resource}"`);
      }
    }
  }

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

  // Music: files that exist, places that are regions, inner regions or the
  // camp, and report tracks that exist.
  const tracks = uniqueIds(errors, 'music', data.music.tracks);
  for (const track of data.music.tracks) {
    if (!existsSync(new URL(track.file, CLIENT_DIR))) errors.push(`music.json: brak pliku src/client/${track.file}`);
  }
  if (!tracks.has(data.music.default)) errors.push(`music.json: nieznany utwór domyślny ${data.music.default}`);
  const places = new Set(['camp', ...data.regions.flatMap((region) => [region.id, ...region.areas.map((area) => area.id)])]);
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
  for (const line of data.tutorial.lines) {
    if (line.voice && !existsSync(new URL(line.voice, CLIENT_DIR))) errors.push(`tutorial.json: brak pliku src/client/${line.voice}`);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateData();
  if (errors.length > 0) {
    for (const error of errors) console.log(`::error::${error}`);
    process.exit(1);
  }
  console.log(`Dane gry są poprawne (${DATA_FILES.length} plików).`);
}
