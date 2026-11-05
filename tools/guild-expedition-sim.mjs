// The Wyprawa Gildii's balance (621 A; src/engine/guild-expedition.js,
// data/guilds.json `expedition`): a guild of typical characters
// (tools/simulate.mjs, one of each class in turn) on its route of a week.
// For each guardian its level, HP, the damage of a typical attack on it
// (as on the Bestia: alone, at full HP, no potions) and how many attacks it
// takes; then the week played out: each member explores `minutes` a day,
// in three parts, and after each part attacks the guardian barring the way,
// if any (3 attacks a day). Prints the day each guardian falls.
//
//   node tools/guild-expedition-sim.mjs                       levels 30 and 60, 5 members, 240 min a day
//   node tools/guild-expedition-sim.mjs --levels 30,60,120 --members 5 --minutes 120,240 --fights 24 --weeks 20

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { typicalCharacter } from './simulate.mjs';
import { loadData } from './validate-data.mjs';

const BASE_CLASSES = ['warrior', 'archer', 'mage', 'cleric', 'shadow'];
const DAY_PARTS = 3;

function option(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
}

// The damage a member's attacks deal to a guardian: `fights` fights of the
// typical character of its class and level on the guardian with HP to spare.
function damageSamples(classId, level, guardian, fights, content) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return Array.from({ length: fights }, (_, index) => {
    const beast = { monsterId: guardian.monsterId, areaId: guardian.areaId, level: guardian.level, hp: 1e9, maxHp: 1e9 };
    return engine.guildBeastFight({ character, equipped, name: 'Typowa', beast, seed: `expedition:${classId}:${guardian.stage}:${index}` }, content).damage;
  });
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

// One week of a guild: the minutes come in DAY_PARTS parts a day, and after
// each part every member attacks once the guardian barring the way. The
// day (1 = Monday) and part each guardian falls in, or null.
function playWeek({ members, minutesPerDay, guardians, samples, need, seed }, content) {
  const rng = engine.createRng(seed);
  const stages = guardians.length;
  let minutes = 0;
  let beaten = 0;
  let hp = null;
  const fell = [];
  for (let day = 1; day <= 7 && beaten < stages; day++) {
    for (let part = 0; part < DAY_PARTS && beaten < stages; part++) {
      minutes += (members.length * minutesPerDay) / DAY_PARTS;
      for (const member of members) {
        const route = engine.expeditionProgress({ minutes, walked: beaten * need, beaten, need, standing: hp !== null }, content);
        if (route.done || !route.guardian) break;
        if (hp === null) hp = guardians[beaten].maxHp;
        const pool = samples[member][beaten];
        hp -= pool[Math.floor(rng.next() * pool.length)];
        if (hp <= 0) {
          fell.push({ day, part });
          beaten += 1;
          hp = null;
        }
      }
    }
  }
  return fell;
}

export function simulateExpedition({ level, members: count, minutesPerDay, fights, weeks }, content) {
  const members = Array.from({ length: count }, (_, index) => BASE_CLASSES[index % BASE_CLASSES.length]);
  const route = engine.guildExpedition({ levels: members.map(() => level) }, content);
  const need = engine.expeditionStageMinutes(count, content);
  const guardians = route.guardians.map((_, index) => engine.expeditionGuardian({ stage: index + 1, level: route.level, members: count, guardians: route.guardians }, content));
  const samples = Object.fromEntries([...new Set(members)].map((classId) => [classId, guardians.map((guardian) => damageSamples(classId, level, guardian, fights, content))]));
  const rows = guardians.map((guardian, index) => {
    const average = mean(members.map((classId) => mean(samples[classId][index])));
    return {
      stage: guardian.stage,
      name: content.monstersById[guardian.monsterId].name,
      level: guardian.level,
      maxHp: guardian.maxHp,
      damage: Math.round(average),
      share: average / engine.beastAttackDamage(guardian.level, content),
      attacks: guardian.maxHp / average,
    };
  });
  const falls = Array.from({ length: weeks }, (_, week) => playWeek({ members, minutesPerDay, guardians, samples, need, seed: `week:${level}:${week}` }, content));
  const days = guardians.map((_, index) => {
    const seen = falls.map((fell) => fell[index]?.day ?? null);
    const fallen = seen.filter((day) => day !== null).sort((a, b) => a - b);
    return { fallen: fallen.length / weeks, median: fallen.length > 0 ? fallen[Math.floor(fallen.length / 2)] : null };
  });
  return { land: content.regionsById[route.landId].name, need, rows, days };
}

function main(args) {
  const content = engine.buildContent(loadData());
  const levels = option(args, 'levels', '30,60').split(',').map(Number);
  const members = Number(option(args, 'members', '5'));
  const minutes = option(args, 'minutes', '240').split(',').map(Number);
  const fights = Number(option(args, 'fights', '24'));
  const weeks = Number(option(args, 'weeks', '20'));
  const DAYS = ['', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
  for (const level of levels) {
    for (const minutesPerDay of minutes) {
      const result = simulateExpedition({ level, members, minutesPerDay, fights, weeks }, content);
      console.log(`\nPoziom ${level}, ${members} członków, ${minutesPerDay} min wypraw dziennie na członka — ${result.land}, etap: ${result.need} min`);
      console.log('etap  strażnik              poz.      HP   atak  /typowy  ataków  padł (mediana, odsetek tygodni)');
      for (const [index, row] of result.rows.entries()) {
        const day = result.days[index];
        console.log(
          `${String(row.stage).padStart(4)}  ${row.name.padEnd(20)} ${String(row.level).padStart(4)} ${String(row.maxHp).padStart(7)} ${String(row.damage).padStart(6)}  ${row.share.toFixed(2).padStart(7)}  ${row.attacks.toFixed(1).padStart(6)}  ${day.median ? DAYS[day.median] : '—'} (${Math.round(day.fallen * 100)}%)`,
        );
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
