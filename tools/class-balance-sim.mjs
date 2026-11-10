// Class balance on explorations (question 772): the realistic player of
// tools/difficulty-sim.mjs of each class, and of each evolution path of it
// (`--paths all`; the main path otherwise), on explorations in the newest
// place of a level, with companions as the realistic player has them and
// alone (`-nocomp`, as in the Arena). For each: how often an exploration
// ends in a defeat, the HP left at its end, XP and gold an hour as the
// game gives them (a defeat loses the whole exploration and costs the XP
// penalty), how fast the side kills (the creatures' HP a hundred units of
// fight time, won fights) and how much the character takes (the share of
// its HP the creatures' blows and effects take a fight). Then each class
// against the average of the five main paths.
//
//   node tools/class-balance-sim.mjs                         levels 25, 50, 75, 100, 150, 200
//   node tools/class-balance-sim.mjs --levels 50,100 --hunts 300 --paths all
//   node tools/class-balance-sim.mjs --minutes 60,240 --models realistic,realistic-nocomp --json out.json

import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import * as engine from '../src/engine/index.js';
import { GEAR_SETS, companionsOf, contentWith, newestArea, playerOf, roadKit, withArea } from './difficulty-sim.mjs';

export const LEVELS = [25, 50, 75, 100, 150, 200];

// The damage the character took in a fight: the blows and effects that
// reached it (a summon's or a shield's share does not).
const TAKEN = new Set(['hit', 'crit', 'tick']);

// `hunts` explorations of `minutes` of one class (with the evolution of
// `path`, the skill that leads it; null for the main path) at a level.
export function measureClass({ model, classId, level, minutes, hunts, path = null }, content) {
  const area = newestArea(level, content);
  const local = withArea(area, content);
  const players = Array.from({ length: GEAR_SETS }, (_, set) => playerOf(model, classId, level, local, set, path));
  const maxHps = players.map((one) => engine.playerCombatant({ character: one.character, equipped: one.equipped, name: 'Symulacja', area }, local).maxHp);
  const plan = players[0].plan;
  const kit = roadKit(plan, area, minutes, local);
  const penalty = engine.faintPenalty(level, engine.xpToNext(level, content), content);
  const totals = { defeats: 0, endHp: 0, xp: 0, gold: 0, killed: 0, killTime: 0, fights: 0, taken: 0 };
  for (let i = 0; i < hunts; i++) {
    const { character, equipped } = players[i % GEAR_SETS];
    const maxHp = maxHps[i % GEAR_SETS];
    const hunt = engine.simulateHunt(
      { character, equipped, hp: maxHp, name: 'Symulacja', areaId: area.id, minutes, seed: `class-balance:${classId}:${level}:${minutes}:${i}`, companions: companionsOf(plan, level, i, local), ...kit },
      local,
    );
    // As the game takes it: a defeat loses everything and costs the penalty.
    const kept = engine.faintForfeit(hunt);
    if (hunt.result === 'fainted') {
      totals.defeats += 1;
      totals.xp -= penalty;
    }
    totals.xp += kept.xp;
    totals.gold += kept.gold;
    totals.endHp += hunt.hpEnd / hunt.maxHp;
    for (const fight of hunt.fights) {
      if (fight.events.length === 0) continue;
      totals.fights += 1;
      for (const event of fight.events) if (event.target === 'a0' && event.damage && TAKEN.has(event.kind)) totals.taken += event.damage / maxHp;
      if (fight.won !== true) continue;
      totals.killed += fight.enemiesView.reduce((sum, enemy) => sum + enemy.maxHp, 0);
      totals.killTime += fight.events.at(-1).t;
    }
  }
  const hours = (hunts * minutes) / 60;
  return {
    model,
    classId,
    level,
    minutes,
    area: area.id,
    evolution: players[0].character.evolution ?? null,
    defeats: totals.defeats / hunts,
    endHp: totals.endHp / hunts,
    xpPerHour: totals.xp / hours,
    goldPerHour: totals.gold / hours,
    killSpeed: (100 * totals.killed) / Math.max(1, totals.killTime),
    takenPerFight: totals.taken / Math.max(1, totals.fights),
  };
}

// The rows of a level: each class's main path, and with `paths` its other
// two (from the class level of the first evolution on).
export function variantsAt(level, content, paths = false) {
  const rows = [];
  for (const cls of content.classes) {
    const skills = content.skills.filter((skill) => skill.classId === cls.id);
    const evolved = playerOf('realistic', cls.id, level, content).character.evolution;
    for (const [index, skill] of skills.entries()) {
      if (index > 0 && (!paths || !evolved)) break;
      rows.push({ classId: cls.id, path: index === 0 ? null : skill.id, main: index === 0 });
    }
  }
  return rows;
}

function parseArgs(argv) {
  const options = { set: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : (i++, next);
    if (name === 'set') options.set.push(value);
    else options[name] = value;
  }
  return options;
}

const list = (value, fallback) => (typeof value === 'string' ? value.split(',') : fallback);
const pct = (value) => `${(value * 100).toFixed(1)}%`;
// Against the average; none where the average is not above zero (XP an
// hour of many defeats, whose penalties outweigh what the rest brought).
const vs = (value, average) => (average > 0 ? `${value >= average ? '+' : ''}${((value / average - 1) * 100).toFixed(0)}%` : '—');

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = contentWith(options.set);
  const levels = list(options.levels, LEVELS.map(String)).map(Number);
  const minutesList = list(options.minutes, ['60', '240']).map(Number);
  const models = list(options.models, ['realistic', 'realistic-nocomp']);
  const hunts = Number(options.hunts ?? 240);
  const rows = [];
  for (const level of levels) {
    const area = newestArea(level, content);
    console.log(`\n== ${level}. poziom, ${area.id} (${area.minLevel}–${area.maxLevel}), ${hunts} wypraw na komórkę`);
    for (const model of models) {
      for (const minutes of minutesList) {
        const cells = variantsAt(level, content, options.paths === 'all').map((variant) => ({ ...variant, ...measureClass({ model, level, minutes, hunts, ...variant }, content) }));
        rows.push(...cells);
        const mains = cells.filter((cell) => cell.main);
        const mean = (key) => mains.reduce((sum, cell) => sum + cell[key], 0) / mains.length;
        const average = { defeats: mean('defeats'), xpPerHour: mean('xpPerHour'), goldPerHour: mean('goldPerHour'), killSpeed: mean('killSpeed'), takenPerFight: mean('takenPerFight') };
        console.log(`${model}, ${minutes} min: porażki | HP na końcu | XP/h (wobec średniej) | złoto/h | szybkość zabijania | przyjęte na walkę (% HP)`);
        for (const cell of cells) {
          const name = cell.evolution ? content.evolutionsById[cell.evolution].name : content.classesById[cell.classId].name;
          console.log(
            `  ${(cell.main ? name : `  ${name}`).padEnd(22)} ${pct(cell.defeats).padStart(6)} (${`${cell.defeats >= average.defeats ? '+' : ''}${((cell.defeats - average.defeats) * 100).toFixed(1)}`.padStart(6)} pp)` +
              ` ${pct(cell.endHp).padStart(7)}  ${cell.xpPerHour.toFixed(0).padStart(8)} (${vs(cell.xpPerHour, average.xpPerHour).padStart(5)})` +
              `  ${cell.goldPerHour.toFixed(0).padStart(6)} (${vs(cell.goldPerHour, average.goldPerHour).padStart(5)})` +
              `  ${cell.killSpeed.toFixed(0).padStart(6)} (${vs(cell.killSpeed, average.killSpeed).padStart(5)})  ${pct(cell.takenPerFight).padStart(6)} (${vs(cell.takenPerFight, average.takenPerFight).padStart(5)})`,
          );
        }
      }
    }
  }
  if (typeof options.json === 'string') writeFileSync(options.json, JSON.stringify({ sets: options.set, hunts, rows }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
