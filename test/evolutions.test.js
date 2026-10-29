// Class evolutions: the choices of the two paths, what an evolution asks
// for, the skills and points after it, the growth of the stats, HP and mana
// from the next class level on, and the class's new name.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

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
import { useServer } from './helpers/server.js';

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

describe('class evolutions through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('ewolucja'));
    await call('POST', '/api/character', { cookie, body: { name: 'Ewolucja', classId: 'warrior', appearance: 'male' } });
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  test('at class level 50 with both paths ready the character sees its two evolutions, takes one for good and gets the points back', async () => {
    await set(`level = 50, class_level = 49, skills = '{"power-strike":20,"unyielding":20}'`);
    assert.deepEqual((await character()).evolution, { current: null, choices: [] });
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'barbarian' } })).data.error.code, 'class_level');
    await set('class_level = 50');
    const before = await character();
    assert.deepEqual(before.evolution.choices.map((choice) => choice.name), ['Barbarzyńca', 'Strażnik']);
    assert.equal(before.skills.evolution.need, 'evolve');
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'gladiator' } })).status, 400);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'barbarian' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    const after = taken.data.character;
    assert.equal(after.className, 'Barbarzyńca');
    assert.equal(after.baseClassName, 'Wojownik');
    assert.equal(after.evolution.current.trait.name, 'Furia');
    assert.equal(after.skills.points, 41);
    assert.deepEqual(after.skills.pools[0].options.map((skill) => [skill.id, skill.level]), [
      ['crushing-blow', 0],
      ['blood-frenzy', 0],
    ]);
    assert.equal(after.evolutionUndo, false);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'guardian' } })).data.error.code, 'evolved');
    const raised = await call('POST', '/api/skills/raise', { cookie, body: { skillId: 'crushing-blow' } });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.skills.points, 40);
    assert.equal((await call('POST', '/api/evolution/undo', { cookie })).data.error.code, 'no_test_evolution');
  });

  test('on the test version any evolution of the class can be tried at any level and undone, back to the skills it had', async () => {
    await set(`level = 20, class_level = 15, skills = '{"wide-sweep":6}'`);
    const tried = await call('GET', '/api/evolution/test', { cookie });
    assert.deepEqual(tried.data.evolutions.map((evolution) => evolution.id), ['barbarian', 'gladiator', 'guardian']);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'guardian', test: true } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.character.className, 'Strażnik');
    assert.equal(taken.data.character.evolutionUndo, true);
    const undone = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(undone.status, 200, JSON.stringify(undone.data));
    assert.equal(undone.data.character.className, 'Wojownik');
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT skills FROM characters').first()).skills), { 'wide-sweep': 6 });
  });
});
