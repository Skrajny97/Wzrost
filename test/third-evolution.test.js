// The third evolution ("Trzecia ewolucja klas"): at class level 200 each of
// the 15 second forms grows into one further form, where the deployment has
// the third forms on (THIRD_EVOLUTION; off in the live game for now). The
// class waits there until the form is taken, the form's skills take every
// Skill Point back and grow to level 145, the stats grow over four spans,
// the names have a woman's form, the Pustelnik changes it with the other
// paths' third forms, the art stands in with the second form's until it has
// its own, every new skill and trait works in fights, and a third form is
// clearly stronger than its second form while the 15 stay close to each
// other, on explorations and in the Arena.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  applyHunt,
  buildContent,
  classNameOf,
  computeStats,
  createRng,
  evolutionArt,
  evolutionBlock,
  evolutionChanges,
  evolutionChoices,
  evolutionName,
  evolutionPanel,
  evolutionView,
  evolveBlock,
  evolvedSkills,
  monsterCombatant,
  nextFormOf,
  perClassLevelOf,
  playerCombatant,
  raiseBlock,
  simulateFight,
  skillParams,
  skillPoints,
  skillsView,
} from '../src/engine/index.js';
import { measureClass } from '../tools/class-balance-sim.mjs';
import { measure } from '../tools/pvp-arena-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { loadData } from '../tools/validate-data.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const FORMS = [
  'horde-slayer', 'arena-legend', 'colossus', 'bow-master', 'perun-chosen', 'wild-lord', 'elemental-avatar', 'frost-monarch',
  'archdruid', 'saint', 'demon-slayer', 'prophet', 'godslayer', 'lich', 'shadow-lord',
];
const seconds = content.evolutions.filter((evolution) => evolution.stage === 2);
const thirds = content.evolutions.filter((evolution) => evolution.stage === 3);

// The game's data with the third forms taken out: the second forms as they
// were before the third evolution (and as the live game has them while
// THIRD_EVOLUTION is off).
const secondOnly = (() => {
  const raw = loadData();
  const thirdIds = new Set(thirds.map((evolution) => evolution.id));
  raw.evolutions.evolutions = raw.evolutions.evolutions.filter((evolution) => !thirdIds.has(evolution.id));
  raw.evolutions.skills = raw.evolutions.skills.filter((skill) => !thirdIds.has(skill.evolution));
  return buildContent(raw);
})();

// A Berserker at a class level, its skills at their top by default.
const berserker = (classLevel, skills = { 'shattering-blow': 95, 'berserker-roar': 95 }, extra = {}) => ({
  classId: 'warrior',
  level: 150,
  xp: 0,
  classLevel,
  classXp: 0,
  points: {},
  appearance: 'male',
  evolution: 'berserker',
  skills,
  ...extra,
});
const hordeSlayer = (classLevel, skills) => berserker(classLevel, skills, { evolution: 'horde-slayer' });

describe('the third evolution in the engine', () => {
  test('each second form grows into exactly one third form of its class, with its names and description', () => {
    assert.equal(seconds.length, 15);
    assert.deepEqual(seconds.map((form) => nextFormOf(form, content).id), FORMS);
    for (const form of thirds) {
      const second = content.evolutionsById[form.from];
      assert.equal(form.classId, second.classId, form.id);
      assert.equal(form.stage, 3, form.id);
      assert.ok(form.description, form.id);
      // Its first skill grows one of the second form's, the other is new.
      assert.ok(second.skills.includes(content.skillsById[form.skills[0]].from), form.id);
      assert.ok(!content.skillsById[form.skills[1]].from, form.id);
      for (const id of form.skills) {
        assert.equal(content.skillsById[id].maxLevel, 145, id);
        assert.equal(content.skillsById[id].classLevel, 200, id);
      }
    }
    // Third forms are taken, not chosen: never among the choices at 50.
    assert.deepEqual(evolutionChoices({ classId: 'warrior', skills: {} }, content, { all: true }).map((evolution) => evolution.id), ['barbarian', 'gladiator', 'guardian']);
    // The approved names, a man's and a woman's (812 A: Awatar Żywiołów for both).
    assert.deepEqual(thirds.map((form) => form.name), [
      'Pogromca Hord', 'Legenda Areny', 'Kolos', 'Mistrz Łuku', 'Wybraniec Peruna', 'Władca Puszczy', 'Awatar Żywiołów', 'Lodowy Król',
      'Arcydruid', 'Święty', 'Pogromca Demonów', 'Prorok', 'Bogobójca', 'Licz', 'Władca Cieni',
    ]);
    assert.deepEqual(thirds.map((form) => evolutionName(form, 'female')), [
      'Pogromczyni Hord', 'Legenda Areny', 'Kolos', 'Mistrzyni Łuku', 'Wybranka Peruna', 'Władczyni Puszczy', 'Awatar Żywiołów', 'Lodowa Królowa',
      'Arcydruidka', 'Święta', 'Pogromczyni Demonów', 'Prorokini', 'Bogobójczyni', 'Licz', 'Władczyni Cieni',
    ]);
    assert.equal(content.evolutionsById.lich.description, 'Śmierć już po niego przyszła i odeszła z niczym. Teraz to on rządzi umarłymi.');
  });

  test('the class waits at 200 while a Skill Point is left, then until the third form is taken; after it at 300 only for points', () => {
    assert.deepEqual(evolutionBlock(berserker(199, { 'shattering-blow': 95, 'berserker-roar': 80 }), content), { code: 'skill_points', level: 200 });
    assert.deepEqual(evolutionBlock(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 94 }), content), { code: 'skill_points', level: 200 });
    assert.deepEqual(evolutionBlock(berserker(200), content), { code: 'evolve', level: 200 });
    // A class already past 200 (it grew on before the third forms) waits
    // for nothing and takes its form at once.
    assert.equal(evolutionBlock(berserker(230), content), null);
    assert.equal(evolveBlock(berserker(230), 'horde-slayer', content), null);
    // The exploration holds the class at 200, and its XP adds up.
    const hunt = { xp: 1e12, result: 'success', timePoints: 0 };
    const held = applyHunt(berserker(200), hunt, content);
    assert.equal(held.classLevel, 200);
    assert.ok(held.classXp > 0);
    assert.ok(held.messages.some((line) => line.includes('u progu ewolucji') && line.includes('w zakładce Ewolucja')));
    // With the form the class grows on, at 300 waits only for points, and
    // with them spent grows on past it: there is no fourth form.
    assert.equal(applyHunt(hordeSlayer(200, { 'smashing-blow': 1, slaughter: 0 }), hunt, content).classLevel, 300);
    assert.deepEqual(evolutionBlock(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 144 }), content), { code: 'skill_points', level: 300 });
    assert.equal(evolutionBlock(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 145 }), content), null);
    const waiting = applyHunt(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 140 }), hunt, content);
    assert.equal(waiting.classLevel, 300);
    assert.ok(waiting.messages.some((line) => line.includes('rozdasz Punkty Umiejętności')));
    assert.ok(applyHunt(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 145 }), hunt, content).classLevel > 300);
  });

  test('without the third forms (THIRD_EVOLUTION off) a second form waits at 200 only for its points, and grows on past it', () => {
    assert.equal(nextFormOf(secondOnly.evolutionsById.berserker, secondOnly), null);
    assert.deepEqual(evolutionBlock(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 90 }), secondOnly), { code: 'skill_points', level: 200 });
    assert.equal(evolutionBlock(berserker(200), secondOnly), null);
    assert.ok(applyHunt(berserker(200), { xp: 1e12, result: 'success', timePoints: 0 }, secondOnly).classLevel > 200);
    assert.equal(evolutionPanel(berserker(200), secondOnly).nextLevel, null);
  });

  test('the third form asks for its second form, class level 200 and the points spent; the test lifts the level', () => {
    assert.equal(evolveBlock(berserker(199), 'horde-slayer', content).code, 'class_level');
    assert.match(evolveBlock(berserker(199), 'horde-slayer', content).message, /200\. poziomie klasy/);
    assert.equal(evolveBlock(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 50 }), 'horde-slayer', content).code, 'skill_points');
    assert.equal(evolveBlock(berserker(200), 'arena-legend', content).code, 'unknown_evolution');
    // Not past the second form: a first evolution grows into its second first.
    assert.equal(evolveBlock(berserker(200, { 'crushing-blow': 45, 'blood-frenzy': 45 }, { evolution: 'barbarian' }), 'horde-slayer', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(hordeSlayer(200, {}), 'horde-slayer', content).code, 'evolved');
    assert.equal(evolveBlock(hordeSlayer(200, {}), 'berserker', content).code, 'evolved');
    assert.equal(evolveBlock(berserker(120, { 'shattering-blow': 3 }), 'horde-slayer', content, { test: true }), null);
    assert.equal(evolveBlock(berserker(200), 'horde-slayer', content), null);
  });

  test('taking it: the form\'s two skills at 0 with the 190 points back, class levels 200–299 bring 100 more, up to level 145 each', () => {
    const taken = hordeSlayer(200, evolvedSkills('horde-slayer', content));
    assert.deepEqual(taken.skills, { 'smashing-blow': 0, slaughter: 0 });
    assert.deepEqual(skillPoints(taken, content), { earned: 191, spent: 0, free: 191 });
    assert.equal(skillPoints({ ...taken, classLevel: 299 }, content).earned, 290);
    assert.equal(skillPoints({ ...taken, classLevel: 360 }, content).earned, 290);
    assert.equal(raiseBlock({ ...taken, classLevel: 299, skills: { 'smashing-blow': 144, slaughter: 0 } }, 'smashing-blow', content), null);
    assert.equal(raiseBlock({ ...taken, classLevel: 299, skills: { 'smashing-blow': 145, slaughter: 0 } }, 'smashing-blow', content).code, 'max_level');
    const view = skillsView(taken, content);
    assert.deepEqual(view.pools[0].options.map((skill) => [skill.name, skill.state, skill.maxLevel]), [
      ['Miażdżący cios', 'main', 145],
      ['Rzeź', 'second', 145],
    ]);
    assert.equal(view.points, 191);
    assert.equal(view.lastPointLevel, 299);
    assert.deepEqual(view.evolution, { level: 300, need: 'skill_points' });
    // At its first level a grown skill is about its root at the top level.
    const root = skillParams(content.skillsById['shattering-blow'], 95, content);
    const grown = skillParams(content.skillsById['smashing-blow'], 1, content);
    for (const key of ['power', 'armorIgnore', 'stunChance']) assert.ok(Math.abs(grown[key] - root[key]) < 1e-9, key);
    // The form's trait in fights.
    const { character, equipped } = typicalCharacter('warrior', 160, content);
    const unit = playerCombatant({ character: { ...character, classLevel: 210, skills: taken.skills, evolution: 'horde-slayer' }, equipped, name: 'Pogromca' }, content);
    assert.deepEqual([unit.feat.kind, unit.feat.damage, unit.feat.at, unit.feat.lifesteal, unit.feat.lifestealBelow], ['fury', 0.7, 0.1, 0.08, 0.3]);
  });

  test('the stats grow by the class to 50, each form over its span and the third form from 201, HP and mana too', () => {
    const at = (classLevel, evolution) => computeStats({ classId: 'warrior', level: 150, classLevel, points: {}, evolution }, [], content).totals;
    const base = content.classesById.warrior.baseStats.strength;
    assert.equal(at(220, 'horde-slayer').strength, base + 2 * 49 + 3 * 50 + 4 * 100 + 5 * 20);
    assert.equal(at(220, 'berserker').strength, base + 2 * 49 + 3 * 50 + 4 * 120);
    assert.equal(at(200, 'horde-slayer').strength, at(200, 'berserker').strength);
    assert.equal(at(220, 'horde-slayer').vitality - at(220, 'berserker').vitality, 20);
    // The Arcydruid's own HP and mana per class level, after the Druid's.
    const archdruid = { classId: 'mage', level: 150, classLevel: 220, points: {}, skills: {}, evolution: 'archdruid' };
    const perLevel = perClassLevelOf(archdruid, content);
    assert.equal(Math.round(perLevel.mana * 220), 3 * 50 + 4 * 50 + 5 * 100 + 6 * 20);
    assert.equal(Math.round(perLevel.hp * 220), 3 * 50 + 3 * 50 + 4 * 100 + 5 * 20);
    assert.equal(Math.round(perClassLevelOf({ ...archdruid, classLevel: 200 }, content).mana * 200), 3 * 50 + 4 * 50 + 5 * 100);
    // A form without its own HP and mana takes those before it.
    assert.deepEqual(perClassLevelOf({ ...archdruid, evolution: 'frost-monarch' }, content), content.classesById.mage.perClassLevel);
  });

  test('a woman goes by the form\'s woman\'s name wherever the class name shows', () => {
    const female = { ...hordeSlayer(200, evolvedSkills('horde-slayer', content)), appearance: 'female' };
    assert.equal(classNameOf(female, content), 'Pogromczyni Hord');
    assert.equal(classNameOf({ ...female, appearance: 'male' }, content), 'Pogromca Hord');
    assert.equal(classNameOf({ ...female, classId: 'mage', evolution: 'frost-monarch' }, content), 'Lodowa Królowa');
    assert.equal(classNameOf({ ...female, classId: 'mage', evolution: 'elemental-avatar' }, content), 'Awatar Żywiołów');
    assert.equal(skillsView(female, content).pools[0].options[0].path, 'Pogromczyni Hord');
    assert.equal(evolutionView(content.evolutionsById.saint, content, { appearance: 'female' }).name, 'Święta');
    assert.equal(evolutionView(content.evolutionsById.saint, content, { appearance: 'female' }).fromName, 'Cudotwórczyni');
  });

  test('the panel shows the one form to take at 200 once the points are spent, and nothing after it', () => {
    const before = evolutionPanel(berserker(199), content);
    assert.deepEqual([before.current.id, before.next, before.nextLevel], ['berserker', null, 200]);
    assert.equal(evolutionPanel(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 90 }), content).next, null);
    const ready = evolutionPanel(berserker(200), content);
    assert.deepEqual(ready.choices, []);
    assert.equal(ready.next.id, 'horde-slayer');
    assert.equal(ready.next.stage, 3);
    assert.equal(ready.next.skillLevel, 145);
    assert.equal(ready.next.fromName, 'Berserker');
    assert.equal(ready.next.description, 'Sam staje naprzeciw całej hordy i to horda się cofa. Rany tylko go rozjuszają.');
    assert.equal(ready.next.skills[0].from, 'Kruszący cios');
    assert.equal(ready.next.skills[0].effect, 'Cios za 560% obrażeń, który pomija 85% pancerza celu. Cel ma 55% szans stracić 2 najbliższe ruchy. Trafia też wroga stojącego za celem, za 160% obrażeń.');
    assert.equal(ready.next.skills[1].from, null);
    assert.deepEqual(ready.next.growth.map((entry) => `${entry.name} ${entry.value}`), ['Siła 5', 'Witalność 4', 'Wytrzymałość 2']);
    assert.equal(ready.next.trait.name, 'Szał bez granic');
    const after = evolutionPanel(hordeSlayer(200, {}), content);
    assert.deepEqual([after.current.id, after.next, after.nextLevel], ['horde-slayer', null, null]);
  });

  test('the Pustelnik changes a third form for another path\'s third form', () => {
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'horde-slayer' }, content).map((evolution) => evolution.id), ['arena-legend', 'colossus']);
    assert.deepEqual(evolutionChanges({ classId: 'cleric', evolution: 'saint' }, content).map((evolution) => evolution.id), ['demon-slayer', 'prophet']);
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'berserker' }, content).map((evolution) => evolution.id), ['arena-champion', 'bastion']);
  });

  test('a third form stands in with its second form\'s art, and its skills with those down their line, until they have their own', async () => {
    const art = evolutionArt(content);
    for (const form of thirds) assert.equal(art.forms[form.id], form.from, form.id);
    // The grown skill: the one it grew from, then that one's root; the new
    // one: the second form's skill in its place (or the other one, where
    // the grown skill came from that), then that one's stand-in.
    assert.deepEqual(art.skills['smashing-blow'], ['shattering-blow', 'crushing-blow']);
    assert.deepEqual(art.skills.slaughter, ['berserker-roar', 'blood-frenzy']);
    assert.deepEqual(art.skills.hymn, ['choir', 'psalm']);
    assert.deepEqual(art.skills.vision, ['divine-shield', 'great-blessing']);
    assert.deepEqual(art.skills['eagle-talon'], ['harpoon', 'barbed-arrow']);
    const { SPRITES, artChain, lookIds, riderFile, walkerSheet } = await import('../src/client/art.js');
    const { state } = await import('../src/client/state.js');
    const before = state.content;
    state.content = { evolutionArt: art };
    try {
      // Every skill of a third form has an icon down its line.
      for (const form of thirds) {
        for (const id of form.skills) assert.ok(artChain(id).some((one) => SPRITES.skills.ids.includes(one)), id);
      }
      // The look: the form's own art first, then down the line to the class.
      assert.deepEqual(lookIds('warrior', 'female', 'horde-slayer'), ['horde-slayer-female', 'berserker-female', 'barbarian-female', 'warrior-female']);
      // The portraits of the third forms are in (the Prorok's man's still
      // stands in with the Arcykapłan's); the walks and rides, until they
      // have their own, are the second forms'.
      for (const form of thirds) {
        for (const look of ['female', 'male']) {
          const id = `${form.id}-${look}`;
          const portrait = lookIds(form.classId, look, form.id).find((one) => SPRITES.portraits.ids.includes(one));
          assert.equal(portrait, SPRITES.portraits.ids.includes(id) ? id : `${form.from}-${look}`, id);
          if (id !== 'prophet-male') assert.ok(SPRITES.portraits.ids.includes(id), id);
          const walk = SPRITES.walkers.ids.includes(id) ? id : `${form.from}-${look}`;
          assert.equal(walkerSheet(form.classId, look, undefined, form.id), `art/walkers/${walk}.png`, id);
          const ride = SPRITES.riders.ids.includes(id) ? id : `${form.from}-${look}`;
          assert.equal(riderFile(form.classId, look, undefined, form.id), `art/riders/${ride}.png`, id);
        }
      }
    } finally {
      state.content = before;
    }
  });
});

describe('the third forms in fights', () => {
  // A character of a third form (level 160, class level 230) with the
  // form's skills at `skillLevel` (`only`: just these of them).
  function form(evolutionId, { skillLevel = 100, only, classLevel = 230, level = 160, hpShare, id = 'a0', position } = {}) {
    const evolution = content.evolutionsById[evolutionId];
    const { character, equipped } = typicalCharacter(evolution.classId, level, content);
    const skills = Object.fromEntries(evolution.skills.filter((skill) => !only || only.includes(skill)).map((skill) => [skill, skillLevel]));
    const unit = playerCombatant({ character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: evolution.name, id }, content);
    return { ...unit, ...(position && { position }), ...(hpShare !== undefined && { hp: Math.round(unit.maxHp * hpShare) }) };
  }
  // A unit with a skill's or the trait's number changed, for twin fights
  // that draw the same random numbers.
  const withParam = (unit, skillId, key, value) => ({ ...unit, skills: unit.skills.map((skill) => (skill.id === skillId ? { ...skill, params: { ...skill.params, [key]: value } } : skill)) });
  const withFeat = (unit, key, value) => ({ ...unit, feat: { ...unit.feat, [key]: value } });
  const paramOf = (unit, skillId, key) => unit.skills.find((skill) => skill.id === skillId).params[key];
  // A monster of the level; a sturdy one has HP enough for a long fight
  // and strikes softly, so the typical character, without companions or
  // upgrades, lasts it out.
  const LEVEL = 158;
  const foe = (monsterId, id, extra = {}) => ({ ...monsterCombatant({ monsterId, level: LEVEL, id }, content), ...extra });
  const sturdy = (monsterId, id, extra = {}) => {
    const unit = foe(monsterId, id);
    return { ...unit, hp: 200000, maxHp: 200000, damageScale: unit.damageScale * 0.25, ...extra };
  };
  const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
  const BLOWS = ['hit', 'crit'];
  const blowsOf = (result, actor) => result.events.filter((event) => event.actor === actor && BLOWS.includes(event.kind));
  const after = (result, find) => result.events.slice(result.events.findIndex(find) + 1);
  const many = (count, seed, run) => Array.from({ length: count }, (_, index) => run(`${seed}:${index}`));
  const near = (actual, expected, margin, told) => assert.ok(Math.abs(actual - expected) < margin, `${told}: ${actual} vs ${expected}`);

  test('Szał bez granic strikes harder the less HP is left; Miażdżący cios stuns for two moves and strikes the foe behind; Rzeź rages', () => {
    // Twin fights draw the same numbers: the first blow differs only by
    // the trait, at 10% HP all of it.
    const low = form('horde-slayer', { only: [], hpShare: 0.1 });
    const firstBlow = (unit) => blowsOf(fight('szal', [unit], [sturdy('boar', 'e0', { speed: 1 })]), 'a0')[0].damage;
    near(firstBlow(low) / firstBlow(withFeat(low, 'damage', 0)), 1.7, 0.02, 'Szał bez granic');
    const lined = () => [sturdy('boar', 'e0', { hp: 20000 }), sturdy('crow', 'e1')];
    const smashed = fight('miazdzacy', [form('horde-slayer', { only: ['smashing-blow'], skillLevel: 145 })], lined());
    const smash = smashed.events.filter((event) => event.skill === 'smashing-blow' && ['hit', 'crit', 'dodge'].includes(event.kind));
    assert.deepEqual(smash.slice(0, 2).map((event) => [event.target, Boolean(event.pierced)]), [['e0', false], ['e1', true]]);
    const stunned = many(10, 'miazdzacy-stun', (seed) => fight(seed, [form('horde-slayer', { only: ['smashing-blow'], skillLevel: 145 })], [sturdy('boar', 'e0')]))
      .flatMap((result) => result.events)
      .find((event) => event.kind === 'stun');
    assert.equal(stunned.label, 'ogłuszony');
    assert.match(stunned.text, /traci 2 najbliższe ruchy/);
    const raging = form('horde-slayer', { only: ['slaughter'], hpShare: 0.1 });
    const firstSweep = (unit) => fight('rzez', [unit], [sturdy('boar', 'e0', { speed: 1 })]).events.find((event) => event.skill === 'slaughter' && BLOWS.includes(event.kind)).damage;
    near(firstSweep(raging) / firstSweep(withParam(raging, 'slaughter', 'rage', 0)), 1 + paramOf(raging, 'slaughter', 'rage'), 0.02, 'Rzeź');
  });

  test('Huragan stali turns twice in one move, sure and bleeding; Chwała and Wiwaty strengthen blows for every fallen foe', () => {
    const spun = fight('huragan', [form('arena-legend', { only: ['steel-hurricane'] })], [sturdy('wolf', 'e0'), sturdy('wolf', 'e1'), sturdy('fox', 'e2')]);
    const casts = spun.events.map((event, index) => [event, index]).filter(([event]) => event.skill === 'steel-hurricane' && event.kind === 'skill').slice(0, 2);
    assert.match(casts[1][0].text, /drugi obrót/);
    assert.equal(casts[1][0].t, casts[0][0].t);
    for (const [from, to] of [[casts[0][1], casts[1][1]], [casts[1][1], spun.events.length]]) {
      const blows = spun.events.slice(from + 1, to).filter((event) => event.actor === 'a0' && event.skill === 'steel-hurricane' && ['hit', 'crit', 'dodge'].includes(event.kind)).slice(0, 3);
      assert.deepEqual(blows.map((event) => event.kind === 'dodge' ? 'dodge' : event.target), ['e0', 'e1', 'e2']);
    }
    for (const id of ['e0', 'e1', 'e2']) assert.ok(spun.events.some((event) => event.kind === 'effect' && event.effect === 'Krwawienie' && event.target === id), id);
    // A foe with 1 HP falls to the first blow; the blows after it are
    // stronger by Chwała and, while they last, by Wiwaty.
    const legend = form('arena-legend', { only: ['cheers'] });
    const enemies = () => [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1')];
    const onBoar = (unit) => fight('wiwaty', [unit], enemies()).events.find((event) => event.actor === 'a0' && event.target === 'e1' && BLOWS.includes(event.kind)).damage;
    const quiet = withParam(withParam(legend, 'cheers', 'chorus', 0), 'cheers', 'perKill', 0);
    const cheers = paramOf(legend, 'cheers', 'chorus') + paramOf(legend, 'cheers', 'perKill');
    near(onBoar(legend) / onBoar(quiet), 1 + cheers, 0.02, 'Wiwaty');
    near(onBoar(quiet) / onBoar(withFeat(quiet, 'perKill', 0)), 1 + legend.feat.perKill, 0.02, 'Chwała');
    const cheered = fight('wiwaty', [legend], enemies());
    assert.match(cheered.events.find((event) => event.skill === 'cheers').text, /za każdego pokonanego wroga/);
  });

  test('Niezdobyty: the Kolos takes blows meant for the party; Nieprzełamany heals it and throws blows back; Trzęsienie ziemi stuns only the foes in front', () => {
    const colossus = form('colossus', { only: [], position: 'front' });
    const friend = form('bow-master', { only: [], id: 'a1', position: 'back' });
    let meant = 0;
    let taken = 0;
    for (const result of many(6, 'niezdobyty', (seed) => fight(seed, [colossus, friend], [sturdy('wolf', 'e0'), sturdy('wolf', 'e1')]))) {
      result.events.forEach((event, index) => {
        if (event.kind !== 'skill' || event.actor !== 'a0' || event.skillName !== 'Niezdobyty') return;
        taken += 1;
        assert.deepEqual(event.targets, ['a1']);
        assert.match(event.text, /Przyjmuje cios wymierzony w/);
        assert.equal(result.events[index + 1].target, 'a0');
      });
      meant += result.events.filter((event) => event.actor?.startsWith('e') && event.target === 'a1' && ['hit', 'crit', 'dodge'].includes(event.kind)).length;
    }
    // About 35% of the blows meant for the friend.
    near(taken / (taken + meant), 0.35, 0.15, 'Niezdobyty');
    const guarded = fight('nieprzelamany', [form('colossus', { only: ['unbroken'], hpShare: 0.85 })], [sturdy('wolf', 'e0'), sturdy('wolf', 'e1')]);
    const heal = guarded.events.find((event) => event.skill === 'unbroken');
    assert.equal(heal.kind, 'heal');
    assert.ok(heal.amount > 0);
    assert.match(heal.text, /odbija/);
    assert.ok(after(guarded, (event) => event.skill === 'unbroken').some((event) => event.kind === 'reflect' && event.actor === 'a0'));
    let front = 0;
    for (const result of many(8, 'trzesienie', (seed) => fight(seed, [form('colossus', { only: ['earthquake'], skillLevel: 145 })], [sturdy('boar', 'e0'), sturdy('crow', 'e1')]))) {
      for (const event of result.events.filter((one) => one.kind === 'stun')) {
        assert.equal(event.target, 'e0');
        front += 1;
      }
      // Every foe takes the blow, none dodges it.
      const quake = result.events.filter((event) => event.skill === 'earthquake' && ['hit', 'crit', 'dodge'].includes(event.kind));
      assert.ok(quake.some((event) => event.target === 'e1') && !quake.some((event) => event.kind === 'dodge'));
    }
    assert.ok(front > 0);
  });

  test('Strzała przeznaczenia: three sure critical shots; Mistrzowski strzał goes through every foe in the rows behind; Spokojna ręka: no foe dodges', () => {
    for (const result of many(5, 'przeznaczenie', (seed) => fight(seed, [form('bow-master', { only: [] })], [sturdy('boar', 'e0')]))) {
      assert.deepEqual(blowsOf(result, 'a0').slice(0, 3).map((event) => event.kind), ['crit', 'crit', 'crit']);
    }
    const rows = [sturdy('wolf', 'e0', { hp: 20000 }), sturdy('fox', 'e1'), sturdy('crow', 'e2'), sturdy('owl', 'e3')];
    const shot = fight('mistrzowski', [form('bow-master', { only: ['master-shot'] })], rows);
    const first = shot.events.findIndex((event) => event.skill === 'master-shot');
    const through = shot.events.slice(first).filter((event) => event.skill === 'master-shot' && ['hit', 'crit', 'dodge'].includes(event.kind)).slice(0, 4);
    assert.deepEqual(through.map((event) => [event.target, Boolean(event.pierced)]), [['e0', false], ['e1', true], ['e2', true], ['e3', true]]);
    let blows = 0;
    for (const result of many(6, 'spokojna', (seed) => fight(seed, [form('bow-master', { only: ['steady-hand'] })], [sturdy('fox', 'e0'), sturdy('fox', 'e1')]))) {
      const start = result.events.findIndex((event) => event.skill === 'steady-hand' && event.kind === 'skill');
      const end = result.events.findIndex((event, index) => index > start && event.kind === 'fade' && event.skill === 'steady-hand');
      const meanwhile = result.events.slice(start, end).filter((event) => event.actor === 'a0' && !event.skill && ['hit', 'crit', 'dodge'].includes(event.kind));
      assert.ok(!meanwhile.some((event) => event.kind === 'dodge'));
      blows += meanwhile.length;
    }
    assert.ok(blows >= 12);
  });

  test('Grom Peruna\'s spark jumps on to another foe; Gniew Peruna\'s bolts jump on; Znak gromu charges the party\'s blows with lightning', () => {
    const jumps = many(4, 'grom', (seed) => fight(seed, [form('perun-chosen', { only: [] })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')])).flatMap((result) => result.events);
    const leap = jumps.findIndex((event) => /Piorun z grotu przeskakuje dalej/.test(event.text ?? ''));
    assert.ok(leap > 0);
    // From the arrow's spark (which slowed its target) on to the other foe.
    const sparked = jumps.slice(0, leap).findLast((event) => BLOWS.includes(event.kind));
    assert.match(sparked.text, /Iskra z grotu/);
    assert.notEqual(jumps[leap].target, sparked.target);
    const wrath = fight('gniew', [form('perun-chosen', { only: ['perun-wrath'], skillLevel: 145 })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1'), sturdy('fox', 'e2')]);
    assert.ok(wrath.events.some((event) => event.skill === 'perun-wrath' && event.kind !== 'skill' && /Piorun przeskakuje dalej/.test(event.text)));
    const friend = form('horde-slayer', { only: [], id: 'a1', position: 'front' });
    const signed = fight('znak', [form('perun-chosen', { only: ['thunder-sign'], skillLevel: 145, position: 'back' }), friend], [sturdy('boar', 'e0')]);
    assert.match(signed.events.find((event) => event.skill === 'thunder-sign').text, /każdy cios drużyny ma \d+% szans porazić wroga piorunem/);
    assert.ok(signed.events.some((event) => event.actor === 'a1' && BLOWS.includes(event.kind) && /Piorun ze znaku gromu: \+\d+/.test(event.text)));
  });

  test('Prawo puszczy strikes beasts and birds harder; Przewodnik watahy\'s white wolf howls for the party; Szpon orła blinds the foe with the fewest HP', () => {
    const lord = form('wild-lord', { only: [] });
    const firstOn = (unit, monsterId) => blowsOf(fight(`prawo:${monsterId}`, [unit], [sturdy(monsterId, 'e0')]), 'a0')[0].damage;
    near(firstOn(lord, 'boar') / firstOn(withFeat(lord, 'damage', 0), 'boar'), 1.3, 0.02, 'Prawo puszczy on a beast');
    near(firstOn(lord, 'spider') / firstOn(withFeat(lord, 'damage', 0), 'spider'), 1, 0.001, 'Prawo puszczy on a spider');
    const leader = form('wild-lord', { only: ['pack-leader'] });
    const howled = fight('wataha', [leader], [sturdy('spider', 'e0')]);
    const up = howled.events.find((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual([up.skill, up.figure, up.summon], ['pack-leader', 'alpha-wolf', 'Biały basior']);
    assert.match(up.text, /Wycie dodaje całej drużynie \d+% obrażeń/);
    const ownAfter = (result) => after(result, (event) => event.kind === 'summon' && event.state === 'up').find((event) => event.actor === 'a0' && !event.skill && BLOWS.includes(event.kind)).damage;
    near(ownAfter(howled) / ownAfter(fight('wataha', [withParam(leader, 'pack-leader', 'howl', 0)], [sturdy('spider', 'e0')])), 1 + paramOf(leader, 'pack-leader', 'howl'), 0.02, 'howl');
    let misses = 0;
    for (const result of many(6, 'szpon', (seed) => fight(seed, [form('wild-lord', { only: ['eagle-talon'], skillLevel: 145 })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1', { hp: 50000 })]))) {
      const talon = result.events.find((event) => event.skill === 'eagle-talon' && BLOWS.includes(event.kind));
      assert.equal(talon.target, 'e1');
      const blinded = result.events.find((event) => event.kind === 'effect' && event.effect === 'Oślepienie');
      assert.equal(blinded.target, 'e1');
      assert.match(blinded.text, /Przez 3 ruchy chybia \d+% ciosów/);
      misses += result.events.filter((event) => event.actor === 'e1' && event.missed && /chybia, oślepiony/.test(event.text)).length;
    }
    assert.ok(misses > 0);
  });

  test('Kataklizm burns, chills and may shock every foe; Tarcza żywiołów burns, slows or shocks whoever strikes it; Jedność żywiołów strengthens the three elements', () => {
    const results = many(6, 'kataklizm', (seed) => fight(seed, [form('elemental-avatar', { only: ['cataclysm'], skillLevel: 145 })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')]));
    const events = results.flatMap((result) => result.events);
    for (const id of ['e0', 'e1']) {
      for (const effect of ['Oparzenie', 'Wychłodzenie']) assert.ok(events.some((event) => event.kind === 'effect' && event.effect === effect && event.target === id), `${id}: ${effect}`);
    }
    assert.ok(events.some((event) => event.kind === 'stun' && event.label === 'porażony'));
    const answers = new Set();
    for (const result of many(8, 'tarcza', (seed) => fight(seed, [form('elemental-avatar', { only: ['elemental-shield'], hpShare: 0.8 })], [sturdy('wolf', 'e0'), sturdy('wolf', 'e1'), sturdy('boar', 'e2')]))) {
      const cast = result.events.find((event) => event.skill === 'elemental-shield');
      assert.match(cast.text, /Kto w nią uderzy, ten płonie, zwalnia albo traci ruch/);
      result.events.forEach((event, index) => {
        if (!event.absorbed || !event.actor?.startsWith('e')) return;
        const next = result.events[index + 1];
        if (next?.kind === 'effect' && next.effect === 'Oparzenie' && next.target === event.actor) answers.add('burn');
        if (next?.kind === 'slow' && next.targets[0] === event.actor) answers.add('slow');
        if (next?.kind === 'stun' && next.target === event.actor && next.label === 'porażony') answers.add('shock');
      });
    }
    assert.deepEqual([...answers].sort(), ['burn', 'shock', 'slow']);
    // Twin fights: the first spell, a lightning one, is 35% stronger by the trait.
    const avatar = form('elemental-avatar', { only: ['cataclysm'] });
    const firstSpell = (unit) => fight('jednosc', [unit], [sturdy('boar', 'e0')]).events.find((event) => event.skill === 'cataclysm' && BLOWS.includes(event.kind)).damage;
    near(firstSpell(avatar) / firstSpell(withFeat(avatar, 'damage', 0)), 1.35, 0.02, 'Jedność żywiołów');
  });

  test('Wieczny lód: a chilled foe may freeze and lose its move; Lodowa nawałnica chills and slows; Lodowy grobowiec locks the foe with the most HP in ice', () => {
    const frozen = fight('wieczny-lod', [form('frost-monarch', { only: ['ice-storm'] })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')]);
    const storm = frozen.events.findIndex((event) => event.skill === 'ice-storm' && event.kind === 'skill');
    const rest = frozen.events.slice(storm);
    for (const id of ['e0', 'e1']) assert.ok(rest.some((event) => event.kind === 'effect' && event.effect === 'Wychłodzenie' && event.target === id), id);
    assert.ok(rest.some((event) => event.kind === 'slow' && event.skill === 'ice-storm' && event.targets.length === 2));
    const lost = rest.filter((event) => event.kind === 'stun' && /zamarza i traci ruch/.test(event.text));
    assert.ok(lost.length > 0);
    assert.equal(lost[0].label, 'zamarznięty');
    // Before the first chill, no foe freezes.
    assert.ok(!frozen.events.slice(0, storm).some((event) => /zamarza i traci ruch/.test(event.text ?? '')));
    const monarch = form('frost-monarch', { only: ['ice-tomb'] });
    const enemies = () => [sturdy('boar', 'e0', { hp: 150000 }), sturdy('wolf', 'e1')];
    const tomb = fight('grobowiec', [monarch], enemies());
    const locked = tomb.events.find((event) => event.skill === 'ice-tomb' && event.kind === 'stun');
    assert.equal(locked.target, 'e1');
    assert.match(locked.text, /zamarza w lodzie na 2 ruchy i dostaje o \d+% więcej obrażeń/);
    // Until it moves again, it takes more (a lone foe, so the next blow
    // falls on it).
    const nextOn = (unit) =>
      after(fight('grobowiec-sam', [unit], [sturdy('wolf', 'e1')]), (event) => event.skill === 'ice-tomb' && event.kind === 'stun').find((event) => event.target === 'e1' && BLOWS.includes(event.kind)).damage;
    near(nextOn(monarch) / nextOn(withParam(monarch, 'ice-tomb', 'bonus', 0)), 1 + paramOf(monarch, 'ice-tomb', 'bonus'), 0.02, 'Lodowy grobowiec');
  });

  test('Serce puszczy: two summons stand at once; the oak roots the foe it strikes; the bison charges the foe in front and stuns it', () => {
    const grove = fight('serce', [form('archdruid', { skillLevel: 145 })], [sturdy('boar', 'e0'), sturdy('crow', 'e1')]);
    const standing = new Set();
    let both = false;
    for (const event of grove.events.filter((one) => one.kind === 'summon')) {
      if (event.state === 'up') standing.add(event.skill);
      else if (['gone', 'fell'].includes(event.state)) standing.delete(event.summonSkill);
      if (standing.size === 2) both = true;
    }
    assert.ok(both, 'the oak and the bison at once');
    assert.ok(grove.events.some((event) => event.kind === 'slow' && /grzęźnie w korzeniach/.test(event.text)));
    const charge = grove.events.findIndex((event) => event.skill === 'bison-call' && /Żubr szarżuje/.test(event.text ?? ''));
    assert.ok(charge > 0);
    assert.equal(grove.events[charge].target, 'e0');
    if (grove.events[charge].kind !== 'dodge') assert.deepEqual([grove.events[charge + 1].kind, grove.events[charge + 1].target], ['stun', 'e0']);
  });

  test('Cudowne ocalenie raises a fallen member of the party once; Cudowne uzdrowienie heals the party and takes every effect off; Święte światło heals the party', () => {
    const rescued = many(8, 'ocalenie', (seed) =>
      fight(seed, [form('saint', { only: [], position: 'back' }), form('horde-slayer', { only: [], id: 'a1', hpShare: 0.01, position: 'front' })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')]),
    ).find((result) => result.events.some((event) => event.kind === 'heal' && event.target === 'a1' && /wstaje z \d+ HP/.test(event.text)));
    assert.ok(rescued, 'a rescue');
    const raised = rescued.events.filter((event) => event.kind === 'heal' && /wstaje z \d+ HP/.test(event.text));
    assert.equal(raised.length, 1);
    const friend = form('horde-slayer', { only: [], id: 'a1' });
    assert.equal(raised[0].amount, Math.round(friend.maxHp * 0.4));
    // Poisoned by a spider and burned by a wisp, the Święty's heal takes both off.
    const cleansed = many(12, 'uzdrowienie', (seed) => fight(seed, [form('saint', { only: ['miraculous-healing'], hpShare: 0.75 })], [sturdy('spider', 'e0'), sturdy('wisp', 'e1')])).find((result) => {
      const heal = result.events.findIndex((event) => event.skill === 'miraculous-healing');
      return heal >= 0 && result.events.slice(heal, heal + 4).filter((event) => event.kind === 'cleanse').length >= 2;
    });
    assert.ok(cleansed, 'a heal that took two effects off at once');
    const healed = cleansed.events.find((event) => event.skill === 'miraculous-healing' && event.kind === 'skill');
    assert.match(healed.text, /Przez 5 kolejnych ruchów/);
    const light = fight('swiatlo', [form('saint', { only: ['holy-light'], hpShare: 0.5 }), form('horde-slayer', { only: [], id: 'a1', hpShare: 0.5 })], [sturdy('boar', 'e0')]);
    const cast = light.events.findIndex((event) => event.skill === 'holy-light' && event.kind === 'skill');
    const heals = light.events.slice(cast).filter((event) => event.skill === 'holy-light' && event.kind === 'heal');
    assert.deepEqual(heals.slice(0, 2).map((event) => event.target).sort(), ['a0', 'a1']);
  });

  test('Wielki egzorcyzm burns spirits; Sąd ostateczny waits for a foe below 60% and strikes spirits harder; Pieczęć świętości: the sealed foe takes more and heals no more', () => {
    const burns = (monsterId) => fight(`egzorcyzm:${monsterId}`, [form('demon-slayer', { only: [] })], [sturdy(monsterId, 'e0')]).events.some((event) => event.kind === 'effect' && event.effect === 'Oparzenie');
    assert.equal(burns('wraith'), true);
    assert.equal(burns('boar'), false);
    // A foe a little above 60% HP: the judgment waits for plain blows to
    // bring it below.
    const waited = fight('sad', [form('demon-slayer', { only: ['last-judgment'] })], [sturdy('boar', 'e0', { hp: 124000 })]);
    const judged = waited.events.findIndex((event) => event.skill === 'last-judgment' && BLOWS.includes(event.kind));
    assert.ok(judged > 0);
    assert.ok(waited.events[judged].hp + waited.events[judged].damage < 0.6 * 200000);
    assert.ok(waited.events.slice(0, judged).some((event) => event.actor === 'a0' && !event.skill && BLOWS.includes(event.kind)));
    const judge = form('demon-slayer', { only: ['last-judgment'] });
    const firstJudgment = (unit, monsterId) => fight(`sad:${monsterId}`, [unit], [sturdy(monsterId, 'e0', { hp: 100000 })]).events.find((event) => event.skill === 'last-judgment' && BLOWS.includes(event.kind)).damage;
    near(firstJudgment(judge, 'wraith') / firstJudgment(withParam(judge, 'last-judgment', 'familyBonus', 0), 'wraith'), 1 + paramOf(judge, 'last-judgment', 'familyBonus'), 0.02, 'Sąd ostateczny');
    near(firstJudgment(judge, 'boar') / firstJudgment(withParam(judge, 'last-judgment', 'familyBonus', 0), 'boar'), 1, 0.001, 'Sąd ostateczny on a beast');
    // A wraith drains life with its blows; sealed, it heals no more.
    const sealer = form('demon-slayer', { only: ['holy-seal'] });
    const sealed = fight('pieczec', [sealer], [sturdy('wraith', 'e0', { hp: 150000 })]);
    const seal = sealed.events.findIndex((event) => event.skill === 'holy-seal' && event.kind === 'skill');
    assert.match(sealed.events[seal].text, /do końca walki dostaje o \d+% więcej obrażeń i nie może się leczyć/);
    assert.ok(!sealed.events.slice(seal).some((event) => event.kind === 'drain' && event.actor === 'e0'));
    const open = fight('pieczec', [withParam(sealer, 'holy-seal', 'seal', false)], [sturdy('wraith', 'e0', { hp: 150000 })]);
    assert.ok(open.events.some((event) => event.kind === 'drain' && event.actor === 'e0'));
    const nextOn = (result) => after(result, (event) => event.skill === 'holy-seal' && event.kind === 'skill').find((event) => event.actor === 'a0' && !event.skill && BLOWS.includes(event.kind)).damage;
    near(nextOn(sealed) / nextOn(fight('pieczec', [withParam(sealer, 'holy-seal', 'damage', 0)], [sturdy('wraith', 'e0', { hp: 150000 })])), 1 + paramOf(sealer, 'holy-seal', 'damage'), 0.02, 'Pieczęć świętości');
  });

  test('Proroctwo: the party starts the fight blessed; Hymn heals the party and strengthens its blows; Wizja: the party dodges more', () => {
    const prophet = form('prophet', { only: [], position: 'back' });
    const friend = form('arena-legend', { only: [], id: 'a1', position: 'front' });
    const blessed = fight('proroctwo', [prophet, friend], [sturdy('boar', 'e0')]);
    const start = blessed.events.find((event) => event.skillName === 'Proroctwo');
    assert.equal(start.t, 0);
    assert.match(start.text, /Drużyna zaczyna walkę pobłogosławiona: pancerz i odporności \+24%, obrażenia \+13%/);
    const plain = fight('proroctwo', [withFeat(prophet, 'start', null), friend], [sturdy('boar', 'e0')]);
    near(blowsOf(blessed, 'a1')[0].damage / blowsOf(plain, 'a1')[0].damage, 1 + 0.08 * 1.6, 0.02, 'Proroctwo');
    const singer = form('prophet', { only: ['hymn'], hpShare: 0.6 });
    const sung = fight('hymn', [singer], [sturdy('boar', 'e0')]);
    assert.ok(sung.events.some((event) => event.skill === 'hymn' && event.kind === 'heal' && event.target === 'a0'));
    const ownAfter = (result) => after(result, (event) => event.skill === 'hymn' && event.kind === 'skill').find((event) => event.actor === 'a0' && BLOWS.includes(event.kind)).damage;
    const louder = ownAfter(sung) / ownAfter(fight('hymn', [withParam(singer, 'hymn', 'chorus', 0)], [sturdy('boar', 'e0')]));
    near(louder, 1 + paramOf(singer, 'hymn', 'chorus') * (1 + singer.feat.bonus), 0.02, 'Hymn');
    const dodged = (evasion) => {
      let dodges = 0;
      let blows = 0;
      for (const result of many(10, 'wizja', (seed) => fight(seed, [withParam(form('prophet', { only: ['vision'] }), 'vision', 'evasion', evasion)], [sturdy('wolf', 'e0')]))) {
        for (const event of after(result, (one) => one.skill === 'vision')) {
          if (event.actor !== 'e0' || event.target !== 'a0' || !['hit', 'crit', 'dodge'].includes(event.kind)) continue;
          blows += 1;
          if (event.kind === 'dodge') dodges += 1;
        }
      }
      return dodges / blows;
    };
    assert.ok(dodged(0.5) - dodged(0) > 0.15);
  });

  test('Ostatni cios: a kill gives one more move at once; Cios ostateczny kills a foe low on HP at once, but no champion; Krwawy znak: bleeding, and criticals find the foe more often', () => {
    const quick = fight('ostatni', [form('godslayer', { only: [] })], [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1')]);
    const kill = quick.events.findIndex((event) => event.kind === 'kill' && event.target === 'e0');
    const again = quick.events[kill + 1];
    assert.match(again.text, /Od razu rusza się jeszcze raz/);
    const next = quick.events.slice(kill + 2).find((event) => event.actor === 'a0' && BLOWS.includes(event.kind));
    assert.equal(next.t, again.t);
    // Poisoned foes take 15% more.
    assert.equal(form('godslayer', { only: [] }).feat.poisoned, 0.15);
    const slain = fight('ostateczny', [form('godslayer', { only: ['final-blow'] })], [sturdy('boar', 'e0', { hp: 30000 }), sturdy('wolf', 'e1')]);
    const blow = slain.events.find((event) => event.skill === 'final-blow');
    assert.equal(blow.target, 'e0');
    assert.match(blow.text, /To był cios śmiertelny/);
    assert.equal(blow.hp, 0);
    const champion = fight('ostateczny', [form('godslayer', { only: ['final-blow'] })], [sturdy('tusker', 'e0', { hp: 400000, maxHp: 2000000 })]);
    const struck = champion.events.find((event) => event.skill === 'final-blow');
    assert.equal(struck.target, 'e0');
    assert.ok(!/cios śmiertelny/.test(struck.text) && struck.hp > 0);
    const marker = form('godslayer', { only: ['blood-mark'] });
    const marked = fight('znak', [marker], [sturdy('boar', 'e0')]);
    assert.match(marked.events.find((event) => event.skill === 'blood-mark' && event.kind === 'skill').text, /krytyki trafiają w ten cel o \d+ pkt proc\. częściej/);
    assert.ok(marked.events.some((event) => event.kind === 'effect' && event.effect === 'Krwawienie' && event.target === 'e0'));
    const crits = (unit) => {
      let critical = 0;
      let blows = 0;
      for (const result of many(8, 'krwawy', (seed) => fight(seed, [unit], [sturdy('boar', 'e0')]))) {
        for (const event of after(result, (one) => one.skill === 'blood-mark' && one.kind === 'skill')) {
          if (event.actor !== 'a0' || event.skill || !BLOWS.includes(event.kind)) continue;
          blows += 1;
          if (event.kind === 'crit') critical += 1;
        }
      }
      return critical / blows;
    };
    assert.ok(crits(marker) - crits(withParam(marker, 'blood-mark', 'critMark', 0)) > 0.1);
  });

  test('Nieśmiertelność: the Licz survives a deadly blow once with 1 HP; Armia umarłych\'s knight strikes and poisons; Dotyk śmierci poisons and drains', () => {
    const undying = fight('niesmiertelnosc', [form('lich', { only: [], hpShare: 0.01 })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')]);
    const spared = undying.events.filter((event) => /Śmierć odchodzi z niczym: zostaje 1 HP/.test(event.text ?? ''));
    assert.equal(spared.length, 1);
    assert.deepEqual([spared[0].target, spared[0].hp], ['a0', 1]);
    assert.ok(undying.events.some((event) => event.kind === 'kill' && event.target === 'a0'));
    const army = fight('armia', [form('lich', { only: ['army-of-dead'] })], [sturdy('boar', 'e0')]);
    const up = army.events.find((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual([up.skill, up.figure, up.summon], ['army-of-dead', 'skeleton', 'Szkieletowy rycerz']);
    assert.ok(army.events.some((event) => event.skill === 'army-of-dead' && BLOWS.includes(event.kind) && /Szkieletowy rycerz atakuje/.test(event.text)));
    assert.ok(army.events.some((event) => event.kind === 'effect' && event.effect === 'Zatrucie' && event.target === 'e0'));
    const touched = fight('dotyk', [form('lich', { only: ['death-touch'], hpShare: 0.5 })], [sturdy('boar', 'e0')]);
    const touch = touched.events.findIndex((event) => event.skill === 'death-touch' && BLOWS.includes(event.kind));
    assert.equal(touched.events[touch + 1].kind, 'drain');
    assert.match(touched.events[touch + 1].text, /leczy się z zadanej rany/);
    assert.ok(touched.events.some((event) => event.kind === 'effect' && event.effect === 'Zatrucie' && event.target === 'e0'));
  });

  test('Nawałnica cieni strikes seven times; Zaćmienie makes the foes\' blows miss; Cienista forma is quicker and dodges more', () => {
    const storm = fight('nawalnica', [form('shadow-lord', { only: ['shadow-storm'] })], [sturdy('boar', 'e0'), sturdy('wolf', 'e1')]);
    const cast = storm.events.find((event) => event.skill === 'shadow-storm' && event.kind === 'skill');
    assert.equal(storm.events.filter((event) => event.t === cast.t && event.skill === 'shadow-storm' && ['hit', 'crit', 'dodge'].includes(event.kind)).length, 7);
    let misses = 0;
    for (const result of many(4, 'zacmienie', (seed) => fight(seed, [form('shadow-lord', { only: ['eclipse'] })], [sturdy('wolf', 'e0'), sturdy('wolf', 'e1')]))) {
      const start = result.events.findIndex((event) => event.skill === 'eclipse' && event.kind === 'skill');
      assert.match(result.events[start].text, /każdy cios wrogów ma \d+% szans chybić/);
      misses += result.events.slice(start).filter((event) => event.missed && /chybia w ciemności/.test(event.text)).length;
    }
    assert.ok(misses > 0);
    const lord = form('shadow-lord', { only: [] });
    assert.deepEqual([lord.feat.kind, lord.feat.dodge, lord.feat.afterDodge, lord.feat.speed], ['shadowStep', 0.05, 1.2, 0.25]);
    // Quicker than the Widmo it grew out of.
    assert.ok(lord.speed > form('phantom', { only: [] }).speed);
  });
});

describe('the third forms against the second forms (tools/class-balance-sim.mjs, tools/pvp-arena-sim.mjs)', () => {
  test('a third form is clearly stronger than its second form, and the third forms are closer to each other than the second forms', () => {
    // Four-hour explorations of the newest place at level 200 by the
    // realistic player of tools/difficulty-sim.mjs, alone (without
    // companions it is harder): the third form faints no more often, and
    // ends them with more HP or kills clearly quicker.
    const rows = [];
    for (const cls of content.classes) {
      content.skills.filter((skill) => skill.classId === cls.id).forEach((skill, index) => {
        const path = index === 0 ? null : skill.id;
        const options = { model: 'realistic-nocomp', classId: cls.id, level: 200, minutes: 240, hunts: 120, path };
        rows.push([measureClass(options, secondOnly), measureClass(options, content)]);
      });
    }
    assert.deepEqual(rows.map(([, third]) => third.evolution).sort(), [...FORMS].sort());
    for (const [second, third] of rows) {
      const told = `${third.evolution}: ${third.defeats} faints, HP ${third.endHp.toFixed(3)}, kills ${(third.killSpeed / second.killSpeed).toFixed(2)}× vs ${second.defeats} and ${second.endHp.toFixed(3)}`;
      assert.ok(third.defeats <= second.defeats, told);
      assert.ok(third.endHp >= second.endHp || third.killSpeed >= 1.15 * second.killSpeed, told);
    }
    const spread = (list) => Math.max(...list) - Math.min(...list);
    assert.ok(spread(rows.map(([, third]) => third.endHp)) < spread(rows.map(([second]) => second.endHp)));
    assert.ok(Math.max(...rows.map(([, third]) => third.defeats)) <= 0.1);
  });

  test('in the Arena at level 200 each third form wins 25–75% of its duels against the other paths, and the duels last a few rounds', () => {
    // The Pogromca Demonów wins the fewest: the Inkwizytor's line stays the
    // weaker one in duels (779 A).
    const result = measure({ level: 200, seeds: 1, model: 'realistic', paths: true }, content);
    assert.deepEqual(Object.keys(result.paths).sort(), [...FORMS].sort());
    for (const [id, share] of Object.entries(result.paths)) assert.ok(share >= 0.25 && share <= 0.75, `${id} wins ${share}`);
    assert.ok(result.median >= 16 && result.median <= 40, `median ${result.median} moves`);
    assert.ok(result.limits <= 0.12, `the judge ended ${result.limits}`);
  });
});

describe('the third evolution through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const create = async () => {
    ({ cookie } = await signUp('trzeciaforma'));
    await call('POST', '/api/character', { cookie, body: { name: 'Trzeciaforma', classId: 'warrior', appearance: 'male' } });
  };
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const ready = `level = 150, class_level = 200, evolution = 'berserker', skills = '{"shattering-blow":95,"berserker-roar":95}'`;

  beforeEach(() => create());

  test('at class level 200 with the points spent the character sees its one form, takes it with its skills at 0 and keeps its stat points', async () => {
    await set(`level = 150, class_level = 199, evolution = 'berserker', skills = '{"shattering-blow":95,"berserker-roar":94}', points = '{"strength":3}'`);
    let view = await character();
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['berserker', null, 200]);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } })).data.error.code, 'class_level');
    await set('class_level = 200');
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } })).data.error.code, 'skill_points');
    assert.equal((await character()).skills.evolution.need, 'skill_points');
    await set(`skills = '{"shattering-blow":95,"berserker-roar":95}'`);
    view = await character();
    assert.equal(view.evolution.next.id, 'horde-slayer');
    assert.equal(view.evolution.next.name, 'Pogromca Hord');
    assert.deepEqual(view.skills.evolution, { level: 200, need: 'evolve' });
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'arena-legend' } })).status, 400);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.evolution.name, 'Pogromca Hord');
    const after = taken.data.character;
    assert.equal(after.className, 'Pogromca Hord');
    assert.equal(after.baseClassName, 'Wojownik');
    assert.equal(after.evolution.current.trait.name, 'Szał bez granic');
    assert.deepEqual([after.evolution.next, after.evolution.nextLevel], [null, null]);
    assert.equal(after.skills.points, 191);
    assert.deepEqual(after.skills.pools[0].options.map((skill) => [skill.id, skill.level, skill.maxLevel]), [
      ['smashing-blow', 0, 145],
      ['slaughter', 0, 145],
    ]);
    // No free reset of the stat points after the third form.
    assert.equal(after.evolutionReset, null);
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT points FROM characters').first()).points), { strength: 3 });
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } })).data.error.code, 'evolved');
    const raised = await call('POST', '/api/skills/raise', { cookie, body: { skillId: 'smashing-blow', count: 145 } });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.skills.points, 46);
  });

  test('a woman takes the form under its woman\'s name, in the ranking too', async () => {
    await (await db()).prepare('DELETE FROM characters').run();
    await call('POST', '/api/character', { cookie, body: { name: 'Trzeciaformka', classId: 'warrior', appearance: 'female' } });
    await set(ready);
    assert.equal((await character()).evolution.next.name, 'Pogromczyni Hord');
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } });
    assert.equal(taken.data.character.className, 'Pogromczyni Hord');
    assert.equal(taken.data.character.skills.pools[0].options[0].path, 'Pogromczyni Hord');
    const ranking = await call('GET', '/api/ranking', { cookie });
    assert.equal(ranking.status, 200, JSON.stringify(ranking.data));
    assert.equal(ranking.data.rows.find((row) => row.own).className, 'Pogromczyni Hord');
  });

  test('on the test version the third form can be tried at any level and undone back to where the test started', async () => {
    await set(`level = 120, class_level = 120, evolution = 'berserker', skills = '{"shattering-blow":11,"berserker-roar":0}'`);
    const tried = await call('GET', '/api/evolution/test', { cookie });
    assert.deepEqual(tried.data.evolutions.map((evolution) => evolution.id), ['horde-slayer']);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer', test: true } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.character.className, 'Pogromca Hord');
    assert.equal(taken.data.character.evolutionUndo, true);
    // Nothing after the third form.
    assert.deepEqual((await call('GET', '/api/evolution/test', { cookie })).data.evolutions, []);
    const undone = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(undone.status, 200, JSON.stringify(undone.data));
    assert.equal(undone.data.character.className, 'Berserker');
    const row = await (await db()).prepare('SELECT evolution, skills, evolution_undo FROM characters').first();
    assert.deepEqual([row.evolution, JSON.parse(row.skills), row.evolution_undo], ['berserker', { 'shattering-blow': 11, 'berserker-roar': 0 }, null]);
    // A second form tried, then its third: undone back to the first evolution.
    await set(`evolution = 'barbarian', skills = '{"crushing-blow":7}'`);
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker', test: true } });
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer', test: true } });
    const back = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(back.data.character.className, 'Barbarzyńca');
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT skills FROM characters').first()).skills), { 'crushing-blow': 7 });
  });

  test('on the test version a second form gets class level 200 at once, and keeps its form', async () => {
    await set(`level = 120, class_level = 120, class_xp = 9, evolution = 'berserker', skills = '{"shattering-blow":11,"berserker-roar":0}'`);
    const raised = await call('POST', '/api/evolution/test-level?level=200', { cookie });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.classLevel, 200);
    assert.equal(raised.data.character.className, 'Berserker');
    const row = await (await db()).prepare('SELECT class_xp, evolution FROM characters').first();
    assert.deepEqual([row.class_xp, row.evolution], [0, 'berserker']);
    // A first evolution, or a third form, gets no class level 200.
    await set(`evolution = 'barbarian', skills = '{}'`);
    assert.equal((await call('POST', '/api/evolution/test-level?level=200', { cookie })).data.error.code, 'not_second');
    await set(`evolution = 'horde-slayer', skills = '{}'`);
    assert.equal((await call('POST', '/api/evolution/test-level?level=200', { cookie })).data.error.code, 'not_second');
  });
});

describe('the third evolution where the deployment has it off (the live game for now)', () => {
  const { call, db, signUp } = useServer({ THIRD_EVOLUTION: 'off' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('bezczwartej'));
    await call('POST', '/api/character', { cookie, body: { name: 'Bezczwartej', classId: 'warrior', appearance: 'male' } });
  });
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();

  test('through the API a second form has no third form: the class waits at 200 only for its points', async () => {
    await set(`level = 150, class_level = 200, evolution = 'berserker', skills = '{"shattering-blow":95,"berserker-roar":90}'`);
    let view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['berserker', null, null]);
    assert.deepEqual(view.skills.evolution, { level: 200, need: 'skill_points' });
    await set(`skills = '{"shattering-blow":95,"berserker-roar":95}'`);
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(view.skills.evolution.need, null);
    // The form is not there to be taken (a request made by hand is refused).
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'horde-slayer' } });
    assert.ok(taken.status >= 400 && taken.data.error);
    assert.equal((await (await db()).prepare('SELECT evolution FROM characters').first()).evolution, 'berserker');
    assert.deepEqual((await call('GET', '/api/evolution/test', { cookie })).data.evolutions, []);
    assert.equal((await call('POST', '/api/evolution/test-level?level=200', { cookie })).data.error.code, 'not_second');
    // The game's content has no third form either.
    const { evolutionArt: art } = (await call('GET', '/api/content')).data;
    assert.equal(art.forms.berserker, 'barbarian');
    assert.equal(art.forms['horde-slayer'], undefined);
  });
});
