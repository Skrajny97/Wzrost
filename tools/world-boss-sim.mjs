// The World Bosses' numbers (data/world-bosses.json; src/engine/world-boss.js;
// DECISIONS.md, "Postrach Krainy (1222–1226)"), measured and checked as
// tools/guild-beast-sim.mjs does for the Bestia Gildii:
//   - `damage`: the average damage of one attack on each band's boss at a
//     few levels of the band (its first, its middle and its last; in the
//     first band from the unlock's level), by the realistic players of
//     tools/difficulty-sim.mjs (the gear, upgrades and evolutions a player
//     has by then, the companions of its level), the five classes, each
//     against the boss at its level with HP to spare; the typical character
//     of tools/simulate.mjs alone beside it, for a look, with the fights'
//     length and how often the party stood to the end (300 actions). With
//     --write the table goes into the data;
//   - the pace: a band of N active characters at the band's middle level,
//     the boss with the data's HP (attacksPerPlayer attacks of `damage`
//     each), played over `weeks` weeks: each character plays as one of
//     three kinds (PARTICIPATION: every day, every other day, now and then),
//     with its three attacks on a day it plays, its damage drawn from the
//     measured realistic attacks (times --real, 1 by default). How many
//     days of attacks the boss takes to fall (3.67: on Thursday, after two
//     of the three rounds), how often it lives through the week, and the
//     share of the chests of each size.
//
//   node tools/world-boss-sim.mjs                     the damage table and the pace
//   node tools/world-boss-sim.mjs --write             the same, the table written into data/world-bosses.json
//   node tools/world-boss-sim.mjs --fights 4          fewer fights a class and level than 16 (faster, rougher)
//   node tools/world-boss-sim.mjs --pace-only --real 1.5 --weeks 400
//   node tools/world-boss-sim.mjs --power 3            the bosses' blows 3 times as strong as a creature's of their level (data: `power`)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { companionsOf, playerOf, GEAR_SETS } from './difficulty-sim.mjs';
import { typicalCharacter, typicalClassLevel } from './simulate.mjs';
import { loadData } from './validate-data.mjs';

const CLASSES = ['warrior', 'archer', 'mage', 'cleric', 'shadow'];
const ROUNDS = 3;
// The kinds of players in a band, by their share: one plays every day
// (90% of days), one every other day, one now and then (15% of days). On a
// day it plays it makes all three attacks.
export const PARTICIPATION = [
  { share: 0.4, days: 0.9 },
  { share: 0.3, days: 0.5 },
  { share: 0.3, days: 0.15 },
];
const BAND_SIZES = [1, 2, 3, 5, 10, 20, 50, 100, 200];

function option(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
}

const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

// The character level whose typical class level brings its higher level
// (worldBossLevelOf) closest to `level` without passing it.
export function characterLevelFor(level, content) {
  let found = 1;
  for (let candidate = 1; candidate <= level; candidate++) {
    if (Math.max(candidate, typicalClassLevel(candidate, content)) <= level) found = candidate;
    else break;
  }
  return found;
}

// The measured levels of a band: its first (in the first band the unlock's
// level), its middle and its last.
export function bandPoints(band, content) {
  const first = Math.max(band.minLevel, content.unlocksById['world-boss']?.level ?? 1);
  return [...new Set([first, Math.round((first + band.maxLevel) / 2), band.maxLevel])];
}

// `fights` attacks of each class's realistic player (with its companions)
// at `level` on the band's boss, with HP to spare; and the typical
// character alone, for a look. Each with its damage, actions and whether
// the party stood to the end.
export function measureLevel(band, level, fights, content) {
  const charLevel = characterLevelFor(level, content);
  const boss = { id: band.boss.id, region: band.region, level: engine.bandLevel(band, level), hp: 1e12, maxHp: 1e12 };
  const realistic = [];
  const typical = [];
  for (const classId of CLASSES) {
    for (let index = 0; index < fights; index++) {
      const one = playerOf('realistic', classId, charLevel, content, index % GEAR_SETS);
      const companions = companionsOf(one.plan, charLevel, index, content);
      const fight = engine.worldBossFight({ character: one.character, equipped: one.equipped, name: 'Realistyczna', companions, boss, seed: `wb:${band.region}:${level}:${classId}:${index}` }, content);
      realistic.push({ classId, damage: fight.damage, actions: fight.actions, stood: fight.won === null });
    }
    const { character, equipped } = typicalCharacter(classId, charLevel, content);
    for (let index = 0; index < Math.max(1, Math.round(fights / 2)); index++) {
      const fight = engine.worldBossFight({ character, equipped, name: 'Typowa', boss, seed: `wb-typical:${band.region}:${level}:${classId}:${index}` }, content);
      typical.push({ classId, damage: fight.damage, actions: fight.actions });
    }
  }
  return {
    level,
    charLevel,
    realistic,
    damage: mean(realistic.map((one) => one.damage)),
    typical: mean(typical.map((one) => one.damage)),
    actions: mean(realistic.map((one) => one.actions)),
    stood: mean(realistic.map((one) => (one.stood ? 1 : 0))),
    byClass: Object.fromEntries(CLASSES.map((classId) => [classId, mean(realistic.filter((one) => one.classId === classId).map((one) => one.damage))])),
  };
}

// One week of a band of `players` characters on a boss of `hp` (`part` each),
// each character of a kind of PARTICIPATION and with its attacks drawn
// from `pool` times `real`. The days of attacks it took to fall, or null,
// and each character's damage for its chest.
function playWeek({ players, hp, pool, real, rng }) {
  const kinds = Array.from({ length: players }, (_, index) => {
    let at = (index + 0.5) / players;
    for (const kind of PARTICIPATION) {
      if (at < kind.share) return kind;
      at -= kind.share;
    }
    return PARTICIPATION.at(-1);
  });
  const dealt = Array.from({ length: players }, () => 0);
  let left = hp;
  for (let day = 0; day < 7; day++) {
    const playing = kinds.map((kind) => rng.chance(kind.days));
    for (let round = 0; round < ROUNDS; round++) {
      for (let member = 0; member < players; member++) {
        if (!playing[member]) continue;
        const damage = Math.min(left, real * pool[Math.floor(rng.next() * pool.length)]);
        dealt[member] += damage;
        left -= damage;
        if (left <= 0) return { day: day + (round + 1) / ROUNDS, dealt };
      }
    }
  }
  return { day: null, dealt };
}

export function simulatePace({ band, level, players, pool, weeks, real }, content) {
  const levels = Array.from({ length: players }, () => level);
  const { maxHp } = engine.worldBossHp(band, levels, content);
  const part = engine.worldBossPart({ maxHp, players });
  const rng = engine.createRng(`wb-pace:${band.region}:${players}`);
  const days = [];
  const sizes = {};
  let fighters = 0;
  for (let week = 0; week < weeks; week++) {
    const { day, dealt } = playWeek({ players, hp: maxHp, pool, real, rng });
    days.push(day);
    for (const damage of dealt) {
      if (damage <= 0) continue;
      fighters += 1;
      const tier = engine.worldBossChestTier(damage, part, content);
      sizes[tier.id] = (sizes[tier.id] ?? 0) + 1;
    }
  }
  const fallen = days.filter((day) => day !== null).sort((a, b) => a - b);
  return {
    players,
    maxHp,
    fallen: fallen.length / weeks,
    median: fallen.length > 0 ? fallen[Math.floor(fallen.length / 2)] : null,
    mean: fallen.length > 0 ? mean(fallen) : null,
    sizes: Object.fromEntries(Object.entries(sizes).map(([id, count]) => [id, count / Math.max(1, fighters)])),
  };
}

function main(args) {
  const content = engine.buildContent(loadData());
  // Another strength of the bosses' blows than the data's, to try one.
  const power = option(args, 'power', null);
  if (power !== null) content.worldBosses = { ...content.worldBosses, power: Number(power) };
  // 16 fights of each class at each level, two of each draw of the gear:
  // the table of the data was measured so.
  const fights = Number(option(args, 'fights', String(2 * GEAR_SETS)));
  const weeks = Number(option(args, 'weeks', '300'));
  const real = Number(option(args, 'real', '1'));
  const bands = engine.worldBossBands(content);
  const measured = [];
  const pools = new Map();
  if (!args.includes('--pace-only')) {
    console.log(`Obrażenia jednego ataku (realistyczna postać z towarzyszami; typowa sama), ${fights} walk na klasę i poziom:`);
    for (const band of bands) {
      const rows = bandPoints(band, content).map((level) => measureLevel(band, level, fights, content));
      for (const row of rows) {
        measured.push([row.level, Math.round(row.damage)]);
        console.log(
          `  ${band.boss.name.padEnd(20)} poz. ${String(row.level).padStart(3)} (postać ${String(row.charLevel).padStart(3)}): ${String(Math.round(row.damage)).padStart(9)}` +
            ` (typowa sama ${String(Math.round(row.typical)).padStart(8)}), ruchów ${row.actions.toFixed(0).padStart(3)}, do końca ${Math.round(row.stood * 100)}%` +
            ` | ${CLASSES.map((classId) => `${classId} ${Math.round(row.byClass[classId])}`).join(', ')}`,
        );
      }
      pools.set(band.region, rows[1] ?? rows[0]);
    }
    if (args.includes('--write')) {
      const path = new URL('../data/world-bosses.json', import.meta.url);
      const text = readFileSync(path, 'utf8');
      const table = `"damage": [\n${measured.map(([level, damage]) => `    [${level}, ${damage}]`).join(',\n')}\n  ],`;
      writeFileSync(path, text.replace(/"damage": \[[\s\S]*?\n {2}\],/, table));
      console.log('Zapisano damage w data/world-bosses.json.');
      // The pace below with the table just measured.
      content.worldBosses = { ...content.worldBosses, damage: measured };
    }
  }
  console.log(`\nTempo (HP: ${content.worldBosses.hp.attacksPerPlayer} ataków na aktywną postać; gracze: ${PARTICIPATION.map((kind) => `${Math.round(kind.share * 100)}% gra ${Math.round(kind.days * 100)}% dni`).join(', ')}; ataki ×${real}):`);
  for (const band of bands) {
    const middle = Math.round((Math.max(band.minLevel, content.unlocksById['world-boss']?.level ?? 1) + band.maxLevel) / 2);
    const known = pools.get(band.region);
    const pool = known ? known.realistic.map((one) => one.damage) : measureLevel(band, middle, Math.max(2, Math.round(fights / 2)), content).realistic.map((one) => one.damage);
    console.log(`  ${band.boss.name} (poz. ${middle}):`);
    for (const players of BAND_SIZES) {
      const pace = simulatePace({ band, level: middle, players, pool, weeks, real }, content);
      const sizes = ['small', 'medium', 'large', 'huge'].map((id) => `${id} ${Math.round((pace.sizes[id] ?? 0) * 100)}%`).join(', ');
      console.log(
        `    ${String(players).padStart(3)} graczy: pada po ${pace.median === null ? '—' : pace.median.toFixed(2)} dniach (średnio ${pace.mean === null ? '—' : pace.mean.toFixed(2)}), w ${Math.round(pace.fallen * 100)}% tygodni; skrzynie: ${sizes}`,
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
