// Difficulty check: explorations in the newest inner region of a level, for
// the typical character of tools/simulate.mjs (gear from the hours played,
// rare items with the main stat, no upgrades, no evolution, no companions,
// no potions) and for a "realistic" player who uses what the game gives by
// then: the later bases (Tiers), rarer items, the Kowadło, the main path's
// evolutions, companions from the Kwatery, healing potions and trophies of
// the Encyklopedia (the author, 432: "jeśli bierzesz pod uwagę ekwipunek i
// towarzyszy, ludzie mówią, że jest za łatwo i tak"). Measures fainting and
// HP at the end of explorations, XP and gold an hour, and, apart, single
// fights with the place's elite and champion at full HP.
//
//   node tools/difficulty-sim.mjs                              all levels, 60 and 240 minutes
//   node tools/difficulty-sim.mjs --levels 75,100 --hunts 300 --models typical,casual,low,realistic
//   node tools/difficulty-sim.mjs --set monsters.endGame.damage=0.5 --json out.json --rare 200
//   node tools/difficulty-sim.mjs --models realistic-nocomp,realistic-noevo   one part left out
//   node tools/difficulty-sim.mjs --hard                       Trudne wyprawy (629 A)
//
// Models: `typical` (tools/simulate.mjs), `casual` (the least any player of
// the level has: the evolution, which the class waits for at 50 and 100, and
// the later bases that drop, with the typical character's rare items and
// nothing more), `casualcomp` (the same with companions as they come from
// the Karczma), `low` and `realistic` (below). `realistic-nocomp` and the
// like leave one part out: -nocomp, -noevo, -noupg, -nopot, -notier,
// -norarity, -notrophy.
//
// The newest inner region of a level is the one holding it (the character
// at its top, as at 50 in Serce Uroczyska, 46–50), and past the content a
// stand-in of five levels ending at it, with the last region's creatures,
// elite and champion. `--offset 1` takes the region five levels higher,
// `--offset -1` the one before.
//
// The realistic player (realisticPlan), from the game's own data:
// - class level, skills and stat points as the typical character; from
//   class level 50 the main path's first evolution, from 100 its second
//   form, with the Skill Points spent as they come (evolution-sim.mjs);
// - all nine slots from level 30 (two more than the typical character
//   before), items of the typical character's level (gearLevel), each of
//   the latest base its class level and the item's level allow (Tier II
//   from 10, III from 25, IV from 50), with the affixes the game rolls and
//   one of them the class's main stat (kept among the finds, or rolled
//   again by the Zaklinaczka), drawn GEAR_SETS times so that luck with the
//   finds averages out; rarities: rare up to 29, unique weapon and chest from 30, epic
//   weapon, chest and off-hand (unique elsewhere) from 50, a legendary
//   weapon (epic chest, off-hand and head) from 100, legendary weapon and
//   chest (epic elsewhere) from 150;
// - upgrades on the Kowadło: +1 at 10, +2 at 20, +3 at 30, +4 at 40, +5
//   from 50, +6 from 90, +7 from 125, the weapon one more from 50: a player
//   who puts most of its gold into gear (taking one whole set of items of
//   the level from +0 there costs, on average with the failures, 40–70% of
//   all the gold explored until then, e.g. about 40 000 of 60 000 at 50;
//   the Kowadło itself costs little), so an upper bound;
// - companions: none before 30 (the Osada opens at 20, the Kwatery and a
//   hire cost about 2 500 gold, ten hours of exploring then), one from 30,
//   two from 50 (the second bed costs 5 120 gold and 20 hours of building).
//   Each a level below the character, of a class that changes from one
//   exploration to the next (all 20 pairs of classes in turn), with two of
//   its class's skills and two traits in turn, a rare weapon, body armour
//   and talisman of its Tier at the character's item level, upgraded two
//   levels below the character's, and the relation's standing (Znajomy at
//   30, Stały klient at 40, Zaufany from 50, Przyjaciel from 90, the second
//   companion one standing lower);
// - healing potions: two Mniejsze at 20, then Zwykłe (35%) and from 100
//   Duże (50%): three on an hour's exploration, five on longer ones,
//   drunk below 40% HP (the game's default mark);
// - trophies (+5% damage) against the creatures of the place's usual
//   encounters from 30.
// The `low` variant is a weaker but still engaged player: one rarity lower
// everywhere, two upgrades fewer (a whole set from +0 costs 6–12% of the
// gold explored until then), companions with the gear they come with (a
// common weapon and body armour of their level) and the first standing,
// one potion strength lower and fewer of them, no trophies.

import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';
import { KIT, OTHER_BASES, SLOT_ORDER, hoursToReach, itemsPerHour, typicalCharacter } from './simulate.mjs';
import { evolvedSkills } from './evolution-sim.mjs';

export const LEVELS = [10, 20, 30, 40, 50, 60, 75, 90, 100, 110, 125, 150];

const RARITY_STEPS = ['common', 'rare', 'unique', 'epic', 'legendary', 'mythic', 'divine'];

// The newest inner region of a level (see above), `offset` regions of five
// levels away.
export function newestArea(level, content, offset = 0) {
  const top = level + 5 * offset;
  const real = content.areas.find((area) => top >= area.minLevel && top <= area.maxLevel);
  if (real) return real;
  const template = content.areas[content.areas.length - 1];
  const minLevel = 5 * Math.floor((top - 1) / 5) + 1;
  return { ...template, id: `generated-${minLevel}`, minLevel, maxLevel: minLevel + 4, safe: false };
}

export const withArea = (area, content) => (area.id in content.areasById ? content : { ...content, areasById: { ...content.areasById, [area.id]: area } });

// What a realistic player of a level has (the list above); `low` the weaker one.
export function realisticPlan(level, variant = 'realistic') {
  const rarity =
    level >= 150
      ? { weapon: 'legendary', chest: 'legendary', other: 'epic' }
      : level >= 100
        ? { weapon: 'legendary', chest: 'epic', offhand: 'epic', head: 'epic', other: 'unique' }
        : level >= 50
          ? { weapon: 'epic', chest: 'epic', offhand: 'epic', other: 'unique' }
          : level >= 30
            ? { weapon: 'unique', chest: 'unique', other: 'rare' }
            : { other: 'rare' };
  const upgrade = level >= 125 ? 7 : level >= 90 ? 6 : level >= 50 ? 5 : level >= 40 ? 4 : level >= 30 ? 3 : level >= 20 ? 2 : 1;
  const plan = {
    variant,
    rarity,
    upgrade,
    weaponUpgrade: upgrade + (level >= 50 ? 1 : 0),
    extraSlots: 2,
    companions: level >= 50 ? 2 : level >= 30 ? 1 : 0,
    companionGear: 'rare',
    companionUpgrade: Math.max(0, upgrade - 2),
    bond: level >= 90 ? 4 : level >= 50 ? 3 : level >= 40 ? 2 : 1,
    potion: level >= 100 ? 'greater-healing' : level >= 30 ? 'healing' : level >= 20 ? 'lesser-healing' : null,
    potionCount: (minutes) => (level < 30 ? 2 : minutes <= 60 ? 3 : 5),
    healBelow: 0.4,
    trophies: level >= 30,
    evolution: true,
    tiers: true,
  };
  // The least any player of the level has: the evolution (the class waits at
  // its evolution level until one is taken) and the later bases that drop,
  // with the typical character's rare items and nothing else.
  // `casualcomp`: the same with the companions of its level as they come
  // from the Karczma (a common weapon and body armour, the first standing).
  if (variant === 'casual' || variant === 'casualcomp') {
    const companions = variant === 'casualcomp' ? plan.companions : 0;
    return { ...plan, rarity: { other: 'rare' }, upgrade: 0, weaponUpgrade: 0, extraSlots: 0, companions, companionGear: 'starting', companionUpgrade: 0, bond: 0, potion: null, trophies: false };
  }
  if (variant !== 'low') return plan;
  const lower = (id) => RARITY_STEPS[Math.max(0, RARITY_STEPS.indexOf(id) - 1)];
  return {
    ...plan,
    rarity: Object.fromEntries(Object.entries(rarity).map(([slot, id]) => [slot, id === 'rare' ? 'rare' : lower(id)])),
    upgrade: Math.max(0, upgrade - 2),
    weaponUpgrade: Math.max(0, plan.weaponUpgrade - 2),
    companionGear: 'starting',
    companionUpgrade: 0,
    bond: 0,
    potion: level >= 100 ? 'healing' : level >= 30 ? 'lesser-healing' : null,
    potionCount: (minutes) => (minutes <= 60 ? 2 : 3),
    trophies: false,
  };
}

// The latest base of a family a class level allows.
export function bestBase(family, classLevel, content) {
  const bases = content.bases.filter((base) => engine.baseFamily(base) === family && engine.baseClassLevel(base.id, content) <= classLevel);
  return bases.reduce((best, base) => (engine.baseClassLevel(base.id, content) > engine.baseClassLevel(best.id, content) ? base : best));
}

// The class's main stat (its biggest share of autoPoints).
const mainStatOf = (classId, content) => Object.entries(content.classesById[classId].autoPoints).sort((a, b) => b[1] - a[1])[0][0];

// An item as a player keeps it: the affixes the game rolls, and one of them
// the class's main stat (kept among the finds, or rolled again by the
// Zaklinaczka). The other affixes stay as they came, so most of them are
// stats the class hardly needs.
export function keptItem({ baseId, level, rarityId, mainStat }, rng, content) {
  const item = engine.generateItem({ baseId, level, rarityId }, rng, content);
  if (item.affixes.length === 0 || item.affixes.some((affix) => affix.stat === mainStat)) return item;
  const [first, ...rest] = item.affixes;
  const own = first.kind === 'prefix' ? content.prefixes : content.suffixes;
  const other = first.kind === 'prefix' ? content.suffixes : content.prefixes;
  const affix = own.find((one) => one.stat === mainStat) ?? other.find((one) => one.stat === mainStat);
  const kind = content.prefixes.includes(affix) ? 'prefix' : 'suffix';
  const value = engine.affixValue(mainStat, engine.affixShare(level, rarityId, content), content.balance.items);
  return { ...item, affixes: [{ id: affix.id, kind, stat: mainStat, value }, ...rest] };
}

// The gear of a realistic player: the bases, rarities and upgrades of its
// plan; `set` picks one of several draws of the affixes, so a measurement
// over many explorations takes in luck with the finds.
function realisticGear(classId, level, classLevel, plan, content, set = 0) {
  const cls = content.classesById[classId];
  const rng = engine.createRng(`realistic-gear:${classId}:${level}:${plan.variant}:${set}`);
  const itemLevel = Math.max(1, Math.min(level - 1, engine.gearLevel(level, content)));
  const families = { weapon: cls.weapons[0], ...KIT[classId], ...OTHER_BASES };
  // The slots the typical character has filled by now, and extraSlots more.
  const count = level === 1 ? 0 : Math.min(SLOT_ORDER.length, 1 + Math.floor(0.75 * itemsPerHour(content) * hoursToReach(level, content)) + plan.extraSlots);
  const mainStat = mainStatOf(classId, content);
  return SLOT_ORDER.slice(0, count).map((slot) => {
    const base = plan.tiers ? bestBase(families[slot], Math.min(classLevel, itemLevel), content) : content.basesById[families[slot]];
    const rarityId = plan.rarity[slot] ?? plan.rarity.other;
    const item = keptItem({ baseId: base.id, level: itemLevel, rarityId, mainStat }, rng, content);
    const upgrade = slot === 'weapon' ? plan.weaponUpgrade : plan.upgrade;
    return upgrade > 0 ? { ...item, upgrade } : item;
  });
}

// How many draws of the realistic gear a measurement goes through.
export const GEAR_SETS = 8;

// The main path's evolution at the class level: the first from class level
// 50, its second form from 100.
export function mainEvolution(classId, classLevel, content) {
  const [levelOne, levelTwo] = content.balance.progression.classEvolutionLevels;
  if (classLevel < levelOne) return null;
  const main = content.skills.find((skill) => skill.classId === classId);
  const first = content.evolutions.find((evolution) => evolution.classId === classId && !evolution.from && evolution.path === main.id);
  // Without the second evolution in the game the first form stays.
  return classLevel >= levelTwo ? (engine.nextFormOf?.(first, content) ?? first) : first;
}

// The character and gear of a model: `typical` (tools/simulate.mjs) or a
// realistic plan (`realistic`, `low`, or `realistic` without a part:
// `realistic-nocomp`, `-noevo`, `-noupg`, `-nopot`, `-notier`, `-norarity`).
export function playerOf(model, classId, level, content, set = 0) {
  const typical = typicalCharacter(classId, level, content);
  if (model === 'typical') return { ...typical, plan: null };
  const [variant, ...without] = model.split('-');
  let plan = realisticPlan(level, variant);
  if (without.includes('nocomp')) plan = { ...plan, companions: 0 };
  if (without.includes('noevo')) plan = { ...plan, evolution: false };
  if (without.includes('noupg')) plan = { ...plan, upgrade: 0, weaponUpgrade: 0, companionUpgrade: 0 };
  if (without.includes('nopot')) plan = { ...plan, potion: null };
  if (without.includes('notier')) plan = { ...plan, tiers: false };
  if (without.includes('norarity')) plan = { ...plan, rarity: { other: 'rare' } };
  if (without.includes('notrophy')) plan = { ...plan, trophies: false };
  const base = typical.character;
  let character = { ...base };
  const evolution = plan.evolution ? mainEvolution(classId, base.classLevel, content) : null;
  if (evolution) {
    character = { ...base, points: {}, evolution: evolution.id, skills: evolvedSkills(evolution, base.classLevel, content) };
    character.points = engine.autoDistribute(character, content);
  }
  return { character, equipped: realisticGear(classId, level, base.classLevel, plan, content, set), plan };
}

// The players of a model, one for each draw of the gear (the typical
// character has one), and the one for the `index`-th exploration.
function playersOf(model, classId, level, content) {
  const sets = model === 'typical' ? 1 : GEAR_SETS;
  return Array.from({ length: sets }, (_, set) => playerOf(model, classId, level, content, set));
}

// The companions of a realistic player on its `index`-th exploration: the
// classes, skills and traits change from one to the next.
export function companionsOf(plan, level, index, content) {
  if (!plan || plan.companions === 0) return [];
  const t = content.settlement.companions;
  const classes = content.classes.map((cls) => cls.id);
  const first = index % classes.length;
  const second = (first + 1 + (Math.floor(index / classes.length) % (classes.length - 1))) % classes.length;
  const companionLevel = Math.max(1, level - 1);
  const itemLevel = Math.max(1, Math.min(level - 1, engine.gearLevel(level, content)));
  return [first, second].slice(0, plan.companions).map((which, n) => {
    const classId = classes[which];
    const cls = content.classesById[classId];
    const skills = engine.skillsOfClass(classId, content).map((skill) => skill.id);
    const k = (index + n) % skills.length;
    const traits = [t.traits[(index + 3 * n) % t.traits.length].id, t.traits[(index + 3 * n + 4) % t.traits.length].id];
    const rng = engine.createRng(`companion-gear:${classId}:${level}:${plan.variant}:${index % GEAR_SETS}`);
    const mainStat = mainStatOf(classId, content);
    const slots = plan.companionGear === 'starting' ? [['weapon', cls.weapons[0]], ['chest', cls.armor.at(-1)]] : [['weapon', cls.weapons[0]], ['chest', cls.armor.at(-1)], ['talisman', 'talisman']];
    const gear = slots.map(([, family]) => {
      const base = plan.companionGear === 'starting' ? content.basesById[family] : bestBase(family, Math.min(companionLevel, itemLevel), content);
      const item =
        plan.companionGear === 'starting'
          ? engine.generateItem({ baseId: base.id, level: companionLevel }, rng, content)
          : keptItem({ baseId: base.id, level: itemLevel, rarityId: plan.companionGear, mainStat }, rng, content);
      return plan.companionUpgrade > 0 ? { ...item, upgrade: plan.companionUpgrade } : item;
    });
    const standing = content.settlement.standings[Math.max(0, plan.bond - n)];
    return {
      id: `c${n}`,
      name: `Towarzysz ${n + 1}`,
      appearance: n === 0 ? 'female' : 'male',
      classId,
      level: companionLevel,
      xp: 0,
      traits,
      skills: [skills[k], skills[(k + 1) % skills.length]],
      profession: 'gathering',
      story: 0,
      gear,
      relation: standing.points,
    };
  });
}

// The exploration's options for a model: potions, the mark and trophies.
function roadKit(plan, area, minutes, content) {
  if (!plan) return {};
  const fights = engine.potionsPerKind(minutes, content);
  const potions = plan.potion ? { [plan.potion]: Math.min(fights, plan.potionCount(minutes)) } : {};
  const trophies = {};
  if (plan.trophies) {
    const trophy = content.encyclopedia.trophy.damage;
    for (const encounter of area.encounters) for (const id of encounter.monsters) trophies[id] = trophy;
  }
  return { potions, healBelow: plan.healBelow, trophies };
}

// `hunts` explorations of `minutes` for a model at a level.
// `hard`: Trudne wyprawy (629 A), from the challenge's level.
export function measureCell({ model, classId, level, minutes, hunts, offset = 0, hard = false }, content) {
  const area = newestArea(level, content, offset);
  const local = withArea(area, content);
  const players = playersOf(model, classId, level, local);
  const maxHps = players.map((one) => engine.playerCombatant({ character: one.character, equipped: one.equipped, name: 'Symulacja', area }, local).maxHp);
  const player = players[0];
  const kit = roadKit(player.plan, area, minutes, local);
  const totals = { fainted: 0, escaped: 0, xp: 0, penalty: 0, gold: 0, endHp: 0, fights: 0, rare: 0, rareLost: 0, potions: 0, companionsDown: 0 };
  for (let i = 0; i < hunts; i++) {
    const { character, equipped } = players[i % players.length];
    const companions = companionsOf(player.plan, level, i, local);
    const hunt = engine.simulateHunt(
      { character, equipped, hp: maxHps[i % players.length], name: 'Symulacja', areaId: area.id, minutes, seed: `difficulty:${classId}:${level}:${minutes}:${offset}:${i}`, companions, hard, ...kit },
      local,
    );
    if (hunt.result === 'fainted') {
      totals.fainted += 1;
      totals.penalty += engine.faintPenalty(level, engine.xpToNext(level, content), content);
    }
    if (hunt.result === 'escaped') totals.escaped += 1;
    totals.xp += hunt.xp;
    totals.gold += hunt.gold;
    totals.endHp += hunt.hpEnd / hunt.maxHp;
    totals.fights += hunt.fights.length;
    for (const fight of hunt.fights) {
      if (fight.elite || fight.champion) {
        totals.rare += 1;
        if (fight.won !== true) totals.rareLost += 1;
      }
    }
    totals.potions += Object.values(hunt.potionsUsed ?? {}).reduce((sum, count) => sum + count, 0);
    totals.companionsDown += (hunt.companions ?? []).filter((one) => one.fainted).length;
  }
  const hours = (hunts * minutes) / 60;
  return {
    model,
    classId,
    level,
    minutes,
    offset,
    ...(hard && { hard }),
    area: `${area.id} ${area.minLevel}-${area.maxLevel}`,
    classLevel: player.character.classLevel,
    evolution: player.character.evolution ?? null,
    maxHp: maxHps.reduce((sum, hp) => sum + hp, 0) / maxHps.length,
    faintRate: totals.fainted / hunts,
    escapeRate: totals.escaped / hunts,
    endHp: totals.endHp / hunts,
    xpPerHour: totals.xp / hours,
    netXpPerHour: (totals.xp - totals.penalty) / hours,
    goldPerHour: totals.gold / hours,
    fights: totals.fights / hunts,
    rareMet: totals.rare / hunts,
    rareLost: totals.rareLost / hunts,
    potionsUsed: totals.potions / hunts,
    companionsDown: totals.companionsDown / hunts,
  };
}

// Single fights with the place's elite (`elite`) or champion (`champion`)
// at full HP, with the same kit as an hour's exploration: through a
// one-minute exploration whose only fight is that one (a rumour that makes
// it certain), so the fight goes exactly as on the way.
export function measureRare({ model, classId, level, kind, fights, offset = 0 }, content) {
  const found = newestArea(level, content, offset);
  if (kind === 'champion' && !found.champion) return null;
  const area = kind === 'elite' ? { ...found, champion: null, id: `${found.id}-elite` } : found;
  const local = withArea(area, content);
  const players = playersOf(model, classId, level, local);
  const maxHps = players.map((one) => engine.playerCombatant({ character: one.character, equipped: one.equipped, name: 'Symulacja', area }, local).maxHp);
  const player = players[0];
  const kit = roadKit(player.plan, area, 60, local);
  let won = 0;
  let hpLeft = 0;
  let lost = 0;
  let companionsDown = 0;
  for (let i = 0; i < fights; i++) {
    const { character, equipped } = players[i % players.length];
    const companions = companionsOf(player.plan, level, i, local);
    const hunt = engine.simulateHunt(
      { character, equipped, hp: maxHps[i % players.length], name: 'Symulacja', areaId: area.id, minutes: 1, rumor: 1e9, seed: `difficulty-${kind}:${classId}:${level}:${offset}:${i}`, companions, ...kit },
      local,
    );
    const fight = hunt.fights[0];
    if (!fight || !(fight.elite || fight.champion)) throw new Error(`no ${kind} fight at ${level}`);
    if (fight.won === true) {
      won += 1;
      hpLeft += hunt.fights[0].hpAfter / hunt.maxHp;
    } else lost += 1;
    companionsDown += (hunt.companions ?? []).filter((one) => one.fainted).length;
  }
  return { model, classId, level, kind, offset, monster: kind === 'elite' ? area.elite : area.champion, monsterLevel: area.maxLevel + (kind === 'elite' ? content.balance.hunt.eliteLevelBonus : content.balance.hunt.championLevelBonus), winRate: won / fights, lossRate: lost / fights, hpLeft: won ? hpLeft / won : 0, companionsDown: companionsDown / fights };
}

// --set monsters.lateGame.damage=0.5: a balance value changed for the run
// (a JSON value), before the content is built.
export function contentWith(sets = []) {
  const raw = loadData();
  for (const assignment of sets) {
    const [path, value] = assignment.split('=');
    const keys = path.split('.');
    let target = raw.balance;
    for (const key of keys.slice(0, -1)) {
      target[key] ??= {};
      target = target[key];
    }
    target[keys.at(-1)] = JSON.parse(value);
  }
  return engine.buildContent(raw);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = contentWith(options.set);
  const classes = list(options.classes, content.classes.map((cls) => cls.id));
  const levels = list(options.levels, LEVELS.map(String)).map(Number);
  const minutesList = options.minutes === 'none' ? [] : list(options.minutes, ['60', '240']).map(Number);
  const models = list(options.models, ['typical', 'realistic']);
  const hunts = Number(options.hunts ?? 200);
  const rareFights = Number(options.rare ?? 0);
  const offset = Number(options.offset ?? 0);
  const rows = [];
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  for (const level of levels) {
    for (const classId of classes) {
      for (const model of models) {
        for (const minutes of minutesList) {
          const r = measureCell({ model, classId, level, minutes, hunts, offset, hard: options.hard === true }, content);
          rows.push({ type: 'hunt', ...r });
          console.log(
            `${model.padEnd(17)} ${classId.padEnd(8)} ${String(level).padStart(3)} ${String(minutes).padStart(4)} min  omdlenia ${pct(r.faintRate).padStart(6)}  HP ${pct(r.endHp).padStart(6)}  XP/h ${r.xpPerHour.toFixed(0).padStart(7)} (netto ${r.netXpPerHour.toFixed(0).padStart(7)})  złoto/h ${r.goldPerHour.toFixed(0).padStart(5)}  ${r.area}`,
          );
        }
        for (const kind of rareFights > 0 ? ['elite', 'champion'] : []) {
          const r = measureRare({ model, classId, level, kind, fights: rareFights, offset }, content);
          if (!r) continue;
          rows.push({ type: 'rare', ...r });
          console.log(`${model.padEnd(17)} ${classId.padEnd(8)} ${String(level).padStart(3)} ${kind.padEnd(8)} ${r.monster} poz. ${r.monsterLevel}: wygrane ${pct(r.winRate)}, HP po wygranej ${pct(r.hpLeft)}`);
        }
      }
    }
  }
  if (typeof options.json === 'string') writeFileSync(options.json, JSON.stringify({ sets: options.set, hunts, offset, rows }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
