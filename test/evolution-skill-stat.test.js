// The evolution's stat in its skills (986 B, the author's choice after a
// player asked why the Nekromanta's Intelekt "nic nie daje"): the evolution
// skills of an evolution whose growth gives a stat its weapon does not use
// (evolutions.json skillStat) scale with the weapon's stat and twice that
// stat together (balance.json skills.skillStatWeight); its plain blows and
// every other evolution stay as they were, and the stats' preview shows
// what the stat gives.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { computeStats, damageScale, duelist, playerCombatant, statShares } from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';

const withWeight = (weight) => ({ ...content, balance: { ...content.balance, skills: { ...content.balance.skills, skillStatWeight: weight } } });

describe('Statystyka ewolucji w jej umiejętnościach (986 B)', () => {
  test('the eleven evolutions have the stat their growth gives and their weapon does not use', () => {
    const marked = content.evolutions.filter((evolution) => evolution.skillStat).map((evolution) => evolution.id).sort();
    assert.deepEqual(marked, ['grand-inquisitor', 'hunter', 'inquisitor', 'lich', 'master-hunter', 'necromancer', 'perun-chosen', 'poisoner', 'storm-archer', 'thunder-lord', 'wild-lord']);
    for (const evolution of content.evolutions.filter((one) => one.skillStat)) {
      assert.ok(evolution.growth[evolution.skillStat] > 0, evolution.id);
      assert.equal(content.balance.skills.skillStatWeight, 2);
    }
  });

  test('a Nekromanta\'s evolution skills grow with its Intelekt, counted twice beside its Zręczność; its plain blows do not', () => {
    const { character, equipped } = playerOf('realistic', 'shadow', 150, content, 0, 'poisoned-blade');
    assert.equal(character.evolution, 'necromancer');
    const unit = playerCombatant({ character, equipped, name: 'Mira' }, content);
    const flat = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(0));
    const intellect = unit.skillPower;
    const { totals } = computeStats(character, equipped, content);
    const expected = damageScale(totals.dexterity + 2 * totals.intellect, character.level, content.balance) / damageScale(totals.dexterity, character.level, content.balance);
    assert.ok(intellect > 1.03 && intellect < 1.3, String(intellect));
    assert.ok(Math.abs(intellect - expected) < 1e-9, `${intellect} ${expected}`);
    assert.equal(flat.skillPower, 1);
    assert.equal(unit.damageScale, flat.damageScale);
    for (const skill of unit.skills) {
      const before = flat.skills.find((one) => one.id === skill.id);
      if (!content.skillsById[skill.id].evolution) {
        assert.deepEqual(skill.params, before.params, skill.id);
        continue;
      }
      for (const key of ['power', 'single', 'dotPower', 'chainPower']) {
        if (typeof before.params[key] === 'number') assert.ok(Math.abs(skill.params[key] - before.params[key] * intellect) < 1e-9, `${skill.id} ${key}`);
      }
      // What is not the blows' strength stays.
      for (const key of ['turns', 'hp', 'decay', 'dotTicks']) if (key in before.params) assert.equal(skill.params[key], before.params[key], `${skill.id} ${key}`);
    }
  });

  // The players' duels keep their balance until the author decides (the
  // Arena's third forms: the Licz from 64% to 72% of its duels and the
  // Arcydruid from 27% to 24% with it).
  test('not in the players\' duels: the Arena and the guild wars build their fighters without it', () => {
    const { character, equipped } = playerOf('realistic', 'shadow', 150, content, 0, 'poisoned-blade');
    const fighter = duelist({ character, equipped, name: 'Mira' }, 'a0', 'ally', { factor: 1, armor: 1 }, content);
    assert.equal(fighter.skillPower, 1);
    const flat = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(0));
    for (const skill of fighter.skills) assert.deepEqual(skill.params, flat.skills.find((one) => one.id === skill.id).params, skill.id);
  });

  test('the stats\' preview: Intelekt gives a Nekromanta\'s evolution skills, a Mag\'s Intelekt its blows as before', () => {
    const necro = playerOf('realistic', 'shadow', 150, content, 0, 'poisoned-blade');
    const shares = statShares(necro.character, necro.equipped, content);
    assert.ok(shares.intellect.skillPower > 0.03, JSON.stringify(shares.intellect));
    assert.equal(shares.intellect.damage, undefined);
    const mage = playerOf('realistic', 'mage', 150, content);
    const mageShares = statShares(mage.character, mage.equipped, content);
    assert.equal(mageShares.intellect.skillPower, undefined);
    assert.ok(mageShares.intellect.damage > 0);
  });
});
