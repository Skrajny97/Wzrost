// Monsters grow stronger again from level 50, where companions and
// evolutions are in full play (the author: "Od 50 lvla zwiększamy curve
// trudności, bo wchodza na pełnej i towarzysze i ewolucje"), and once more
// from 100, past the second evolution, as the characters' skills and gear
// keep growing (endGame; the author: "od 100ego być mid"): each stage
// evenly up to its top level and in full beyond it, nothing below its
// first level.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { monsterCombatant } from '../src/engine/index.js';
import { content } from './helpers/content.js';

// The content with one stage of the monsters' growth set to `values`.
const withStage = (stage, values) => ({ ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, [stage]: { ...content.balance.monsters[stage], ...values } } } });
const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);
const monster = (level, data) => monsterCombatant({ monsterId, level, id: 'a' }, data);

// A stage adds nothing up to its first level, then its share of the way to
// its top level: the HP (rounded) by its `hp`, the blows by its `damage`.
function assertRamp(stage, flatLevels, shares) {
  const values = { damage: 0.4, hp: 0.3 };
  const grown = withStage(stage, values);
  const flat = withStage(stage, { damage: 0, hp: 0 });
  for (const level of flatLevels) {
    const [now, before] = [monster(level, grown), monster(level, flat)];
    assert.equal(now.maxHp, before.maxHp, `HP at ${level}`);
    assert.deepEqual([now.weapon.min, now.weapon.max], [before.weapon.min, before.weapon.max], `damage at ${level}`);
  }
  for (const [level, share] of shares) {
    const [now, before] = [monster(level, grown), monster(level, flat)];
    assert.ok(Math.abs(now.maxHp / before.maxHp - (1 + values.hp * share)) < 0.01, `HP at ${level}: ${now.maxHp} / ${before.maxHp}`);
    assert.ok(Math.abs(now.weapon.max / before.weapon.max - (1 + values.damage * share)) < 1e-9, `damage at ${level}`);
  }
}

test('the stages as they stand: from 50 to 100 (×3 at 100 against the +25% before), and from 100 to 200', () => {
  const { lateGame, endGame } = content.balance.monsters;
  assert.deepEqual([lateGame.fromLevel, lateGame.toLevel, lateGame.damage, lateGame.hp], [50, 100, 2.75, 2.75]);
  assert.deepEqual([endGame.fromLevel, endGame.toLevel, endGame.damage, endGame.hp], [100, 200, 0.35, 0.35]);
});

test('the late-game ramp: nothing up to 50, a half at 75, in full from 100', () => {
  assertRamp('lateGame', [10, 30, 50], [
    [75, 0.5],
    [100, 1],
    [150, 1],
  ]);
});

test('the end-game ramp: nothing up to 100, a half at 150, in full from 200', () => {
  assertRamp('endGame', [10, 50, 75, 100], [
    [150, 0.5],
    [200, 1],
    [300, 1],
  ]);
});

test('the stages add up: at 150 a monster has both, one on top of the other', () => {
  const both = withStage('endGame', { damage: 0.4, hp: 0.3 });
  const lateGame = { ...both.balance.monsters.lateGame, damage: 0.5, hp: 0.6 };
  const grown = { ...both, balance: { ...both.balance, monsters: { ...both.balance.monsters, lateGame } } };
  const flat = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, lateGame: { ...lateGame, damage: 0, hp: 0 }, endGame: { ...content.balance.monsters.endGame, damage: 0, hp: 0 } } } };
  const [now, before] = [monster(150, grown), monster(150, flat)];
  assert.ok(Math.abs(now.weapon.max / before.weapon.max - 1.5 * 1.2) < 1e-9);
  assert.ok(Math.abs(now.maxHp / before.maxHp - 1.6 * 1.15) < 0.01);
});
