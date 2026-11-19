// The pace of the Bestia Gildii with the classes of the day (1197), the
// rally (1199 A) and the podcięcia (1203), against the pace before them
// (src/engine/guild-strike.js, data/guilds.json `classDay`, `rally`,
// `undercut`). A guild of typical characters (tools/simulate.mjs), its
// classes spread as usual (one of each class in turn), attacks its beast
// three times a day each, and the week is played out four ways:
//   - "dotąd": as before the three, with the HP of before;
//   - "same ciosy": only Cios, the classes of the day as the schedule has
//     them, with the HP grown (strikeHpGrowth);
//   - "zgrana": the same, but the guild plays its podcięcia: in each round
//     of attacks the members not of the class of the day go first, and one
//     makes a podcięcie while the others' attacks left that day need more
//     bonuses than wait; the others strike, with a bonus while one waits;
//   - "zgrana + zbiórka": the same, every attack in the day's rally.
// First, how a power (strikePower) changes an attack's damage in the fight
// itself (the blows grow, guildBeastFight): the damage of the same fights
// with and without it. Real characters hit harder than the typical ones
// (DECISIONS.md, "Wersja 0.4.41": the author's guild of three felled a
// beast of 36 typical attacks in one day of attacks, and with 48 typical
// attacks a member a guild needs "about four days"), so the attacks are
// scaled to make the beast of before fall in `days` days of attacks (or by
// `real`, given), and the other ways are counted against that.
//
//   node tools/guild-beast-sim.mjs                         levels 30, 60, 100 and 150, 5 members, 4 days before
//   node tools/guild-beast-sim.mjs --levels 40,80 --members 10 --fights 12 --weeks 200 --days 4
//   node tools/guild-beast-sim.mjs --real 4                  characters 4 times as strong as the typical

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { typicalCharacter } from './simulate.mjs';
import { loadData } from './validate-data.mjs';

const BASE_CLASSES = ['warrior', 'archer', 'mage', 'cleric', 'shadow'];
const ROUNDS = 3;

function option(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

// The damage of `fights` attacks of the typical character of a class and
// level on the beasts of every lair in turn, with HP to spare, at `power`;
// the same seeds for every power, so the ratios compare the same fights.
function damages(classId, level, power, fights, content) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  const lairs = engine.beastLairs(content);
  return Array.from({ length: fights }, (_, index) => {
    const area = lairs[index % lairs.length];
    const beast = { monsterId: area.champion, areaId: area.id, level, hp: 1e9, maxHp: 1e9 };
    return engine.guildBeastFight({ character, equipped, name: 'Typowa', beast, seed: `pace:${classId}:${level}:${index}`, power }, content).damage;
  });
}

// One week of a guild (`members`: class ids) on a beast of `hp`, as
// `scenario` plays it; `damage(classId, power)` gives an attack's damage.
// How many days of attacks it takes to fall (3.67: on Thursday, after two
// of its three rounds), or null when it lives through the week.
function playWeek({ members, hp, scenario, damage, weekStart, rng }, content) {
  const tuning = content.guilds.undercut;
  let left = hp;
  // The podcięcia waiting: [member index, uses left], the oldest first.
  const waiting = [];
  for (let day = 0; day < 7; day++) {
    const at = weekStart + day * 86400000 + 12 * 3600000;
    const plain = scenario === 'dotąd';
    const boosted = members.map((classId) => !plain && engine.classOfDay(classId, at, content));
    for (let round = 0; round < ROUNDS; round++) {
      // In a played week the classes of the day attack last, so they take
      // the bonuses; otherwise in a random order.
      const order = members.map((_, index) => index).sort(() => rng.next() - 0.5);
      if (scenario.startsWith('zgrana')) order.sort((a, b) => Number(boosted[a]) - Number(boosted[b]));
      for (const [place, member] of order.entries()) {
        let kind = 'strike';
        let bonus = false;
        if (scenario.startsWith('zgrana')) {
          // A podcięcie while the attacks of the others left today, after
          // this one, need more bonuses than wait (a class of the day
          // strikes, while there are others to make them); else a Cios,
          // with the oldest bonus of another member's podcięcie if one waits.
          const pending = waiting.reduce((sum, [, uses]) => sum + uses, 0);
          const after = (ROUNDS - round - 1) * (members.length - 1) + (order.length - place - 1);
          if ((!boosted[member] || boosted.every(Boolean)) && pending + tuning.uses <= after) kind = 'undercut';
          else {
            const usable = waiting.find(([author, uses]) => author !== member && uses > 0);
            if (usable) {
              bonus = true;
              usable[1] -= 1;
            }
          }
        }
        const power = plain ? 1 : engine.strikePower({ classDay: boosted[member], rally: scenario.endsWith('zbiórka'), kind, bonus }, content);
        left -= damage(members[member], power);
        if (kind === 'undercut') waiting.push([member, tuning.uses]);
        while (waiting.length > 0 && waiting[0][1] <= 0) waiting.shift();
        if (left <= 0) return day + (round + 1) / ROUNDS;
      }
    }
  }
  return null;
}

export function simulatePace({ level, members: count, fights, weeks, real: asked = null, days = 4 }, content) {
  const members = Array.from({ length: count }, (_, index) => BASE_CLASSES[index % BASE_CLASSES.length]);
  const powers = new Set([1]);
  for (const classDay of [false, true]) for (const rally of [false, true]) for (const [kind, bonus] of [['strike', false], ['strike', true], ['undercut', false]]) powers.add(engine.strikePower({ classDay, rally, kind, bonus }, content));
  const samples = new Map();
  for (const classId of new Set(members)) for (const power of powers) samples.set(`${classId}:${power}`, damages(classId, level, power, fights, content));
  // How the damage grows with the power: the same fights' total, against
  // the power's own.
  const ratios = [...powers].filter((power) => power !== 1).map((power) => ({
    power,
    ratio: mean([...new Set(members)].map((classId) => mean(samples.get(`${classId}:${power}`)) / mean(samples.get(`${classId}:1`)))),
  }));
  const typical = engine.beastAttackDamage(level, content);
  const before = count * content.guilds.beast.memberAttacks * typical;
  const grown = engine.guildBeast({ seed: 'pace', levels: members.map(() => level) }, content).maxHp;
  const rng = engine.createRng(`pace:${level}:${count}`);
  // As strong as asked, or as makes the beast of before fall in `days`.
  const plainMean = mean(members.map((classId) => mean(samples.get(`${classId}:1`))));
  const real = asked ?? before / (days * ROUNDS * count * plainMean);
  const damage = (classId, power) => {
    const pool = samples.get(`${classId}:${power}`);
    return real * pool[Math.floor(rng.next() * pool.length)];
  };
  const scenarios = ['dotąd', 'same ciosy', 'zgrana', 'zgrana + zbiórka'];
  const monday = engine.questPeriod('weekly', Date.UTC(2026, 10, 23, 12), content).startsAt;
  const result = scenarios.map((scenario) => {
    const days = Array.from({ length: weeks }, () => playWeek({ members, hp: scenario === 'dotąd' ? before : grown, scenario, damage, weekStart: monday, rng }, content));
    const fallen = days.filter((day) => day !== null).sort((a, b) => a - b);
    return { scenario, fallen: fallen.length / weeks, median: fallen.length > 0 ? fallen[Math.floor(fallen.length / 2)] : null, mean: fallen.length > 0 ? mean(fallen) : null };
  });
  return { members, before, grown, typical, real, ratios, result };
}

function main(args) {
  const content = engine.buildContent(loadData());
  const levels = option(args, 'levels', '30,60,100,150').split(',').map(Number);
  const count = Number(option(args, 'members', '5'));
  const fights = Number(option(args, 'fights', '16'));
  const weeks = Number(option(args, 'weeks', '200'));
  const real = option(args, 'real', null);
  const days = Number(option(args, 'days', '4'));
  console.log(`HP Bestii i strażników: ×${engine.strikeHpGrowth(content)} (klasa dnia ×${content.guilds.classDay.hp}, podcięcie ×${content.guilds.undercut.hp}).`);
  for (const level of levels) {
    const pace = simulatePace({ level, members: count, fights, weeks, real: real === null ? null : Number(real), days }, content);
    console.log(`\nPoziom ${level}, ${count} członków (${pace.members.join(', ')}), postacie ${pace.real.toFixed(2)}× mocniejsze od typowych:`);
    console.log(`  HP dotąd ${Math.round(pace.before)}, teraz ${pace.grown}.`);
    console.log(`  Mnożnik ciosów w walce → obrażenia: ${pace.ratios.map(({ power, ratio }) => `×${power} → ×${ratio.toFixed(2)}`).join(', ')}`);
    for (const row of pace.result) {
      console.log(`  ${row.scenario.padEnd(18)} pada po ${row.median === null ? '—' : row.median.toFixed(2)} dniach ataków (średnio ${row.mean === null ? '—' : row.mean.toFixed(2)}), w ${Math.round(row.fallen * 100)}% tygodni`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
