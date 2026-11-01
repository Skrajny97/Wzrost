// Monsters grow stronger again from level 50, where companions and
// evolutions are in full play (the author: "Od 50 lvla zwiększamy curve
// trudności, bo wchodza na pełnej i towarzysze i ewolucje"): up to +25% HP
// and damage at level 100, as through the mid-game, nothing below 50.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { monsterCombatant } from '../src/engine/index.js';
import { content } from './helpers/content.js';

const without = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, lateGame: { ...content.balance.monsters.lateGame, damage: 0, hp: 0 } } } };
const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);
const both = (level) => [monsterCombatant({ monsterId, level, id: 'a' }, content), monsterCombatant({ monsterId, level, id: 'b' }, without)];

test('the late-game ramp: nothing up to 50, a half at 75, +25% from 100', () => {
  const late = content.balance.monsters.lateGame;
  assert.deepEqual([late.fromLevel, late.toLevel, late.damage, late.hp], [50, 100, 0.25, 0.25]);
  for (const level of [10, 30, 50]) {
    const [now, before] = both(level);
    assert.equal(now.maxHp, before.maxHp, `HP at ${level}`);
    assert.deepEqual(now.damage, before.damage, `damage at ${level}`);
  }
  for (const [level, share] of [
    [75, 0.125],
    [100, 0.25],
    [150, 0.25],
  ]) {
    const [now, before] = both(level);
    assert.ok(Math.abs(now.maxHp / before.maxHp - (1 + share)) < 0.01, `HP at ${level}: ${now.maxHp} / ${before.maxHp}`);
  }
});
