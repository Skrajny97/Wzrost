// Class evolutions: the choices of the two paths, what an evolution asks
// for, the skills and points after it, the growth of the stats, HP and mana
// from the next class level on, and the class's new name.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  classNameOf,
  computeStats,
  evolutionChoices,
  evolutionView,
  evolveBlock,
  evolvedSkills,
  learnedSkills,
  perClassLevelOf,
  raiseBlock,
  skillPoints,
  skillsView,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';

const warrior = (classLevel, skills, extra = {}) => ({ classId: 'warrior', level: 50, xp: 0, classLevel, classXp: 0, points: {}, skills, ...extra });
const ready = (classLevel = 50) => warrior(classLevel, { 'power-strike': 20, unyielding: 20 });

describe('class evolutions in the engine', () => {
  test('every class has an evolution for each of its paths, and a character chooses from those of its two, the main one first', () => {
    for (const cls of content.classes) {
      const paths = content.skills.filter((skill) => skill.classId === cls.id).map((skill) => skill.id);
      assert.deepEqual(content.evolutions.filter((evolution) => evolution.classId === cls.id).map((evolution) => evolution.path), paths);
    }
    assert.deepEqual(evolutionChoices(ready(), content).map((evolution) => evolution.name), ['Barbarzyńca', 'Strażnik']);
    assert.deepEqual(evolutionChoices(warrior(50, { unyielding: 20, 'wide-sweep': 20 }), content).map((evolution) => evolution.id), ['guardian', 'gladiator']);
    assert.equal(evolutionChoices(ready(), content, { all: true }).length, 3);
  });

  test('an evolution waits for class level 50 and both paths ready, it is one of the two, and it is taken once; the test lifts the level', () => {
    assert.equal(evolveBlock(ready(49), 'barbarian', content).code, 'class_level');
    assert.equal(evolveBlock(warrior(50, { 'power-strike': 20 }), 'barbarian', content).code, 'second_path');
    assert.equal(evolveBlock(warrior(50, { 'power-strike': 20, unyielding: 10 }), 'barbarian', content).code, 'skill_points');
    assert.equal(evolveBlock(ready(), 'gladiator', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(ready(), 'sniper', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(ready(), 'guardian', content), null);
    assert.equal(evolveBlock({ ...ready(), evolution: 'guardian' }, 'barbarian', content).code, 'evolved');
    assert.equal(evolveBlock(warrior(12, { 'power-strike': 3 }), 'gladiator', content, { test: true }), null);
  });

  test('after it the two skills of the evolution start at 0 with the points back, and class levels 50–99 bring 50 more: 45 and 45', () => {
    const evolved = { ...ready(), evolution: 'barbarian', skills: evolvedSkills('barbarian', content) };
    assert.deepEqual(evolved.skills, { 'crushing-blow': 0, 'blood-frenzy': 0 });
    assert.deepEqual(skillPoints(evolved, content), { earned: 41, spent: 0, free: 41 });
    assert.equal(skillPoints({ ...evolved, classLevel: 99 }, content).earned, 90);
    assert.equal(skillPoints({ ...evolved, classLevel: 140 }, content).earned, 90);
    assert.deepEqual(learnedSkills(evolved, content), []);
    assert.equal(raiseBlock(evolved, 'crushing-blow', content), null);
    assert.equal(raiseBlock({ ...evolved, skills: { 'crushing-blow': 45, 'blood-frenzy': 0 } }, 'crushing-blow', content).code, 'max_level');
    const view = skillsView(evolved, content);
    assert.deepEqual(view.pools.map((pool) => pool.options.map((skill) => [skill.name, skill.state, skill.maxLevel])), [
      [
        ['Druzgocący cios', 'main', 45],
        ['Krwawy szał', 'second', 45],
      ],
    ]);
    assert.equal(view.points, 41);
    assert.deepEqual(view.evolution, { level: 100, need: 'skill_points' });
  });

  test('the evolution grows the stats from class level 51 on, and the Arkanista more mana', () => {
    const plain = computeStats(warrior(60, {}), [], content).totals;
    const barbarian = computeStats(warrior(60, {}, { evolution: 'barbarian' }), [], content).totals;
    assert.equal(barbarian.strength - plain.strength, 10);
    assert.equal(barbarian.vitality, plain.vitality);
    assert.equal(computeStats(warrior(50, {}, { evolution: 'barbarian' }), [], content).totals.strength, computeStats(warrior(50, {}), [], content).totals.strength);
    const mage = { classId: 'mage', level: 50, classLevel: 60, points: {}, skills: {}, evolution: 'arcanist' };
    const perLevel = perClassLevelOf(mage, content);
    assert.equal(Math.round(perLevel.mana * 60), 3 * 50 + 4 * 10);
    assert.deepEqual(perClassLevelOf({ ...mage, evolution: 'ice-lord' }, content), content.classesById.mage.perClassLevel);
  });

  test('the class goes by the evolution\'s name, and its card shows the growth, trait and skills at the top level', () => {
    assert.equal(classNameOf(ready(), content), 'Wojownik');
    assert.equal(classNameOf({ ...ready(), evolution: 'barbarian' }, content), 'Barbarzyńca');
    const card = evolutionView(content.evolutionsById.barbarian, content);
    assert.deepEqual(card.growth.map((entry) => `${entry.name} ${entry.value}`), ['Siła 3', 'Witalność 2', 'Wytrzymałość 2']);
    assert.equal(card.trait.name, 'Furia');
    assert.equal(card.pathName, 'Potężny cios');
    assert.equal(card.skills[0].from, 'Potężny cios');
    assert.equal(card.skills[0].effect, 'Cios za 260% obrażeń, który pomija 50% pancerza celu. Cel ma 25% szans stracić najbliższy ruch.');
  });
});
