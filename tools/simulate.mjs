// Balance simulation: many hunts for typical characters of each class.
// Measures fainting chance, XP, gold and items per hour, and how many hours
// of hunting a level takes with the current XP table.
//
//   node tools/simulate.mjs                      summary table (10 000 hunts)
//   node tools/simulate.mjs --hunts 2000 --levels 1,5,10 --minutes 30,60,240
//   node tools/simulate.mjs --calibrate          suggests xpPerHourScale

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';

// Gear a typical character has, from the hours it has explored: it starts
// with nothing, gets its weapon in the first fight, finds about two items an
// hour and loot favours empty slots, so slots fill in this order. Worn items
// have the level gearLevel gives (found half the exploring time ago, at most
// 45 minutes), and rare ones with the class's main stat replace common ones
// slot by slot, one per 3 hours.
const KIT = {
  warrior: { chest: 'chainmail', offhand: 'shield', head: 'helmet' },
  archer: { chest: 'tunic', offhand: 'quiver', head: 'hood' },
  mage: { chest: 'robe', offhand: 'focus', head: 'hood' },
  cleric: { chest: 'surplice', offhand: 'shield', head: 'cowl' },
  shadow: { chest: 'tunic', offhand: 'misericorde', head: 'hood' },
};
const SLOT_ORDER = ['weapon', 'chest', 'offhand', 'head', 'feet', 'hands', 'amulet', 'ring', 'talisman'];
const OTHER_BASES = { feet: 'boots', hands: 'gloves', amulet: 'amulet', ring: 'ring', talisman: 'talisman' };

// Hours of exploring it takes to reach a level.
export function hoursToReach(level, content) {
  let hours = 0;
  for (let l = 1; l < level; l++) hours += engine.huntingHours(l, content);
  return hours;
}


// Items an hour: finds that are treasure chests. Creatures leave only
// materials, and the elite's chest is too rare to count.
export function itemsPerHour(content) {
  const { hunt, rewards } = content.balance;
  const outcomes = Object.values(rewards.findOutcomes).reduce((sum, weight) => sum + weight, 0);
  return (60 / hunt.findIntervalMinutes) * (rewards.findOutcomes.chest / outcomes);
}

export function typicalCharacter(classId, level, content) {
  const cls = content.classesById[classId];
  const classLevel = typicalClassLevel(level, content);
  const character = { classId, level, classLevel, points: {}, position: cls.position, xp: 0, classXp: 0, skills: typicalSkills(classId, classLevel, content) };
  character.points = engine.autoDistribute(character, content);
  const mainStat = Object.entries(cls.autoPoints).sort((a, b) => b[1] - a[1])[0][0];
  const affixIds = [content.prefixes.find((affix) => affix.stat === mainStat).id];
  const rng = engine.createRng(`gear:${classId}:${level}`);
  const hours = hoursToReach(level, content);
  const itemLevel = Math.max(1, Math.min(level - 1, engine.gearLevel(level, content)));
  const bases = { weapon: cls.weapons[0], ...KIT[classId], ...OTHER_BASES };
  // Three of four finds land in a new slot; the rest are duplicates for the scrapper.
  const slots = level === 1 ? [] : SLOT_ORDER.slice(0, Math.min(SLOT_ORDER.length, 1 + Math.floor(0.75 * itemsPerHour(content) * hours)));
  const rareSlots = Math.min(slots.length, Math.floor(hours / 3));
  const equipped = slots.map((slot, index) =>
    index < rareSlots
      ? engine.generateItem({ baseId: bases[slot], level: itemLevel, rarityId: 'rare', affixIds }, rng, content)
      : engine.generateItem({ baseId: bases[slot], level: itemLevel }, rng, content),
  );
  return { character, equipped };
}

// The skills a character usually has: from the class level of the first
// skill every Skill Point spent, first on the class's first skill up to the
// top level (the main path), then on its second (the side path). Skills
// carry the mid-game, so the balance counts on them.
export function typicalSkills(classId, classLevel, content) {
  const { unlockClassLevel, lastPointClassLevel, maxLevel } = content.balance.skills;
  const points = Math.max(0, Math.min(classLevel, lastPointClassLevel) - unlockClassLevel + 1);
  const [main, side] = content.skills.filter((skill) => skill.classId === classId);
  const skills = {};
  if (points > 0) skills[main.id] = Math.min(maxLevel, points);
  if (points > maxLevel) skills[side.id] = points - maxLevel;
  return skills;
}

// The class level a character usually has at a character level: class levels
// need less XP, so they run ahead. Found by adding up the XP of both tables.
export function typicalClassLevel(level, content) {
  let total = 0;
  for (let l = 1; l < level; l++) total += engine.xpToNext(l, content);
  let classLevel = 1;
  while (total >= engine.classXpToNext(classLevel, content)) {
    total -= engine.classXpToNext(classLevel, content);
    classLevel += 1;
  }
  return classLevel;
}

// Inner regions from the data, plus generated stand-ins for levels without
// content yet, so the XP table can be checked up to level 500.
export function areaForLevel(level, content) {
  const real = content.areas.find((area) => level >= area.minLevel && level <= area.maxLevel);
  if (real) return real;
  const template = content.areas[content.areas.length - 1];
  return { ...template, id: `generated-${level}`, minLevel: Math.max(1, level - 2), maxLevel: level + 2, safe: false };
}

export function simulateMany({ classId, level, minutes, hunts }, content) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  const area = areaForLevel(level, content);
  const local = area.id in content.areasById ? content : { ...content, areasById: { ...content.areasById, [area.id]: area } };
  const maxHp = engine.playerCombatant({ character, equipped, name: 'Symulacja', area }, local).maxHp;
  const totals = { fainted: 0, escaped: 0, xp: 0, penalty: 0, gold: 0, items: 0, fights: 0, endHp: 0 };
  for (let i = 0; i < hunts; i++) {
    const hunt = engine.simulateHunt(
      { character, equipped, hp: maxHp, name: 'Symulacja', areaId: area.id, minutes, seed: `sim:${classId}:${level}:${minutes}:${i}` },
      local,
    );
    if (hunt.result === 'fainted') {
      totals.fainted += 1;
      totals.penalty += engine.faintPenalty(level, engine.xpToNext(level, content), content);
    }
    if (hunt.result === 'escaped') totals.escaped += 1;
    totals.xp += hunt.xp;
    totals.gold += hunt.gold;
    totals.items += hunt.items.length;
    totals.fights += hunt.fights.length;
    totals.endHp += hunt.hpEnd / hunt.maxHp;
  }
  const hours = (hunts * minutes) / 60;
  const netXpPerHour = (totals.xp - totals.penalty) / hours;
  return {
    classId,
    level,
    minutes,
    faintRate: totals.fainted / hunts,
    escapeRate: totals.escaped / hunts,
    xpPerHour: totals.xp / hours,
    netXpPerHour,
    goldPerHour: totals.gold / hours,
    itemsPerHour: totals.items / hours,
    endHp: totals.endHp / hunts,
    hoursToLevel: engine.xpToNext(level, content) / Math.max(1e-9, netXpPerHour),
    targetHours: engine.huntingHours(level, content),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const name = argv[i].slice(2);
      const next = argv[i + 1];
      options[name] = next === undefined || next.startsWith('--') ? true : (i++, next);
    }
  }
  return options;
}

const list = (value, fallback) => (typeof value === 'string' ? value.split(',') : fallback);

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = engine.buildContent(loadData());
  const classes = list(options.classes, content.classes.map((cls) => cls.id));
  const levels = list(options.levels, ['1', '5', '10', '20', '26', '35', '50']).map(Number);
  const minutesList = list(options.minutes, ['5', '30', '120', '240']).map(Number);

  if (options.calibrate) {
    // Levels above the existing regions use generated stand-ins, so keep to the regions there are (up to 50).
    const calibrationLevels = list(options.levels, ['1', '3', '5', '10', '20', '30', '40', '50']).map(Number);
    const hunts = Number(options.hunts ?? 300);
    const ratios = [];
    for (const level of calibrationLevels) {
      const rates = classes.map((classId) => simulateMany({ classId, level, minutes: 60, hunts }, content).netXpPerHour);
      const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
      ratios.push(mean / level ** content.balance.rewards.xpExponent);
      console.log(`poziom ${level}: średnio ${mean.toFixed(0)} XP/h netto`);
    }
    const scale = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    console.log(`Proponowane xpPerHourScale: ${scale.toFixed(1)} (obecnie ${content.balance.progression.xpPerHourScale})`);
    return;
  }

  // Only the hunt lengths a character of that level can choose (level 1 has only short hunts).
  const allowed = (level) => minutesList.filter((minutes) => engine.huntDurations(level, content).includes(minutes));
  const combos = classes.length * levels.reduce((sum, level) => sum + allowed(level).length, 0);
  const hunts = Number(options.hunts ?? Math.ceil(10000 / combos));
  console.log(`${hunts} wypraw na wiersz, razem ${hunts * combos}.`);
  console.log('klasa     poz  min  omdlenia  odwrót  XP/h  netto  złoto/h  przedm./h  HP na końcu  godz. do poz. (cel)');
  for (const classId of classes) {
    for (const level of levels) {
      for (const minutes of allowed(level)) {
        const r = simulateMany({ classId, level, minutes, hunts }, content);
        const pct = (value) => `${(value * 100).toFixed(1)}%`.padStart(8);
        console.log(
          `${classId.padEnd(9)} ${String(level).padStart(3)} ${String(minutes).padStart(4)} ${pct(r.faintRate)} ${pct(r.escapeRate)}` +
            ` ${r.xpPerHour.toFixed(0).padStart(5)} ${r.netXpPerHour.toFixed(0).padStart(6)} ${r.goldPerHour.toFixed(0).padStart(8)}` +
            ` ${r.itemsPerHour.toFixed(2).padStart(10)} ${pct(r.endHp).padStart(12)} ${r.hoursToLevel.toFixed(1).padStart(9)} (${r.targetHours.toFixed(1)})`,
        );
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
