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
//
// An evolved character takes back the 40 Skill Points of its two skills and
// gets one more for each class level up to 99, spread evenly over the
// evolution's two skills, as a player who spends them as they come.

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';
import { areaForLevel, typicalCharacter } from './simulate.mjs';

export function evolvedSkills(evolution, classLevel, content) {
  const { skillMaxLevel, lastPointClassLevel, pointsPerClassLevel } = content.evolutionRules;
  const from = content.balance.progression.classEvolutionLevels[0];
  const returned = 2 * content.balance.skills.maxLevel;
  let points = returned + pointsPerClassLevel * Math.max(0, Math.min(classLevel, lastPointClassLevel) - from);
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

export function simulateCharacter({ character, equipped, level, minutes, hunts, tag }, content) {
  const area = areaForLevel(level, content);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = engine.buildContent(loadData());
  const levels = (typeof options.levels === 'string' ? options.levels.split(',') : ['50', '60', '70', '80']).map(Number);
  const minutes = Number(options.minutes ?? 60);
  const hunts = Number(options.hunts ?? 200);
  const from = content.balance.progression.classEvolutionLevels[0];
  console.log(`${hunts} wypraw po ${minutes} min na wiersz.`);
  console.log('klasa / ewolucja         poz  klasa  HP maks.  omdlenia   XP/h  HP na końcu  walka  zadane  przyjęte  zadane wobec klasy  przyjęte wobec klasy');
  for (const cls of content.classes) {
    for (const level of levels) {
      const base = typicalCharacter(cls.id, level, content);
      if (base.character.classLevel <= from) continue;
      const rows = [{ name: cls.name, character: base.character }];
      for (const evolution of content.evolutions.filter((e) => e.classId === cls.id)) {
        const character = { ...base.character, evolution: evolution.id, skills: evolvedSkills(evolution, base.character.classLevel, content) };
        character.points = engine.autoDistribute(character, content);
        rows.push({ name: evolution.name, character });
      }
      let first = null;
      for (const row of rows) {
        const r = simulateCharacter({ character: row.character, equipped: base.equipped, level, minutes, hunts, tag: row.name }, content);
        first ??= r;
        const pct = (value) => `${(value * 100).toFixed(1)}%`;
        const vs = (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;
        console.log(
          `${row.name.padEnd(24)} ${String(level).padStart(3)} ${String(row.character.classLevel).padStart(6)} ${String(r.maxHp).padStart(9)} ${pct(r.faintRate).padStart(9)}` +
            ` ${r.netXpPerHour.toFixed(0).padStart(6)} ${pct(r.endHp).padStart(12)} ${r.fightTime.toFixed(0).padStart(6)} ${r.dealtPerTime.toFixed(2).padStart(7)} ${r.takenPerTime.toFixed(2).padStart(9)}` +
            ` ${vs(r.dealtPerTime / first.dealtPerTime - 1).padStart(19)} ${vs(r.takenPerTime / first.takenPerTime - 1).padStart(21)}`,
        );
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
