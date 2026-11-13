// The Labirynt Systemu's difficulty (data/labyrinth.json, src/engine/labyrinth.js):
// whole days of it for the players of tools/difficulty-sim.mjs, with two
// companions from the Kwatery (850 A), the rooms chosen as a careful player
// would (a spring or the merchant's healing when wounded, the altar and the
// treasure when there, an elite only in good health) and the blessings
// taken as they come (one of the three at random, no strong picks). Counts
// how often each level is cleared: the aim (the author's brief) is level 1
// almost always, level 2 usually, level 3 about half the time and
// Piekielny rarely. With --core, the same with a full Rdzeń of the level
// (coreFor) to measure what it gives; --explore measures the explorations
// of difficulty-sim.mjs with and without that Rdzeń.
//
//   node tools/labyrinth-sim.mjs                         levels 30–200, 40 days each, every class
//   node tools/labyrinth-sim.mjs --levels 50,100 --days 80 --model low
//   node tools/labyrinth-sim.mjs --core --explore --levels 50,100,200

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { companionsOf, contentWith, newestArea, playerOf, roadKit, withArea } from './difficulty-sim.mjs';

const LEVELS = [30, 50, 75, 100, 150, 200];

// The rooms a careful player prefers, by how wounded the party is.
function pickRoom(state, map, rooms, rng) {
  const types = rooms.map((index) => ({ index, type: map.rows[state.row + 1][index].type }));
  const hp = Object.values(state.hp);
  const low = state.hp.me < 0.5 || hp.some((share) => share <= 0) || hp.reduce((sum, share) => sum + share, 0) / hp.length < 0.55;
  const order = low ? ['spring', 'merchant', 'altar', 'treasure', 'fight', 'elite', 'guardian'] : ['altar', 'treasure', 'elite', 'fight', 'spring', 'merchant', 'guardian'];
  const healthy = state.hp.me > 0.75;
  const ranked = types
    .filter((one) => healthy || one.type !== 'elite' || types.every((other) => other.type === 'elite'))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || rng.next() - 0.5);
  return (ranked[0] ?? types[0]).index;
}

// A full Rdzeń of a level, as a player who has played the Labirynt for a
// while has it: its sockets filled with medium and small Artefakty of a
// rarity of the level, upgraded part of the way, a gem of the level, and
// two elements in resonance (fire and nature, the most general).
export function coreFor(level, content, { rarity, upgrade, gem } = {}) {
  const sockets = engine.coreSockets(level, content);
  const rarityId = rarity ?? (level >= 200 ? 'epic' : level >= 100 ? 'unique' : 'rare');
  const upgradeLevel = upgrade ?? (level >= 200 ? 7 : level >= 100 ? 5 : 3);
  const gemId = gem ?? (level >= 150 ? 'sapphire' : level >= 75 ? 'emerald' : 'amethyst');
  const elements = ['fire', 'nature', 'earth', 'fire', 'nature', 'lightning', 'earth', 'frost'];
  const absorbed = [];
  let left = sockets;
  let index = 0;
  while (left > 0) {
    const size = left >= 2 ? 'medium' : 'small';
    const element = elements[index % elements.length];
    const rules = content.labyrinth.core.elements.find((one) => one.id === element);
    const traits = size === 'medium' ? [...rules.traits] : [rules.traits[0]];
    absorbed.push({ element, size, rarity: rarityId, traits, ability: null, upgrade: upgradeLevel, spent: 0 });
    left -= size === 'medium' ? 2 : 1;
    index += 1;
  }
  return { open: true, shards: 0, gem: gemId, absorbed };
}

// One day of the Labirynt for a player: the levels it clears. The
// creatures stand halfway between the character's and the class's level
// (labyrinthCharLevel, the author 13.11.2026).
function playDay({ player, companions, day, seed }, content) {
  let state = engine.newLabyrinth({ day, charLevel: engine.labyrinthCharLevel(player.character), companions, seed });
  const rng = engine.createRng(`${seed}:choices`);
  for (let step = 0; step < 60 && !state.over; step++) {
    if (state.pending) {
      if (state.pending.kind === 'merchant') {
        const hurt = Object.values(state.hp).some((share) => share < 0.6);
        const bought = hurt && !state.pending.heal ? engine.buyAtMerchant(state, 'heal', content) : null;
        state = bought ?? engine.leaveMerchant(state) ?? { ...state, pending: null };
        continue;
      }
      state = engine.chooseBlessing(state, rng.pick(state.pending.choices));
      continue;
    }
    const map = engine.labyrinthMap(state.day, state.level, content);
    const rooms = engine.reachableRooms(map, state.row, state.room);
    if (rooms.length === 0) break;
    const target = { row: state.row + 1, room: pickRoom(state, map, rooms, rng) };
    state = engine.enterRoom(state, target, { character: player.character, equipped: player.equipped, name: 'Symulacja', companions }, `${seed}:${step}`, content).state;
  }
  return state.cleared;
}

export function measureLabyrinth({ model = 'realistic', classId, level, days, core = null }, content) {
  const cleared = [0, 0, 0, 0, 0];
  for (let i = 0; i < days; i++) {
    const base = playerOf(model, classId, level, content, i % 8);
    const player = core ? { ...base, character: { ...base.character, core } } : base;
    const plan = base.plan ?? { companions: 2, companionGear: 'rare', companionUpgrade: 0, bond: 1, variant: model };
    const companions = companionsOf({ ...plan, companions: 2 }, level, i, content);
    const day = `sim-${String(i).padStart(4, '0')}`;
    const levels = playDay({ player, companions, level, day, seed: `labyrinth-sim:${model}:${classId}:${level}:${i}` }, content);
    cleared[levels] += 1;
  }
  // The share of days each level was cleared (level n: n or more cleared).
  return [1, 2, 3, 4].map((n) => cleared.slice(n).reduce((sum, count) => sum + count, 0) / days);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = contentWith(options.set);
  // --strength 1,1.2,1.4: the first three levels' strength for the run
  // (Piekielny twice the third's), as [damage, HP] alike.
  if (typeof options.strength === 'string') {
    const [first, second, third] = options.strength.split(',').map(Number);
    const strengths = [first, second, third, third * 2];
    content.labyrinth = { ...content.labyrinth, levels: content.labyrinth.levels.map((level, index) => ({ ...level, strength: [strengths[index], strengths[index]] })) };
  }
  const levels = typeof options.levels === 'string' ? options.levels.split(',').map(Number) : LEVELS;
  const classes = typeof options.classes === 'string' ? options.classes.split(',') : content.classes.map((cls) => cls.id);
  const days = Number(options.days ?? 40);
  const model = typeof options.model === 'string' ? options.model : 'realistic';
  const pct = (value) => `${(value * 100).toFixed(0)}%`.padStart(4);
  for (const level of levels) {
    const totals = [0, 0, 0, 0];
    const coreTotals = [0, 0, 0, 0];
    for (const classId of classes) {
      const rates = measureLabyrinth({ model, classId, level, days }, content);
      rates.forEach((rate, index) => (totals[index] += rate / classes.length));
      let line = `${model.padEnd(10)} ${classId.padEnd(8)} ${String(level).padStart(3)}  poziom 1 ${pct(rates[0])}  2 ${pct(rates[1])}  3 ${pct(rates[2])}  Piekielny ${pct(rates[3])}`;
      if (options.core) {
        const withCore = measureLabyrinth({ model, classId, level, days, core: coreFor(level, content) }, content);
        withCore.forEach((rate, index) => (coreTotals[index] += rate / classes.length));
        line += `   z Rdzeniem: ${pct(withCore[0])} ${pct(withCore[1])} ${pct(withCore[2])} ${pct(withCore[3])}`;
      }
      console.log(line);
    }
    console.log(`${'średnio'.padEnd(19)} ${String(level).padStart(3)}  poziom 1 ${pct(totals[0])}  2 ${pct(totals[1])}  3 ${pct(totals[2])}  Piekielny ${pct(totals[3])}${options.core ? `   z Rdzeniem: ${coreTotals.map(pct).join(' ')}` : ''}`);
    if (options.explore) {
      for (const classId of classes) {
        const hunts = Number(options.hunts ?? 100);
        const plain = measureExploration({ model, classId, level, minutes: 240, hunts }, content);
        const strong = measureExploration({ model, classId, level, minutes: 240, hunts, core: coreFor(level, content) }, content);
        console.log(
          `  wyprawa 4 h ${classId.padEnd(8)} ${level}: omdlenia ${pct(plain.faintRate)} → ${pct(strong.faintRate)} z Rdzeniem, HP na końcu ${pct(plain.endHp)} → ${pct(strong.endHp)}, XP/h ${plain.xpPerHour.toFixed(0)} → ${strong.xpPerHour.toFixed(0)}`,
        );
      }
    }
  }
}

// measureCell of difficulty-sim.mjs with the player's Rdzeń.
// The explorations of measureCell (difficulty-sim.mjs) in the newest place
// of a level, with the same seeds, potions and trophies, and the player's
// Rdzeń (`core`) or none (null).
export function measureExploration({ model, classId, level, minutes, hunts, core = null }, content) {
  const area = newestArea(level, content);
  const local = withArea(area, content);
  const players = Array.from({ length: model === 'typical' ? 1 : 8 }, (_, set) => {
    const one = playerOf(model, classId, level, local, set);
    return core ? { ...one, character: { ...one.character, core } } : one;
  });
  const maxHps = players.map((one) => engine.playerCombatant({ character: one.character, equipped: one.equipped, name: 'Symulacja', area }, local).maxHp);
  const kit = roadKit(players[0].plan, area, minutes, local);
  let fainted = 0;
  let endHp = 0;
  let xp = 0;
  for (let i = 0; i < hunts; i++) {
    const { character, equipped } = players[i % players.length];
    const companions = companionsOf(players[0].plan, level, i, local);
    const seed = ['difficulty', classId, level, minutes, 0, i].join(':');
    const hunt = engine.simulateHunt({ character, equipped, hp: maxHps[i % players.length], name: 'Symulacja', areaId: area.id, minutes, seed, companions, ...kit }, local);
    if (hunt.result === 'fainted') fainted += 1;
    endHp += hunt.hpEnd / hunt.maxHp;
    xp += hunt.xp;
  }
  return { faintRate: fainted / hunts, endHp: endHp / hunts, xpPerHour: xp / ((hunts * minutes) / 60), maxHp: maxHps[0] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
