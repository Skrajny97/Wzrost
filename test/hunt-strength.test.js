// The creatures of the newest place, the one that holds the character's
// level, are stronger by that level (balance.monsters.huntCurve; the
// author, 4.11.2026: 611 between B and C, 612 C, 613 C): from the 10th level
// on, the same for a character alone, with companions or in a party, the
// elite and the champion of the place as its other creatures. The danger
// estimate's sample fights meet the same creatures. Lower places, the
// Wieże, the events' fights and the Bestia Gildii keep their own measure.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { encounterCombatants, estimateThreat, exploreStrength, huntStrength, monsterCombatant, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const withCurve = (huntCurve) => ({ ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve } } });
const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);

test('huntStrength: none before the first point, straight between two points, as the last past it', () => {
  const curve = [[10, 1, 1], [20, 3, 2], [30, 2, 1.5]];
  assert.deepEqual(huntStrength(5, curve), [1, 1]);
  assert.deepEqual(huntStrength(10, curve), [1, 1]);
  assert.deepEqual(huntStrength(15, curve), [2, 1.5]);
  assert.deepEqual(huntStrength(20, curve), [3, 2]);
  assert.deepEqual(huntStrength(25, curve), [2.5, 1.75]);
  assert.deepEqual(huntStrength(40, curve), [2, 1.5]);
  assert.deepEqual(huntStrength(40, []), [1, 1]);
  assert.deepEqual(huntStrength(40, undefined), [1, 1]);
});

test('the curve as it stands: nothing up to the 10th level (613 C), stronger creatures past it', () => {
  const curve = content.balance.monsters.huntCurve;
  assert.deepEqual(curve[0], [10, 1, 1]);
  for (const level of [1, 5, 9, 10]) assert.deepEqual(huntStrength(level, curve), [1, 1], `level ${level}`);
  for (const level of [13, 18, 33]) {
    const [damage, hp] = huntStrength(level, curve);
    assert.ok(damage > 1.2 && hp > 1.1, `level ${level}: ${damage}, ${hp}`);
  }
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i][0] > curve[i - 1][0], 'points by level');
  for (const [, damage, hp] of curve) assert.ok(damage >= 1 && hp >= 1, 'never easier than before');
});

test('the place that holds the character’s level by that level, a higher one by its first level, a lower one as before', () => {
  const curve = withCurve([[10, 1, 1], [30, 3, 2]]);
  const place = (id) => curve.areasById[id];
  const at = (level) => huntStrength(level, curve.balance.monsters.huntCurve);
  assert.deepEqual(exploreStrength(place('viper-heaps'), 20, curve), at(20));
  assert.deepEqual(exploreStrength(place('viper-heaps'), 16, curve), at(16));
  assert.deepEqual(exploreStrength(place('boar-thicket'), 20, curve), at(21));
  assert.deepEqual(exploreStrength(place('raven-hollows'), 20, curve), [1, 1]);
  assert.ok(at(16)[0] < at(20)[0] && at(20)[0] < at(21)[0]);
});

test('a creature met on an exploration hits harder and has more HP by the strength it is given', () => {
  for (const level of [12, 30, 75]) {
    const plain = monsterCombatant({ monsterId, level, id: 'e0' }, content);
    const strong = monsterCombatant({ monsterId, level, id: 'e0', strength: [2.5, 1.8] }, content);
    assert.ok(Math.abs(strong.weapon.max / plain.weapon.max - 2.5) < 1e-9, `damage at ${level}`);
    assert.ok(Math.abs(strong.maxHp / plain.maxHp - 1.8) < 0.01, `HP at ${level}: ${strong.maxHp} / ${plain.maxHp}`);
    const [unit] = encounterCombatants({ members: [{ monsterId, level }] }, content, { strength: [2.5, 1.8] });
    assert.equal(unit.maxHp, strong.maxHp);
  }
});

test('the exploration and its danger estimate meet the place’s stronger creatures; the same creatures elsewhere do not change', () => {
  const { character, equipped } = typicalCharacter('warrior', 20, content);
  const hunt = { character, equipped, name: 'Próba', areaId: 'viper-heaps', minutes: 60, seed: 'curve' };
  const overwhelming = withCurve([[1, 200, 200]]);
  const none = withCurve([]);
  assert.equal(simulateHunt(hunt, overwhelming).result, 'fainted');
  assert.notEqual(simulateHunt(hunt, none).fights[0].won, false);
  const threat = estimateThreat({ character, equipped, hp: 9999, areaId: 'viper-heaps' }, overwhelming);
  assert.ok(Object.values(threat).every((level) => level === 'very-high'), JSON.stringify(threat));
  // A lower place keeps its creatures as they were.
  const lower = { ...hunt, areaId: 'raven-hollows' };
  assert.deepEqual(simulateHunt(lower, overwhelming), simulateHunt(lower, none));
  // A fight outside explorations (the Wieże, events, the Bestia Gildii)
  // builds its creatures without the curve.
  const [tower] = encounterCombatants({ members: [{ monsterId, level: 40 }] }, overwhelming);
  assert.equal(tower.maxHp, monsterCombatant({ monsterId, level: 40, id: 'e0' }, content).maxHp);
});
