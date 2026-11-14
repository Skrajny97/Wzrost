// Checks every game data file against its JSON Schema (data/schemas) and then
// checks references between files, e.g. that regions name existing monsters.
// Run: node tools/validate-data.mjs   (exits with 1 when something is wrong)

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { fireBuilding, fireTrade } from '../src/engine/fire.js';
import { TIMED_KINDS, fightsText } from '../src/engine/potions.js';

const DATA_DIR = new URL('../data/', import.meta.url);
const CLIENT_DIR = new URL('../src/client/', import.meta.url);
export const DATA_FILES = [
  'stats', 'elements', 'effects', 'rarities', 'slots', 'classes',
  'item-bases', 'affixes', 'monsters', 'regions', 'balance', 'texts', 'unlocks',
  'resources', 'buildings', 'camp', 'music', 'sounds', 'appearances', 'tutorial', 'materials', 'quests', 'skills', 'professions', 'animations', 'skins', 'chat', 'community',
  'events', 'encyclopedia', 'evolutions', 'gift-codes', 'settlement', 'towers', 'portals', 'guilds', 'cosmetics', 'news', 'fame',
  'weeks', 'payments', 'party-events', 'labyrinth', 'cards',
];
// Unlocks the code refers to by id.
const REQUIRED_UNLOCKS = ['stats', 'quick-hunts', 'community', 'skills', 'evolution', 'professions', 'settlement', 'party', 'towers', 'portals', 'labyrinth', 'core'];
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
  // The events' foes have the shape of the creatures.
  const foes = ajv.compile(readJson('schemas/monsters.schema.json'));
  if (!foes(data.events.foes)) {
    for (const error of foes.errors) errors.push(`events.json/foes${error.instancePath || ''}: ${error.message}`);
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

// The class evolutions (evolutions.json): one for every path of every
// class, of a known class and path, with stats there are and two skills of
// its own, the first the path's skill grown (from). Each has one second form
// (from: the evolution it grows out of), of the same class, whose first
// skill grows one of that evolution's two, and each second form one third
// form the same way (where the data has any). Their skills have the numbers
// their kind needs, an effect text naming only numbers they have, and the
// points of the class levels after each evolution fill both to the top
// level with none left (the author's 40 + 50 = 45 + 45, then 90 + 100 =
// 95 + 95, then 190 + 100 = 145 + 145).
function checkEvolutions(data, { classIds, effectIds, elements, stats }) {
  const errors = [];
  const where = (id) => `evolutions.json: ${id}`;
  const { evolutions, skills, skillMaxLevel, lastPointClassLevel, pointsPerClassLevel, secondForms, thirdForms } = data.evolutions;
  const evolutionIds = uniqueIds(errors, 'evolutions', evolutions);
  const skillIds = uniqueIds(errors, 'evolutions (umiejętności)', skills);
  for (const id of skillIds) if (data.skills.some((skill) => skill.id === id)) errors.push(`${where(id)}: to id ma już umiejętność klasy`);
  const baseById = new Map(data.skills.map((skill) => [skill.id, skill]));
  const evolutionById = new Map(evolutions.map((evolution) => [evolution.id, evolution]));
  // A form's stage: 1 for a first evolution, one more for each form it
  // grows out of.
  const stageOf = (evolution, depth = 0) => {
    const parent = evolution?.from !== undefined ? evolutionById.get(evolution.from) : null;
    return parent && depth < 5 ? stageOf(parent, depth + 1) + 1 : 1;
  };
  const paths = new Set();
  const grown = new Set();
  for (const evolution of evolutions) {
    if (!classIds.has(evolution.classId)) errors.push(`${where(evolution.id)} ma nieznaną klasę "${evolution.classId}"`);
    for (const stat of Object.keys(evolution.growth)) if (!stats.has(stat)) errors.push(`${where(evolution.id)} ma przyrost nieznanej statystyki "${stat}"`);
    const own = evolution.skills.map((id) => skills.find((skill) => skill.id === id));
    const ownOk = !own.some((skill) => !skill || skill.evolution !== evolution.id);
    if (!ownOk) errors.push(`${where(evolution.id)} ma umiejętność, która nie jest jego`);
    if (evolution.from !== undefined) {
      // A second form: of the class of the evolution it grows out of, one
      // for each, and only out of a first evolution; a third form the same
      // out of a second one.
      const parent = evolutionById.get(evolution.from);
      if (!parent || stageOf(parent) > 2) errors.push(`${where(evolution.id)} wyrasta z "${evolution.from}", a to nie jest pierwsza ani druga ewolucja`);
      else {
        if (parent.classId !== evolution.classId) errors.push(`${where(evolution.id)} ma inną klasę niż "${evolution.from}"`);
        if (grown.has(evolution.from)) errors.push(`${where(evolution.id)}: z "${evolution.from}" wyrasta już inna ewolucja`);
        if (ownOk && !parent.skills.includes(own[0].from)) errors.push(`${where(evolution.id)}: pierwsza umiejętność rozwija "${own[0].from}", a nie umiejętność ewolucji "${evolution.from}"`);
      }
      grown.add(evolution.from);
      continue;
    }
    const path = baseById.get(evolution.path);
    if (!path || path.classId !== evolution.classId) errors.push(`${where(evolution.id)} prowadzi ścieżkę "${evolution.path}", której jego klasa nie ma`);
    if (paths.has(evolution.path)) errors.push(`${where(evolution.id)}: ścieżkę "${evolution.path}" prowadzi już inna ewolucja`);
    paths.add(evolution.path);
    if (ownOk && own[0].from !== evolution.path) errors.push(`${where(evolution.id)}: pierwsza umiejętność rozwija "${own[0].from}", a nie ścieżkę "${evolution.path}"`);
  }
  for (const skill of data.skills) if (!paths.has(skill.id)) errors.push(`skills.json: ścieżka ${skill.id} nie ma ewolucji`);
  for (const evolution of evolutions) if (evolution.from === undefined && !grown.has(evolution.id)) errors.push(`${where(evolution.id)} nie ma drugiej ewolucji`);
  // With third forms in the data, every second form has one.
  if (evolutions.some((evolution) => stageOf(evolution) === 3)) {
    for (const evolution of evolutions) if (stageOf(evolution) === 2 && !grown.has(evolution.id)) errors.push(`${where(evolution.id)} nie ma trzeciej ewolucji`);
  }
  const evolutionSkillIds = new Set(skills.map((skill) => skill.id));
  for (const skill of skills) {
    const at = where(skill.id);
    if (!evolutionIds.has(skill.evolution)) errors.push(`${at} ma nieznaną ewolucję "${skill.evolution}"`);
    else if (!evolutions.find((evolution) => evolution.id === skill.evolution).skills.includes(skill.id)) errors.push(`${at}: ewolucja "${skill.evolution}" jej nie wymienia`);
    const second = evolutionById.get(skill.evolution)?.from !== undefined;
    if (skill.from !== undefined && !(second ? evolutionSkillIds : baseById).has(skill.from)) errors.push(`${at} rozwija nieznaną umiejętność "${skill.from}"`);
    const params = skill.params;
    if (params.dotEffect !== undefined && !effectIds.has(params.dotEffect)) errors.push(`${at} ma nieznany efekt "${params.dotEffect}"`);
    for (const element of [params.element, ...String(params.elements ?? '').split(' ').filter(Boolean)]) {
      if (element !== undefined && !elements.has(element)) errors.push(`${at} ma nieznany żywioł "${element}"`);
    }
    if (params.category !== undefined && !['physical', 'magical'].includes(params.category)) errors.push(`${at} ma nieznany rodzaj obrażeń "${params.category}"`);
    for (const [, name] of skill.effect.matchAll(/\{(\w+)(?:%\.1|%| pp|\.1)?\}/g)) {
      if (!(name in params) && name !== 'cooldown' && name !== 'critPower') errors.push(`${at} ma w opisie skutku nieznaną liczbę "${name}"`);
    }
  }
  const before = (data.balance.skills.lastPointClassLevel - data.balance.skills.unlockClassLevel + 1) * data.balance.skills.pointsPerClassLevel;
  const after = (lastPointClassLevel - data.balance.skills.lastPointClassLevel) * pointsPerClassLevel;
  if (before + after !== 2 * skillMaxLevel) errors.push(`evolutions.json: ${before} punktów sprzed ewolucji i ${after} po niej nie dają dwóch umiejętności po ${skillMaxLevel} poziomów`);
  // The second forms: every point back and those of the class levels after
  // them, up to their last, fill both of their skills to their top level.
  const later = (secondForms.lastPointClassLevel - lastPointClassLevel) * secondForms.pointsPerClassLevel;
  if (before + after + later !== 2 * secondForms.skillMaxLevel) {
    errors.push(`evolutions.json: ${before + after} punktów sprzed drugiej ewolucji i ${later} po niej nie dają dwóch umiejętności po ${secondForms.skillMaxLevel} poziomów`);
  }
  if (secondForms.lastPointClassLevel >= (data.balance.progression.classEvolutionLevels[2] ?? Infinity)) errors.push('evolutions.json: ostatni Punkt Umiejętności drugiej ewolucji przychodzi dopiero z trzecią');
  // The third forms the same: every point back and those of the class
  // levels after them, up to their last, fill both of their skills.
  if (thirdForms) {
    const third = (thirdForms.lastPointClassLevel - secondForms.lastPointClassLevel) * thirdForms.pointsPerClassLevel;
    if (before + after + later + third !== 2 * thirdForms.skillMaxLevel) {
      errors.push(`evolutions.json: ${before + after + later} punktów sprzed trzeciej ewolucji i ${third} po niej nie dają dwóch umiejętności po ${thirdForms.skillMaxLevel} poziomów`);
    }
    if (thirdForms.lastPointClassLevel >= (data.balance.progression.classEvolutionLevels[3] ?? Infinity)) errors.push('evolutions.json: ostatni Punkt Umiejętności trzeciej ewolucji przychodzi dopiero z czwartą');
    for (const skill of skills) {
      const evolution = evolutionById.get(skill.evolution);
      const rules = [null, null, secondForms, thirdForms][evolution ? stageOf(evolution) : 1];
      if (rules && skill.from !== undefined && evolutionById.get(evolution.from)?.skills.includes(skill.from) === false) {
        errors.push(`${where(skill.id)} rozwija "${skill.from}", a to nie jest umiejętność ewolucji "${evolution.from}"`);
      }
    }
  }
  return errors;
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
    if (effect.element !== undefined && !elements.has(effect.element)) errors.push(`effects.json: ${effect.id} ma nieznany żywioł "${effect.element}"`);
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
  // part that the Stół rozbiórki makes.
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
    // than the first base's (up to 35% more, as Tier VIII's x1.35 rounded up
    // to hundredths, never a big multiplier) and a flat bonus on top.
    if (base.family !== undefined) {
      const first = basesById.get(base.family);
      const factor = { weapon: 'damageFactor', armor: 'armorFactor', implicit: 'statFactor' }[base.kind];
      if (!first || first.family !== undefined) errors.push(`item-bases.json: ${base.id} ma rodzinę "${base.family}", która nie jest pierwszą bazą kategorii`);
      else if (first.slot !== base.slot || first.kind !== base.kind) errors.push(`item-bases.json: ${base.id} ma inny slot albo rodzaj niż kategoria "${base.family}"`);
      else if (!(base[factor] > first[factor]) || base[factor] > Math.ceil(first[factor] * 135 - 1e-9) / 100) {
        errors.push(`item-bases.json: ${base.id} ma mieć trochę wyższy ${factor} niż kategoria "${base.family}" (więcej niż ${first[factor]}, najwyżej o 35%)`);
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
    shield: ['below', 'pool', 'ratio'],
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
  // The author: the points fill both paths to the top level, with none left,
  // and all of them come before the first evolution.
  {
    const { unlockClassLevel, lastPointClassLevel, pointsPerClassLevel, paths, maxLevel } = data.balance.skills;
    const points = (lastPointClassLevel - unlockClassLevel + 1) * pointsPerClassLevel;
    if (points !== paths * maxLevel) errors.push(`balance.json: poziomy klasy ${unlockClassLevel}–${lastPointClassLevel} dają ${points} Punktów Umiejętności, a ${paths} ścieżki po ${maxLevel} poziomów biorą ${paths * maxLevel}`);
    if (lastPointClassLevel >= data.balance.progression.classEvolutionLevels[0]) errors.push(`balance.json: ostatni Punkt Umiejętności (poziom klasy ${lastPointClassLevel}) przychodzi dopiero z pierwszą ewolucją albo po niej`);
  }
  // A skill's own sound names a skill there is, of a class or of an evolution.
  const soundSkills = new Set([...data.skills, ...data.evolutions.skills].map((skill) => `skill-${skill.id}`));
  for (const name of Object.keys(data.sounds.effects)) {
    if (name.startsWith('skill-') && !soundSkills.has(name)) errors.push(`sounds.json: effects ma dźwięk "${name}" nieznanej umiejętności`);
  }
  // Each skill's path has its own name within its class.
  const pathNames = new Set();
  for (const skill of data.skills) {
    const key = `${skill.classId}:${skill.path}`;
    if (pathNames.has(key)) errors.push(`skills.json: ścieżka "${skill.path}" powtarza się w klasie ${skill.classId}`);
    pathNames.add(key);
  }

  errors.push(...checkEvolutions(data, { classIds, effectIds, elements, stats }));

  // Gift codes: their own ids and codes, a date they end at, and camp
  // resources there are. A code repeats only for different single
  // characters (`for`, as the PC code for several players): a code for
  // everyone stands alone.
  {
    const codes = data['gift-codes'].codes;
    uniqueIds(errors, 'gift-codes', codes);
    const typed = new Map();
    for (const gift of codes) {
      const owners = typed.get(gift.code) ?? [];
      const owner = gift.for ?? '';
      if (owners.length > 0 && (owner === '' || owners.includes('') || owners.includes(owner))) errors.push(`gift-codes.json: kod ${gift.code} powtarza się`);
      typed.set(gift.code, [...owners, owner]);
      if (Number.isNaN(Date.parse(gift.until))) errors.push(`gift-codes.json: ${gift.id} ma nieczytelną datę końca "${gift.until}"`);
      if (gift.from !== undefined && Number.isNaN(Date.parse(gift.from))) errors.push(`gift-codes.json: ${gift.id} ma nieczytelną datę początku "${gift.from}"`);
      else if (gift.from !== undefined && Date.parse(gift.from) >= Date.parse(gift.until)) errors.push(`gift-codes.json: ${gift.id} kończy się, zanim zacznie działać`);
      for (const id of Object.keys(gift.rewards.resources ?? {})) {
        if (!resources.has(id)) errors.push(`gift-codes.json: ${gift.id} daje nieznany zasób "${id}"`);
      }
    }
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
  // The events' foes fight as creatures do, so they are checked the same way.
  for (const monster of [...data.monsters, ...data.events.foes]) {
    statKeys('monsters', monster.id, monster.stats.base, { all: true });
    statKeys('monsters', monster.id, monster.stats.growth);
    if (!stats.has(monster.attack.scaling)) errors.push(`monsters.json: ${monster.id} skaluje atak nieznaną statystyką`);
    if (monster.attack.element && !elements.has(monster.attack.element)) {
      errors.push(`monsters.json: ${monster.id} ma nieznany żywioł ataku`);
    }
    if (monster.attack.dot && !effects.has(monster.attack.dot.effect)) {
      errors.push(`monsters.json: ${monster.id} nakłada nieznany efekt "${monster.attack.dot.effect}"`);
    }
    if (monster.attack.slow && !effects.has(monster.attack.slow.effect)) {
      errors.push(`monsters.json: ${monster.id} spowalnia nieznanym efektem "${monster.attack.slow.effect}"`);
    }
    for (const element of Object.keys(monster.resistances ?? {})) {
      if (!elements.has(element)) errors.push(`monsters.json: ${monster.id} ma odporność na nieznany żywioł "${element}"`);
    }
    for (const element of Object.keys(monster.weaknesses ?? {})) {
      if (!elements.has(element)) errors.push(`monsters.json: ${monster.id} ma słabość na nieznany żywioł "${element}"`);
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
    errors.push('buildings.json: brak budynku z craftSpeed (Stół rozbiórki), bez którego nie ma przeróbki materiałów');
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
    // Its queue's orders can be taken off it, in these words (crafting.js).
    if (!building.queue) errors.push(`buildings.json: ${building.id} potrzebuje queue (teksty usuwania zleceń z kolejki)`);
  }
  if (data.buildings.some((building) => building.queue && building.effect.kind !== 'craftSpeed')) {
    errors.push('buildings.json: queue (usuwanie zleceń z kolejki) ma tylko Stół rozbiórki (craftSpeed)');
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
    for (const id of building.exchange?.resources ?? []) {
      if (!resources.has(id)) errors.push(`buildings.json: ${building.id} wymienia nieznany zasób "${id}"`);
    }
    // The exchange's rates: one for each level at most, never higher than at
    // the level before.
    const rates = building.exchange?.rates ?? [];
    if (rates.length > building.maxLevel) errors.push(`buildings.json: ${building.id} ma więcej stawek wymiany niż poziomów`);
    if (rates.some((rate, i) => i > 0 && rate > rates[i - 1])) errors.push(`buildings.json: stawki wymiany w ${building.id} nie mogą rosnąć z poziomem`);
    // The dealer's rarities (every rarity has its part): known ones, never
    // lower than at the level before.
    const shopCaps = (building.shop?.rarities ?? []).map((id) => rarityOrder.indexOf(id));
    if (shopCaps.includes(-1)) errors.push(`buildings.json: ${building.id} sprzedaje części nieznanej rzadkości`);
    else if (shopCaps.some((index, i) => i > 0 && index < shopCaps[i - 1])) errors.push(`buildings.json: rzadkości w sklepie ${building.id} nie mogą maleć z poziomem`);
    if (shopCaps.length > building.maxLevel) errors.push(`buildings.json: ${building.id} ma w sklepie więcej rzadkości niż poziomów`);
    // A daily limit for every rarity, smaller (or the same) for a rarer one.
    if (building.shop) {
      const daily = rarityOrder.map((id) => building.shop.daily[id]);
      if (daily.includes(undefined) || Object.keys(building.shop.daily).length !== rarityOrder.length) {
        errors.push(`buildings.json: ${building.id} musi mieć w shop.daily limit każdej rzadkości`);
      } else if (daily.some((limit, i) => i > 0 && limit > daily[i - 1])) errors.push(`buildings.json: dzienne limity w sklepie ${building.id} nie mogą rosnąć z rzadkością`);
    }
  }
  // The fire spirit's trade lives in one building (src/engine/fire.js), and
  // so do the dealer's counter (src/engine/shop.js) and the resources'
  // exchange (src/engine/exchange.js).
  if (data.buildings.filter((building) => building.trade).length > 1) errors.push('buildings.json: wymianę złota (trade) może mieć tylko jeden budynek');
  if (data.buildings.filter((building) => building.shop).length > 1) errors.push('buildings.json: sprzedaż części (shop) może mieć tylko jeden budynek');
  if (data.buildings.filter((building) => building.exchange).length > 1) errors.push('buildings.json: wymianę zasobów (exchange) może mieć tylko jeden budynek');
  // The Duch budowniczego at the Kamień węgielny (src/engine/builder-spirit.js)
  // buys the camp's resources only, each for less than the fire spirit sells a
  // piece of it at the Ognisko's top level (the design: "Najwyższa cena skupu
  // u dowolnego NPC musi być niższa od najniższej ceny sprzedaży"), so gold
  // never grows from buying and selling back.
  const spirit = data.camp.cornerstone?.spirit;
  const fire = fireBuilding(data);
  for (const [id, gold] of Object.entries(spirit?.gold ?? {})) {
    if (!resources.has(id)) errors.push(`camp.json: duch budowniczego skupuje nieznany zasób "${id}"`);
    else if (fire?.trade.resources.includes(id) && gold / spirit.lot >= fireTrade(fire.maxLevel, data).unitGold) {
      errors.push(`camp.json: duch budowniczego płaci za "${id}" co najmniej tyle, ile duch ognia bierze za sztukę`);
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

  // Skin tones: the default among them, every tone recoloured on its own
  // ramp, Jasna too (the author: "567 A"), and a file for every portrait in
  // every tone.
  const tones = uniqueIds(errors, 'skins', data.skins.skins);
  if (!tones.has(data.skins.default)) errors.push(`skins.json: nieznany odcień domyślny ${data.skins.default}`);
  for (const tone of data.skins.skins.filter((candidate) => !candidate.ramp)) errors.push(`skins.json: odcień ${tone.id} nie ma rampy`);
  for (const tone of data.skins.skins.filter((candidate) => candidate.ramp)) {
    for (const cls of data.classes) {
      for (const look of data.appearances) {
        // The portrait, and the walking figure of the Walka scene.
        for (const [kind, tool] of [['portraits', 'skin-tones.py'], ['walkers', 'walk-tones.py']]) {
          const file = `art/${kind}/${cls.id}-${look.id}-${tone.id}.png`;
          if (existsSync(new URL(`art/${kind}/${cls.id}-${look.id}.png`, CLIENT_DIR)) && !existsSync(new URL(file, CLIENT_DIR))) {
            errors.push(`skins.json: brak pliku src/client/${file} (python3 tools/${tool})`);
          }
        }
      }
    }
  }

  // Waiting scenes: files that exist, scenes of professions that exist (a
  // profession may wait for its own: Górnictwo and Jubilerstwo work without
  // one, and src/client/scenes.js shows none), the lands of regions, and the
  // light of the day from midnight on.
  const animations = data.animations;
  const sceneFiles = [
    ...Object.values(animations.work).map((sheet) => sheet.file),
    animations.walk.figure.file,
    animations.walk.path,
    ...Object.values(animations.walk.lands),
    animations.bird,
  ];
  for (const file of sceneFiles) {
    if (!existsSync(new URL(file, CLIENT_DIR))) errors.push(`animations.json: brak pliku src/client/${file}`);
  }
  for (const id of Object.keys(animations.work)) {
    if (!data.professions.professions.some((profession) => profession.id === id)) errors.push(`animations.json: nieznana profesja ${id}`);
  }
  for (const id of Object.keys(animations.walk.lands)) {
    if (!data.regions.some((region) => region.id === id)) errors.push(`animations.json: nieznany region ${id}`);
  }
  // A rider on the larger canvas (walk.rider.large) is drawn at its size, in
  // every skin tone, and its seat lies within it.
  const large = animations.walk.rider.large;
  if (large) {
    const [seatX, seatY] = large.seat;
    if (seatX >= large.width || seatY >= large.height) errors.push('animations.json: siodło dużego jeźdźca poza płótnem');
    for (const id of large.ids) {
      for (const tone of ['', ...data.skins.skins.filter((skin) => skin.ramp).map((skin) => `-${skin.id}`)]) {
        const size = pngSize(`art/riders/${id}${tone}.png`);
        if (!size) errors.push(`animations.json: brak jeźdźca src/client/art/riders/${id}${tone}.png`);
        else if (size.width !== large.width || size.height !== large.height) errors.push(`animations.json: jeździec ${id}${tone} ma ${size.width} × ${size.height}, a nie ${large.width} × ${large.height}`);
      }
    }
  }
  for (const range of [animations.moments.firstSeconds, animations.moments.seconds]) {
    if (range[1] < range[0]) errors.push('animations.json: przedział czasu rzadkich zdarzeń od większej liczby');
  }
  const hours = animations.dayParts.map((part) => part.from);
  if (hours[0] !== 0 || hours.some((hour, i) => i > 0 && hour <= hours[i - 1])) errors.push('animations.json: dayParts od godziny 0, rosnąco');

  // Music: files that exist, places that are regions, inner regions, the
  // camp, a tab with music (src/client/app.js: the routes' music), the
  // Osada or one of its places (settlement:<id>; its screen sets them once
  // open), and report tracks that exist.
  const tracks = uniqueIds(errors, 'music', data.music.tracks);
  for (const track of data.music.tracks) {
    if (!existsSync(new URL(track.file, CLIENT_DIR))) errors.push(`music.json: brak pliku src/client/${track.file}`);
  }
  if (!tracks.has(data.music.default)) errors.push(`music.json: nieznany utwór domyślny ${data.music.default}`);
  const places = new Set([
    'camp',
    'skills',
    'professions',
    'evolution',
    'settlement',
    ...data.settlement.places.map((place) => `settlement:${place.id}`),
    ...data.regions.flatMap((region) => [region.id, ...region.areas.map((area) => area.id)]),
  ]);
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
    // Its computer version too (519), with its own recordings.
    for (const told of [line, line.desktop, ...Object.values(line.classes ?? {})].filter(Boolean)) {
      for (const voice of [told.voice, told.female?.voice]) {
        if (voice && !existsSync(new URL(voice, CLIENT_DIR))) errors.push(`tutorial.json: brak pliku src/client/${voice}`);
      }
    }
  }
  errors.push(...checkQuests(data, { resources, rarities }));
  errors.push(...checkProfessions(data, { stats }));
  uniqueIds(errors, 'chat', data.chat.channels);
  // The first channel, the Globalny, is everyone's on every server (the
  // Loteria's result goes there, casino.js), and a language has one channel.
  if (data.chat.channels[0].language) errors.push('chat.json: pierwszy kanał nie może mieć language');
  const languages = data.chat.channels.map((channel) => channel.language).filter(Boolean);
  if (new Set(languages).size !== languages.length) errors.push('chat.json: jeden język ma najwyżej jeden kanał');
  const { pollSeconds, page, keep } = data.chat.rules;
  if (pollSeconds.min > pollSeconds.max) errors.push('chat.json: rules.pollSeconds.min nie może być większe niż max');
  if (page > keep) errors.push('chat.json: rules.page nie może być większe niż keep');
  // The Społeczność's list needs the parts the page draws, and has no Czat
  // since 0.2.40 (the author: „tylko z zakładki”): the page draws no Czat
  // among them.
  uniqueIds(errors, 'community', data.community.sections);
  for (const id of ['friends', 'ranking']) {
    const section = data.community.sections.find((candidate) => candidate.id === id);
    if (!section || section.soon) errors.push(`community.json: brak otwartego działu ${id}`);
  }
  if (data.community.sections.some((section) => section.id === 'chat')) errors.push('community.json: Czat nie jest działem Społeczności (otwiera go kółko czatu)');
  errors.push(...checkEvents(data, { monsters, rarities }));
  errors.push(...checkPartyEvents(data, { monsters }));
  errors.push(...checkEncyclopedia(data));
  errors.push(...checkSettlement(data, { rarities }));
  errors.push(...checkStable(data));
  errors.push(...checkTannery(data));
  errors.push(...checkResidentGifts(data));
  errors.push(...checkCasino(data));
  errors.push(...checkCosmetics(data));
  errors.push(...checkTowers(data));
  errors.push(...checkPortals(data));
  errors.push(...checkLabyrinth(data, { stats, elements, rarities }));
  errors.push(...checkCards(data, { rarities }));
  errors.push(...checkGuildSeat(data, { resources }));
  errors.push(...checkGuildExpedition(data));
  errors.push(...checkGuildWar(data));
  errors.push(...checkWeeks(data, { stats }));
  errors.push(...checkPayments(data));
  return errors;
}

// The payments for Punkty Systemu (payments.json): each pack once, more
// points for more money, the limits let the dearest pack be bought, and the
// quarters' time zone is one the clock knows.
function checkPayments(data) {
  const errors = [];
  const { packs, monthlyLimit } = data.payments;
  uniqueIds(errors, 'payments', packs);
  for (let i = 1; i < packs.length; i += 1) {
    if (packs[i].points <= packs[i - 1].points || packs[i].price <= packs[i - 1].price) errors.push(`payments.json: pakiet ${packs[i].id} musi dawać więcej punktów za więcej pieniędzy niż ${packs[i - 1].id}`);
  }
  if (packs.some((pack) => pack.price > monthlyLimit)) errors.push('payments.json: limit miesięczny mniejszy niż cena pakietu');
  const { quarterLimit, timeZone } = data.payments;
  if (quarterLimit !== null && packs.some((pack) => pack.price > quarterLimit)) errors.push('payments.json: limit kwartalny mniejszy niż cena pakietu');
  try {
    new Intl.DateTimeFormat('pl-PL', { timeZone });
  } catch {
    errors.push(`payments.json: nieznana strefa czasu ${timeZone}`);
  }
  return errors;
}

// The guild wars (guilds.json, war; 792–800): the Gildia page has the
// Wojna tab, last; a full guild holds all its teams (793 A: 30 members, 6
// teams of 5); the pictures behind the war, under its battles and of the
// banners are there; the mirror guild's tag is as a guild's.
function checkGuildWar(data) {
  const errors = [];
  const { war, tabs, size, tag } = data.guilds;
  if (tabs.at(-1)?.id !== 'war') errors.push('guilds.json: Wojna (war) powinna być ostatnią zakładką strony Gildii');
  if (size > war.teamSize * war.maxTeams) errors.push(`guilds.json: gildia mieści ${size} członków, a drużyn jest najwyżej ${war.maxTeams} po ${war.teamSize}`);
  for (const [folder, id] of [['places', war.backdrop], ['boards', war.fightBoard], ['guild', war.banner]]) {
    if (!existsSync(new URL(`art/${folder}/${id}.png`, CLIENT_DIR))) errors.push(`guilds.json: wojny nie mają obrazka src/client/art/${folder}/${id}.png`);
  }
  const mirror = [...war.mirror.tag].length;
  if (mirror < tag.min || mirror > tag.max || !/^[\p{Lu}\p{N}]+$/u.test(war.mirror.tag)) errors.push(`guilds.json: skrót lustrzanej gildii "${war.mirror.tag}" nie jest skrótem gildii`);
  return errors;
}

// The weeks of the year (weeks.json; the author, 10.11.2026): all 52 in
// their order, each number once, a stat effect of a known stat, no other
// effect with one, and every stat named in the effects' words.
function checkWeeks(data, { stats }) {
  const errors = [];
  uniqueIds(errors, 'weeks', data.weeks.weeks);
  for (const [index, week] of data.weeks.weeks.entries()) {
    if (week.number !== index + 1) errors.push(`weeks.json: ${week.id} powinien mieć numer ${index + 1}`);
    for (const effect of week.effects) {
      if ((effect.kind === 'stat') !== (effect.stat !== undefined)) errors.push(`weeks.json: ${week.id}: statystyka (stat) tylko przy rodzaju stat, i tam koniecznie`);
      else if (effect.stat !== undefined && !stats.has(effect.stat)) errors.push(`weeks.json: ${week.id} ma nieznaną statystykę "${effect.stat}"`);
    }
  }
  for (const stat of stats) if (!data.weeks.stats[stat]) errors.push(`weeks.json: stats nie ma statystyki "${stat}"`);
  for (const stat of Object.keys(data.weeks.stats)) if (!stats.has(stat)) errors.push(`weeks.json: stats ma nieznaną statystykę "${stat}"`);
  return errors;
}

// The Wyprawa Gildii (guilds.json, expedition; 621 A): the Gildia page has
// its tab, and every land has as many different creatures as the route has
// guardians (src/engine/guild-expedition.js picks them), its last stage
// giving the rare item.
function checkGuildExpedition(data) {
  const errors = [];
  const { guardians } = data.guilds.expedition;
  if (!data.guilds.tabs.some((tab) => tab.id === 'expedition')) errors.push('guilds.json: strona Gildii nie ma zakładki Wyprawy (expedition)');
  if (!guardians.at(-1)?.item) errors.push('guilds.json: ostatni strażnik Wyprawy powinien dawać przedmiot (item)');
  for (const region of data.regions) {
    const creatures = new Set(
      region.areas.flatMap((area) => [...area.encounters, ...(area.tough ?? [])].flatMap((encounter) => encounter.monsters).concat(area.elite ?? region.elite ?? [], area.champion ?? [])),
    );
    if (creatures.size < guardians.length) errors.push(`guilds.json: kraina ${region.id} ma ${creatures.size} stworów, a Wyprawa ${guardians.length} strażników`);
  }
  return errors;
}

// The Siedziba Gildii (guilds.json, seat; 616 A): buildings of their own
// ids, each taking a known camp resource beside gold and with its picture
// (src/client/art/guild); the Gildia page has its tab.
function checkGuildSeat(data, { resources }) {
  const errors = [];
  const { buildings } = data.guilds.seat;
  uniqueIds(errors, 'guilds (seat)', buildings);
  for (const building of buildings) {
    if (!resources.has(building.resource)) errors.push(`guilds.json: budynek Siedziby ${building.id} bierze nieznany zasób "${building.resource}"`);
    if (!existsSync(new URL(`art/guild/${building.id}.png`, CLIENT_DIR))) errors.push(`guilds.json: budynek Siedziby ${building.id} nie ma obrazka src/client/art/guild/${building.id}.png`);
  }
  if (!data.guilds.tabs.some((tab) => tab.id === 'seat')) errors.push('guilds.json: strona Gildii nie ma zakładki Siedziby (seat)');
  return errors;
}

// The events at the end of an exploration: their foes apart from the
// creatures (no Bestiariusz), each fight with foes, and options unique.
function checkEvents(data, { monsters, rarities }) {
  const errors = [];
  const { events } = data;
  const foes = uniqueIds(errors, 'events', events.foes);
  for (const id of foes) if (monsters.has(id)) errors.push(`events.json: przeciwnik ${id} ma id stwora z monsters.json`);
  const herbs = new Set(data.professions.herbs.map((herb) => herb.id));
  const classes = new Set(data.classes.map((cls) => cls.id));
  const brotherhoods = new Set(data.settlement.brotherhoods.map((brotherhood) => brotherhood.id));
  const residents = new Set(data.settlement.residents.map((resident) => resident.id));
  uniqueIds(errors, 'events', events.list);
  // The relation with residents of the Osada (818.3) and a companion's
  // errand (817.7) an outcome or a won fight brings: residents of the Osada
  // in an event of the Osada, and the errand only in a companion's.
  const checkTies = (where, gives, event) => {
    for (const id of Object.keys(gives?.relation ?? {})) if (!residents.has(id)) errors.push(`events.json: ${where} ma nieznanego mieszkańca "${id}"`);
    if (gives?.relation && !event.settlement) errors.push(`events.json: ${where} daje relację z mieszkańcem, a zdarzenie nie ma settlement`);
    if (gives?.companion && !event.companion) errors.push(`events.json: ${where} rozstrzyga sprawę towarzysza, a zdarzenie nie jest sprawą towarzysza`);
  };
  const checkRarities = (where, weights) => {
    for (const id of Object.keys(weights ?? {})) if (!rarities.has(id)) errors.push(`events.json: ${where} ma nieznaną rzadkość "${id}"`);
  };
  // An outcome of an option (`option`) of an event (`event`); `priced` when
  // an option of its path has a price.
  const checkOutcome = (where, outcome, { event, option, priced = Boolean(option?.goldPerLevel), inherits = false }) => {
    const fighting =
      outcome.foes || outcome.ambush || outcome.speedBonus || outcome.itemChance !== undefined || outcome.start || outcome.win;
    const rewarding =
      outcome.gold !== undefined ||
      outcome.itemRarities ||
      outcome.herbs ||
      outcome.buff ||
      outcome.points ||
      outcome.herbsKnown ||
      outcome.xpFoes ||
      outcome.reputation ||
      outcome.rumor ||
      outcome.relation ||
      outcome.companion ||
      outcome.stakeBack;
    const losing = outcome.goldShare !== undefined || outcome.goldCapPerLevel !== undefined || outcome.resourcesShare !== undefined;
    if (outcome.kind === 'fight') {
      if (!outcome.foes) errors.push(`events.json: ${where} ma walkę bez przeciwników`);
      // People of the events, or creatures of monsters.json (the Błędnica).
      for (const id of outcome.foes ?? []) if (!foes.has(id) && !monsters.has(id)) errors.push(`events.json: ${where} ma nieznanego przeciwnika "${id}"`);
      if (!outcome.start?.includes('{enemies}')) errors.push(`events.json: ${where} potrzebuje zdania start z {enemies}`);
      checkRarities(where, outcome.win?.itemRarities);
      if (outcome.win?.itemRarities && !outcome.win.text?.includes('{item}')) errors.push(`events.json: ${where} potrzebuje zdania win.text z {item}`);
      if ((outcome.win?.relation || outcome.win?.companion) && !outcome.win.text) errors.push(`events.json: ${where} potrzebuje zdania win.text o relacji`);
      checkTies(where, outcome.win, event);
      // A companion's errand fought: settled whatever the fight's end (817.7),
      // so one not won names the errand too, with a sentence about it.
      if (outcome.win?.companion && !outcome.lose?.companion?.errand) errors.push(`events.json: ${where} potrzebuje lose.companion.errand: sprawa zamyka się też po przegranej`);
      if (outcome.lose?.companion?.relation !== undefined) errors.push(`events.json: ${where} nie daje relacji po przegranej (lose.companion.relation)`);
      if (outcome.lose && !outcome.lose.text) errors.push(`events.json: ${where} potrzebuje zdania lose.text`);
      checkTies(where, outcome.lose, event);
    } else if (fighting) {
      errors.push(`events.json: ${where} ma ustawienia walki bez walki`);
    }
    if (outcome.kind === 'reward') {
      if (!rewarding) errors.push(`events.json: ${where} ma nagrodę bez złota, przedmiotu, ziół, wzmocnienia, punktów, XP, reputacji i plotki`);
      if (outcome.gold !== undefined && !outcome.text.includes('{gold}')) errors.push(`events.json: ${where} potrzebuje {gold} w tekście`);
      if (outcome.itemRarities && !outcome.text.includes('{item}')) errors.push(`events.json: ${where} potrzebuje {item} w tekście`);
      // A strengthening or a curse says for how many fights.
      if (outcome.buff && !outcome.text.includes(fightsText(outcome.buff.fights, data.professions))) errors.push(`events.json: ${where} ma podać w tekście „${fightsText(outcome.buff.fights, data.professions)}”`);
      checkRarities(where, outcome.itemRarities);
      for (const id of Object.keys(outcome.herbs ?? {})) if (!herbs.has(id)) errors.push(`events.json: ${where} ma nieznane zioło "${id}"`);
      if (outcome.herbsKnown && !outcome.text.includes('{herbs}')) errors.push(`events.json: ${where} potrzebuje {herbs} w tekście`);
      if (outcome.herbsKnown && !outcome.herbsKnown.goldText.includes('{gold}')) errors.push(`events.json: ${where} potrzebuje {gold} w herbsKnown.goldText`);
      for (const id of outcome.xpFoes ?? []) if (!foes.has(id) && !monsters.has(id)) errors.push(`events.json: ${where} ma nieznanego przeciwnika "${id}" w xpFoes`);
      if (outcome.xpFoes && !outcome.text.includes('{xp}')) errors.push(`events.json: ${where} potrzebuje {xp} w tekście`);
      for (const id of Object.keys(outcome.reputation ?? {})) if (!brotherhoods.has(id)) errors.push(`events.json: ${where} ma nieznane bractwo "${id}"`);
      if (outcome.reputation && !event.settlement) errors.push(`events.json: ${where} daje reputację Osady, a zdarzenie nie ma settlement`);
      if (outcome.rumor && !(outcome.text.includes('{area}') && outcome.noRumorText)) errors.push(`events.json: ${where} potrzebuje plotki z {area} w tekście i zdania noRumorText`);
      // A stake won back is the option's price times stakeBack, told as {gold}.
      if (outcome.stakeBack && !priced) errors.push(`events.json: ${where} zwraca stawkę opcji, która nie ma ceny`);
      if (outcome.stakeBack && !outcome.text.includes('{gold}')) errors.push(`events.json: ${where} potrzebuje {gold} w tekście`);
      checkTies(where, outcome, event);
    } else if (rewarding) {
      errors.push(`events.json: ${where} ma nagrodę bez kind reward`);
    }
    if (outcome.kind === 'loss') {
      if (outcome.goldShare === undefined && outcome.resourcesShare === undefined) errors.push(`events.json: ${where} ma stratę bez goldShare i resourcesShare`);
      if (outcome.goldShare !== undefined && !outcome.lossText?.includes('{gold}')) errors.push(`events.json: ${where} potrzebuje zdania lossText z {gold}`);
      if (outcome.resourcesShare !== undefined && !outcome.lossText?.includes('{resources}')) errors.push(`events.json: ${where} potrzebuje zdania lossText z {resources}`);
    } else if (losing) {
      errors.push(`events.json: ${where} ma stratę z sakiewki albo zasobów bez kind loss`);
    }
    if (outcome.kind === 'faint') {
      if (!outcome.goldLoss) errors.push(`events.json: ${where} ma omdlenie bez goldLoss`);
      if (!outcome.lossText?.includes('{gold}')) errors.push(`events.json: ${where} potrzebuje zdania lossText z {gold}`);
    } else if (outcome.goldLoss !== undefined || (outcome.lossText !== undefined && outcome.kind !== 'loss')) {
      errors.push(`events.json: ${where} ma stratę złota bez kind faint`);
    }
    // A further choice: its own options, each with an outcome, or only its
    // words in a case, which keeps the option's options (`inherits`).
    if (outcome.kind === 'choice') {
      if (outcome.options) {
        uniqueIds(errors, `events (${where})`, outcome.options);
        for (const next of outcome.options) {
          for (const id of next.classes ?? []) if (!classes.has(id)) errors.push(`events.json: ${where}/${next.id} ma nieznaną klasę "${id}"`);
          if (next.outcome) checkOutcomes(`${where}/${next.id}`, next.outcome, { event, option: next, priced: priced || Boolean(next.goldPerLevel) });
        }
      } else if (!inherits) {
        errors.push(`events.json: ${where} ma dalszy wybór bez opcji`);
      }
    } else if (outcome.options) {
      errors.push(`events.json: ${where} ma opcje bez kind choice`);
    }
    // The price: told only where an option of the path has one.
    if (!priced && (outcome.free || outcome.text.includes('{cost}'))) errors.push(`events.json: ${where} mówi o cenie opcji, która jej nie ma`);
  };
  // An outcome or a list of them, each drawn by its weight. An outcome of a
  // list that "Testuj zdarzenia" can choose has both an id and a name, and
  // the live game, which leaves the drafts out, needs one to draw.
  const checkOutcomes = (where, outcomes, context) => {
    if (!Array.isArray(outcomes)) return checkOutcome(where, outcomes, context);
    outcomes.forEach((outcome, index) => {
      if (outcome.weight === undefined) errors.push(`events.json: ${where} [${index}] na liście skutków potrzebuje wagi`);
      if ((outcome.id === undefined) !== (outcome.name === undefined)) errors.push(`events.json: ${where} [${index}] potrzebuje i id, i name albo żadnego z nich`);
      checkOutcome(`${where} [${index}]`, outcome, context);
    });
    uniqueIds(errors, `events (${where})`, outcomes.filter((outcome) => outcome.id));
    if (outcomes.every((outcome) => outcome.draft)) errors.push(`events.json: ${where} ma same szkice, więc w grze nie byłoby czego losować`);
  };
  // An event limited to inner regions comes only where the creatures it
  // fights live (the author: the wounded woman only where the Błędnica is).
  const living = new Map();
  for (const region of data.regions) {
    for (const area of region.areas) {
      const ids = new Set(area.encounters.flatMap((encounter) => encounter.monsters));
      for (const id of [area.elite ?? region.elite, area.champion ?? region.champion]) if (id) ids.add(id);
      living.set(area.id, ids);
    }
  }
  // Every outcome, further choices' too.
  const deep = (found) =>
    [found]
      .flat()
      .filter(Boolean)
      .flatMap((outcome) => [outcome, ...(outcome.kind === 'choice' ? (outcome.options ?? []).flatMap((next) => deep(next.outcome)) : [])]);
  const outcomesOf = (event) => [...event.options.flatMap((option) => deep(option.outcome)), ...(event.cases ?? []).flatMap((eventCase) => Object.values(eventCase.outcomes).flatMap(deep))];
  for (const event of events.list) {
    // An event met first in one case comes in it once, then in the others.
    if (event.firstCase && !(event.cases ?? []).some((one) => one.id === event.firstCase)) errors.push(`events.json: ${event.id} ma nieznany przypadek pierwszego spotkania "${event.firstCase}"`);
    if (event.firstCase && (event.cases ?? []).length < 2) errors.push(`events.json: ${event.id} ma przypadek pierwszego spotkania i żadnego innego`);
    // A companion's errand: one case for each companion's story, in order.
    if (event.companion && (event.cases ?? []).length !== data.settlement.companions.stories.length) {
      errors.push(`events.json: ${event.id} potrzebuje po jednym przypadku na każdą historię towarzysza (${data.settlement.companions.stories.length})`);
    }
    if (event.companion && (data.settlement.companions.talks.memories ?? []).length !== data.settlement.companions.stories.length) {
      errors.push(`settlement.json: companions.talks.memories potrzebuje po jednym zdaniu na każdą historię towarzysza`);
    }
    for (const id of event.exceptAreas ?? []) {
      if (!living.has(id)) errors.push(`events.json: ${event.id} ma nieznany region wewnętrzny "${id}" w exceptAreas`);
    }
    for (const id of event.areas ?? []) {
      if (!living.has(id)) {
        errors.push(`events.json: ${event.id} ma nieznany region wewnętrzny "${id}"`);
        continue;
      }
      for (const foe of new Set(outcomesOf(event).flatMap((outcome) => outcome.foes ?? []))) {
        if (monsters.has(foe) && !living.get(id).has(foe)) errors.push(`events.json: ${event.id} przychodzi w ${id}, a tam nie żyje ${foe}`);
      }
    }
    uniqueIds(errors, `events (${event.id})`, event.options);
    uniqueIds(errors, `events (${event.id}, przypadki)`, event.cases ?? []);
    for (const option of event.options) {
      for (const id of option.classes ?? []) if (!classes.has(id)) errors.push(`events.json: ${event.id}/${option.id} ma nieznaną klasę "${id}"`);
      if (option.outcome) checkOutcomes(`${event.id}/${option.id}`, option.outcome, { event, option });
    }
    // Every option, further choices' too, has an outcome in every case: its
    // own or the case's, named by its path ("lead/look").
    for (const eventCase of event.cases ?? [{ id: null, outcomes: {} }]) {
      const paths = new Set();
      const walk = (list, prefix, priced) => {
        for (const option of list) {
          const path = [...prefix, option.id];
          const key = path.join('/');
          paths.add(key);
          const own = option.outcome;
          const found = eventCase.outcomes[key];
          const cost = priced || Boolean(option.goldPerLevel);
          if (!found && !own) errors.push(`events.json: ${event.id}/${key} nie ma skutku${eventCase.id ? ` w przypadku ${eventCase.id}` : ''}`);
          if (found) checkOutcomes(`${event.id}/${eventCase.id}/${key}`, found, { event, option, priced: cost, inherits: !Array.isArray(own) && own?.kind === 'choice' });
          // Further on in this case: its own choice's options, or the option's.
          for (const choice of [found ?? own].flat().filter((one) => one?.kind === 'choice')) {
            const next = choice.options ?? (!Array.isArray(own) && own?.kind === 'choice' ? own.options : null);
            if (next) walk(next, path, cost);
          }
        }
      };
      walk(event.options, [], false);
      for (const key of Object.keys(eventCase.outcomes)) if (!paths.has(key)) errors.push(`events.json: ${event.id}/${eventCase.id} ma skutek nieznanej opcji "${key}"`);
    }
  }
  return errors;
}

// The party events (party-events.json, src/engine/party-events.js): unique
// ids, an `auto` option that names an option nobody is kept from (no
// leader's potion), outcomes of a kind with what it needs, foes and
// brotherhoods that exist, and each reward's value named in its text, as
// the events' checks do.
function checkPartyEvents(data, { monsters }) {
  const errors = [];
  const file = 'party-events';
  const where = (text) => `${file}.json: ${text}`;
  const { texts, list } = data[file];
  const foes = new Set(data.events.foes.map((foe) => foe.id));
  const brotherhoods = new Set(data.settlement.brotherhoods.map((brotherhood) => brotherhood.id));
  const foeKnown = (id) => foes.has(id) || monsters.has(id);
  // The texts around the events, each with the values it is filled with.
  const needs = {
    leaderNote: ['names'],
    waiting: ['title', 'leader'],
    chosen: ['title', 'leader', 'option'],
    auto: ['title', 'option'],
    reportChosen: ['option'],
    reportAuto: ['option'],
    hpLost: ['hp'],
    bagFull: ['lost'],
    boonHaste: ['percent'],
    boonXp: ['percent'],
    boonGold: ['percent'],
  };
  for (const [key, names] of Object.entries(needs)) {
    for (const name of names) if (!texts[key].includes(`{${name}}`)) errors.push(where(`texts.${key} potrzebuje {${name}}`));
  }
  // What a reward gives and the value its text names.
  const named = { gold: 'gold', xpFoes: 'xp', herbsKnown: 'herbs', potions: 'potions', materials: 'materials', minerals: 'minerals' };
  const GIVES = ['gold', 'xpFoes', 'herbsKnown', 'potions', 'materials', 'minerals', 'reputation', 'boon'];
  const checkGives = (at, gives, text) => {
    for (const [key, value] of Object.entries(named)) if (gives[key] !== undefined && !text?.includes(`{${value}}`)) errors.push(where(`${at} potrzebuje {${value}} w tekście`));
    if (gives.herbsKnown) {
      // Without Zielarstwo the gold instead of herbs, told with the rest.
      for (const [key, value] of Object.entries(named)) {
        if (key !== 'herbsKnown' && gives[key] !== undefined && !gives.herbsKnown.goldText.includes(`{${value}}`)) errors.push(where(`${at} potrzebuje {${value}} w herbsKnown.goldText`));
      }
      if (!gives.herbsKnown.goldText.includes('{gold}')) errors.push(where(`${at} potrzebuje {gold} w herbsKnown.goldText`));
    }
    for (const id of gives.xpFoes ?? []) if (!foeKnown(id)) errors.push(where(`${at} ma nieznanego przeciwnika "${id}" w xpFoes`));
    for (const id of Object.keys(gives.reputation ?? {})) if (!brotherhoods.has(id)) errors.push(where(`${at} ma nieznane bractwo "${id}"`));
  };
  const checkOutcome = (at, outcome) => {
    const giving = GIVES.some((key) => outcome[key] !== undefined) || outcome.leader || outcome.others;
    const fighting = outcome.foes || outcome.ambush !== undefined || outcome.start || outcome.win || outcome.lose;
    const split = Boolean(outcome.leader || outcome.others);
    if (!outcome.text && !split) errors.push(where(`${at} potrzebuje tekstu`));
    if (outcome.kind === 'reward') {
      if (!giving) errors.push(where(`${at} ma nagrodę bez niczego do dania`));
      if (split && !(outcome.leader && outcome.others)) errors.push(where(`${at} potrzebuje nagrody i lidera (leader), i reszty (others)`));
      if (split && GIVES.some((key) => outcome[key] !== undefined)) errors.push(where(`${at} ma nagrodę dla wszystkich obok nagród lidera i reszty`));
      if (split) {
        checkGives(`${at}/leader`, outcome.leader, outcome.leader.text);
        checkGives(`${at}/others`, outcome.others, outcome.others.text);
      } else checkGives(at, outcome, outcome.text);
    } else if (giving) errors.push(where(`${at} daje nagrodę bez kind reward`));
    if (outcome.kind === 'loss') {
      if (outcome.hpLoss === undefined) errors.push(where(`${at} ma stratę bez hpLoss`));
    } else if (outcome.hpLoss !== undefined) errors.push(where(`${at} ma hpLoss bez kind loss`));
    if (outcome.kind === 'fight') {
      if (!outcome.foes) errors.push(where(`${at} ma walkę bez przeciwników`));
      for (const id of outcome.foes ?? []) if (!foeKnown(id)) errors.push(where(`${at} ma nieznanego przeciwnika "${id}"`));
      if (!outcome.start?.includes('{enemies}')) errors.push(where(`${at} potrzebuje zdania start z {enemies}`));
      if (outcome.win?.materials && !outcome.win.text.includes('{materials}')) errors.push(where(`${at} potrzebuje {materials} w win.text`));
    } else if (fighting) errors.push(where(`${at} ma ustawienia walki bez walki`));
  };
  const ids = uniqueIds(errors, file, list);
  if (ids.size === 0) errors.push(where('nie ma żadnego zdarzenia'));
  for (const event of list) {
    const optionIds = uniqueIds(errors, `${file} (${event.id})`, event.options);
    // The option of an event nobody chose: one the party may always take.
    if (!optionIds.has(event.auto)) errors.push(where(`${event.id} ma auto "${event.auto}", a nie ma takiej opcji`));
    else if (event.options.find((option) => option.id === event.auto).leaderPotion) errors.push(where(`${event.id}: opcja auto nie może wymagać mikstury lidera`));
    for (const option of event.options) {
      const at = `${event.id}/${option.id}`;
      if (!Array.isArray(option.outcome)) {
        checkOutcome(at, option.outcome);
        continue;
      }
      option.outcome.forEach((outcome, index) => {
        if (outcome.weight === undefined) errors.push(where(`${at} [${index}] na liście skutków potrzebuje wagi`));
        if ((outcome.id === undefined) !== (outcome.name === undefined)) errors.push(where(`${at} [${index}] potrzebuje i id, i name albo żadnego z nich`));
        checkOutcome(`${at} [${index}]`, outcome);
      });
      uniqueIds(errors, `${file} (${at})`, option.outcome.filter((outcome) => outcome.id));
      if (option.outcome.every((outcome) => outcome.draft)) errors.push(where(`${at} ma same szkice, więc w grze nie byłoby czego losować`));
    }
  }
  if (list.every((event) => event.draft)) errors.push(where('ma same szkice, więc w grze nie byłoby czego losować'));
  return errors;
}

// The chance a profession's mastery gives (952.3 A, 952.4 A, `mastery`):
// rising from its `from` level to a later `to` the profession reaches, and
// with the chance the work has anyway (`base`, the brewing's bonusChance)
// never above 1.
function checkMastery(errors, name, table, profession, base = 0) {
  const { mastery } = table;
  if (!mastery || !profession) return;
  if (mastery.to <= mastery.from || mastery.to > profession.maxLevel) {
    errors.push(`professions.json: ${name}.mastery musi rosnąć od from do późniejszego to, najwyżej do ${profession.maxLevel}. poziomu profesji`);
  }
  if (base + mastery.chance > 1) errors.push(`professions.json: ${name}.mastery.chance razem z szansą bazową przekracza 1`);
}

// Professions: stats that exist, the mastery within the levels, a gathering
// profession that gathers, herbs known within its levels, the herbs at once
// from level 1 on and growing, and a slider that reaches its longest time in
// whole steps.
function checkProfessions(data, { stats }) {
  const errors = [];
  const { professions, gathering, herbs } = data.professions;
  const ids = uniqueIds(errors, 'professions', professions);
  uniqueIds(errors, 'professions (zioła)', herbs);
  const tabLevel = data.unlocks.find((unlock) => unlock.id === 'professions').level;
  for (const profession of professions) {
    for (const stat of profession.stats) {
      if (!stats.has(stat)) errors.push(`professions.json: ${profession.id} ma nieznaną statystykę "${stat}"`);
    }
    if (profession.unlockLevel < tabLevel) errors.push(`professions.json: ${profession.id} otwiera się na poziomie ${profession.unlockLevel}, przed zakładką Profesje (${tabLevel})`);
    // The mastery reward comes on a level the profession has (825: kept at the 100th of 200).
    if (profession.masteryLevel > profession.maxLevel) errors.push(`professions.json: ${profession.id} ma masteryLevel ${profession.masteryLevel} ponad maxLevel ${profession.maxLevel}`);
    // A profession that opens later has its System message in unlocks.json, at the same level.
    const own = data.unlocks.find((unlock) => unlock.id === profession.id);
    if (own && own.level !== (profession.unlockLevel ?? tabLevel)) errors.push(`unlocks.json: ${profession.id} ma poziom ${own.level}, a profesja otwiera się na ${profession.unlockLevel ?? tabLevel}`);
  }
  const gatherer = professions.find((profession) => profession.id === gathering.profession);
  if (!ids.has(gathering.profession) || gatherer.kind !== 'gathering') {
    errors.push(`professions.json: gathering.profession "${gathering.profession}" nie jest profesją zbieracką`);
  } else {
    for (const herb of herbs) {
      if (herb.level > gatherer.maxLevel) errors.push(`professions.json: zioło ${herb.id} wymaga poziomu ${herb.level}, a profesja kończy się na ${gatherer.maxLevel}`);
    }
    checkMastery(errors, 'gathering', gathering, gatherer);
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
  errors.push(...checkBrewing(data.professions, ids, new Set(data.effects.map((effect) => effect.id)), new Set(data.materials.materials.map((material) => material.id))));
  errors.push(...checkWorkshop(data, ids));
  errors.push(...checkMinerals(data, ids));
  return errors;
}

// The tab's rows: every profession once. Górnictwo: a gathering profession,
// a slider in whole steps, the measured gold of explorations rising with the
// level. The minerals: one gem for each rarity, in the order of
// rarities.json, each rarer one from a higher level and with a higher bonus
// when set; ores for rarities that exist, each rarity's jewellery with
// exactly one ore, open no later than its gem; all within the profession's
// levels, and something to mine from level 1. Jubilerstwo: a crafting
// profession, slots that exist and the Warsztat does not make, a chance for
// each rarity.
function checkMinerals(data, ids) {
  const errors = [];
  const { professions, rows, mining, jewelcrafting, minerals } = data.professions;
  const placed = rows.flat();
  if (placed.length !== professions.length || new Set(placed).size !== placed.length || !placed.every((id) => ids.has(id))) {
    errors.push('professions.json: rows musi mieć każdą profesję dokładnie raz');
  }
  uniqueIds(errors, 'professions (minerały)', minerals);
  const miner = professions.find((profession) => profession.id === mining.profession);
  if (!miner || miner.kind !== 'gathering') errors.push(`professions.json: mining.profession "${mining.profession}" nie jest profesją zbieracką`);
  checkMastery(errors, 'mining', mining, miner);
  const jeweller = professions.find((profession) => profession.id === jewelcrafting.profession);
  if (!jeweller || jeweller.kind !== 'crafting') errors.push(`professions.json: jewelcrafting.profession "${jewelcrafting.profession}" nie jest profesją wytwórczą`);
  const { minutes, veins } = mining;
  if (minutes.max < minutes.min || (minutes.max - minutes.min) % minutes.step !== 0) errors.push('professions.json: mining.minutes.max musi wypadać na kroku suwaka od min');
  veins.explorationGold.forEach(([level, gold], index) => {
    const [before, goldBefore] = veins.explorationGold[index - 1] ?? [0, 0];
    if (level <= before || gold < goldBefore) errors.push('professions.json: mining.veins.explorationGold musi rosnąć z poziomem');
  });
  const rarities = data.rarities.map((rarity) => rarity.id);
  const gems = minerals.filter((mineral) => mineral.kind === 'gem');
  const ores = minerals.filter((mineral) => mineral.kind === 'ore');
  if (gems.map((gem) => gem.rarity).join() !== rarities.join()) errors.push('professions.json: minerals musi mieć jeden kamień na każdą rzadkość, w kolejności z rarities.json');
  gems.forEach((gem, index) => {
    if (gem.for) errors.push(`professions.json: kamień ${gem.id} nie ma for`);
    if (!(gem.setBonus > 0)) errors.push(`professions.json: kamień ${gem.id} potrzebuje setBonus`);
    const before = gems[index - 1];
    if (before && (gem.level <= before.level || gem.setBonus <= before.setBonus)) errors.push(`professions.json: kamień ${gem.id} musi mieć wyższy poziom i setBonus niż ${before.id}`);
  });
  for (const ore of ores) {
    if (ore.rarity || ore.setBonus) errors.push(`professions.json: kruszec ${ore.id} nie ma rarity ani setBonus`);
    if (!ore.for) errors.push(`professions.json: kruszec ${ore.id} potrzebuje for`);
    for (const rarity of ore.for ?? []) if (!rarities.includes(rarity)) errors.push(`professions.json: kruszec ${ore.id} ma nieznaną rzadkość "${rarity}"`);
  }
  for (const rarity of rarities) {
    const own = ores.filter((ore) => ore.for?.includes(rarity));
    const gem = gems.find((one) => one.rarity === rarity);
    if (own.length !== 1) errors.push(`professions.json: biżuteria rzadkości ${rarity} potrzebuje dokładnie jednego kruszcu`);
    else if (gem && own[0].level > gem.level) errors.push(`professions.json: kruszec ${own[0].id} otwiera się później niż kamień ${gem.id}`);
  }
  for (const mineral of minerals) {
    if (miner && mineral.level > miner.maxLevel) errors.push(`professions.json: minerał ${mineral.id} wymaga poziomu ponad profesję`);
  }
  if (!minerals.some((mineral) => mineral.level === 1)) errors.push('professions.json: żadnego minerału nie kopie się od 1. poziomu');
  const slots = new Set(data.slots.map((slot) => slot.id));
  for (const slot of Object.keys(jewelcrafting.ores)) {
    if (!slots.has(slot)) errors.push(`professions.json: jewelcrafting.ores ma nieznany slot "${slot}"`);
    if (data.professions.workshop.parts[slot]) errors.push(`professions.json: slot ${slot} robi i Warsztat, i Jubilerstwo`);
  }
  if (Object.keys(jewelcrafting.chances).join() !== rarities.join()) errors.push('professions.json: jewelcrafting.chances musi mieć każdą rzadkość raz, w kolejności z rarities.json');
  if (jeweller && jewelcrafting.laterPatternLevel > jeweller.maxLevel) errors.push('professions.json: jewelcrafting.laterPatternLevel przekracza poziomy profesji');
  return errors;
}

// The Warsztat: a crafting profession, slots and families of bases that
// exist, resources that exist, and every rarity once, in order, from level 1
// on, within the profession's levels.
function checkWorkshop(data, ids) {
  const errors = [];
  const { workshop, professions } = data.professions;
  const crafter = professions.find((profession) => profession.id === workshop.profession);
  if (!ids.has(workshop.profession) || crafter.kind !== 'crafting') {
    errors.push(`professions.json: workshop.profession "${workshop.profession}" nie jest profesją wytwórczą`);
  }
  const slots = new Set(data.slots.map((slot) => slot.id));
  for (const slot of Object.keys(workshop.parts)) {
    if (!slots.has(slot)) errors.push(`professions.json: workshop.parts ma nieznany slot "${slot}"`);
  }
  const resources = new Set(data.resources.map((resource) => resource.id));
  const families = new Set(data['item-bases'].map((base) => base.family ?? base.id));
  for (const [resource, list] of Object.entries(workshop.resources.families)) {
    if (!resources.has(resource)) errors.push(`professions.json: workshop.resources.families ma nieznany zasób "${resource}"`);
    for (const family of list) {
      if (!families.has(family)) errors.push(`professions.json: workshop.resources.families ma nieznaną rodzinę "${family}"`);
    }
  }
  if (workshop.rarities.map((rarity) => rarity.id).join() !== data.rarities.map((rarity) => rarity.id).join()) {
    errors.push('professions.json: workshop.rarities musi mieć każdą rzadkość raz, w kolejności z rarities.json');
  }
  if (workshop.rarities[0]?.level !== 1) errors.push('professions.json: workshop.rarities musi zaczynać się od poziomu 1');
  workshop.rarities.forEach((rarity, index) => {
    if (index > 0 && rarity.level <= workshop.rarities[index - 1].level) errors.push('professions.json: poziomy w workshop.rarities muszą rosnąć');
    if (crafter && rarity.level > crafter.maxLevel) errors.push(`professions.json: rzadkość ${rarity.id} wymaga poziomu ${rarity.level}, a profesja kończy się na ${crafter.maxLevel}`);
    if (!(rarity.chance > 0 && rarity.chance <= 1)) errors.push(`professions.json: szansa rzadkości ${rarity.id} musi być z przedziału (0, 1]`);
  });
  if (crafter && workshop.laterPatternLevel > crafter.maxLevel) errors.push('professions.json: workshop.laterPatternLevel przekracza poziomy profesji');
  // Upgrades from +1 up, each opening later than the one below it.
  workshop.upgrades.forEach((tier, index) => {
    if (tier.upgrade !== index + 1) errors.push('professions.json: workshop.upgrades musi iść po kolei od +1');
    if (index > 0 && tier.level <= workshop.upgrades[index - 1].level) errors.push('professions.json: poziomy w workshop.upgrades muszą rosnąć');
    if (tier.max < tier.chance) errors.push(`professions.json: max ulepszenia +${tier.upgrade} jest niższe niż jego szansa`);
    if (crafter && tier.level > crafter.maxLevel) errors.push(`professions.json: ulepszenie +${tier.upgrade} wymaga poziomu ponad profesję`);
  });
  if (workshop.upgrades.length > data.balance.upgrades.chances.length) errors.push('professions.json: workshop.upgrades sięga wyżej niż Kowadło');
  const { scroll } = workshop;
  if (!data.materials.parts.some((part) => part.id === scroll.part)) errors.push(`professions.json: zwój robi się z nieznanej części "${scroll.part}"`);
  if (crafter && scroll.level > crafter.maxLevel) errors.push('professions.json: zwój wymaga poziomu ponad profesję');
  if (data['item-bases'].some((base) => base.id === scroll.id)) errors.push(`professions.json: id zwoju "${scroll.id}" jest już bazą przedmiotu`);
  return errors;
}

// The Encyklopedia: its tiers rising, every item base worn from the class
// level of a tier, the thresholds rising and within their tab's entries,
// every tab once, and the sentences the engine says.
const ENCYCLOPEDIA_TEXTS = [
  'accessories', 'tierItems', 'tierItemsFirst', 'tierLevels', 'itemDrop', 'itemDropAny', 'itemClasses', 'itemClass', 'itemAnyClass',
  'itemOtherClasses', 'itemWear', 'itemPattern', 'itemJewelPattern', 'itemBest', 'potionRecipe', 'potionHerbs', 'potionCatalyst', 'potionTaught', 'herbGather', 'herbEvent',
  'materialDrop', 'materialGrades', 'trophyNeeds', 'trophyWon', 'partTable', 'partExchange', 'partShop', 'mineralMine', 'mineralCraft', 'mineralGem', 'mineralOre', 'unknown',
];

function checkEncyclopedia(data) {
  const { tabs, tiers, milestones, texts } = data.encyclopedia;
  const errors = [];
  uniqueIds(errors, 'encyclopedia (zakładki)', tabs);
  tiers.forEach((tier, index) => {
    if (index > 0 && (tier.classLevel <= tiers[index - 1].classLevel || tier.upTo <= tiers[index - 1].upTo)) errors.push('encyclopedia.json: tiers muszą rosnąć');
  });
  if (tiers[0]?.classLevel !== 1) errors.push('encyclopedia.json: pierwszy tier musi być od 1. poziomu klasy');
  const tierLevels = new Set(tiers.map((tier) => tier.classLevel));
  for (const base of data['item-bases']) {
    if (!tierLevels.has(base.classLevel ?? 1)) errors.push(`encyclopedia.json: baza ${base.id} (poziom klasy ${base.classLevel ?? 1}) nie ma swojego tieru`);
  }
  const totals = {
    potions: data.professions.potions.length,
    herbs: data.professions.herbs.length,
    materials: data.materials.materials.length,
    parts: data.materials.parts.length,
    minerals: data.professions.minerals.length,
  };
  for (const [tab, counts] of Object.entries(milestones)) {
    counts.forEach((count, index) => {
      if (index > 0 && count <= counts[index - 1]) errors.push(`encyclopedia.json: progi ${tab} muszą rosnąć`);
    });
    if (counts.at(-1) > totals[tab]) errors.push(`encyclopedia.json: próg ${counts.at(-1)} w ${tab} jest większy niż liczba wpisów (${totals[tab]})`);
  }
  for (const key of ENCYCLOPEDIA_TEXTS) if (!texts[key]) errors.push(`encyclopedia.json: brak tekstu ${key}`);
  return errors;
}

// Brewing: a crafting profession that brews, recipes known within its levels
// from level 1 on, of herbs and catalysts that exist, and each potion's
// description naming what it does, as the data does ("leczy 20% maks. HP").
function checkBrewing(data, ids, effects, materialIds) {
  const { professions, brewing, herbs, potions } = data;
  const errors = [];
  uniqueIds(errors, 'professions (mikstury)', potions);
  const brewer = professions.find((profession) => profession.id === brewing.profession);
  if (!ids.has(brewing.profession) || brewer.kind !== 'crafting') {
    errors.push(`professions.json: brewing.profession "${brewing.profession}" nie jest profesją wytwórczą`);
  }
  if (!potions.some((potion) => potion.level === 1)) errors.push('professions.json: żadnego przepisu nie zna się od 1. poziomu');
  checkMastery(errors, 'brewing', brewing, brewer, brewing.bonusChance);
  const herbIds = new Set(herbs.map((herb) => herb.id));
  for (const potion of potions) {
    if (brewer && potion.level > brewer.maxLevel) errors.push(`professions.json: mikstura ${potion.id} wymaga poziomu ${potion.level}, a profesja kończy się na ${brewer.maxLevel}`);
    if (potion.catalyst && !materialIds.has(potion.catalyst)) errors.push(`professions.json: mikstura ${potion.id} ma nieznany katalizator "${potion.catalyst}"`);
    for (const id of Object.keys(potion.herbs)) {
      if (!herbIds.has(id)) errors.push(`professions.json: mikstura ${potion.id} ma nieznane zioło "${id}"`);
    }
    for (const [kind, value] of Object.entries(potion.effect)) {
      // An antidote says what it cures instead of a share.
      if (kind === 'cure') continue;
      if (!potion.description.includes(`${Math.round(value * 100)}%`)) errors.push(`professions.json: opis mikstury ${potion.id} nie podaje ${Math.round(value * 100)}%`);
    }
    if (Object.keys(potion.effect).length !== 1) errors.push(`professions.json: mikstura ${potion.id} ma mieć jedno działanie`);
    // A strengthening potion is drunk from the bag and lasts its number of
    // fights; the others work by themselves in fights.
    const timed = TIMED_KINDS.some((kind) => kind in potion.effect);
    if (timed !== ('fights' in potion)) errors.push(`professions.json: fights ma tylko mikstura wzmacniająca (${potion.id})`);
    if (('poison' in potion.effect) !== ('dot' in potion)) errors.push(`professions.json: dot ma tylko mikstura z poison (${potion.id})`);
    if (potion.dot && !effects.has(potion.dot.effect)) errors.push(`professions.json: mikstura ${potion.id} ma nieznany efekt "${potion.dot.effect}"`);
    if (('cure' in potion.effect) !== ('cures' in potion)) errors.push(`professions.json: cures ma tylko odtrutka (${potion.id})`);
    if (potion.cures && !effects.has(potion.cures)) errors.push(`professions.json: mikstura ${potion.id} leczy nieznany efekt "${potion.cures}"`);
    if (potion.fights && !potion.description.includes(fightsText(potion.fights, data))) errors.push(`professions.json: opis mikstury ${potion.id} nie podaje „${fightsText(potion.fights, data)}”`);
  }
  const { healBelow, healBelowChoices } = data.potionUse;
  if (!healBelowChoices.includes(healBelow)) errors.push('professions.json: potionUse.healBelow musi być jednym z healBelowChoices');
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
  // The weekly curve goes up the levels, its share never falling.
  const curve = quests.periods.weekly.curve ?? [];
  curve.forEach(([level, share], index) => {
    if (index > 0 && (level <= curve[index - 1][0] || share < curve[index - 1][1])) errors.push(`quests.json: krzywa tygodnia psuje się na poziomie ${level}`);
  });
  // The note under a period's quests names what its chest gives.
  for (const [periodId, { chest }] of Object.entries(quests.periods)) {
    for (const amount of [chest.timePoints, chest.systemPoints]) {
      if (!chest.text.includes(`+${amount} `)) errors.push(`quests.json: napis skrzyni ${periodId} nie podaje +${amount}`);
    }
  }
  for (const kind of quests.kinds) {
    // Creatures and potions bring their own nouns.
    const ownNoun = kind.id === 'kill' || kind.id === 'brew';
    if (!ownNoun && !kind.counted) errors.push(`quests.json: rodzaj ${kind.id} nie ma counted`);
    if ((ownNoun || kind.counted) && !kind.text.includes('{noun}')) errors.push(`quests.json: tekst rodzaju ${kind.id} nie ma {noun}`);
    if (kind.text.includes('{herb}') !== (kind.id === 'gather')) errors.push(`quests.json: tylko rodzaj gather ma {herb} w tekście`);
    // Creatures are counted by the fights that bring them.
    const byFights = kind.id === 'kill' || kind.id === 'killAny';
    for (const period of ['daily', 'weekly'].filter((each) => kind[each])) {
      const range = byFights ? kind[period].fights : kind[period].count;
      if (!range) errors.push(`quests.json: rodzaj ${kind.id} nie ma ${byFights ? 'fights' : 'count'} w ${period}`);
      else if (range[0] > range[1]) errors.push(`quests.json: rodzaj ${kind.id} ma odwrócony zakres w ${period}`);
      // Regions to open are counted within reach of the class level, and
      // the class levels of their limits go up.
      if (kind.id === 'unlock' && !kind[period].reach) errors.push(`quests.json: rodzaj unlock nie ma reach w ${period}`);
      const most = kind[period].most ?? [];
      if (most.some((band, index) => index > 0 && band.fromClassLevel <= most[index - 1].fromClassLevel)) errors.push(`quests.json: progi most rodzaju ${kind.id} w ${period} nie rosną`);
    }
    if (kind.id === 'unlock' && !kind.untilClassLevel) errors.push('quests.json: rodzaj unlock nie ma untilClassLevel');
    if (kind.profession && !data.professions.professions.some((profession) => profession.id === kind.profession)) errors.push(`quests.json: rodzaj ${kind.id} ma nieznaną profesję ${kind.profession}`);
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

// The Osada: places of residents who live there, each kind of goods ordered
// by one brotherhood only, standings growing from 0, order counts and
// rarities that exist, and every rarity with affixes priced for reforging.
function checkSettlement(data, { rarities }) {
  const errors = [];
  const { places, residents, brotherhoods, standings, orders, reforge } = data.settlement;
  uniqueIds(errors, 'settlement (miejsca)', places);
  const residentIds = uniqueIds(errors, 'settlement (mieszkańcy)', residents);
  const brotherhoodIds = uniqueIds(errors, 'settlement (bractwa)', brotherhoods);
  const standingIds = uniqueIds(errors, 'settlement (stopnie)', standings);
  for (const place of places) {
    if (place.resident && !residentIds.has(place.resident)) errors.push(`settlement.json: miejsce ${place.id} ma nieznanego mieszkańca ${place.resident}`);
  }
  for (const service of ['orders', 'reforge', 'hermit', 'herbalist', 'market']) {
    const { resident } = data.settlement[service];
    if (!residentIds.has(resident)) errors.push(`settlement.json: ${service}.resident to nieznany mieszkaniec ${resident}`);
  }
  const kinds = brotherhoods.flatMap((brotherhood) => brotherhood.goods);
  if (new Set(kinds).size !== kinds.length) errors.push('settlement.json: ten sam rodzaj towaru zamawiają dwa bractwa');
  if (standings[0].points !== 0) errors.push('settlement.json: pierwszy stopień musi być od 0 punktów');
  standings.forEach((standing, index) => {
    if (index > 0 && standing.points <= standings[index - 1].points) errors.push('settlement.json: progi stopni muszą rosnąć');
  });
  if (!standingIds.has(orders.quality.from)) errors.push(`settlement.json: orders.quality.from to nieznany stopień ${orders.quality.from}`);
  if (!standingIds.has(orders.special.from)) errors.push(`settlement.json: orders.special.from to nieznany stopień ${orders.special.from}`);
  const standingAt = (id) => standings.findIndex((standing) => standing.id === id);
  // The price of hiring companions at each standing: known standings, and
  // never dearer at a higher one.
  const prices = data.settlement.companions?.priceByStanding ?? {};
  for (const id of Object.keys(prices)) if (!standingIds.has(id)) errors.push(`settlement.json: companions.priceByStanding ma nieznany stopień ${id}`);
  const ordered = standings.filter((standing) => standing.id in prices).map((standing) => prices[standing.id]);
  if (ordered.some((factor, index) => index > 0 && factor > ordered[index - 1])) errors.push('settlement.json: companions.priceByStanding nie może rosnąć ze stopniem');
  // A companion's talks (295 A): a piece of each story for each standing,
  // and the forms for a woman and a man written as [a|b].
  const { stories, talks } = data.settlement.companions;
  if (talks.stories.length !== stories.length) errors.push('settlement.json: companions.talks.stories musi mieć tyle historii, ile companions.stories');
  talks.stories.forEach((pieces, index) => {
    if (pieces.length !== standings.length) errors.push(`settlement.json: historia ${index} w companions.talks ma ${pieces.length} kawałków, a stopni jest ${standings.length}`);
  });
  for (const line of [...talks.stories.flat(), ...Object.values(talks.chatter).flat()]) {
    if (line.replace(/\[[^\[\]|]*\|[^\[\]|]*\]/g, '').match(/[[\]|]/)) errors.push(`settlement.json: zła forma [kobieta|mężczyzna] w „${line}”`);
  }
  // The words of the day by the standing of the relation (the author:
  // "więcej opcji rozmów na różne stopnie"): a list for every standing, for
  // no other, and no line twice.
  for (const standing of standings) if (!talks.chatter[standing.id]?.length) errors.push(`settlement.json: companions.talks.chatter nie ma zdań dla stopnia ${standing.id}`);
  for (const id of Object.keys(talks.chatter)) if (!standingIds.has(id)) errors.push(`settlement.json: companions.talks.chatter ma nieznany stopień ${id}`);
  const chatter = Object.values(talks.chatter).flat();
  for (const line of new Set(chatter.filter((one, index) => chatter.indexOf(one) !== index))) errors.push(`settlement.json: zdanie „${line}” stoi w companions.talks.chatter dwa razy`);
  // The residents who sell take less with each standing (287 A), never
  // more at a higher one.
  const discounts = data.settlement.relationDiscount;
  if (discounts.length > standings.length) errors.push('settlement.json: relationDiscount ma więcej liczb niż stopni');
  if (discounts.some((discount, index) => index > 0 && discount < discounts[index - 1])) errors.push('settlement.json: relationDiscount nie może maleć ze stopniem');
  // Jagna's herbs for sale: a few at first and more with each standing (the
  // author: "Niech ma na początku 3 podstawowe zioła, a w miarę zwiekszania
  // znajomości coraz więcej"), never more than there are herbs she sells:
  // those below Zielarstwo's masteryLevel (the herbs from it on are only
  // gathered, tradedHerbs in src/engine/market.js).
  const { stock } = data.settlement.herbalist.sell;
  if (stock.length > standings.length) errors.push('settlement.json: herbalist.sell.stock ma więcej liczb niż stopni');
  if (stock.some((count, index) => index > 0 && count < stock[index - 1])) errors.push('settlement.json: herbalist.sell.stock nie może maleć ze stopniem');
  const gatherer = data.professions.professions.find((profession) => profession.id === data.professions.gathering.profession);
  const traded = data.professions.herbs.filter((herb) => herb.level < (gatherer?.masteryLevel ?? Infinity)).length;
  if (Math.max(...stock) > traded) errors.push(`settlement.json: herbalist.sell.stock podaje więcej ziół, niż jest ich przed poziomem opanowania Zielarstwa (${traded})`);
  // The rare recipes of Alchemia she teaches (121 A, `taught` in
  // professions.json): each from a standing that exists, reached in a
  // relation with a resident or a reputation with a brotherhood that exist
  // (teaching, 682 A and C).
  for (const potion of data.professions.potions) {
    if (potion.taught && !standingIds.has(potion.taught)) errors.push(`professions.json: mikstura ${potion.id} ma nieznany stopień "${potion.taught}" (taught)`);
  }
  for (const { kind, id } of data.settlement.herbalist.teaching) {
    const known = kind === 'relation' ? residentIds : brotherhoodIds;
    if (!known.has(id)) errors.push(`settlement.json: herbalist.teaching ma ${kind === 'relation' ? 'nieznanego mieszkańca' : 'nieznane bractwo'} ${id}`);
  }
  reforge.choices.forEach((step, index) => {
    if (!standingIds.has(step.from)) errors.push(`settlement.json: reforge.choices ma nieznany stopień ${step.from}`);
    const before = reforge.choices[index - 1];
    if (before && (standingAt(step.from) <= standingAt(before.from) || step.count <= before.count)) errors.push('settlement.json: reforge.choices muszą rosnąć ze stopniem');
  });
  if (!rarities.has(orders.partRarity)) errors.push(`settlement.json: orders.partRarity to nieznana rzadkość ${orders.partRarity}`);
  // Orders for any materials of a rarity (the author: "oddaj 32 materiały
  // pospolite/ileś rzadkich/unikalnych"): a name for each rarity of the
  // creatures' own materials (no trophies), and only for known rarities.
  for (const id of Object.keys(orders.anyMaterial)) if (!rarities.has(id)) errors.push(`settlement.json: orders.anyMaterial ma nieznaną rzadkość ${id}`);
  for (const material of data.materials.materials) {
    const monster = data.monsters.find((one) => one.id === material.monster);
    if (monster && !monster.elite && !monster.champion && !orders.anyMaterial[material.rarity]) {
      errors.push(`settlement.json: orders.anyMaterial nie nazywa materiałów rzadkości ${material.rarity} (${material.id})`);
    }
  }
  for (const [kind, count] of Object.entries(orders.counts)) {
    if (count.min > count.max) errors.push(`settlement.json: orders.counts.${kind}.min nie może być większe niż max`);
  }
  for (const rarity of data.rarities.filter((one) => one.affixes > 0)) {
    const cost = reforge.materials[rarity.id];
    if (!cost) errors.push(`settlement.json: brak kosztu przekucia dla rzadkości ${rarity.id}`);
    else if (!rarities.has(cost.rarity)) errors.push(`settlement.json: przekucie ${rarity.id} bierze materiały nieznanej rzadkości ${cost.rarity}`);
  }
  return errors;
}

// The Stajnia (327 A): its koniuszy lives in the Osada, in a place on the
// board, and each next mount, bought after the one before, is quicker,
// dearer and from a level no lower.
function checkStable(data) {
  const errors = [];
  const { stable, residents, places } = data.settlement;
  if (!stable) return errors;
  if (!residents.some((resident) => resident.id === stable.resident)) errors.push(`settlement.json: stable.resident to nieznany mieszkaniec ${stable.resident}`);
  if (!places.some((place) => place.resident === stable.resident)) errors.push(`settlement.json: koniuszy ${stable.resident} nie ma miejsca na planszy`);
  stable.mounts.forEach((mount, index) => {
    const before = stable.mounts[index - 1];
    if (before && (mount.shorter <= before.shorter || mount.gold <= before.gold || mount.level < before.level)) {
      errors.push(`settlement.json: wierzchowiec ${mount.name} musi być szybszy i droższy od poprzedniego, od poziomu nie niższego`);
    }
  });
  return errors;
}

// The Garbarnia (325 A): its tanner and brotherhood exist, he pays more
// with each standing, and he sells a share of the ordinary creatures'
// materials at first and more with each standing, all of them at the last,
// as Jagna her herbs.
function checkTannery(data) {
  const errors = [];
  const { tannery, residents, brotherhoods, standings } = data.settlement;
  if (!tannery) return errors;
  if (!residents.some((resident) => resident.id === tannery.resident)) errors.push(`settlement.json: tannery.resident to nieznany mieszkaniec ${tannery.resident}`);
  if (!brotherhoods.some((brotherhood) => brotherhood.id === tannery.brotherhood)) errors.push(`settlement.json: tannery.brotherhood to nieznane bractwo ${tannery.brotherhood}`);
  if (tannery.premium.some((premium, index) => index > 0 && premium < tannery.premium[index - 1])) errors.push('settlement.json: tannery.premium nie może maleć ze stopniem');
  const { stock } = tannery.sell;
  if (stock.length > standings.length) errors.push('settlement.json: tannery.sell.stock ma więcej liczb niż stopni');
  if (stock.some((share, index) => index > 0 && share < stock[index - 1])) errors.push('settlement.json: tannery.sell.stock nie może maleć ze stopniem');
  if (stock.at(-1) !== 1) errors.push('settlement.json: tannery.sell.stock na ostatnim stopniu musi być 1 (wszystkie materiały)');
  return errors;
}

// The gifts for the Osada's residents and the friends' presents (818.1 and
// 818.2): every resident likes something, once, and leaves a present of
// goods in a count that makes sense, from a standing that exists; a rarer
// piece never gives less than a commoner one.
function checkResidentGifts(data) {
  const errors = [];
  const { gifts, residents, standings } = data.settlement;
  if (!gifts) return errors;
  const residentIds = new Set(residents.map((resident) => resident.id));
  const seen = new Set();
  for (const entry of gifts.residents) {
    if (!residentIds.has(entry.resident)) errors.push(`settlement.json: gifts.residents ma nieznanego mieszkańca ${entry.resident}`);
    if (seen.has(entry.resident)) errors.push(`settlement.json: gifts.residents ma mieszkańca ${entry.resident} dwa razy`);
    seen.add(entry.resident);
    const { weekly } = entry;
    const where = `settlement.json: gifts.residents ${entry.resident}.weekly`;
    if (['herb', 'potion', 'material'].includes(weekly.kind)) {
      if (!weekly.min || !weekly.max) errors.push(`${where}: podarek ${weekly.kind} potrzebuje min i max`);
      else if (weekly.min > weekly.max) errors.push(`${where}: min nie może być większe niż max`);
    }
    if (weekly.kind === 'gold' && !weekly.perLevel) errors.push(`${where}: podarek w złocie potrzebuje perLevel`);
    if (weekly.kind === 'time-points' && !weekly.count) errors.push(`${where}: podarek w Punktach Czasu potrzebuje count`);
  }
  for (const resident of residents) if (!seen.has(resident.id)) errors.push(`settlement.json: gifts.residents nie mówi, co lubi ${resident.id}`);
  if (!standings.some((standing) => standing.id === gifts.from)) errors.push(`settlement.json: gifts.from to nieznany stopień ${gifts.from}`);
  if (gifts.relation.some((points, index) => index > 0 && points < gifts.relation[index - 1])) errors.push('settlement.json: gifts.relation nie może maleć z rzadkością');
  return errors;
}

// The Wieże (src/engine/towers.js): floor f holds the inner region (f - 1)
// mod the regions' number, so with the regions as they are the champion
// floors must come round to every land's champion (342 A: "kolejno",
// not the same two), and every region must have a usual floor, without
// an elite or a champion, in some lap (484 A). A new land may break it:
// with 30 regions every 15th floor met only two of them, as 30 is twice 15.
function checkTowers(data) {
  const errors = [];
  const { championEvery, eliteEvery, eliteLapEvery } = data.towers.floors;
  const areas = data.regions.flatMap((region) => region.areas);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const lap = areas.length * eliteLapEvery;
  const champions = new Set();
  const usual = new Set();
  for (let floor = 1; floor <= (championEvery * lap) / gcd(championEvery, lap); floor++) {
    const area = areas[(floor - 1) % areas.length];
    const elite = floor % eliteEvery === 0 && Math.floor((floor - 1) / areas.length) % eliteLapEvery === 0;
    if (floor % championEvery === 0 && area.champion) champions.add(area.champion);
    else if (!elite && floor % championEvery !== 0) usual.add(area.id);
  }
  for (const area of areas) {
    if (area.champion && !champions.has(area.champion)) {
      errors.push(`towers.json: czempion ${area.champion} nie czeka na żadnym piętrze (co ${championEvery}. piętro przy ${areas.length} regionach, 342 A)`);
    }
    if (!usual.has(area.id)) errors.push(`towers.json: region ${area.id} nie ma w Wieżach zwykłego piętra (484 A)`);
  }
  // Floor 1 is the level the towers open at, so the first floor is open
  // to every character that may enter (0.2.11).
  const unlock = data.unlocks.find((one) => one.id === 'towers');
  if (unlock && unlock.level !== data.towers.firstFloorLevel) {
    errors.push(`towers.json: firstFloorLevel ${data.towers.firstFloorLevel} różny od poziomu odblokowania Wież (${unlock.level}, unlocks.json)`);
  }
  // Who climbs (src/server/towers.js, climbersFor): `members` the players,
  // the character entering counted, `size` all the fighters on its side,
  // players and companions together, each from the fewest to the most. The
  // players fit among the fighters, and without companions the fighters
  // are the players alone (the Wieża Drużyn with companions alone since
  // 10.11.2026: size [2, 3], members [1, 3]).
  for (const tower of data.towers.towers) {
    const [fewest, most] = tower.members;
    const [least, largest] = tower.size;
    if (fewest > most) errors.push(`towers.json: ${tower.id}: members od ${fewest} do ${most}`);
    if (least > largest) errors.push(`towers.json: ${tower.id}: size od ${least} do ${largest}`);
    if (most > largest) errors.push(`towers.json: ${tower.id}: members[1] (${most}) większe niż size[1] (${largest})`);
    if (fewest > least) errors.push(`towers.json: ${tower.id}: members[0] (${fewest}) większe niż size[0] (${least})`);
    if (!tower.companions && (least !== fewest || largest !== most)) errors.push(`towers.json: ${tower.id}: bez towarzyszy size musi być równe members`);
  }
  return errors;
}

// The Portale Systemu (src/engine/portals.js): each portal has an id of
// its own and pays what it says: gold alone, or a camp resource or a part
// that exists, or materials.
function checkPortals(data) {
  const errors = [];
  const resources = new Set(data.resources.map((resource) => resource.id));
  const parts = new Set(data.materials.parts.map((part) => part.id));
  const ids = new Set();
  for (const portal of data.portals.portals) {
    if (ids.has(portal.id)) errors.push(`portals.json: portal ${portal.id} jest dwa razy`);
    ids.add(portal.id);
    if ((portal.loot === 'resource') !== (portal.resource !== undefined) || (portal.resource !== undefined && !resources.has(portal.resource))) errors.push(`portals.json: portal ${portal.id}: zasób tylko w portalu zasobu, i znany`);
    if ((portal.loot === 'part') !== (portal.part !== undefined) || (portal.part !== undefined && !parts.has(portal.part))) errors.push(`portals.json: portal ${portal.id}: część tylko w portalu części, i znana`);
  }
  return errors;
}

// The Labirynt Systemu and the Rdzeń (src/engine/labyrinth.js, core.js;
// 850–866): the three levels and Piekielny last, its creatures twice as
// strong as the third's (854 A); the rarities of the guardians' Artefakty
// known, every room's kind there with a weight but the guardian's, the
// first row's kind one of them, the map's ranges in order; the Rdzeń's
// elements exactly the game's eight, each with traits there are and its
// resonance a trait of its own with a value for each count, growing; the
// stat traits of a stat there is (or the class's main one, "main"); a size
// with no more traits than every element has; a break's Odłamki for every
// rarity, a cost for each level of upgrade, and the Wieże's Artefakt of a
// level there is.
function checkLabyrinth(data, { stats, elements, rarities }) {
  const errors = [];
  const rules = data.labyrinth;
  const where = 'labyrinth.json';
  const levels = rules.levels;
  if (levels.filter((level) => level.hell).length !== 1 || !levels.at(-1).hell) errors.push(`${where}: Piekielny (hell) musi być jeden i ostatni`);
  const third = levels[levels.length - 2];
  const hell = levels.at(-1);
  if (third && hell && hell.strength.some((value, index) => Math.abs(value - 2 * third.strength[index]) > 1e-9)) {
    errors.push(`${where}: stwory Piekielnego muszą być dwa razy mocniejsze niż na poziomie ${third.id} (854 A)`);
  }
  const levelIds = uniqueIds(errors, where, levels);
  for (const level of levels) {
    for (const rarity of Object.keys(level.artifact)) if (!rarities.has(rarity)) errors.push(`${where}: poziom ${level.id} ma nieznaną rzadkość "${rarity}"`);
  }
  const rooms = new Map(rules.rooms.map((room) => [room.id, room]));
  for (const id of ['fight', 'elite', 'treasure', 'spring', 'altar', 'merchant', 'guardian']) {
    const room = rooms.get(id);
    if (!room) errors.push(`${where}: brak komnaty "${id}"`);
    else if ((id === 'guardian') !== (room.weight === undefined)) errors.push(`${where}: komnata ${id}: waga ma każda poza strażnikiem`);
  }
  if (!rooms.get(rules.map.firstRow)?.weight) errors.push(`${where}: map.firstRow "${rules.map.firstRow}" to nie komnata z wagą`);
  for (const key of ['rooms', 'links']) if (rules.map[key][0] > rules.map[key][1]) errors.push(`${where}: map.${key} od większej do mniejszej`);
  if (rules.map.eliteFromRow > rules.map.rows) errors.push(`${where}: map.eliteFromRow za rzędami poziomu`);
  uniqueIds(errors, `${where} (błogosławieństwa)`, rules.blessings);
  const core = rules.core;
  const traits = new Map(core.traits.map((trait) => [trait.id, trait]));
  uniqueIds(errors, `${where} (cechy)`, core.traits);
  for (const trait of core.traits) {
    if ((trait.kind === 'stat') !== (trait.stat !== undefined)) errors.push(`${where}: cecha ${trait.id}: statystykę ma tylko cecha kind "stat"`);
    if (trait.stat !== undefined && trait.stat !== 'main' && !stats.has(trait.stat)) errors.push(`${where}: cecha ${trait.id} ma nieznaną statystykę "${trait.stat}"`);
  }
  const coreElements = uniqueIds(errors, `${where} (żywioły Rdzenia)`, core.elements);
  for (const id of elements) if (!coreElements.has(id)) errors.push(`${where}: Rdzeń nie ma żywiołu "${id}"`);
  for (const id of coreElements) if (!elements.has(id)) errors.push(`${where}: nieznany żywioł Rdzenia "${id}"`);
  const fewestTraits = Math.min(...core.elements.map((element) => element.traits.length));
  for (const element of core.elements) {
    for (const id of element.traits) if (!traits.has(id)) errors.push(`${where}: żywioł ${element.id} ma nieznaną cechę "${id}"`);
    if (!element.traits.includes(element.resonance.trait)) errors.push(`${where}: rezonans żywiołu ${element.id} podnosi cechę spoza jego cech`);
    if (element.resonance.values.length !== core.resonance.counts.length) errors.push(`${where}: rezonans żywiołu ${element.id} ma ${element.resonance.values.length} progów, a counts ${core.resonance.counts.length}`);
    if (element.resonance.values.some((value, index) => index > 0 && value <= element.resonance.values[index - 1])) errors.push(`${where}: rezonans żywiołu ${element.id} musi rosnąć`);
  }
  for (const size of core.sizes) if (size.traits > fewestTraits) errors.push(`${where}: rozmiar ${size.id} ma więcej cech niż żywioły`);
  for (const id of rarities) if (core.break[id] === undefined) errors.push(`${where}: rozbicie nie ma Odłamków rzadkości "${id}"`);
  if (core.upgrade.costs.length !== core.upgrade.max) errors.push(`${where}: upgrade.costs musi mieć ${core.upgrade.max} kosztów`);
  if (!levelIds.has(core.tower.level)) errors.push(`${where}: tower.level "${core.tower.level}" to nie poziom Labiryntu`);
  return errors;
}

// Talia Systemu (src/engine/cards.js; 871–877): the three types of the
// creatures' attacks, each beating another, all three beaten once; every
// rarity of the game with its might; the starter deck and every tier's deck
// a whole deck of cards, each a creature living in a land, once, at a level
// up to the top, the starter's ordinary creatures, four of each type (874 A);
// the tiers' first win a rarity some card has; a hero for each class, its
// power a number for each stage, and the words of its number where it has
// one ({power}); the host a resident of the Osada.
function checkCards(data, { rarities }) {
  const errors = [];
  const rules = data.cards;
  const where = 'cards.json';
  if (!rules) return errors;
  const types = uniqueIds(errors, `${where} (typy)`, rules.types);
  const scalings = new Set(data.monsters.map((monster) => monster.attack.scaling));
  for (const type of rules.types) {
    if (!types.has(type.target) || type.target === type.id) errors.push(`${where}: typ ${type.id} musi bić inny typ, a bije "${type.target}"`);
  }
  if (new Set(rules.types.map((type) => type.target)).size !== rules.types.length) errors.push(`${where}: każdy typ musi być bity przez dokładnie jeden typ`);
  for (const scaling of scalings) if (!types.has(scaling)) errors.push(`${where}: stwory atakują statystyką "${scaling}", której nie ma wśród typów`);
  uniqueIds(errors, `${where} (linie)`, rules.lines);
  for (const id of rarities) if (rules.stats.rarity[id] === undefined) errors.push(`${where}: stats.rarity nie ma rzadkości "${id}"`);
  for (const id of Object.keys(rules.stats.rarity)) if (!rarities.has(id)) errors.push(`${where}: stats.rarity ma nieznaną rzadkość "${id}"`);
  if (rules.stats.shapeRange[0] > rules.stats.shapeRange[1]) errors.push(`${where}: stats.shapeRange od większej do mniejszej`);
  // The creatures living in a land: those of the regions' places, their
  // elites and champions, and the regions' elites.
  const living = new Set();
  for (const region of data.regions) {
    if (region.elite) living.add(region.elite);
    for (const area of region.areas) {
      for (const encounter of [...(area.encounters ?? []), ...(area.tough ?? [])]) for (const id of encounter.monsters) living.add(id);
      for (const id of [area.elite, area.champion]) if (id) living.add(id);
    }
  }
  const byId = new Map(data.monsters.map((monster) => [monster.id, monster]));
  const deck = (owner, ids) => {
    if (ids.length !== rules.deckSize) errors.push(`${where}: ${owner} ma ${ids.length} kart, a talia to ${rules.deckSize}`);
    if (new Set(ids).size !== ids.length) errors.push(`${where}: ${owner} ma jakąś kartę dwa razy`);
    for (const id of ids) if (!living.has(id)) errors.push(`${where}: ${owner}: "${id}" to nie stwór żyjący w krainach`);
  };
  deck('starter', rules.starter.monsters);
  for (const id of rules.starter.monsters) {
    const monster = byId.get(id);
    if (monster && (monster.elite || monster.champion)) errors.push(`${where}: talia startowa ma tylko zwykłe stwory, a "${id}" nim nie jest (874 A)`);
  }
  for (const type of rules.types) {
    const count = rules.starter.monsters.filter((id) => byId.get(id)?.attack.scaling === type.id).length;
    if (count !== rules.deckSize / rules.types.length) errors.push(`${where}: talia startowa ma ${count} kart typu ${type.id}, a powinna ${rules.deckSize / rules.types.length}`);
  }
  const tiers = uniqueIds(errors, `${where} (stopnie)`, rules.host.tiers);
  if (tiers.size === 0) errors.push(`${where}: Szczęsny potrzebuje choć jednego stopnia`);
  const materialRarity = new Map(data.materials.materials.map((material) => [material.monster, material.rarity]));
  for (const tier of rules.host.tiers) {
    deck(`stopień ${tier.id}`, tier.cards.map((card) => card.monster));
    for (const card of tier.cards) if (card.level > rules.stats.maxLevel) errors.push(`${where}: stopień ${tier.id}: karta ${card.monster} ponad najwyższy poziom ${rules.stats.maxLevel}`);
    if (!rarities.has(tier.firstWin.rarity)) errors.push(`${where}: stopień ${tier.id}: nieznana rzadkość karty za pierwszą wygraną "${tier.firstWin.rarity}"`);
    else if (![...living].some((id) => (materialRarity.get(id) ?? data.rarities[0].id) === tier.firstWin.rarity)) errors.push(`${where}: stopień ${tier.id}: żadna karta nie ma rzadkości "${tier.firstWin.rarity}"`);
  }
  const heroes = uniqueIds(errors, `${where} (bohaterowie)`, rules.heroes);
  for (const cls of data.classes) if (!heroes.has(cls.id)) errors.push(`${where}: klasa ${cls.id} nie ma umiejętności bohatera (872 A)`);
  for (const hero of rules.heroes) {
    if (!data.classes.some((cls) => cls.id === hero.id)) errors.push(`${where}: bohater ${hero.id} to nie klasa`);
    const words = [hero.text, hero.plus ?? ''].join(' ');
    if (hero.power.some((power) => power > 0) && !words.includes('{power}')) errors.push(`${where}: bohater ${hero.id} ma liczbę (power), której słowa nie podają ({power})`);
    if (hero.plus && hero.power[0] > 0) errors.push(`${where}: bohater ${hero.id}: plus jest dla umiejętności bez liczby przed ewolucją`);
  }
  if (!data.settlement.residents.some((resident) => resident.id === rules.host.resident)) errors.push(`${where}: host.resident "${rules.host.resident}" to nie mieszkaniec Osady`);
  // The residents' tables (904 B): each a resident of the Osada with a place
  // of its own, not Szczęsny, a whole deck at levels up to the top, after a
  // tier there is, its stake between that tier's and the next one's (above
  // the top tier's for the strongest), and an icon the page has.
  const tables = uniqueIds(errors, `${where} (stoły mieszkańców)`, rules.residents.tables);
  const icons = new Set([...readFileSync(new URL('icons.js', CLIENT_DIR), 'utf8').matchAll(/^ {2}'?([a-z][a-z-]*)'?: \[/gm)].map((match) => match[1]));
  if (rules.residents.shown > rules.deckSize) errors.push(`${where}: residents.shown (${rules.residents.shown}) ponad talię (${rules.deckSize})`);
  for (const table of rules.residents.tables) {
    const owner = `mieszkaniec ${table.id}`;
    if (table.id === rules.host.resident) errors.push(`${where}: ${owner} to Szczęsny, który gra stopniami`);
    if (!data.settlement.residents.some((resident) => resident.id === table.id)) errors.push(`${where}: ${owner} to nie mieszkaniec Osady`);
    else if (!data.settlement.places.some((place) => place.resident === table.id)) errors.push(`${where}: ${owner} nie ma miejsca w Osadzie, w którym by grał`);
    deck(owner, table.cards.map((card) => card.monster));
    for (const card of table.cards) if (card.level > rules.stats.maxLevel) errors.push(`${where}: ${owner}: karta ${card.monster} ponad najwyższy poziom ${rules.stats.maxLevel}`);
    const below = rules.host.tiers[table.after - 1];
    const above = rules.host.tiers[table.after];
    if (!below) errors.push(`${where}: ${owner}: after ${table.after} to nie stopień Szczęsnego`);
    else if (!(table.stake > below.stake && (!above || table.stake < above.stake))) {
      errors.push(`${where}: ${owner}: stawka ${table.stake} nie leży między stopniami ${table.after} (${below.stake}) i ${table.after + 1} (${above?.stake ?? '–'})`);
    }
    if (!icons.has(table.icon)) errors.push(`${where}: ${owner}: nieznana ikona "${table.icon}" (src/client/icons.js)`);
  }
  if (tables.size === 0) errors.push(`${where}: mieszkańcy nie mają stołów`);
  return errors;
}

// The Salon Gier (answers 523–526): its host lives in the Osada, in a place
// on the board, with a greeting for each standing; a stake's chance stays a
// chance up to the top stake; a prize is worth more than the top stake and
// less than a win costs on average (1 / chancePerGold), so the Wheel never
// gives back more gold than it takes; the rarities exist, and the words the
// game fills in name their {…} and forms for a woman and a man ([a|b]).
function checkCasino(data) {
  const errors = [];
  const { casino, residents, places, standings } = data.settlement;
  if (!casino) return errors;
  const host = residents.find((resident) => resident.id === casino.resident);
  if (!host) errors.push(`settlement.json: casino.resident to nieznany mieszkaniec ${casino.resident}`);
  else if (host.greetings.length !== standings.length) errors.push(`settlement.json: gospodarz Salonu ${host.id} musi mieć powitanie na każdy stopień relacji`);
  if (!places.some((place) => place.resident === casino.resident)) errors.push(`settlement.json: gospodarz Salonu ${casino.resident} nie ma miejsca na planszy`);
  const { wheel, lottery, texts } = casino;
  // The Wheel's one pool of the day (4.11.2026): the four tiers once each,
  // their chances with that of nothing adding up to 1 at the lowest stake
  // and at the highest, no better chance of nothing at a higher stake (586),
  // and known rarities.
  const rarities = data.rarities.map((rarity) => rarity.id);
  const tierIds = wheel.tiers.map((tier) => tier.id);
  for (const id of ['weak', 'fair', 'good', 'great']) if (tierIds.filter((one) => one === id).length !== 1) errors.push(`settlement.json: casino.wheel.tiers potrzebuje progu ${id} dokładnie raz`);
  for (const end of ['low', 'high']) {
    const sum = wheel.none[end] + wheel.tiers.reduce((total, tier) => total + tier[end], 0);
    if (Math.abs(sum - 1) > 1e-9) errors.push(`settlement.json: casino.wheel: none.${end} i szanse progów (${end}) muszą dawać razem 1, a dają ${sum}`);
  }
  if (wheel.none.high > wheel.none.low) errors.push('settlement.json: casino.wheel.none.high nie może być większe niż none.low: wyższa stawka nie zmniejsza szansy na wygraną');
  for (const key of ['topRarity', 'goodRarity', 'greatRarity', 'mythicRarity']) if (!rarities.includes(wheel[key])) errors.push(`settlement.json: casino.wheel.${key} to nieznana rzadkość ${wheel[key]}`);
  for (const id of wheel.fairRarities) if (!rarities.includes(id)) errors.push(`settlement.json: casino.wheel.fairRarities ma nieznaną rzadkość ${id}`);
  for (const key of ['weakMaterials', 'fairMaterials']) if (wheel[key][0] > wheel[key][1]) errors.push(`settlement.json: casino.wheel.${key}: od nie może być więcej niż do`);
  if (lottery.base < 0 || lottery.ticket < 1) errors.push('settlement.json: casino.lottery potrzebuje ceny losu i bazy puli');
  const needs = { lotteryAbout: ['ticket', 'base'], lotteryToday: ['pot', 'tickets'], lotteryBuy: ['ticket'], lotteryEarlier: ['date'], announce: ['name', 'gold'], wheelAbout: ['step', 'low', 'high'], wheelPool: ['left', 'all'], wheelStake: ['stake'], wheelOdds: ['great', 'good', 'fair', 'weak', 'none'], wheelSpin: ['stake'], won: ['prize'] };
  for (const [key, words] of Object.entries(needs)) {
    for (const word of words) if (!texts[key]?.includes(`{${word}}`)) errors.push(`settlement.json: casino.texts.${key} nie ma {${word}}`);
  }
  for (const line of Object.values(texts).flat()) {
    if (line.replace(/\[[^[\]|]*\|[^[\]|]*\]/g, '').match(/[[\]|]/)) errors.push(`settlement.json: zła forma [kobieta|mężczyzna] w „${line}”`);
  }
  return errors;
}

// The width and the height of a PNG file of the page (src/client), from its
// header, or null when there is no such file.
function pngSize(file) {
  const url = new URL(file, CLIENT_DIR);
  if (!existsSync(url)) return null;
  const png = readFileSync(url);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// The Sklep Systemu (data/cosmetics.json): a frame's and a background's
// picture is there (art/cosmetics; an aura and a trail are drawn by the game), a frame's window and the points of its
// light lie inside its 120 × 160 picture, the light that needs points has
// them, a mount's look does not take the key of a Stajnia's mount, under
// which its trot would stand in walk.mounts (animations.json), and a pet's
// two sheets (art/pets) are there, each its frames side by side.
function checkCosmetics(data) {
  const errors = [];
  const FRAME = { width: 120, height: 160 };
  const where = (id) => `cosmetics.json: ${id}`;
  uniqueIds(errors, 'cosmetics', data.cosmetics.items);
  const inside = ([x, y]) => x < FRAME.width && y < FRAME.height;
  const mounts = new Set((data.settlement.stable?.mounts ?? []).map((mount) => mount.id));
  for (const item of data.cosmetics.items) {
    // An aura and a trail have no picture: the game draws them.
    if ((item.kind === 'frame' || item.kind === 'background') && !existsSync(new URL(`art/cosmetics/${item.art}.png`, CLIENT_DIR))) {
      errors.push(`${where(item.id)}: brak obrazka src/client/art/cosmetics/${item.art}.png`);
    }
    if (item.kind === 'mountSkin' && (mounts.has(item.id) || mounts.has(item.art))) errors.push(`${where(item.id)} ma id albo obrazek wierzchowca ze Stajni`);
    if (item.kind === 'pet') {
      for (const key of ['walk', 'portrait']) {
        const { file, size, frames } = item.pet[key];
        const found = pngSize(file);
        if (!found) errors.push(`${where(item.id)}: brak arkusza src/client/${file}`);
        else if (found.width !== size * frames || found.height !== size) {
          errors.push(`${where(item.id)}: arkusz ${file} ma ${found.width} × ${found.height}, a ${frames} klatek po ${size} × ${size} to ${size * frames} × ${size}`);
        }
      }
      // Counted from the portrait's corner, the frame starts on the portrait.
      const { anchor, x, y } = item.pet.portrait;
      if (!anchor && !(x >= 0 && x < 96 && y >= 0 && y < 128)) errors.push(`${where(item.id)}: chowaniec poza portretem 96 × 128`);
    }
    if (item.kind !== 'frame') continue;
    const [left, top, right, bottom] = item.window;
    if (!(left < right && top < bottom && inside([right, bottom]))) errors.push(`${where(item.id)}: okno ramki musi leżeć w obrazku ${FRAME.width} × ${FRAME.height}`);
    const points = item.effect.points ?? [];
    if (points.some((point) => !inside(point))) errors.push(`${where(item.id)}: punkt animacji poza obrazkiem ${FRAME.width} × ${FRAME.height}`);
    if ((item.effect.kind === 'pulse') !== (points.length === 0)) errors.push(`${where(item.id)}: animacja ${item.effect.kind} ${item.effect.kind === 'pulse' ? 'nie ma punktów' : 'potrzebuje punktów'}`);
  }
  return errors;
}
