// Balance of the class evolutions (data/evolutions.json): typical characters
// of each evolution at class levels past the first evolution, against their
// class as it grows on without one (where evolutions are off). Measures
// fainting, XP an hour and HP at the end, as tools/simulate.mjs, and, as
// XP an hour depends mostly on how many fights a hunt brings, the fights
// themselves: how long one lasts and the damage the character's side deals
// and the character takes in a unit of a fight's time.
//
//   node tools/evolution-sim.mjs                         levels 50, 60, 70, 80
//   node tools/evolution-sim.mjs --levels 60 --hunts 300 --minutes 60
//   node tools/evolution-sim.mjs --second                levels 85, 90, 95, 100
//   node tools/evolution-sim.mjs --third                 levels 170, 180, 190, 200
//
// An evolved character takes back the 40 Skill Points of its two skills and
// gets one more for each class level up to 99, spread evenly over the
// evolution's two skills, as a player who spends them as they come.
// `--second` compares each first evolution, its skills at the top level,
// with its second form at the same class level (past 100): the form takes
// back the 90 points and gets one for each class level from 100 on.
// `--third` compares each second form, its skills at their top level, with
// its third form at the same class level (past 200): the third form takes
// back the 190 points and gets one for each class level from 200 on.
// `--plus 8` measures in the place that many levels above the character
// (as the second evolution's test does), `--then` against the creatures as
// they were when the second forms were set (no growth past 100).

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';
import { areaForLevel, typicalCharacter } from './simulate.mjs';

export function evolvedSkills(evolution, classLevel, content) {
  const stage = evolution.stage ?? 1;
  const rules = content.evolutionStages?.[stage - 1] ?? content.evolutionRules;
  const { skillMaxLevel, pointsPerClassLevel } = rules;
  const levels = content.balance.progression.classEvolutionLevels;
  const from = levels[stage - 1];
  // The points the skills before had, all back: the class's two at their
  // top level, or the first evolution's two at theirs.
  const returned = stage === 1 ? 2 * content.balance.skills.maxLevel : 2 * (content.evolutionStages?.[stage - 2] ?? content.evolutionRules).skillMaxLevel;
  const lastPointClassLevel = rules.lastPointClassLevel;
  let points = returned + pointsPerClassLevel * Math.max(0, Math.min(classLevel, lastPointClassLevel) - from + (stage === 1 ? 0 : 1));
  const skills = Object.fromEntries(evolution.skills.map((id) => [id, 0]));
  for (let i = 0; points > 0; i = (i + 1) % evolution.skills.length) {
    const id = evolution.skills[i];
    if (skills[id] < skillMaxLevel) {
      skills[id] += 1;
      points -= 1;
    } else if (evolution.skills.every((other) => skills[other] >= skillMaxLevel)) break;
  }
  return skills;
}

export function simulateCharacter({ character, equipped, level, minutes, hunts, tag, plus = 0 }, content) {
  const area = areaForLevel(level + plus, content);
  const local = area.id in content.areasById ? content : { ...content, areasById: { ...content.areasById, [area.id]: area } };
  const maxHp = engine.playerCombatant({ character, equipped, name: 'Symulacja', area }, local).maxHp;
  const totals = { fainted: 0, xp: 0, penalty: 0, gold: 0, endHp: 0, fights: 0, time: 0, dealt: 0, taken: 0 };
  for (let i = 0; i < hunts; i++) {
    const hunt = engine.simulateHunt(
      { character, equipped, hp: maxHp, name: 'Symulacja', areaId: area.id, minutes, seed: `evo:${tag}:${level}:${minutes}:${i}` },
      local,
    );
    if (hunt.result === 'fainted') {
      totals.fainted += 1;
      totals.penalty += engine.faintPenalty(level, engine.xpToNext(level, content), content);
    }
    totals.xp += hunt.xp;
    totals.gold += hunt.gold;
    totals.endHp += hunt.hpEnd / hunt.maxHp;
    for (const fight of hunt.fights) {
      if (!fight.events.length) continue;
      const ally = new Set(fight.allies.map((unit) => unit.id));
      totals.fights += 1;
      totals.time += fight.events[fight.events.length - 1].t;
      // Damage on the enemies counts whoever deals it (blows, the ticks of
      // poison and bleeding, a falcon, a summon); on the character, all but
      // the blows its summon takes in its place ("summon").
      for (const event of fight.events) {
        if (!event.damage) continue;
        if (ally.has(event.target)) {
          if (event.kind !== 'summon') totals.taken += event.damage;
        } else totals.dealt += event.damage;
      }
    }
  }
  const hours = (hunts * minutes) / 60;
  return {
    area: area.id,
    maxHp,
    faintRate: totals.fainted / hunts,
    xpPerHour: totals.xp / hours,
    netXpPerHour: (totals.xp - totals.penalty) / hours,
    goldPerHour: totals.gold / hours,
    endHp: totals.endHp / hunts,
    fightTime: totals.time / Math.max(1, totals.fights),
    dealtPerTime: totals.dealt / Math.max(1, totals.time),
    takenPerTime: totals.taken / Math.max(1, totals.time),
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

// The rows of one class at one level: the class and its three evolutions,
// or (stage 2) each first evolution and its second form, or (stage 3) each
// second form and its third, one pair at a time.
function rowsOf(cls, base, content, stage) {
  const evolved = (evolution) => {
    const character = { ...base.character, evolution: evolution.id, skills: evolvedSkills(evolution, base.character.classLevel, content) };
    character.points = engine.autoDistribute(character, content);
    return { name: evolution.name, character };
  };
  const firsts = content.evolutions.filter((e) => e.classId === cls.id && !e.from);
  if (stage === 1) return [[{ name: cls.name, character: base.character }, ...firsts.map(evolved)]];
  const before = stage === 2 ? firsts : firsts.map((first) => engine.nextFormOf(first, content));
  return before.map((form) => [evolved(form), evolved(engine.nextFormOf(form, content))]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let content = engine.buildContent(loadData());
  const stage = options.third ? 3 : options.second ? 2 : 1;
  const defaults = { 1: ['50', '60', '70', '80'], 2: ['85', '90', '95', '100'], 3: ['170', '180', '190', '200'] }[stage];
  const levels = (typeof options.levels === 'string' ? options.levels.split(',') : defaults).map(Number);
  const minutes = Number(options.minutes ?? 60);
  const hunts = Number(options.hunts ?? 200);
  const from = content.balance.progression.classEvolutionLevels[stage - 1];
  const only = typeof options.only === 'string' ? options.only.split(',') : null;
  // The creatures as they were when the second forms were set: +25% from 50
  // to 100 and nothing past it, without the harder explorations (0.1.59).
  if (options.then) {
    const { lateGame, endGame } = content.balance.monsters;
    const monsters = { ...content.balance.monsters, lateGame: { ...lateGame, damage: 0.25, hp: 0.25 }, endGame: { ...endGame, damage: 0, hp: 0 } };
    content = { ...content, balance: { ...content.balance, monsters, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
  }
  const plus = Number(options.plus ?? 0);
  console.log(`${hunts} wypraw po ${minutes} min na wiersz.`);
  const against = stage > 1 ? 'ewolucji' : 'klasy';
  console.log(`klasa / ewolucja         poz  klasa  HP maks.  omdlenia   XP/h  HP na końcu  walka  zadane  przyjęte  zadane wobec ${against}  przyjęte wobec ${against}  wymiana`);
  for (const cls of content.classes) {
    for (const level of levels) {
      const base = typicalCharacter(cls.id, level, content);
      if (base.character.classLevel <= from) continue;
      for (const rows of rowsOf(cls, base, content, stage)) {
        if (only && !rows.some((row) => only.includes(row.character.evolution))) continue;
        printRows(rows, { level, minutes, hunts, base, plus }, content);
      }
    }
  }
}

// One row per character, each measured against the first of `rows`. The
// last column is the exchange: damage dealt for each point of HP taken, as
// a fight's HP loss is its foes' HP times taken / dealt.
function printRows(rows, { level, minutes, hunts, base, plus = 0 }, content) {
  let first = null;
  for (const row of rows) {
    const r = simulateCharacter({ character: row.character, equipped: base.equipped, level, minutes, hunts, tag: row.name, plus }, content);
    first ??= r;
    const pct = (value) => `${(value * 100).toFixed(1)}%`;
    const vs = (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;
    const exchange = (one) => one.dealtPerTime / Math.max(1e-9, one.takenPerTime);
    console.log(
      `${row.name.padEnd(24)} ${String(level).padStart(3)} ${String(row.character.classLevel).padStart(6)} ${String(r.maxHp).padStart(9)} ${pct(r.faintRate).padStart(9)}` +
        ` ${r.netXpPerHour.toFixed(0).padStart(6)} ${pct(r.endHp).padStart(12)} ${r.fightTime.toFixed(0).padStart(6)} ${r.dealtPerTime.toFixed(2).padStart(7)} ${r.takenPerTime.toFixed(2).padStart(9)}` +
        ` ${vs(r.dealtPerTime / first.dealtPerTime - 1).padStart(19)} ${vs(r.takenPerTime / first.takenPerTime - 1).padStart(21)} ${vs(exchange(r) / exchange(first) - 1).padStart(9)}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
