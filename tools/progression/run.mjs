// Characters of every class carried from level 1 to 50 with the game's real
// engine and real loot (sim.mjs), unlike tools/simulate.mjs, which gives a
// typical character the gear the curve assumes. Runs the data as it is with
// full per-level rows, the proposals of the balance study (24.10.2026) one by
// one and together, and other player behaviours. Writes results.json and
// summary.txt to checks/progression/ (not committed). About 2.5 minutes:
//
//   node tools/progression/run.mjs [baselineRuns=100] [variantRuns=100] [sensitivityRuns=60]
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as engine from '../../src/engine/index.js';
import { loadRaw, buildContent, DEFAULT_POLICY } from './sim.mjs';
import { simulateClass, designHours } from './aggregate.mjs';
import { runVariant, compact, OUT } from './variants.mjs';
import { fileURLToPath } from 'node:url';

const baselineRuns = Number(process.argv[2] ?? 100);
const variantRuns = Number(process.argv[3] ?? 100);
const sensitivityRuns = Number(process.argv[4] ?? 60);
const t0 = Date.now();
const log = (text) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${text}`);

const content = buildContent(loadRaw());
let commit = 'unknown';
try { commit = execSync('git log -1 --format=%h', { cwd: fileURLToPath(new URL('../..', import.meta.url)) }).toString().trim(); } catch {}

const baseline = {};
for (const cls of content.classes) {
  baseline[cls.id] = simulateClass(cls.id, content, { runs: baselineRuns });
  log(`baseline ${cls.id}`);
}

// What a variant keeps in results.json: no per-level rows, the rest in full.
const brief = (c) => ({
  runs: c.runs,
  runsReaching50: c.runsReaching50,
  milestones: c.milestones,
  overall: c.overall,
  bands: c.bands.map((b) => ({ band: b.band, faintRate: b.faintRate, hoursToCrossBand: b.hoursToCrossBand, designHoursToCrossBand: b.designHoursToCrossBand, xpLostShare: b.xpLostShare, goldPerHour: b.goldPerHour, huntsPerRun: b.huntsPerRun, minutesPerHunt: b.minutesPerHunt })),
  faintRateByLevel: Object.fromEntries(c.levels.filter((r) => r.faintRateAtLevel !== null).map((r) => [r.level, r.faintRateAtLevel])),
  exploreHoursByLevel: Object.fromEntries(c.levels.map((r) => [r.level, r.exploreHours])),
});

const PROPOSALS = [
  ['P1_weapon2', 'weapon2'],
  ['P2_gearLag240', 'lag240'],
  ['P3_groups_on_P2', 'lag240+groups'],
  ['P1-3', 'weapon2+lag240+groups'],
  ['P1-4', 'weapon2+lag240+groups+xp=520+early=0.85'],
  ['P5_woodGrowth', 'woodcost'],
  ['package_P1-5', 'weapon2+lag240+groups+xp=520+early=0.85+woodcost'],
  ['package_P1-5_plus_chest60', 'weapon2+lag240+groups+xp=520+early=0.85+woodcost+chest=0.6'],
  ['xp520_alone', 'xp=520+early=0.85'],
  ['camp_alt_wood_region_and_sawmill', 'wood+sawmill'],
];
const SENSITIVITIES = [
  ['anvil', 'anvil'],
  ['careful_threat_display', 'careful'],
  ['eager_highest_open_area', 'eager'],
  ['rest_to_full', 'rest100'],
];

const proposals = {};
const lines = [];
for (const [key, name] of PROPOSALS) {
  const result = runVariant(name, variantRuns);
  proposals[key] = { variant: name, describe: result.describe, runs: variantRuns, classes: Object.fromEntries(Object.entries(result.classes).map(([id, c]) => [id, brief(c)])) };
  lines.push(compact({ ...result, name: `${key} (${name})` }));
  log(`proposal ${key}`);
}
const sensitivities = {};
for (const [key, name] of SENSITIVITIES) {
  const result = runVariant(name, sensitivityRuns);
  sensitivities[key] = { variant: name, describe: result.describe, runs: sensitivityRuns, classes: Object.fromEntries(Object.entries(result.classes).map(([id, c]) => [id, brief(c)])) };
  lines.push(compact({ ...result, name: `${key} (${name})` }));
  log(`sensitivity ${key}`);
}

const designCurve = [];
for (let L = 1; L <= 50; L++) {
  designCurve.push({ level: L, minutesThisLevel: Math.round(engine.huntingHours(L, content) * 600) / 10, hoursToReach: Math.round(designHours(L, content) * 100) / 100, xpToNext: engine.xpToNext(L, content), classXpToNext: engine.classXpToNext(L, content), engineGearLevel: engine.gearLevel(L, content), longestHuntMinutes: engine.longestHunt(L, content) });
}

const results = {
  meta: {
    generated: new Date().toISOString(),
    repoCommit: commit,
    engine: 'src/engine (imported read-only)',
    runsPerClass: { baseline: baselineRuns, proposals: variantRuns, sensitivities: sensitivityRuns },
    policy: {
      ...DEFAULT_POLICY,
      area: 'inner region whose range holds the character level; 2 faints in the last 3 hunts there -> 2 hunts one inner region lower, then retry',
      length: 'longest allowed (30 min to L24, 60 to L34, 120 to L49)',
      rest: 'until HP >= 80% of max HP; no idle time between timers',
      points: 'autoDistribute ("Rozdaj według klasy") after every hunt from level 2',
      loot: 'server autoEquip into empty slots, then a find replaces the worn item if offence x defence from combatValues rises; everything else sold to the scrapper at once',
      camp: 'at every hunt end, hunt start and build completion: collect stores; if nothing is being built, start the affordable next level with the lowest gold cost',
      timePoints: 'counted, never spent (the tutorial would spend 30 on the first hunt), with one every half an hour of the wall clock',
    },
    fields: {
      exploreHours: 'exploring hours (sum of hunt timers) when the XP crossed the level inside the hunt',
      exploreHoursAtClaim: 'exploring hours at the end of the hunt that brought the level (when the player sees it)',
      totalHours: 'exploring + resting hours at the crossing',
      faintRateAtLevel: 'share of hunts started at this level that ended in fainting',
      gearItemLevel: 'average item level of worn items (filled slots only)',
      gearCommonEquivalentLevel: 'the same with rarity budget folded in: level a common item would need for the same budget',
      engineGearLevel: 'gearLevel() the engine gives monsters natural weapons and hides at this level',
      camp: 'average building levels when the character reached this level',
      bands: 'hunts grouped by the character level at their start',
    },
  },
  designCurve,
  baseline,
  proposals,
  sensitivities,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('results.json', OUT), JSON.stringify(results, null, 1));
writeFileSync(new URL('summary.txt', OUT), lines.join('\n\n') + '\n');
console.log(lines.join('\n\n'));
log('written checks/progression/results.json and summary.txt');
