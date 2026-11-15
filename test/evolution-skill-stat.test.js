// The evolution's stat in its skills (986 B, the author's choice after a
// player asked why the Nekromanta's Intelekt "nic nie daje"; since 988 the
// Nekromanta and the Licz count their Zręczność as Intelekt and hit with
// kostury, evolution-gear.test.js): the evolution
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
  test('the nine evolutions have the stat their growth gives and their weapon does not use', () => {
    const marked = content.evolutions.filter((evolution) => evolution.skillStat).map((evolution) => evolution.id).sort();
    assert.deepEqual(marked, ['grand-inquisitor', 'hunter', 'inquisitor', 'master-hunter', 'perun-chosen', 'poisoner', 'storm-archer', 'thunder-lord', 'wild-lord']);
    for (const evolution of content.evolutions.filter((one) => one.skillStat)) {
      assert.ok(evolution.growth[evolution.skillStat] > 0, evolution.id);
      assert.equal(content.balance.skills.skillStatWeight, 2);
    }
  });

  test('a Władca Piorunów\'s evolution skills grow with its Intelekt, counted twice beside its Zręczność; its plain blows do not', () => {
    const { character, equipped } = playerOf('realistic', 'archer', 150, content, 0, 'arrow-rain');
    assert.equal(character.evolution, 'thunder-lord');
    const unit = playerCombatant({ character, equipped, name: 'Mira' }, content);
    const flat = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(0));
    const intellect = unit.skillPower;
    const { totals } = computeStats(character, equipped, content);
    const expected = damageScale(totals.dexterity + 2 * totals.intellect, character.level, content.balance) / damageScale(totals.dexterity, character.level, content.balance);
    assert.ok(intellect > 1.01 && intellect < 1.3, String(intellect));
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

  // In the players' duels the stat counts once (987 B: twice, the Licz won
  // 72% of the Arena's third-form duels and the Arcydruid 24%).
  test('once in the players\' duels: the Arena and the guild wars build their fighters with duelSkillStatWeight', () => {
    const { character, equipped } = playerOf('realistic', 'archer', 150, content, 0, 'arrow-rain');
    assert.equal(content.balance.skills.duelSkillStatWeight, 1);
    const fighter = duelist({ character, equipped, name: 'Mira' }, 'a0', 'ally', { factor: 1, armor: 1 }, content);
    const { totals } = computeStats(character, equipped, content);
    const once = damageScale(totals.dexterity + totals.intellect, character.level, content.balance) / damageScale(totals.dexterity, character.level, content.balance);
    assert.ok(Math.abs(fighter.skillPower - once) < 1e-9, `${fighter.skillPower} ${once}`);
    assert.ok(fighter.skillPower > 1 && fighter.skillPower < playerCombatant({ character, equipped, name: 'Mira' }, content).skillPower);
    const single = playerCombatant({ character, equipped, name: 'Mira' }, withWeight(1));
    for (const skill of fighter.skills) assert.deepEqual(skill.params, single.skills.find((one) => one.id === skill.id).params, skill.id);
  });

  test('the stats\' preview: Intelekt gives a Władca Piorunów\'s evolution skills, a Mag\'s Intelekt its blows as before', () => {
    const storm = playerOf('realistic', 'archer', 150, content, 0, 'arrow-rain');
    const shares = statShares(storm.character, storm.equipped, content);
    assert.ok(shares.intellect.skillPower > 0, JSON.stringify(shares.intellect));
    assert.equal(shares.intellect.damage, undefined);
    const mage = playerOf('realistic', 'mage', 150, content);
    const mageShares = statShares(mage.character, mage.equipped, content);
    assert.equal(mageShares.intellect.skillPower, undefined);
    assert.ok(mageShares.intellect.damage > 0);
  });
});
