// Companions evolve (896 A; the author, 13.11.2026): at their 50th, 100th
// and 200th level, by themselves, along the path of the first skill on
// their card, with the form's name, trait, growth and two skills, which
// grow with the level from where the class's left off; their look stays
// their own, and a tracker's trait brings its materials as a character's.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  companionCharacter,
  companionClassName,
  companionCombatant,
  companionForm,
  companionSkillLevel,
  companionSkills,
  trackerMaterials,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

/** A hired companion of `classId` at `level` with `skills`. */
const companion = (classId, level, skills, appearance = 'male') => ({
  id: 'w1:0',
  name: 'Testowy',
  appearance,
  classId,
  level,
  xp: 0,
  traits: [],
  skills,
  profession: null,
  story: 0,
  gear: [],
});

const cleric = (level, appearance) => companion('cleric', level, ['prayer-of-health', 'exorcism'], appearance);
const third = content.evolutions.some((evolution) => evolution.stage === 3);

describe('companion evolution (896 A)', () => {
  test('below the first evolution level a companion keeps its class and skills', () => {
    const young = cleric(49);
    assert.equal(companionForm(young, content), null);
    assert.deepEqual(companionSkills(young, content), ['prayer-of-health', 'exorcism']);
    assert.deepEqual(companionClassName(young, content), { name: content.classesById.cleric.name, base: null });
    assert.equal(companionCharacter(young, content).evolution, undefined);
  });

  test('at 50 it takes the first evolution of its first skill, at 100 and 200 the forms after it', () => {
    assert.equal(companionForm(cleric(50), content)?.id, 'healer');
    assert.equal(companionForm(cleric(99), content)?.id, 'healer');
    assert.equal(companionForm(cleric(100), content)?.id, 'miracle-worker');
    assert.equal(companionForm(cleric(200), content)?.id, third ? 'saint' : 'miracle-worker');
    // The first skill decides, not the order of the class's paths.
    assert.equal(companionForm(companion('cleric', 50, ['blessing', 'prayer-of-health']), content)?.id, 'priest');
  });

  test('without an evolution for its first skill it follows its second', () => {
    assert.equal(companionForm(companion('cleric', 50, ['no-such-skill', 'exorcism']), content)?.id, 'inquisitor');
  });

  test('every skill a candidate can come with has a first evolution of its class', () => {
    for (const skill of content.skills) {
      const first = content.evolutions.find((evolution) => evolution.classId === skill.classId && !evolution.from && evolution.path === skill.id);
      assert.ok(first, `${skill.id} (${skill.classId}) has no evolution`);
    }
  });

  test('the form’s skills replace the class’s and go on from the level the class’s had', () => {
    const evolved = cleric(50);
    assert.deepEqual(companionSkills(evolved, content), content.evolutionsById.healer.skills);
    const before = companionSkillLevel('prayer-of-health', 49, content);
    const after = companionSkillLevel('renewal', 50, content);
    assert.ok(after >= before, `renewal at 50 (${after}) is below prayer of health at 49 (${before})`);
    assert.equal(after, 1 + Math.floor((50 - content.balance.skills.unlockClassLevel) / content.settlement.companions.skillStep));
    // A form's skill is not known before its form.
    assert.equal(companionSkillLevel('renewal', 49, content), 0);
    // Never above the skill's top level.
    const top = content.skillsById['great-renewal'].maxLevel;
    assert.equal(companionSkillLevel('great-renewal', content.balance.progression.maxLevel, content), Math.min(top, 1 + Math.floor((content.balance.progression.maxLevel - 10) / 4)));
    const character = companionCharacter(evolved, content);
    assert.equal(character.evolution, 'healer');
    assert.deepEqual(Object.keys(character.skills).sort(), [...content.evolutionsById.healer.skills].sort());
  });

  test('in a fight it has its form’s trait and no form portrait', () => {
    const unit = companionCombatant(cleric(50), {}, content);
    assert.equal(unit.feat?.kind, content.evolutionsById.healer.trait.kind);
    assert.equal('evolution' in unit, false);
    assert.equal(unit.companion, true);
    // The form's growth from the level after 50 makes it no weaker than its class would be.
    const asClass = companionCombatant(cleric(49), {}, content);
    assert.ok(unit.maxHp >= asClass.maxHp);
  });

  test('its class goes by its form’s name, a woman’s where the form has one, with the class beside it', () => {
    const named = companionClassName(cleric(100, 'female'), content);
    assert.equal(named.name, content.evolutionsById['miracle-worker'].nameFemale);
    assert.equal(named.base, content.classesById.cleric.name);
    assert.equal(companionClassName(cleric(50, 'male'), content).name, content.evolutionsById.healer.name);
  });

  test('a tracker’s trait on a companion brings more materials, the most of the party once', () => {
    const plain = newCharacter('warrior', { level: 60, classLevel: 60 });
    const hunter = companion('archer', 60, ['pinning-shot', 'aimed-shot']);
    assert.equal(trackerMaterials(plain, [], content), 0);
    assert.equal(trackerMaterials(plain, [hunter], content), content.evolutionsById.hunter.trait.params.materials);
    const master = { ...hunter, level: 100 };
    assert.equal(trackerMaterials(plain, [hunter, master], content), content.evolutionsById['master-hunter'].trait.params.materials);
    // The character's own tracker counts too, the larger one wins.
    const huntingCharacter = newCharacter('archer', { level: 60, classLevel: 60, evolution: 'hunter' });
    assert.equal(trackerMaterials(huntingCharacter, [master], content), content.evolutionsById['master-hunter'].trait.params.materials);
  });
});
