// Proposals tested on a modified copy of the data in memory (the repository
// is never touched). Each variant mutates a clone of the raw data files.
//   node tools/progression/variants.mjs [runs] [variant names...]
// e.g. node tools/progression/variants.mjs 40 baseline lag240 weapon2+lag240+groups
import { mkdirSync, writeFileSync } from 'node:fs';
import * as engine from '../../src/engine/index.js';
import { loadRaw, clone, buildContent } from './sim.mjs';
import { simulateClass } from './aggregate.mjs';

// Results go to checks/ at the repository root, which git ignores.
export const OUT = new URL('../../checks/progression/', import.meta.url);

export const VARIANTS = {
  baseline: { describe: 'data as in the repository', apply() {} },
  anvil: { describe: 'baseline data, player also upgrades worn items on the Kowadło', policy: { anvil: true }, apply() {} },
  lag180: { describe: 'balance.monsters.gearLagMinutes 45 -> 180', apply(raw) { raw.balance.monsters.gearLagMinutes = 180; } },
  lag240: { describe: 'balance.monsters.gearLagMinutes 45 -> 240', apply(raw) { raw.balance.monsters.gearLagMinutes = 240; } },
  lag360: { describe: 'balance.monsters.gearLagMinutes 45 -> 360', apply(raw) { raw.balance.monsters.gearLagMinutes = 360; } },
  free3: { describe: 'balance.hunt.lowLevelFreeDiff 2 -> 3', apply(raw) { raw.balance.hunt.lowLevelFreeDiff = 3; } },
  free4: { describe: 'balance.hunt.lowLevelFreeDiff 2 -> 4', apply(raw) { raw.balance.hunt.lowLevelFreeDiff = 4; } },
  xp520: { describe: 'progression.xpPerHourScale 650 -> 520', apply(raw) { raw.balance.progression.xpPerHourScale = 520; } },
  xp500: { describe: 'progression.xpPerHourScale 650 -> 500', apply(raw) { raw.balance.progression.xpPerHourScale = 500; } },
  drop10: { describe: 'rewards.itemDropChance 0.06 -> 0.10', apply(raw) { raw.balance.rewards.itemDropChance = 0.1; } },
  wood: {
    describe: 'Uroczysko Kamieni resources wood 3 / stone 5 -> wood 5 / stone 3',
    apply(raw) { raw.regions.find((r) => r.id === 'stone-glade').resources = { wood: 5, stone: 3, 'iron-ore': 2 }; },
  },
  woodcost: {
    describe: 'every building: wood growth 1.9 -> 1.75',
    apply(raw) { for (const b of raw.buildings) for (const c of b.costs) if (c.resource === 'wood') c.growth = 1.75; },
  },
  thicket: {
    describe: 'Dzicza Głusza: tough "wolf,wolf,wolf" and "boar,boar,wolf" removed, "boar,boar" and "wolf,wolf" regular weights halved',
    apply(raw) {
      const area = raw.regions.flatMap((r) => r.areas).find((a) => a.id === 'boar-thicket');
      area.tough = area.tough.filter((e) => !['wolf,wolf,wolf', 'boar,boar,wolf'].includes(e.monsters.join(',')));
      for (const e of area.encounters) if (['boar,boar', 'wolf,wolf'].includes(e.monsters.join(','))) e.weight = e.weight / 2;
    },
  },
  dmg125: { describe: 'monsters.damageMultiplier 1.4 -> 1.25', apply(raw) { raw.balance.monsters.damageMultiplier = 1.25; } },
  dmg130: { describe: 'monsters.damageMultiplier 1.4 -> 1.3', apply(raw) { raw.balance.monsters.damageMultiplier = 1.3; } },
  tough10: { describe: 'hunt.toughChanceByMinutes 30 min 0.15 -> 0.10 (others scaled)', apply(raw) { raw.balance.hunt.toughChanceByMinutes = [[1, 0], [10, 0.03], [30, 0.1], [120, 0.2], [240, 0.3]]; } },
  rest100: { describe: 'policy: rest to full HP instead of 80%', policy: { restTo: 1.0 }, apply() {} },
  eager: { describe: 'policy: the highest inner region the class level opens', policy: { areaChoice: 'eager' }, apply() {} },
  careful: { describe: 'policy: the longest length the threat display rates under 5% faint chance', policy: { threatAware: true }, apply() {} },
  beastgrowth: {
    describe: 'wolf, boar, alpha-wolf, bear: strength growth -0.5 (2.5->2.0, 3->2.5)',
    apply(raw) { for (const m of raw.monsters) if (['wolf', 'boar', 'alpha-wolf', 'bear'].includes(m.id)) m.stats.growth.strength -= 0.5; },
  },
  groups: { describe: 'hunt.groupFactors [1, 0.7, 0.55] -> [1, 0.6, 0.45]', apply(raw) { raw.balance.hunt.groupFactors = [1, 0.6, 0.45]; } },
  recover40: { describe: 'hunt.recoveryAfterFight 0.3 -> 0.4', apply(raw) { raw.balance.hunt.recoveryAfterFight = 0.4; } },
  hp8: { describe: 'character.hpPerLevel 5 -> 8', apply(raw) { raw.balance.character.hpPerLevel = 8; } },
  hp10: { describe: 'character.hpPerLevel 5 -> 10', apply(raw) { raw.balance.character.hpPerLevel = 10; } },
  boar: {
    describe: 'boar (monsters.json): strength and endurance growth 2.5 -> 2.0',
    apply(raw) { const m = raw.monsters.find((x) => x.id === 'boar'); m.stats.growth.strength = 2.0; m.stats.growth.endurance = 2.0; },
  },
  boar2: {
    describe: 'boar (monsters.json): strength and endurance growth 2.5 -> 2.0, hpFactor 0.7 -> 0.6',
    apply(raw) { const m = raw.monsters.find((x) => x.id === 'boar'); m.stats.growth.strength = 2.0; m.stats.growth.endurance = 2.0; m.hpFactor = 0.6; },
  },
  weapon2: {
    describe: 'a second weapon base for each class with one (item-bases.json + classes.json "weapons"), same numbers as the first',
    apply(raw) {
      for (const cls of raw.classes) {
        if (cls.weapons.length > 1) continue;
        const base = raw['item-bases'].find((b) => b.id === cls.weapons[0]);
        const copy = { ...base, id: `${base.id}-2`, name: `${base.name} II` };
        raw['item-bases'].push(copy);
        cls.weapons = [...cls.weapons, copy.id];
      }
    },
  },
  h1at30: { describe: 'unlocks.json hunts-1h level 25 -> 30', apply(raw) { raw.unlocks.find((u) => u.id === 'hunts-1h').level = 30; } },
  sawmill: {
    describe: 'sawmill production perLevel 6 -> 10',
    apply(raw) { raw.buildings.find((b) => b.id === 'sawmill').effect.perLevel = 10; },
  },
};

// Several variants combined: "lag240+xp520".
// Parametric variants: xp=480, lag=240, free=3, gf=0.6/0.45, drop=0.1, dmg=1.3
const PARAMETRIC = {
  xp: (v) => ({ describe: `progression.xpPerHourScale 650 -> ${v}`, apply(raw) { raw.balance.progression.xpPerHourScale = Number(v); } }),
  lag: (v) => ({ describe: `monsters.gearLagMinutes 45 -> ${v}`, apply(raw) { raw.balance.monsters.gearLagMinutes = Number(v); } }),
  free: (v) => ({ describe: `hunt.lowLevelFreeDiff 2 -> ${v}`, apply(raw) { raw.balance.hunt.lowLevelFreeDiff = Number(v); } }),
  gf: (v) => ({ describe: `hunt.groupFactors -> [1, ${v.split('/').join(', ')}]`, apply(raw) { raw.balance.hunt.groupFactors = [1, ...v.split('/').map(Number)]; } }),
  drop: (v) => ({ describe: `rewards.itemDropChance 0.06 -> ${v}`, apply(raw) { raw.balance.rewards.itemDropChance = Number(v); } }),
  dmg: (v) => ({ describe: `monsters.damageMultiplier 1.4 -> ${v}`, apply(raw) { raw.balance.monsters.damageMultiplier = Number(v); } }),
  // early=0.85: earlyXpFactors for levels 6-20 set to 0.85 (flat); ramp=0.75: from 0.75 at level 6 up to 1 at level 21
  early: (v) => ({ describe: `progression.earlyXpFactors: levels 6-20 x${v}`, apply(raw) { const f = raw.balance.progression.earlyXpFactors.slice(0, 5); for (let L = 6; L <= 20; L++) f.push(Number(v)); raw.balance.progression.earlyXpFactors = f; } }),
  ramp: (v) => ({ describe: `progression.earlyXpFactors: levels 6-20 from ${v} rising to 1`, apply(raw) { const f = raw.balance.progression.earlyXpFactors.slice(0, 5); const f0 = Number(v); for (let L = 6; L <= 20; L++) f.push(Math.round((f0 + (1 - f0) * (L - 6) / 15) * 1000) / 1000); raw.balance.progression.earlyXpFactors = f; } }),
  mlw: (v) => ({ describe: `hunt.monsterLevelWeights [8, 4, 2, 1, 1] -> [${v.split('/').join(', ')}]`, apply(raw) { raw.balance.hunt.monsterLevelWeights = v.split('/').map(Number); } }),
  xpbase: (v) => ({ describe: `rewards.xpBase 100 -> ${v}`, apply(raw) { raw.balance.rewards.xpBase = Number(v); } }),
};

export function variantFor(name) {
  const parts = name.split('+').map((part) => {
    if (part.includes('=')) {
      const [key, value] = part.split('=');
      if (!PARAMETRIC[key]) throw new Error(`unknown parameter ${key}`);
      return PARAMETRIC[key](value);
    }
    const v = VARIANTS[part];
    if (!v) throw new Error(`unknown variant ${part}`);
    return v;
  });
  return {
    describe: parts.map((p) => p.describe).join('; '),
    policy: Object.assign({}, ...parts.map((p) => p.policy ?? {})),
    apply(raw) { for (const p of parts) p.apply(raw); },
  };
}

export function runVariant(name, runs, classes) {
  const variant = variantFor(name);
  const raw = clone(loadRaw());
  variant.apply(raw);
  const content = buildContent(raw);
  const out = {};
  for (const cls of content.classes) {
    if (classes && !classes.includes(cls.id)) continue;
    out[cls.id] = simulateClass(cls.id, content, { runs, policy: variant.policy });
  }
  return { name, describe: variant.describe, content, classes: out };
}

export function compact(result) {
  const lines = [`--- ${result.name}: ${result.describe}`];
  lines.push('class    L10   L17   L20   L25   L35   L50  (total L20, L50) | faint 1-10 11-20 21-30 31-40 41-50 all | xpLost | campTot L20 L35 L50 | gold@50 | idle wood/gold h | gearEq@20 @30');
  const f = (v, n = 5) => String(v ?? '-').padStart(n);
  for (const [id, c] of Object.entries(result.classes)) {
    const m = c.milestones.exploreHoursToReach;
    const t = c.milestones.totalHoursToReach;
    const row = (L) => c.levels.find((r) => r.level === L);
    const L17 = row(17)?.exploreHours;
    lines.push(
      `${id.padEnd(8)}${f(m[10])} ${f(L17)} ${f(m[20])} ${f(m[25])} ${f(m[35])} ${f(m[50])}  (${t[20]}, ${t[50]}) | ` +
        `${c.bands.map((b) => f(b.faintRate, 4)).join(' ')} ${f(c.overall.faintRate, 4)} | ${f(c.overall.xpLostShare, 4)} | ` +
        `${f(c.milestones.campTotalAt[20], 4)} ${f(c.milestones.campTotalAt[35], 4)} ${f(c.milestones.campTotalAt[50], 4)} | ${f(c.overall.walletAt50.gold, 6)} | ` +
        `${f(c.overall.campIdleHoursByMissingResource.wood ?? 0, 4)}/${f(c.overall.campIdleHoursByMissingResource.gold ?? 0, 3)} | ${row(20)?.gearCommonEquivalentLevel} ${row(30)?.gearCommonEquivalentLevel}`,
    );
  }
  const all = Object.values(result.classes);
  const avg = (f) => Math.round((all.reduce((s, c) => s + f(c), 0) / all.length) * 100) / 100;
  lines.push(`average  L10 ${avg((c) => c.milestones.exploreHoursToReach[10])}  L20 ${avg((c) => c.milestones.exploreHoursToReach[20])}  L50 ${avg((c) => c.milestones.exploreHoursToReach[50])}  faint ${avg((c) => c.overall.faintRate)}  campTot@50 ${avg((c) => c.milestones.campTotalAt[50])}`);
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('variants.mjs')) {
  const runs = Number(process.argv[2] ?? 40);
  const names = process.argv.slice(3);
  const saved = {};
  for (const name of names.length ? names : ['baseline']) {
    const result = runVariant(name, runs);
    console.log(compact(result));
    saved[name] = { describe: result.describe, classes: result.classes };
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(`variants-${Date.now()}.json`, OUT), JSON.stringify(saved));
  // gearLevel tables for the lag variants
  if (names.some((n) => n.includes('lag'))) {
    for (const name of names.filter((n) => n.includes('lag'))) {
      const raw = clone(loadRaw());
      variantFor(name).apply(raw);
      const content = buildContent(raw);
      console.log(`gearLevel ${name}: ` + [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((L) => `${L}:${engine.gearLevel(L, content)}`).join(' '));
    }
  }
}
