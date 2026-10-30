// Class evolutions: the choices of the two paths, what an evolution asks
// for, the skills and points after it, the growth of the stats, HP and mana
// from the next class level on, the class's new name, and the evolutions'
// skills and traits in fights.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  classNameOf,
  computeStats,
  createRng,
  evolutionChoices,
  evolutionView,
  evolveBlock,
  evolvedSkills,
  learnedSkills,
  monsterCombatant,
  perClassLevelOf,
  playerCombatant,
  raiseBlock,
  simulateFight,
  skillDemo,
  skillPoints,
  skillsView,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
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
    // The author's words for the ceremony.
    assert.equal(content.evolutionTexts.ceremonyLine, 'Twoja nowa klasa to: {name}. Rozdaj Punkty Umiejętności na nowe zdolności.');
  });
});

describe('class evolutions in fights', () => {
  // An evolved character of level 60 with the evolution's skills at
  // `skillLevel` (`only`: just these of them).
  function evolved(evolutionId, { skillLevel = 30, hpShare, only, classLevel = 60, id = 'a0', position } = {}) {
    const evolution = content.evolutionsById[evolutionId];
    const { character, equipped } = typicalCharacter(evolution.classId, 60, content);
    const skills = Object.fromEntries(evolution.skills.filter((skill) => !only || only.includes(skill)).map((skill) => [skill, skillLevel]));
    const unit = playerCombatant({ character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: evolution.name, id }, content);
    return { ...unit, ...(position && { position }), ...(hpShare !== undefined && { hp: Math.round(unit.maxHp * hpShare) }) };
  }
  const foe = (monsterId, level, id) => monsterCombatant({ monsterId, level, id }, content);
  // A foe that does not fall quickly, so a fight lasts many moves.
  const sturdy = (monsterId, level, id) => ({ ...foe(monsterId, level, id), hp: 20000, maxHp: 20000 });
  const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
  const blows = (result, actor) => result.events.filter((event) => event.actor === actor && ['hit', 'crit'].includes(event.kind) && !event.counter);

  test('every evolution skill works in fights, and the account has no gaps in its texts', () => {
    for (const evolution of content.evolutions) {
      const used = new Set();
      for (let seed = 0; seed < 10; seed++) {
        const enemies = seed % 2 ? [foe('wolf', 56, 'e0'), foe('wolf', 56, 'e1'), foe('crow', 56, 'e2')] : [foe('boar', 58, 'e0')];
        const result = fight(`ewolucja:${evolution.id}:${seed}`, [evolved(evolution.id, { hpShare: seed % 3 === 2 ? 0.45 : 1 })], enemies);
        for (const event of result.events) {
          if (event.skill) used.add(event.skill);
          assert.doesNotMatch(event.text, /undefined|NaN|\{\w+\}/, `${evolution.id}: ${event.text}`);
        }
      }
      // The miracle waits for a faint (its own test below).
      for (const id of evolution.skills.filter((skill) => skill !== 'miracle')) assert.ok(used.has(id), `${evolution.id}: ${id}`);
    }
  });

  test('the author\'s preview shows every evolution skill in its fight', () => {
    for (const skill of content.evolutionSkills) {
      const demo = skillDemo(skill.id, content);
      assert.ok(demo.events.some((event) => event.skill === skill.id), skill.id);
    }
    // The miracle is shown by the fight it turns: the risen character wins.
    assert.equal(skillDemo('miracle', content).won, true);
  });

  test('a summon stands before its summoner and takes the foes\' blows until it falls or goes', () => {
    const result = fight('przywołanie', [evolved('arcanist', { only: ['elemental-summon'] })], [sturdy('wolf', 58, 'e0')]);
    const up = result.events.findIndex((event) => event.kind === 'summon' && event.state === 'up');
    assert.ok(up >= 0);
    const end = result.events.findIndex((event, index) => index > up && event.kind === 'summon' && ['fell', 'gone'].includes(event.state));
    assert.ok(end > up);
    const meanwhile = result.events.slice(up, end);
    assert.ok(meanwhile.some((event) => event.kind === 'summon' && event.state === 'hit' && event.actor === 'e0'));
    assert.ok(!meanwhile.some((event) => ['hit', 'crit', 'dodge'].includes(event.kind) && event.target === 'a0'));
    assert.ok(meanwhile.some((event) => event.kind === 'hit' && event.actor === 'a0' && event.skill === 'elemental-summon'));
  });

  test('a challenge draws every foe\'s blow to the challenger, who throws a share of each back', () => {
    const mage = { ...evolved('ice-lord', { only: [], id: 'a1' }), position: 'back' };
    const result = fight('wyzwanie', [evolved('guardian', { only: ['challenge'] }), mage], [sturdy('wolf', 58, 'e0'), sturdy('crow', 58, 'e1')]);
    const start = result.events.findIndex((event) => event.kind === 'skill' && event.skill === 'challenge');
    const end = result.events.findIndex((event, index) => index > start && event.kind === 'fade' && event.skill === 'challenge');
    assert.ok(start >= 0 && end > start);
    const meanwhile = result.events.slice(start, end).filter((event) => event.actor?.startsWith('e') && ['hit', 'crit', 'dodge'].includes(event.kind));
    assert.ok(meanwhile.length > 0);
    for (const event of meanwhile) assert.equal(event.target, 'a0');
    const reflects = result.events.slice(start, end).filter((event) => event.kind === 'reflect');
    assert.ok(reflects.length > 0 && reflects.every((event) => event.actor === 'a0' && event.damage > 0));
  });

  test('a miracle raises the fainted once a fight, and Riposta answers a dodge with a bleeding blow', () => {
    const raised = fight('cud', [evolved('healer', { only: ['miracle'], hpShare: 0.05 })], [sturdy('boar', 60, 'e0')]);
    const miracles = raised.events.filter((event) => event.skill === 'miracle');
    assert.equal(miracles.length, 1);
    assert.ok(miracles[0].hp > 0);
    assert.ok(raised.events.indexOf(miracles[0]) < raised.events.length - 1);
    // A warrior seldom dodges: the first of a few fights where it does.
    const dodged = (result) => result.events.findIndex((event) => event.kind === 'dodge' && event.target === 'a0');
    const gladiator = Array.from({ length: 10 }, (_, seed) => fight(`riposta${seed}`, [evolved('gladiator', { only: ['riposte'] })], [sturdy('wolf', 58, 'e0')])).find((result) => dodged(result) >= 0);
    const dodge = dodged(gladiator);
    const answer = gladiator.events[dodge + 1];
    assert.equal(answer.actor, 'a0');
    assert.equal(answer.counter, true);
    assert.equal(answer.skill, 'riposte');
    assert.ok(gladiator.events.some((event) => event.kind === 'effect' && event.effect === 'Krwawienie'));
  });

  test('Riposta raises the dodge by 15 percentage points for the whole fight', () => {
    // The share of the wolf's blows at the gladiator that miss, over a few fights.
    const missed = (only) => {
      let dodges = 0;
      let blows = 0;
      for (let seed = 0; seed < 20; seed++) {
        for (const event of fight(`riposta-unik${seed}`, [evolved('gladiator', { only })], [sturdy('wolf', 58, 'e0')]).events) {
          if (event.actor !== 'e0' || event.target !== 'a0' || !['dodge', 'hit', 'crit'].includes(event.kind)) continue;
          blows += 1;
          if (event.kind === 'dodge') dodges += 1;
        }
      }
      return dodges / blows;
    };
    assert.ok(missed(['riposte']) - missed([]) > 0.08);
    const start = fight('riposta-tekst', [evolved('gladiator', { only: ['riposte'] })], [sturdy('wolf', 58, 'e0')]).events.find((event) => event.kind === 'skill' && event.skill === 'riposte');
    assert.match(start.text, /unik rośnie o 15 pkt proc\./);
  });

  test('Zimna krew makes the first blow that lands critical; a mark of death strikes its echo', () => {
    for (let seed = 0; seed < 5; seed++) {
      const result = fight(`zimna-krew:${seed}`, [evolved('sniper', { only: [] })], [sturdy('boar', 58, 'e0')]);
      assert.equal(blows(result, 'a0')[0].kind, 'crit');
    }
    const marked = fight('znak', [evolved('assassin', { only: ['death-mark'] })], [sturdy('boar', 58, 'e0')]);
    const echo = marked.events.find((event) => event.skill === 'death-mark' && event.kind === 'hit');
    assert.ok(echo && echo.damage > 0);
  });

  test('traits shape the character too: Opoka\'s armour, Arkana\'s mana, Krok cienia\'s speed, Zimowy oddech\'s shelter', () => {
    const plain = (classId) => {
      const { character, equipped } = typicalCharacter(classId, 60, content);
      return playerCombatant({ character: { ...character, classLevel: 50, skills: {} }, equipped, name: 'Mira' }, content);
    };
    const at50 = (evolutionId) => evolved(evolutionId, { only: [], classLevel: 50 });
    assert.equal(at50('guardian').armor, Math.round(plain('warrior').armor * 1.1));
    assert.equal(at50('arcanist').maxMana, Math.round(plain('mage').maxMana * 1.15));
    assert.ok(Math.abs(at50('night-dancer').speed - plain('shadow').speed * 1.1) < 1e-9);
    assert.deepEqual(at50('ice-lord').shelter, { frost: 0.15 });
    assert.equal(at50('barbarian').feat.kind, 'fury');
    assert.equal(plain('warrior').feat, undefined);
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
    assert.equal((await character()).features.includes('evolution'), false);
    await set('class_level = 50');
    const before = await character();
    // The Ewolucja tab opens at class level 50.
    assert.equal(before.features.includes('evolution'), true);
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
    const raisedTen = await call('POST', '/api/skills/raise', { cookie, body: { skillId: 'crushing-blow', count: 10 } });
    assert.equal(raisedTen.status, 200, JSON.stringify(raisedTen.data));
    assert.equal(raisedTen.data.character.skills.points, 30);
    assert.equal(raisedTen.data.character.skills.pools[0].options[0].level, 11);
    assert.equal((await call('POST', '/api/skills/raise', { cookie, body: { skillId: 'crushing-blow', count: 0 } })).data.error.code, 'invalid_count');
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
    // A test evolution below class level 50 opens its tab as well.
    assert.equal(taken.data.character.features.includes('evolution'), true);
    const undone = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(undone.status, 200, JSON.stringify(undone.data));
    assert.equal(undone.data.character.className, 'Wojownik');
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT skills FROM characters').first()).skills), { 'wide-sweep': 6 });
  });

  test('on the test version the character gets the class level of the first evolution at once, a test evolution undone first', async () => {
    await set(`level = 20, class_level = 15, class_xp = 7, skills = '{"wide-sweep":6}'`);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'guardian', test: true } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    const raised = await call('POST', '/api/evolution/test-level', { cookie });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.classLevel, 50);
    assert.equal(raised.data.character.className, 'Wojownik');
    assert.equal(raised.data.character.evolutionUndo, false);
    const row = await (await db()).prepare('SELECT class_xp, skills, evolution FROM characters').first();
    assert.deepEqual([row.class_xp, JSON.parse(row.skills), row.evolution], [0, { 'wide-sweep': 6 }, null]);
  });

  const points = async () => JSON.parse((await (await db()).prepare('SELECT points FROM characters').first()).points);
  const decide = (reset) => call('POST', '/api/evolution/points', { cookie, body: { reset } });

  test('after an evolution the stat points can be reset once, for free, and the answer is final', async () => {
    await set(`level = 50, class_level = 50, skills = '{"power-strike":20,"unyielding":20}', points = '{"strength":3,"vitality":2}'`);
    const before = await character();
    assert.equal(before.evolutionReset, null);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'barbarian' } });
    // Everything comes back: the points of the character's 49 levels and of
    // the class's 49, given out by hand or by class alike.
    assert.deepEqual(taken.data.character.evolutionReset, { character: 392, class: 98, bonus: 0, total: 490 });
    const reset = await decide(true);
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.reset, true);
    assert.equal(reset.data.character.evolutionReset, null);
    assert.equal(reset.data.character.freePoints, before.freePoints + 5);
    assert.deepEqual(await points(), {});
    // Once: points spent again stay, asked again (from another device, say).
    assert.equal((await call('POST', '/api/character/points', { cookie, body: { points: { strength: 2 } } })).status, 200);
    const again = await decide(true);
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.equal(again.data.reset, false);
    assert.deepEqual(await points(), { strength: 2 });
  });

  test('keeping the stat points ends the offer too, and without points spent there is none', async () => {
    await set(`level = 50, class_level = 50, skills = '{"power-strike":20,"unyielding":20}', points = '{"agility":4}'`);
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'guardian' } });
    const kept = await decide(false);
    assert.equal(kept.data.reset, false);
    assert.equal(kept.data.character.evolutionReset, null);
    assert.equal((await decide(true)).data.reset, false);
    assert.deepEqual(await points(), { agility: 4 });
    await set(`evolution = NULL, skills = '{"power-strike":20,"unyielding":20}', points = '{}'`);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'guardian' } })).data.character.evolutionReset, null);
  });

  test('on the test version undoing an evolution gives back the stat points it reset', async () => {
    await set(`level = 20, class_level = 15, skills = '{"wide-sweep":6}', points = '{"strength":4}'`);
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'gladiator', test: true } });
    assert.equal((await decide(true)).data.reset, true);
    assert.deepEqual(await points(), {});
    const undone = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(undone.status, 200, JSON.stringify(undone.data));
    assert.equal(undone.data.character.evolutionReset, null);
    assert.deepEqual(await points(), { strength: 4 });
  });
});

describe('class evolutions where the deployment has them off (the live game in 0.0.58)', () => {
  const { call, db, signUp } = useServer({ EVOLUTIONS: 'off' });

  test('the class grows past class level 50 as before them, with no Ewolucja tab, choice or evolution to take', async () => {
    const { cookie } = await signUp('bezewolucji');
    await call('POST', '/api/character', { cookie, body: { name: 'Bezewolucji', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare(`UPDATE characters SET level = 50, class_level = 50, skills = '{"power-strike":20,"unyielding":20}'`).run();
    const character = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(character.features.includes('evolution'), false);
    assert.deepEqual(character.evolution, { current: null, choices: [] });
    // Nothing for the class to wait for at class level 50: it grows on.
    assert.equal(character.skills.evolution.need, null);
    assert.equal((await call('GET', '/api/content')).data.unlocks.some((unlock) => unlock.id === 'evolution'), false);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'barbarian' } })).status, 404);
    assert.equal((await call('GET', '/api/evolution/test', { cookie })).status, 404);
  });
});
