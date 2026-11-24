// „Zagrożenie” tells the chance an exploration really ends in a faint, with
// companions too (19.11.2026). Its sample fights alone start the companions
// at full HP each time, while on the way their HP goes from fight to fight
// and some of them fall, after which the creatures turn on the character: a
// realistic player of level 100 with two companions was shown 1.8% where
// about one 4-hour exploration in five ended in a faint. So a build with
// companions also goes on explorations of 1, 2 and 4 hours, fight after
// fight as simulateHunt fights them (threatSamples' `trips`), and each
// length takes their share fainted within its number of fights, weighed to
// its odds of each kind of encounter (the elite and the champion avoided or
// sought too), moved by the sample fights' recursion for its rest and HP.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { THREAT_TRIPS, THREAT_TRIP_MINUTES, explorationPace, faintChances, playerCombatant, simulateHunt, threatSamples } from '../src/engine/index.js';
import { companionsOf, newestArea, playerOf, roadKit, withArea } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';

const near = (actual, expected, within) => assert.ok(Math.abs(actual - expected) <= within, `${actual} vs ${expected} (±${within})`);

// A realistic player of tools/difficulty-sim.mjs in the newest place of its
// level: its gear set and companions by `build`, the healing potions it
// takes on a 4-hour exploration, also by id.
function realistic(classId, level, build) {
  const area = newestArea(level, content);
  const local = withArea(area, content);
  const one = playerOf('realistic', classId, level, local, build % 8);
  const companions = companionsOf(one.plan, level, build, local);
  const kit = roadKit(one.plan, area, 240, local);
  const [id] = Object.keys(kit.potions);
  const healing = { count: kit.potions[id], amount: local.potionsById[id].effect.heal, below: kit.healBelow, potions: kit.potions };
  const maxHp = playerCombatant({ character: one.character, equipped: one.equipped, name: 'Próba', area }, local).maxHp;
  return { area, local, character: one.character, equipped: one.equipped, companions, kit, healing, maxHp };
}

// The share of `count` explorations of `minutes` of that very build that
// end in a faint, as the game runs them.
function simulated({ area, local, character, equipped, companions, kit, maxHp }, minutes, count, tag) {
  let faints = 0;
  for (let i = 0; i < count; i++) {
    const hunt = simulateHunt({ character, equipped, hp: maxHp, name: 'Próba', areaId: area.id, minutes, seed: `zagrożenie:${tag}:${minutes}:${i}`, companions, potions: kit.potions, healBelow: kit.healBelow }, local);
    if (hunt.result === 'fainted') faints += 1;
  }
  return faints / count;
}

describe('the companions\' explorations', () => {
  // A Cień of level 300: since the weaker creatures (24.11.2026) a realistic
  // player of level 100 with companions hardly ever faints in the newest
  // place, so nothing there would move the estimate.
  const one = realistic('shadow', 300, 0);
  const samples = threatSamples({ character: one.character, equipped: one.equipped, areaId: one.area.id, companions: one.companions, healing: one.healing }, one.local);

  test('they go only with companions, THREAT_TRIPS of each length of THREAT_TRIP_MINUTES, the share fainted growing with the fights', () => {
    assert.ok(samples.trips);
    assert.deepEqual(
      samples.trips.map((trip) => trip.minutes),
      THREAT_TRIP_MINUTES,
    );
    for (const trip of samples.trips) {
      assert.equal(trip.count, THREAT_TRIPS);
      assert.equal(trip.by.length, explorationPace(trip.minutes, content, one.character.level).fights + 1);
      assert.equal(trip.by[0], 0);
      for (let fights = 1; fights < trip.by.length; fights++) assert.ok(trip.by[fights] >= trip.by[fights - 1]);
    }
    const alone = threatSamples({ character: one.character, equipped: one.equipped, areaId: one.area.id, healing: one.healing }, one.local);
    assert.equal(alone.trips, null);
    // The same build, the same explorations.
    assert.deepEqual(threatSamples({ character: one.character, equipped: one.equipped, areaId: one.area.id, companions: one.companions, healing: one.healing }, one.local).trips, samples.trips);
  });

  test('each of their lengths from full HP is their share itself; less HP, the elite avoided or sought move it', () => {
    const chances = (input) => faintChances({ character: one.character, equipped: one.equipped, hp: one.maxHp, areaId: one.area.id, healing: one.healing, ...input }, one.local, samples);
    const longest = content.balance.hunt.maxMinutes;
    for (const trip of samples.trips) near(chances({})[trip.minutes], trip.by.at(-1), 1e-9);
    assert.ok(chances({ hp: one.maxHp * 0.25 })[longest] > chances({})[longest]);
    // Avoided, only the explorations that met no elite nor champion count
    // (each weighed by how much likelier its other fights are so).
    const went = samples.trips.at(-1);
    const without = went.paths.map((path, index) => [path, went.faints[index]]).filter(([path]) => !/[ce]/.test(path));
    assert.ok(without.length > 0 && without.length < went.paths.length);
    near(chances({ avoidRare: true })[longest], without.filter(([, faint]) => faint).length / without.length, 0.05);
    assert.ok(chances({ seekRare: true })[longest] >= chances({ avoidRare: true })[longest]);
    // A short exploration less often than a long one.
    assert.ok(chances({})[60] < chances({})[longest]);
  });

  test('without companions the estimate is the sample fights\' recursion, as before', () => {
    const alone = threatSamples({ character: one.character, equipped: one.equipped, areaId: one.area.id, healing: one.healing }, one.local);
    const plain = { ...alone, trips: null };
    const input = { character: one.character, equipped: one.equipped, hp: one.maxHp, areaId: one.area.id, healing: one.healing };
    assert.deepEqual(faintChances(input, one.local, alone), faintChances(input, one.local, plain));
  });
});

describe('the estimate against explorations as the game runs them', () => {
  // Realistic players of three levels with two companions each, two builds
  // of every class: the estimate for 1 and 4 hours within a few points of
  // the share of 120 explorations of each build that end in a faint. Before
  // 19.11.2026 the recursion alone showed a fraction of it. 120, not 60,
  // since the side stats (1218): at level 100 the first 60 of each build
  // came to 31.2% fainted against the estimate's 36.8%, while 240 of them
  // come to 33.6%. Since the weaker creatures (24.11.2026) none of them
  // faints at levels 50 and 100 (the estimate shows none either), and at
  // 300 about 6.6% on 4 hours, where the recursion alone shows 3.7%.
  for (const level of [50, 100, 300]) {
    test(`level ${level}: 1 and 4 hours`, () => {
      const rows = { 60: { estimate: 0, real: 0, before: 0 }, 240: { estimate: 0, real: 0, before: 0 } };
      let builds = 0;
      for (const cls of content.classes) {
        for (const build of [0, 1]) {
          const one = realistic(cls.id, level, build);
          const samples = threatSamples({ character: one.character, equipped: one.equipped, areaId: one.area.id, companions: one.companions, healing: one.healing }, one.local);
          const input = { character: one.character, equipped: one.equipped, hp: one.maxHp, areaId: one.area.id, healing: one.healing };
          const chances = faintChances(input, one.local, samples);
          const before = faintChances(input, one.local, { ...samples, trips: null });
          for (const minutes of [60, 240]) {
            rows[minutes].estimate += chances[minutes];
            rows[minutes].before += before[minutes];
            rows[minutes].real += simulated(one, minutes, 120, `${cls.id}:${level}:${build}`);
          }
          builds += 1;
        }
      }
      for (const minutes of [60, 240]) {
        const { estimate, real, before } = Object.fromEntries(Object.entries(rows[minutes]).map(([key, sum]) => [key, sum / builds]));
        near(estimate, real, minutes === 60 ? 0.03 : 0.05);
        if (minutes === 240 && level === 300) assert.ok(real >= 0.05 && before < real * 0.75, `before: ${before}, real: ${real}`);
      }
    });
  }
});
