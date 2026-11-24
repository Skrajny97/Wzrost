// What a day of the Labirynt Systemu is worth (data/labyrinth.json,
// src/engine/labyrinth.js): finishing it against failing on purpose and
// playing it again (DECISIONS.md, „Labirynt: nagrody za ukończenie”). A
// player (level 228): „bo teraz bardziej się opłaca wywalić przed i zrobić
// jeszcze raz niż to kończyć”. The game's own numbers, no fights: the maps
// of many days (labyrinthMap: the rows, the rooms of a row, the rooms'
// weights and rules), on each level the path a player farming the Odłamki
// takes (the most Odłamki, then the most XP and gold), the rewards of its
// rooms (a fight the XP and gold of one fight of an exploration of
// rewardMinutes, an elite and a treasure their Odłamki and gold), the
// guardian's Artefakt at the Odłamki it breaks into (Rozbij: break of its
// rarity by the level's odds, times the sockets of its size by the sizes'
// weights) and the completion rewards (completionReward). XP and gold in
// minutes of exploring at the creatures' level (labyrinthGold), the
// character and its class at the same level.
//
//   A    the levels 1–3 finished (and, apart, with Piekielny);
//   B    a fight lost on purpose just before the 3rd level's guardian, the
//        Labirynt started again and played to the same place;
//   B+   the same, then finished as A.
//
// Before 24.11.2026 starting again cost the gold of 150 minutes and every
// room of the second try paid again; now it is free, the rooms up to the
// place of the defeat give nothing but blessings, and a level pays its
// completion reward the first time it is finished that day.
//
//   node tools/labyrinth-value.mjs                    levels 50, 150 and 300
//   node tools/labyrinth-value.mjs --levels 100,228 --days 800

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { contentWith } from './difficulty-sim.mjs';

// The gold of starting again before 24.11.2026 (reset.goldMinutes).
const OLD_RESET_MINUTES = 150;

// A reward: Odłamki (Artefakty as the Odłamki they break into), the gold
// and the XP in minutes of exploring.
const zero = () => ({ shards: 0, gold: 0, xp: 0 });
const add = (...all) => all.reduce((sum, one) => ({ shards: sum.shards + one.shards, gold: sum.gold + one.gold, xp: sum.xp + one.xp }), zero());
const times = (one, factor) => ({ shards: one.shards * factor, gold: one.gold * factor, xp: one.xp * factor });

// One won fight's gold in minutes of exploring, on average over the
// Labirynt's creatures of the level (labyrinthFoes, as labyrinthFight pays
// it), and its XP: one fight of an exploration of rewardMinutes.
function fightValue(charLevel, content, samples = 600) {
  const rules = content.labyrinth;
  const pace = engine.explorationPace(rules.rewardMinutes, content);
  const lengthed = pace.timeFactor * (1 + pace.lengthBonus);
  const late = engine.lateRewards(charLevel, content);
  let gold = 0;
  for (let i = 0; i < samples; i++) {
    const { encounter } = engine.labyrinthFoes({ day: `value-${i}`, level: 1, row: i % 6, room: i % 3, type: 'fight', charLevel }, content);
    const groupFactor = content.balance.hunt.groupFactors[encounter.members.length - 1];
    for (const member of encounter.members) gold += content.balance.rewards.goldPerLevel * member.level * content.monstersById[member.monsterId].reward.gold * groupFactor * lengthed * late;
  }
  const perMinute = engine.expectedExploration(engine.portalArea(charLevel, content), charLevel, 60, content, charLevel).gold / 60;
  return { shards: 0, gold: gold / samples / perMinute, xp: rules.rewardMinutes / pace.fights };
}

// The Odłamki an Artefakt of a level's odds breaks into, on average.
function artifactShards(level, content) {
  const { artifact } = engine.labyrinthLevel(level, content);
  const { core } = content.labyrinth;
  const all = Object.values(artifact).reduce((sum, weight) => sum + weight, 0);
  const rarity = Object.entries(artifact).reduce((sum, [id, weight]) => sum + (weight / all) * core.break[id], 0);
  const sizes = core.sizes.reduce((sum, size) => sum + size.weight, 0);
  const sockets = core.sizes.reduce((sum, size) => sum + (size.weight / sizes) * size.sockets, 0);
  return rarity * sockets;
}

// A level's rooms on the farming path, on average over `days` maps.
function levelRooms(level, fight, content, days) {
  const rules = content.labyrinth;
  const { shards } = engine.labyrinthLevel(level, content);
  const worth = {
    fight,
    elite: { shards: shards.elite, gold: rules.rewards.eliteGoldMinutes, xp: 0 },
    treasure: { shards: shards.treasure, gold: rules.rewards.treasureGoldMinutes, xp: 0 },
  };
  const valueOf = (type) => worth[type] ?? zero();
  const rank = (one) => one.shards * 1e6 + one.gold + one.xp;
  let total = zero();
  for (let day = 0; day < days; day++) {
    const map = engine.labyrinthMap(`value-${day}`, level, content);
    const rows = map.rows.slice(0, -1);
    // The best path from each room to the guardian, row by row from the last.
    let best = rows.at(-1).map((room) => valueOf(room.type));
    for (let row = rows.length - 2; row >= 0; row--) {
      best = rows[row].map((room) => add(valueOf(room.type), room.links.map((next) => best[next]).reduce((top, one) => (rank(one) > rank(top) ? one : top))));
    }
    total = add(total, best.reduce((top, one) => (rank(one) > rank(top) ? one : top)));
  }
  return times(total, 1 / days);
}

// Everything of the model at one character level.
export function labyrinthValue(charLevel, content, days = 400) {
  const fight = fightValue(charLevel, content);
  const levels = [1, 2, 3, 4].map((level) => {
    const { completion } = engine.labyrinthLevel(level, content);
    return {
      rooms: levelRooms(level, fight, content, days),
      guardian: { shards: artifactShards(level, content), gold: 0, xp: 0 },
      completion: { shards: completion.shards, gold: completion.goldMinutes, xp: 0 },
    };
  });
  const [one, two, three, hell] = levels;
  const reset = { shards: 0, gold: OLD_RESET_MINUTES, xp: 0 };
  // Played up to just before the 3rd level's guardian, with or without the
  // completion rewards of the levels 1 and 2.
  const upTo = (paid) => add(one.rooms, one.guardian, two.rooms, two.guardian, three.rooms, paid ? add(one.completion, two.completion) : zero());
  const finished = (paid) => add(upTo(paid), three.guardian, paid ? three.completion : zero());
  const withHell = (paid) => add(finished(paid), hell.rooms, hell.guardian, paid ? hell.completion : zero());
  return {
    fight,
    levels,
    before: {
      a: finished(false),
      aHell: withHell(false),
      b: add(upTo(false), upTo(false), times(reset, -1)),
      bFinished: add(finished(false), upTo(false), times(reset, -1)),
    },
    after: { a: finished(true), aHell: withHell(true), b: upTo(true), bFinished: finished(true) },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    options[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = contentWith();
  const levels = typeof options.levels === 'string' ? options.levels.split(',').map(Number) : [50, 150, 300];
  const days = Number(options.days ?? 400);
  const round = (value) => Math.round(value);
  const cell = (one) => `${round(one.shards)} / ${round(one.gold)} / ${round(one.xp)}`;
  const versus = (a, b, key) => `${a[key] >= b[key] ? '+' : ''}${Math.round(((a[key] - b[key]) / Math.abs(b[key] || 1)) * 100)}%`;
  for (const level of levels) {
    const value = labyrinthValue(level, content, days);
    console.log(`\nPostać i klasa na poziomie ${level}: walka ${value.fight.gold.toFixed(1)} min złota i ${value.fight.xp.toFixed(1)} min PD`);
    value.levels.forEach((one, index) =>
      console.log(`  ${['1.', '2.', '3.', 'Piekielny'][index].padEnd(10)} komnaty ${cell(one.rooms)}   Artefakt ${one.guardian.shards.toFixed(2)} Odłamka   za ukończenie ${cell(one.completion)}`),
    );
  }
  console.log('\nOdłamki (Artefakty jako Odłamki z Rozbij) / złoto / PD w minutach eksploracji; w nawiasie A względem B (Odłamki, złoto).\n');
  console.log('| Postać | Zasady | A: poziomy 1–3 | A: z Piekielnym | B: porażka przed 3. strażnikiem, od nowa do tego miejsca | B+: to samo, potem do końca |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const level of levels) {
    const value = labyrinthValue(level, content, days);
    for (const [name, rows] of [['przed', value.before], ['po', value.after]]) {
      const { a, aHell, b, bFinished } = rows;
      console.log(`| ${level} | ${name} | ${cell(a)} | ${cell(aHell)} | ${cell(b)} (A ${versus(a, b, 'shards')}, ${versus(a, b, 'gold')}) | ${cell(bFinished)} (A ${versus(a, bFinished, 'shards')}, ${versus(a, bFinished, 'gold')}) |`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
