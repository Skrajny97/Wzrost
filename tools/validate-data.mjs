// Checks every game data file against its JSON Schema (data/schemas) and then
// checks references between files, e.g. that regions name existing monsters.
// Run: node tools/validate-data.mjs   (exits with 1 when something is wrong)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const DATA_DIR = new URL('../data/', import.meta.url);
export const DATA_FILES = [
  'stats', 'elements', 'effects', 'rarities', 'slots', 'classes',
  'item-bases', 'affixes', 'monsters', 'regions', 'balance', 'texts', 'unlocks',
];
// Unlocks the code refers to by id.
const REQUIRED_UNLOCKS = ['long-hunts', 'stats', 'skills', 'professions', 'training', 'settlement', 'dungeons', 'core'];
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

  for (const region of data.regions) {
    if (region.minLevel > region.maxLevel) errors.push(`regions.json: ${region.id} ma minLevel większy niż maxLevel`);
    for (const encounter of [...region.encounters, ...(region.tough ?? [])]) {
      for (const id of encounter.monsters) {
        const monster = monstersById.get(id);
        if (!monster) errors.push(`regions.json: ${region.id} ma nieznanego potwora "${id}"`);
        else if (monster.elite) errors.push(`regions.json: ${region.id} ma elitę "${id}" w zwykłym spotkaniu`);
      }
    }
    const elite = monstersById.get(region.elite);
    if (!elite) errors.push(`regions.json: ${region.id} ma nieznaną elitę "${region.elite}"`);
    else if (!elite.elite) errors.push(`regions.json: elita ${region.id} ("${region.elite}") nie jest oznaczona jako elite`);
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
  const fights = data.balance.hunt.fightsByMinutes;
  if (fights[0][0] > minMinutes) errors.push('balance.json: fightsByMinutes nie obejmuje najkrótszej wyprawy');
  for (let i = 1; i < fights.length; i++) {
    if (fights[i][0] <= fights[i - 1][0] || fights[i][1] < fights[i - 1][1]) errors.push('balance.json: fightsByMinutes musi rosnąć');
  }
  if (monsters.size === 0 || bases.size === 0) errors.push('Brak potworów lub przedmiotów.');
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
