// The Arena's duels checked (data/settlement.json, arena;
// src/engine/pvp-arena.js): the realistic players of tools/difficulty-sim.mjs
// (`low` for the weaker gear), every pair of classes at a few levels, with
// every draw of their gear and several seeds. For the data's HP curve (or
// one factor at every level, `--hp`, or another curve, `--curve`) and each
// move limit: how many moves a duel takes (the median and the 10th and 90th
// percentile), how many end in a few moves (`krótkie`: at most `--short`
// moves of both sides together), how often the judge ends one (the move
// limit) and how often with a draw, and the winner's HP left on average;
// then each class's share of wins against the other classes. `--gap 10`
// gives the defender that many levels more.
//
//   node tools/pvp-arena-sim.mjs                              the data's numbers
//   node tools/pvp-arena-sim.mjs --hp 1,2,3,4 --moves 40,60,80   one factor at every level
//   node tools/pvp-arena-sim.mjs --curve 25:1.5,75:2,100:2.75,300:3
//   node tools/pvp-arena-sim.mjs --levels 25,50,100,200 --seeds 6 --models realistic,low --gap 10

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';
import { GEAR_SETS, playerOf } from './difficulty-sim.mjs';

const LEVELS = [25, 50, 100, 200, 300];

// The content with the duel's numbers changed for the run.
function contentWith(duel) {
  const raw = loadData();
  raw.settlement.arena = { ...raw.settlement.arena, duel: { ...raw.settlement.arena.duel, ...duel } };
  return engine.buildContent(raw);
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

const list = (value, fallback) => (typeof value === 'string' ? value.split(',') : fallback);
const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
const pct = (value) => `${(value * 100).toFixed(1)}%`.padStart(6);

// The players of a class at a level, one for each draw of the gear, made once.
const players = new Map();
function playersOf(model, classId, level, content) {
  const key = `${model}:${classId}:${level}`;
  if (!players.has(key)) {
    players.set(
      key,
      Array.from({ length: GEAR_SETS }, (_, set) => {
        const { character, equipped } = playerOf(model, classId, level, content, set);
        return { character, equipped, name: `${classId}${set}` };
      }),
    );
  }
  return players.get(key);
}

// Every duel of one level: each class against each (itself too), each draw
// of the attacker's gear against the next draw of the defender's, `seeds`
// seeds each.
export function measure({ level, gap = 0, seeds, model }, content) {
  const classes = content.classes.map((cls) => cls.id);
  const moves = [];
  let limits = 0;
  let draws = 0;
  let short = 0;
  let winnerHp = 0;
  let decided = 0;
  const wins = Object.fromEntries(classes.map((id) => [id, { won: 0, fought: 0 }]));
  const shortMoves = Number(measure.short ?? 8);
  for (const a of classes) {
    for (const b of classes) {
      const attackers = playersOf(model, a, level, content);
      const defenders = playersOf(model, b, level + gap, content);
      for (let set = 0; set < GEAR_SETS; set++) {
        for (let seed = 0; seed < seeds; seed++) {
          const duel = engine.arenaDuel({ attacker: attackers[set], defender: defenders[(set + 1) % GEAR_SETS], seed: `${a}:${b}:${level}:${set}:${seed}` }, content, { record: false });
          moves.push(duel.moves);
          if (duel.limit) limits += 1;
          if (duel.result === 'draw') draws += 1;
          else {
            decided += 1;
            winnerHp += duel.result === 'win' ? duel.shares.attacker : duel.shares.defender;
          }
          if (duel.moves <= shortMoves) short += 1;
          if (a !== b && duel.result !== 'draw') {
            wins[a].fought += 1;
            wins[b].fought += 1;
            wins[duel.result === 'win' ? a : b].won += 1;
          }
        }
      }
    }
  }
  moves.sort((x, y) => x - y);
  const total = moves.length;
  return {
    level,
    total,
    median: percentile(moves, 0.5),
    p10: percentile(moves, 0.1),
    p90: percentile(moves, 0.9),
    short: short / total,
    limits: limits / total,
    draws: draws / total,
    winnerHp: decided ? winnerHp / decided : 0,
    wins: Object.fromEntries(Object.entries(wins).map(([id, { won, fought }]) => [id, fought ? won / fought : 0])),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = loadData().settlement.arena.duel;
  // The curves tried: one factor each (--hp), the one given (--curve) or the data's.
  const curves =
    typeof options.hp === 'string'
      ? options.hp.split(',').map((factor) => [[1, Number(factor)]])
      : typeof options.curve === 'string'
        ? [options.curve.split(',').map((point) => point.split(':').map(Number))]
        : [base.hpCurve];
  const limits = list(options.moves, [String(base.maxMoves)]).map(Number);
  const levels = list(options.levels, LEVELS.map(String)).map(Number);
  const models = list(options.models, ['realistic']);
  const seeds = Number(options.seeds ?? 4);
  const gap = Number(options.gap ?? 0);
  measure.short = Number(options.short ?? 8);
  for (const hpCurve of curves) {
    for (const maxMoves of limits) {
      const content = contentWith({ hpCurve, maxMoves });
      const factors = hpCurve.map(([level, factor]) => (hpCurve.length > 1 ? `${factor} (poz. ${level})` : String(factor))).join(', ');
      console.log(`\nHP × ${factors}, limit ${maxMoves} ruchów, remis do ${base.drawMargin * 100}% różnicy${gap ? `, obrońca +${gap} poz.` : ''}`);
      for (const model of models) {
        for (const level of levels) {
          const r = measure({ level, gap, seeds, model }, content);
          const classes = Object.entries(r.wins)
            .map(([id, share]) => `${id} ${pct(share)}`)
            .join('  ');
          console.log(
            `${model.padEnd(9)} poz. ${String(level).padStart(3)}: ruchy ${String(r.median).padStart(3)} (${String(r.p10).padStart(3)}–${String(r.p90).padStart(3)})  krótkie ${pct(r.short)}  sędzia ${pct(r.limits)}  remisy ${pct(r.draws)}  HP zwycięzcy ${pct(r.winnerHp)}  |  wygrane: ${classes}`,
          );
        }
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
