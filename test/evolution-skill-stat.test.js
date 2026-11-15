// The evolution's stat in its skills (986 B, the author's choice after a
// player asked why the Nekromanta's Intelekt "nic nie daje"): the evolution
// skills of an evolution whose growth gives a stat its weapon does not use
// (evolutions.json skillStat) scale with the weapon's stat and twice that
// stat together (balance.json skills.skillStatWeight), once in the players'
// duels (987 B); its plain blows and every other evolution stay as they
// were, and the stats' preview shows what the stat gives. Since 988 no
// evolution of the game has one: their weapons hit with that stat
// (evolution-gear.test.js). The rule stays, checked on a Królobójca given
// Percepcja for it.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { computeStats, damageScale, duelist, playerCombatant, statShares } from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';

// The game's data with the Królobójca's skills growing with its Percepcja.
const marked = { ...content.evolutionsById.kingslayer, skillStat: 'perception' };
const withStat = { ...content, evolutions: content.evolutions.map((one) => (one.id === 'kingslayer' ? marked : one)), evolutionsById: { ...content.evolutionsById, kingslayer: marked } };
const withWeight = (weight) => ({ ...withStat, balance: { ...withStat.balance, skills: { ...withStat.balance.skills, skillStatWeight: weight } } });
const kingslayer = () => playerOf('realistic', 'shadow', 150, withStat, 0, 'backstab');

describe('Statystyka ewolucji w jej umiejętnościach (986 B)', () => {
  test('since 988 no evolution has one: the eleven of 986 B hit with that stat', () => {
    assert.deepEqual(content.evolutions.filter((evolution) => evolution.skillStat).map((evolution) => evolution.id), []);
    assert.equal(content.balance.skills.skillStatWeight, 2);
  });

  test("an evolution's skills grow with its stat, counted twice beside the weapon's; its plain blows do not", () => {
    const { character, equipped } = kingslayer();
    assert.equal(character.evolution, 'kingslayer');
    const unit = playerCombatant({ character, equipped, name: 'Mira' }, withStat);
    const flat = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(0));
    const power = unit.skillPower;
    const { totals } = computeStats(character, equipped, withStat);
    const expected = damageScale(totals.dexterity + 2 * totals.perception, character.level, withStat.balance) / damageScale(totals.dexterity, character.level, withStat.balance);
    assert.ok(power > 1.01 && power < 2, String(power));
    assert.ok(Math.abs(power - expected) < 1e-9, `${power} ${expected}`);
    assert.equal(flat.skillPower, 1);
    assert.equal(unit.damageScale, flat.damageScale);
    for (const skill of unit.skills) {
      const before = flat.skills.find((one) => one.id === skill.id);
      if (!withStat.skillsById[skill.id].evolution) {
        assert.deepEqual(skill.params, before.params, skill.id);
        continue;
      }
      for (const key of ['power', 'single', 'dotPower', 'chainPower']) {
        if (typeof before.params[key] === 'number') assert.ok(Math.abs(skill.params[key] - before.params[key] * power) < 1e-9, `${skill.id} ${key}`);
      }
      // What is not the blows' strength stays.
      for (const key of ['turns', 'hp', 'decay', 'dotTicks']) if (key in before.params) assert.equal(skill.params[key], before.params[key], `${skill.id} ${key}`);
    }
  });

  test("once in the players' duels: the Arena and the guild wars build their fighters with duelSkillStatWeight", () => {
    const { character, equipped } = kingslayer();
    assert.equal(withStat.balance.skills.duelSkillStatWeight, 1);
    const fighter = duelist({ character, equipped, name: 'Mira' }, 'a0', 'ally', { factor: 1, armor: 1 }, withStat);
    const { totals } = computeStats(character, equipped, withStat);
    const once = damageScale(totals.dexterity + totals.perception, character.level, withStat.balance) / damageScale(totals.dexterity, character.level, withStat.balance);
    assert.ok(Math.abs(fighter.skillPower - once) < 1e-9, `${fighter.skillPower} ${once}`);
    assert.ok(fighter.skillPower > 1 && fighter.skillPower < playerCombatant({ character, equipped, name: 'Mira' }, withStat).skillPower);
    const single = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(1));
    for (const skill of fighter.skills) assert.deepEqual(skill.params, single.skills.find((one) => one.id === skill.id).params, skill.id);
  });

  test("the stats' preview: the stat gives the evolution's skills; a Mag's Intelekt its blows as before", () => {
    const { character, equipped } = kingslayer();
    const shares = statShares(character, equipped, withStat);
    assert.ok(shares.perception.skillPower > 0, JSON.stringify(shares.perception));
    const mage = playerOf('realistic', 'mage', 150, content);
    const mageShares = statShares(mage.character, mage.equipped, content);
    assert.equal(mageShares.intellect.skillPower, undefined);
    assert.ok(mageShares.intellect.damage > 0);
  });
});
