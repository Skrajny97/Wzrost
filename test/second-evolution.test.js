// The second evolution ("Druga ewolucja klas"): at class level 100 each of
// the 15 evolutions grows into one further form. The class waits there
// until the form is taken, the form's skills take every Skill Point back
// and grow to level 95, the stats grow over three spans, the names have a
// woman's form, the Pustelnik changes it with the first evolution, the art
// stands in with the first evolution's until it has its own, and every new
// skill and trait works in fights.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  applyHunt,
  autoDistribute,
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
  simulateHunt,
  skillParams,
  skillPoints,
  skillsView,
} from '../src/engine/index.js';
import { evolvedSkills as simulatedSkills } from '../tools/evolution-sim.mjs';
import { areaForLevel, typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const FORMS = [
  'berserker', 'arena-champion', 'bastion', 'marksman', 'thunder-lord', 'master-hunter', 'archmage', 'winter-lord',
  'druid', 'miracle-worker', 'grand-inquisitor', 'high-priest', 'kingslayer', 'necromancer', 'phantom',
];
const firsts = content.evolutions.filter((evolution) => !evolution.from);
const seconds = content.evolutions.filter((evolution) => evolution.from);

// A Barbarzyńca at a class level, its skills at their top by default.
const barbarian = (classLevel, skills = { 'crushing-blow': 45, 'blood-frenzy': 45 }, extra = {}) => ({
  classId: 'warrior',
  level: 80,
  xp: 0,
  classLevel,
  classXp: 0,
  points: {},
  appearance: 'male',
  evolution: 'barbarian',
  skills,
  ...extra,
});

describe('the second evolution in the engine', () => {
  test('each first evolution grows into exactly one second form of its class, with its names and description', () => {
    assert.equal(firsts.length, 15);
    assert.deepEqual(firsts.map((evolution) => nextFormOf(evolution, content).id), FORMS);
    for (const form of seconds) {
      const first = content.evolutionsById[form.from];
      assert.equal(form.classId, first.classId, form.id);
      assert.equal(form.stage, 2, form.id);
      assert.ok(form.description, form.id);
      // Its first skill grows one of the first evolution's.
      assert.ok(first.skills.includes(content.skillsById[form.skills[0]].from), form.id);
      for (const id of form.skills) {
        assert.equal(content.skillsById[id].maxLevel, 95, id);
        assert.equal(content.skillsById[id].classLevel, 100, id);
      }
    }
    // Second forms are taken, not chosen: never among the choices at 50.
    assert.deepEqual(evolutionChoices({ classId: 'warrior', skills: {} }, content, { all: true }).map((evolution) => evolution.id), ['barbarian', 'gladiator', 'guardian']);
    // The approved names, a man's and a woman's.
    assert.deepEqual(seconds.map((form) => form.name), [
      'Berserker', 'Czempion Areny', 'Bastion', 'Strzelec Wyborowy', 'Władca Piorunów', 'Mistrz Łowów', 'Arcymag Żywiołów', 'Pan Zimy',
      'Druid', 'Cudotwórca', 'Wielki Inkwizytor', 'Arcykapłan', 'Królobójca', 'Nekromanta', 'Widmo',
    ]);
    assert.deepEqual(seconds.map((form) => evolutionName(form, 'female')), [
      'Berserkerka', 'Czempionka Areny', 'Bastion', 'Strzelczyni Wyborowa', 'Władczyni Piorunów', 'Mistrzyni Łowów', 'Arcymagini Żywiołów', 'Pani Zimy',
      'Druidka', 'Cudotwórczyni', 'Wielka Inkwizytorka', 'Arcykapłanka', 'Królobójczyni', 'Nekromantka', 'Widmo',
    ]);
    assert.equal(content.evolutionsById.necromancer.description, 'Trucizna to był tylko początek. Nekromanta nabywa cech nekrotycznych.');
  });

  test('the class waits at 100 while a Skill Point is left, then until the second form is taken; after it only for points at 200', () => {
    assert.deepEqual(evolutionBlock(barbarian(99, { 'crushing-blow': 45, 'blood-frenzy': 40 }), content), { code: 'skill_points', level: 100 });
    assert.deepEqual(evolutionBlock(barbarian(100, { 'crushing-blow': 45, 'blood-frenzy': 44 }), content), { code: 'skill_points', level: 100 });
    assert.deepEqual(evolutionBlock(barbarian(100), content), { code: 'evolve', level: 100 });
    // A class already past 100 (it grew on before the second forms) waits
    // for nothing and takes its form at once.
    assert.equal(evolutionBlock(barbarian(120), content), null);
    assert.equal(evolveBlock(barbarian(120), 'berserker', content), null);
    // The exploration holds the class at 100, and its XP adds up.
    const hunt = { xp: 1e9, result: 'success', timePoints: 0 };
    const held = applyHunt(barbarian(100), hunt, content);
    assert.equal(held.classLevel, 100);
    assert.ok(held.classXp > 0);
    assert.ok(held.messages.some((line) => line.includes('u progu ewolucji') && line.includes('w zakładce Ewolucja')));
    // With the form the class grows on, and at 200 waits only for points.
    const berserker = (classLevel, skills) => barbarian(classLevel, skills, { evolution: 'berserker' });
    assert.ok(applyHunt(berserker(100, { 'shattering-blow': 1, 'berserker-roar': 0 }), hunt, content).classLevel > 100);
    assert.deepEqual(evolutionBlock(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 90 }), content), { code: 'skill_points', level: 200 });
    assert.equal(evolutionBlock(berserker(200, { 'shattering-blow': 95, 'berserker-roar': 95 }), content), null);
  });

  test('the second form asks for its first evolution, class level 100 and the points spent; the test lifts the level', () => {
    assert.equal(evolveBlock(barbarian(99), 'berserker', content).code, 'class_level');
    assert.equal(evolveBlock(barbarian(100, { 'crushing-blow': 45, 'blood-frenzy': 30 }), 'berserker', content).code, 'skill_points');
    assert.equal(evolveBlock(barbarian(100), 'arena-champion', content).code, 'unknown_evolution');
    assert.equal(evolveBlock({ ...barbarian(100), evolution: null, skills: { 'power-strike': 20, unyielding: 20 } }, 'berserker', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(barbarian(100, {}, { evolution: 'berserker' }), 'berserker', content).code, 'evolved');
    assert.equal(evolveBlock(barbarian(100), 'barbarian', content).code, 'evolved');
    assert.equal(evolveBlock(barbarian(60, { 'crushing-blow': 3 }), 'berserker', content, { test: true }), null);
    assert.equal(evolveBlock(barbarian(100), 'berserker', content), null);
  });

  test('taking it: the form\'s two skills at 0 with the 90 points back, class levels 100–199 bring 100 more, up to level 95 each', () => {
    const taken = { ...barbarian(100), evolution: 'berserker', skills: evolvedSkills('berserker', content) };
    assert.deepEqual(taken.skills, { 'shattering-blow': 0, 'berserker-roar': 0 });
    assert.deepEqual(skillPoints(taken, content), { earned: 91, spent: 0, free: 91 });
    assert.equal(skillPoints({ ...taken, classLevel: 199 }, content).earned, 190);
    assert.equal(skillPoints({ ...taken, classLevel: 260 }, content).earned, 190);
    assert.equal(raiseBlock({ ...taken, classLevel: 199, skills: { 'shattering-blow': 94, 'berserker-roar': 0 } }, 'shattering-blow', content), null);
    assert.equal(raiseBlock({ ...taken, classLevel: 199, skills: { 'shattering-blow': 95, 'berserker-roar': 0 } }, 'shattering-blow', content).code, 'max_level');
    const view = skillsView(taken, content);
    assert.deepEqual(view.pools[0].options.map((skill) => [skill.name, skill.state, skill.maxLevel]), [
      ['Kruszący cios', 'main', 95],
      ['Ryk berserkera', 'second', 95],
    ]);
    assert.equal(view.points, 91);
    assert.equal(view.lastPointLevel, 199);
    assert.deepEqual(view.evolution, { level: 200, need: 'skill_points' });
    // At its first level a grown skill is about its root at the top level.
    const root = skillParams(content.skillsById['crushing-blow'], 45, content);
    const grown = skillParams(content.skillsById['shattering-blow'], 1, content);
    assert.ok(Math.abs(grown.power - root.power) < 1e-9 && Math.abs(grown.armorIgnore - root.armorIgnore) < 1e-9);
    // The form's trait in fights.
    const { character, equipped } = typicalCharacter('warrior', 90, content);
    const unit = playerCombatant({ character: { ...character, classLevel: 110, skills: taken.skills, evolution: 'berserker' }, equipped, name: 'Berserker' }, content);
    assert.deepEqual([unit.feat.kind, unit.feat.damage, unit.feat.lifesteal], ['fury', 0.5, 0.05]);
  });

  test('the stats grow by the class to 50, the first evolution from 51 to 100 and the second form from 101, HP and mana too', () => {
    const at = (classLevel, evolution) => computeStats({ classId: 'warrior', level: 80, classLevel, points: {}, evolution }, [], content).totals;
    const base = content.classesById.warrior.baseStats.strength;
    assert.equal(at(120, 'berserker').strength, base + 2 * 49 + 3 * 50 + 4 * 20);
    assert.equal(at(120, 'barbarian').strength, base + 2 * 49 + 3 * 70);
    assert.equal(at(100, 'berserker').strength, at(100, 'barbarian').strength);
    assert.equal(at(120, 'berserker').vitality - at(120, 'barbarian').vitality, 20);
    const druid = { classId: 'mage', level: 80, classLevel: 120, points: {}, skills: {}, evolution: 'druid' };
    const perLevel = perClassLevelOf(druid, content);
    assert.equal(Math.round(perLevel.mana * 120), 3 * 50 + 4 * 50 + 5 * 20);
    assert.equal(Math.round(perLevel.hp * 120), 3 * 50 + 3 * 50 + 4 * 20);
    // A form without its own HP and mana takes those before it.
    assert.deepEqual(perClassLevelOf({ ...druid, evolution: 'winter-lord' }, content), content.classesById.mage.perClassLevel);
    assert.equal(Math.round(perClassLevelOf({ ...druid, classLevel: 100 }, content).mana * 100), 3 * 50 + 4 * 50);
  });

  test('a woman goes by the form\'s woman\'s name wherever the class name shows', () => {
    const female = { ...barbarian(100), appearance: 'female', evolution: 'berserker', skills: evolvedSkills('berserker', content) };
    assert.equal(classNameOf(female, content), 'Berserkerka');
    assert.equal(classNameOf({ ...female, appearance: 'male' }, content), 'Berserker');
    assert.equal(classNameOf({ ...female, evolution: 'bastion' }, content), 'Bastion');
    assert.equal(classNameOf({ ...female, evolution: 'barbarian' }, content), 'Barbarzyńca');
    assert.equal(skillsView(female, content).pools[0].options[0].path, 'Berserkerka');
    assert.equal(evolutionView(content.evolutionsById.necromancer, content, { appearance: 'female' }).name, 'Nekromantka');
    assert.equal(evolutionView(content.evolutionsById.necromancer, content, { appearance: 'female' }).fromName, 'Truciciel');
  });

  test('the panel shows the one form to take at 100 once the points are spent, and when it comes', () => {
    const before = evolutionPanel(barbarian(99), content);
    assert.deepEqual([before.current.id, before.next, before.nextLevel], ['barbarian', null, 100]);
    assert.equal(evolutionPanel(barbarian(100, { 'crushing-blow': 45, 'blood-frenzy': 40 }), content).next, null);
    const ready = evolutionPanel(barbarian(100), content);
    assert.deepEqual(ready.choices, []);
    assert.equal(ready.next.id, 'berserker');
    assert.equal(ready.next.stage, 2);
    assert.equal(ready.next.skillLevel, 95);
    assert.equal(ready.next.fromName, 'Barbarzyńca');
    assert.equal(ready.next.description, 'W szale bitewnym nie czuje bólu ani strachu. Im bliżej śmierci, tym groźniejszy.');
    assert.equal(ready.next.skills[0].from, 'Druzgocący cios');
    assert.equal(ready.next.skills[0].effect, 'Cios za 400% obrażeń, który pomija 70% pancerza celu. Cel ma 40% szans stracić 2 najbliższe ruchy.');
    assert.deepEqual(ready.next.growth.map((entry) => `${entry.name} ${entry.value}`), ['Siła 4', 'Witalność 3', 'Wytrzymałość 2']);
    const after = evolutionPanel({ ...barbarian(100), evolution: 'berserker' }, content);
    assert.deepEqual([after.current.id, after.next, after.nextLevel], ['berserker', null, null]);
  });

  test('the Pustelnik changes a second form for another path\'s second form', () => {
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'berserker' }, content).map((evolution) => evolution.id), ['arena-champion', 'bastion']);
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'barbarian' }, content).map((evolution) => evolution.id), ['gladiator', 'guardian']);
  });

  test('a second form stands in with its first evolution\'s art, and its skills with those they grow from, until they have their own', async () => {
    const art = evolutionArt(content);
    assert.equal(Object.keys(art.forms).length, 15);
    assert.equal(art.forms.berserker, 'barbarian');
    assert.equal(art.forms.necromancer, 'poisoner');
    assert.deepEqual(art.skills['shattering-blow'], ['crushing-blow']);
    assert.deepEqual(art.skills['berserker-roar'], ['blood-frenzy']);
    // The Arcykapłan's grown skill comes from Psalm, so the new one stands
    // in with the other skill of the Kapłan, not Psalm twice.
    assert.deepEqual(art.skills.choir, ['psalm']);
    assert.deepEqual(art.skills['divine-shield'], ['great-blessing']);
    const { SPRITES, artChain, lookIds, riderFile, walkerSheet } = await import('../src/client/art.js');
    const { state } = await import('../src/client/state.js');
    // Every stand-in has its art already.
    for (const [id, [stand]] of Object.entries(art.skills)) assert.ok(SPRITES.skills.ids.includes(stand), `${id}: ${stand}`);
    for (const [form, first] of Object.entries(art.forms)) {
      for (const look of ['female', 'male']) {
        for (const kind of ['portraits', 'walkers', 'riders']) assert.ok(SPRITES[kind].ids.includes(`${first}-${look}`), `${form}: ${kind} ${first}-${look}`);
      }
    }
    const before = state.content;
    state.content = { evolutionArt: art };
    try {
      // The form's own art first, so a file and its id on the list are all
      // it takes; then the first evolution's, then the class's. Every second
      // form walks and rides in its own look.
      assert.deepEqual(lookIds('warrior', 'female', 'berserker'), ['berserker-female', 'barbarian-female', 'warrior-female']);
      assert.equal(walkerSheet('warrior', 'female', undefined, 'berserker'), 'art/walkers/berserker-female.png');
      assert.equal(riderFile('cleric', 'male', undefined, 'high-priest'), 'art/riders/high-priest-male.png');
      assert.deepEqual(artChain('ent-summon'), ['ent-summon', 'elemental-summon']);
      assert.deepEqual(artChain('power-strike'), ['power-strike']);
    } finally {
      state.content = before;
    }
  });
});

describe('the second forms in fights', () => {
  // A character of a second form (level 90, class level 120) with the
  // form's skills at `skillLevel` (`only`: just these of them).
  function form(evolutionId, { skillLevel = 50, only, classLevel = 120, level = 90, hpShare, id = 'a0', position } = {}) {
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
  const foe = (monsterId, level, id, extra = {}) => ({ ...monsterCombatant({ monsterId, level, id }, content), ...extra });
  const sturdy = (monsterId, level, id, extra = {}) => foe(monsterId, level, id, { hp: 60000, maxHp: 60000, ...extra });
  const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
  const blowsOf = (result, actor) => result.events.filter((event) => event.actor === actor && ['hit', 'crit'].includes(event.kind));
  const after = (result, find) => result.events.slice(result.events.findIndex(find) + 1);

  test('Żniwo: a foe killed by the Nekromanta\'s poison rises as a skeleton that fights on its side to the end of the fight', () => {
    // A quick foe with 1 HP: its poison kills it on its next move, before
    // the Nekromanta strikes it.
    const necromancer = form('necromancer', { only: ['curse-of-decay'] });
    const result = fight('zniwo', [necromancer], [foe('wolf', 88, 'e0', { hp: 1, speed: 50 }), sturdy('boar', 88, 'e1')]);
    const killed = result.events.findIndex((event) => event.kind === 'kill' && event.target === 'e0');
    assert.ok(killed > 0);
    assert.equal(result.events[killed - 1].kind, 'tick');
    assert.equal(result.events[killed - 1].effect, 'Zatrucie');
    const risen = result.events[killed + 1];
    assert.deepEqual([risen.kind, risen.state, risen.actor, risen.skill, risen.figure], ['summon', 'up', 'a0', 'risen', 'skeleton']);
    assert.equal(risen.summonHp, Math.round(necromancer.maxHp * 0.3));
    assert.match(risen.text, /wstaje jako szkielet/);
    const later = result.events.slice(killed + 2);
    // It strikes the foes and takes their blows, and does not go away.
    assert.ok(later.some((event) => event.actor === 'a0' && event.skill === 'risen' && ['hit', 'crit', 'dodge'].includes(event.kind) && event.target === 'e1'));
    assert.ok(later.some((event) => event.kind === 'summon' && event.state === 'hit' && event.actor === 'e1'));
    assert.ok(!later.some((event) => event.kind === 'summon' && event.state === 'gone'));
    // A foe killed by a blow stays down.
    const struck = fight('zniwo-cios', [form('necromancer', { only: [] })], [foe('wolf', 88, 'e0', { hp: 1 }), sturdy('boar', 88, 'e1')]);
    assert.ok(struck.events.some((event) => event.kind === 'kill' && event.target === 'e0'));
    assert.ok(!struck.events.some((event) => event.kind === 'summon'));
  });

  test('Wskrzeszenie: a skeleton warrior that strikes and poisons; Klątwa rozkładu poisons every foe and wears its armour away', () => {
    const raised = fight('wskrzeszenie', [form('necromancer', { only: ['raise-dead'] })], [sturdy('boar', 88, 'e0')]);
    const up = raised.events.find((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual([up.skill, up.figure, up.summon], ['raise-dead', 'skeleton', 'Szkielet wojownik']);
    assert.ok(raised.events.some((event) => event.skill === 'raise-dead' && event.kind === 'hit' && /Szkielet wojownik atakuje/.test(event.text)));
    assert.ok(raised.events.some((event) => event.kind === 'effect' && event.effect === 'Zatrucie' && event.target === 'e0'));
    const cursed = fight('klatwa', [form('necromancer', { only: ['curse-of-decay'] })], [sturdy('boar', 88, 'e0'), sturdy('wolf', 88, 'e1')]);
    const cast = cursed.events.find((event) => event.skill === 'curse-of-decay');
    assert.deepEqual(cast.targets, ['e0', 'e1']);
    for (const id of ['e0', 'e1']) {
      assert.ok(cursed.events.some((event) => event.kind === 'tick' && event.target === id && /Pancerz celu słabnie o \d+%/.test(event.text)), id);
    }
    // The curse is no blow.
    assert.ok(!cursed.events.some((event) => event.skill === 'curse-of-decay' && ['hit', 'crit'].includes(event.kind)));
  });

  test('Moc puszczy: the Druid\'s ent and bear have 30% more HP and strike 30% harder, and one waits while the other stands', () => {
    const druid = form('druid', { only: ['ent-summon', 'bear-summon'], skillLevel: 40 });
    const plain = withFeat(withFeat(druid, 'summonHp', 0), 'summonPower', 0);
    const strong = fight('druid', [druid], [sturdy('boar', 88, 'e0')]);
    const weak = fight('druid', [plain], [sturdy('boar', 88, 'e0')]);
    const upOf = (result) => result.events.find((event) => event.kind === 'summon' && event.state === 'up');
    assert.equal(upOf(strong).skill, 'ent-summon');
    assert.equal(upOf(strong).summonHp, Math.max(1, Math.round(druid.maxHp * skillParams(content.skillsById['ent-summon'], 40, content).hp * 1.3)));
    assert.ok(Math.abs(upOf(strong).summonHp / upOf(weak).summonHp - 1.3) < 0.01);
    const firstBlow = (result) => result.events.find((event) => event.skill === 'ent-summon' && event.kind === 'hit');
    assert.ok(Math.abs(firstBlow(strong).damage / firstBlow(weak).damage - 1.3) < 0.03, `${firstBlow(strong).damage} / ${firstBlow(weak).damage}`);
    // One summon at a time: the bear comes after the ent has gone or fallen.
    const summons = strong.events.filter((event) => event.kind === 'summon' && ['up', 'gone', 'fell'].includes(event.state));
    assert.ok(summons.some((event) => event.state === 'up' && event.skill === 'bear-summon'));
    let standing = null;
    for (const event of summons) {
      if (event.state === 'up') {
        assert.equal(standing, null, 'a second summon while one stands');
        standing = event.skill;
      } else standing = null;
    }
  });

  test('Kruszący cios takes two moves; Wir stali makes every foe it hits bleed; Deszcz meteorów burns them', () => {
    const stunned = Array.from({ length: 10 }, (_, seed) => fight(`kruszacy:${seed}`, [form('berserker', { only: ['shattering-blow'], skillLevel: 95 })], [sturdy('boar', 88, 'e0')]))
      .flatMap((result) => result.events)
      .find((event) => event.kind === 'stun');
    assert.equal(stunned.label, 'ogłuszony');
    assert.match(stunned.text, /traci 2 najbliższe ruchy/);
    const bled = fight('wir-stali', [form('arena-champion', { only: ['steel-whirl'] })], [sturdy('wolf', 88, 'e0'), sturdy('wolf', 88, 'e1'), sturdy('fox', 88, 'e2')]);
    for (const id of ['e0', 'e1', 'e2']) assert.ok(bled.events.some((event) => event.kind === 'effect' && event.effect === 'Krwawienie' && event.target === id), id);
    const burned = fight('meteory', [form('archmage', { only: ['meteor-shower'], skillLevel: 95 })], [sturdy('wolf', 88, 'e0'), sturdy('wolf', 88, 'e1')]);
    for (const id of ['e0', 'e1']) assert.ok(burned.events.some((event) => event.kind === 'effect' && event.effect === 'Oparzenie' && event.target === id), id);
  });

  test('Ryk berserkera weakens the foes\' blows, Mur tarcz hardens the party\'s armour, Chór strengthens the party\'s blows', () => {
    // Twin fights draw the same numbers: the first foe's blow after the
    // stance wakes differs only by the stance.
    const firstAfter = (result, skill, pick) => after(result, (event) => event.kind === 'skill' && event.skill === skill).find(pick);
    const foeHit = (event) => event.actor === 'e0' && event.target === 'a0' && event.kind === 'hit';
    const berserker = form('berserker', { only: ['berserker-roar'] });
    const roared = fight('ryk', [berserker], [sturdy('wolf', 88, 'e0')]);
    const quiet = fight('ryk', [withParam(berserker, 'berserker-roar', 'weaken', 0)], [sturdy('wolf', 88, 'e0')]);
    const weaken = berserker.skills[0].params.weaken;
    const ratio = firstAfter(roared, 'berserker-roar', foeHit).damage / firstAfter(quiet, 'berserker-roar', foeHit).damage;
    assert.ok(Math.abs(ratio - (1 - weaken)) < 0.02, `${ratio} vs ${1 - weaken}`);
    const bastion = form('bastion', { only: ['shield-wall'] });
    const walled = fight('mur', [bastion], [sturdy('wolf', 88, 'e0')]);
    const open = fight('mur', [withParam(bastion, 'shield-wall', 'wall', 0)], [sturdy('wolf', 88, 'e0')]);
    assert.ok(firstAfter(walled, 'shield-wall', foeHit).damage < firstAfter(open, 'shield-wall', foeHit).damage);
    const priest = form('high-priest', { only: ['choir'] });
    const sung = fight('chor', [priest], [sturdy('boar', 88, 'e0')]);
    const silent = fight('chor', [withParam(priest, 'choir', 'chorus', 0)], [sturdy('boar', 88, 'e0')]);
    const ownHit = (event) => event.actor === 'a0' && ['hit', 'crit'].includes(event.kind);
    const chorus = priest.skills[0].params.chorus * (1 + priest.feat.bonus);
    const louder = firstAfter(sung, 'choir', ownHit).damage / firstAfter(silent, 'choir', ownHit).damage;
    assert.ok(Math.abs(louder - (1 + chorus)) < 0.02, `${louder} vs ${1 + chorus}`);
  });

  test('Pojedynek challenges the foe with the most HP; Namierzenie locks a foe that cannot dodge the character', () => {
    const champion = form('arena-champion', { only: ['duel'] });
    const enemies = () => [foe('wolf', 88, 'e0', { hp: 500 }), sturdy('boar', 88, 'e1')];
    const duel = fight('pojedynek', [champion], enemies());
    const cast = duel.events.find((event) => event.skill === 'duel' && event.kind === 'skill');
    assert.deepEqual(cast.targets, ['e1']);
    assert.match(cast.text, /staje do pojedynku/);
    const plain = fight('pojedynek', [withParam(withParam(champion, 'duel', 'damage', 0), 'duel', 'guard', 0)], enemies());
    const onBoar = (result) => after(result, (event) => event.skill === 'duel' && event.kind === 'skill').find((event) => event.actor === 'a0' && event.target === 'e1' && event.kind === 'hit');
    const harder = onBoar(duel).damage / onBoar(plain).damage;
    assert.ok(Math.abs(harder - (1 + champion.skills[0].params.damage)) < 0.03, String(harder));
    for (let seed = 0; seed < 5; seed++) {
      const locked = fight(`namierzenie:${seed}`, [form('marksman', { only: ['target-lock'] })], [sturdy('wolf', 88, 'e0')]);
      const rest = after(locked, (event) => event.skill === 'target-lock' && event.kind === 'skill');
      assert.ok(rest.some((event) => event.actor === 'a0' && event.target === 'e0' && ['hit', 'crit'].includes(event.kind)));
      assert.ok(!rest.some((event) => event.actor === 'a0' && event.target === 'e0' && event.kind === 'dodge'));
    }
  });

  test('Zniknięcie: no foe hits the character for a move, and its next blow is critical; Cień-sobowtór repeats its blows', () => {
    // Quick foes, so they strike while the Królobójca is gone.
    const vanished = fight('znikniecie', [form('kingslayer', { only: ['vanish'] })], [sturdy('wolf', 88, 'e0', { speed: 6 }), sturdy('wolf', 88, 'e1', { speed: 6 })]);
    const start = vanished.events.findIndex((event) => event.skill === 'vanish' && event.kind === 'skill');
    const end = vanished.events.findIndex((event, index) => index > start && event.kind === 'fade' && event.skill === 'vanish');
    assert.ok(start >= 0 && end > start);
    const meanwhile = vanished.events.slice(start, end).filter((event) => event.target === 'a0' && ['hit', 'crit', 'dodge'].includes(event.kind));
    assert.ok(meanwhile.length > 0);
    for (const event of meanwhile) assert.match(event.text, /znika w cieniu/);
    assert.equal(blowsOf({ events: vanished.events.slice(start) }, 'a0')[0].kind, 'crit');
    const doubled = fight('sobowtor', [form('phantom', { only: ['shadow-double'] })], [sturdy('boar', 88, 'e0')]);
    const own = doubled.events.findIndex((event, index) => index > doubled.events.findIndex((each) => each.skill === 'shadow-double') && event.actor === 'a0' && ['hit', 'crit'].includes(event.kind) && !event.skill);
    assert.ok(own > 0);
    const repeat = doubled.events[own + 1];
    assert.deepEqual([repeat.actor, repeat.target, repeat.skill], ['a0', 'e0', 'shadow-double']);
  });

  test('Strzał w serce goes through two foes behind its target; Kula piorunów strikes every move', () => {
    const lined = [foe('wolf', 88, 'e0', { hp: 300, position: 'front' }), sturdy('crow', 88, 'e1', { position: 'middle' }), sturdy('owl', 88, 'e2', { position: 'back' })];
    const shot = fight('serce', [form('marksman', { only: ['heart-shot'] })], lined);
    const first = shot.events.findIndex((event) => event.skill === 'heart-shot');
    assert.deepEqual(shot.events.slice(first).filter((event) => event.skill === 'heart-shot').slice(0, 3).map((event) => event.target), ['e0', 'e1', 'e2']);
    const orb = fight('kula', [form('thunder-lord', { only: ['thunder-orb'] })], [sturdy('boar', 88, 'e0')]);
    assert.ok(orb.events.filter((event) => event.skill === 'thunder-orb' && ['hit', 'crit'].includes(event.kind)).length >= 3);
    assert.match(orb.events.find((event) => event.skill === 'thunder-orb').text, /kula piorunów razi wrogów/);
  });

  test('Wilk bites as a summon and may miss; Lodowa zbroja slows those who strike it; Boska ochrona shields the whole party', () => {
    const wolfFights = Array.from({ length: 6 }, (_, seed) => fight(`wilk:${seed}`, [form('master-hunter', { only: ['wolf-call'] })], [sturdy('fox', 88, 'e0')]));
    const bites = wolfFights.flatMap((result) => result.events).filter((event) => event.skill === 'wolf-call' && event.actor === 'a0');
    assert.ok(bites.some((event) => event.kind === 'hit' && /Wilk atakuje\./.test(event.text)));
    assert.ok(bites.some((event) => event.kind === 'dodge' && /Wilk atakuje, ale/.test(event.text)));
    assert.equal(wolfFights[0].events.find((event) => event.kind === 'summon' && event.state === 'up').figure, 'wolf');
    const iced = fight('lodowa-zbroja', [form('winter-lord', { only: ['ice-armor'], hpShare: 0.55 })], [sturdy('wolf', 88, 'e0')]);
    assert.match(iced.events.find((event) => event.skill === 'ice-armor').text, /zwalnia o \d+%/);
    assert.ok(iced.events.some((event) => event.kind === 'slow' && event.targets[0] === 'e0'));
    const priest = form('high-priest', { only: ['divine-shield'], hpShare: 0.55 });
    const friend = { ...form('bastion', { only: [], id: 'a1' }), position: 'front' };
    const guarded = fight('boska-ochrona', [priest, friend], [sturdy('wolf', 88, 'e0'), sturdy('wolf', 88, 'e1')]);
    const cast = guarded.events.find((event) => event.skill === 'divine-shield');
    assert.ok(cast.shield > 0);
    assert.deepEqual(cast.guarded.map((one) => one.id), ['a1']);
    assert.equal(cast.guarded[0].shield, Math.round(friend.maxHp * skillParams(content.skillsById['divine-shield'], 50, content).guard * 1.4));
  });

  test('Harmonia żywiołów strengthens the spells after an element was used', () => {
    const archmage = form('archmage', { only: ['elemental-harmony', 'meteor-shower'] });
    const tuned = fight('harmonia', [archmage], [sturdy('boar', 88, 'e0')]);
    const flat = fight('harmonia', [withParam(archmage, 'elemental-harmony', 'bonus', 0)], [sturdy('boar', 88, 'e0')]);
    assert.match(tuned.events.find((event) => event.skill === 'elemental-harmony').text, /każdy żywioł użyty w zaklęciach wzmacnia następne/);
    const own = (result) => blowsOf(result, 'a0');
    assert.equal(own(tuned)[0].damage, own(flat)[0].damage);
    assert.ok(own(tuned).some((event, index) => event.damage > own(flat)[index].damage));
  });

  test('the traits: Szał heals when low, Owacja heals on a kill, Twierdza blocks blows, Sokole oko makes two sure criticals', () => {
    const low = fight('szal', [form('berserker', { only: [], hpShare: 0.2 })], [sturdy('boar', 70, 'e0')]);
    assert.ok(low.events.some((event) => event.kind === 'drain' && event.actor === 'a0' && /leczy się z zadanej rany/.test(event.text)));
    const cheered = fight('owacja', [form('arena-champion', { only: [], hpShare: 0.5 })], [foe('wolf', 80, 'e0', { hp: 1 }), sturdy('boar', 88, 'e1')]);
    const kill = cheered.events.findIndex((event) => event.kind === 'kill' && event.target === 'e0');
    assert.match(cheered.events[kill + 1].text, /Tłum wiwatuje/);
    let blocked = 0;
    let blows = 0;
    for (let seed = 0; seed < 8; seed++) {
      for (const event of fight(`twierdza:${seed}`, [form('bastion', { only: [] })], [sturdy('wolf', 88, 'e0')]).events) {
        if (event.actor !== 'e0' || event.target !== 'a0' || !['hit', 'crit', 'dodge'].includes(event.kind)) continue;
        blows += 1;
        if (event.blocked) blocked += 1;
      }
    }
    assert.ok(blocked / blows > 0.04 && blocked / blows < 0.2, `${blocked} / ${blows}`);
    for (let seed = 0; seed < 5; seed++) {
      const shots = blowsOf(fight(`sokole-oko:${seed}`, [form('marksman', { only: [] })], [sturdy('boar', 88, 'e0')]), 'a0');
      assert.deepEqual(shots.slice(0, 2).map((event) => event.kind), ['crit', 'crit']);
    }
  });

  test('the traits: Gromowe groty slow, Wieczna zima chills with frost, Święty ogień burns spirits, Łaska takes every effect off, Widmowy krok dodges more', () => {
    const sparked = fight('gromowe', [form('thunder-lord', { only: [] })], [sturdy('boar', 88, 'e0')]);
    const spark = sparked.events.findIndex((event) => /Iskra z grotu/.test(event.text ?? ''));
    assert.ok(spark >= 0);
    assert.deepEqual([sparked.events[spark + 1].kind, sparked.events[spark + 1].targets], ['slow', ['e0']]);
    const frozen = fight('wieczna-zima', [form('winter-lord', { only: ['ice-star'] })], [sturdy('boar', 88, 'e0')]);
    const star = frozen.events.findIndex((event) => event.skill === 'ice-star');
    assert.ok(frozen.events.slice(star).some((event) => event.kind === 'effect' && event.effect === 'Wychłodzenie' && event.target === 'e0'));
    const burns = (monsterId) => fight(`swiety-ogien:${monsterId}`, [form('grand-inquisitor', { only: [] })], [sturdy(monsterId, 88, 'e0')]).events.some((event) => event.kind === 'effect' && event.effect === 'Oparzenie');
    assert.equal(burns('wraith'), true);
    assert.equal(burns('boar'), false);
    // Poisoned by a spider and burned by a wisp, the Cudotwórca's heal takes both off.
    const cleansed = Array.from({ length: 12 }, (_, seed) => fight(`laska:${seed}`, [form('miracle-worker', { only: ['great-renewal'], hpShare: 0.75 })], [sturdy('spider', 88, 'e0'), sturdy('wisp', 88, 'e1')])).find(
      (result) => result.events.filter((event) => event.kind === 'cleanse').length >= 2,
    );
    assert.ok(cleansed, 'a heal that took two effects off');
    const heal = cleansed.events.findIndex((event) => event.skill === 'great-renewal');
    assert.deepEqual(cleansed.events.slice(heal).filter((event) => event.kind === 'cleanse').map((event) => event.cleared).sort().slice(0, 2), ['Oparzenie', 'Zatrucie']);
    // Widmowy krok raises the dodge above the cap (here by 30 points, to see it).
    const missed = (feat) => {
      let dodges = 0;
      let blows = 0;
      for (let seed = 0; seed < 10; seed++) {
        for (const event of fight(`widmowy:${seed}`, [withFeat(form('phantom', { only: [] }), 'dodge', feat)], [sturdy('wolf', 88, 'e0')]).events) {
          if (event.actor !== 'e0' || event.target !== 'a0' || !['hit', 'crit', 'dodge'].includes(event.kind)) continue;
          blows += 1;
          if (event.kind === 'dodge') dodges += 1;
        }
      }
      return dodges / blows;
    };
    assert.ok(missed(0.3) - missed(0) > 0.15);
  });

  test('a second form is clearly stronger than its first evolution at the same class level, and the forms are as even as the first evolutions', () => {
    // A hunt's XP comes from a set number of fights, so strength shows as
    // safety where it is harder: four-hour explorations 8 levels above a
    // typical character of level 90 (class level 109), the skills spent as
    // they come (tools/evolution-sim.mjs). The form faints less often and
    // ends them with no less HP, or (where neither faints much) with clearly
    // more HP; a healer ends them near full HP either way.
    // The forms were set against the monsters of then (+25% from 50 to 100,
    // nothing past it): against the steeper late game (balance.monsters) a
    // typical character, without companions or upgrades, faints on every
    // such exploration with either form, so the comparison keeps them.
    const level = 90;
    const area = areaForLevel(level + 8, content);
    const { lateGame, endGame } = content.balance.monsters;
    const monsters = { ...content.balance.monsters, lateGame: { ...lateGame, damage: 0.25, hp: 0.25 }, endGame: { ...endGame, damage: 0, hp: 0 } };
    const then = { ...content, balance: { ...content.balance, monsters } };
    const local = { ...then, areasById: { ...content.areasById, [area.id]: area } };
    const explore = (evolution) => {
      const base = typicalCharacter(evolution.classId, level, content);
      const character = { ...base.character, evolution: evolution.id, skills: simulatedSkills(evolution, base.character.classLevel, content) };
      character.points = autoDistribute(character, content);
      const maxHp = playerCombatant({ character, equipped: base.equipped, name: 'Próba', area }, local).maxHp;
      let faints = 0;
      let endHp = 0;
      for (let i = 0; i < 40; i++) {
        const hunt = simulateHunt({ character, equipped: base.equipped, hp: maxHp, name: 'Próba', areaId: area.id, minutes: 240, seed: `druga:${evolution.id}:${i}` }, local);
        if (hunt.result === 'fainted') faints += 1;
        endHp += hunt.hpEnd / hunt.maxHp / 40;
      }
      return { faints, endHp };
    };
    const pairs = firsts.map((first) => [explore(first), explore(nextFormOf(first, content))]);
    pairs.forEach(([first, second], index) => {
      const told = `${seconds[index].id}: ${second.faints} faints and HP ${second.endHp.toFixed(2)} vs ${first.faints} and ${first.endHp.toFixed(2)}`;
      const safer = second.faints < first.faints && second.endHp >= first.endHp;
      const healthier = second.faints <= first.faints && second.endHp >= first.endHp + 0.03;
      assert.ok(safer || healthier, told);
    });
    const spread = (list) => Math.max(...list) - Math.min(...list);
    assert.ok(spread(pairs.map(([, second]) => second.endHp)) <= spread(pairs.map(([first]) => first.endHp)));
  });
});

describe('the second evolution through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const create = async (appearance = 'male') => {
    ({ cookie } = await signUp('drugaforma'));
    await call('POST', '/api/character', { cookie, body: { name: 'Drugaforma', classId: 'warrior', appearance } });
  };
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const ready = `level = 80, class_level = 100, evolution = 'barbarian', skills = '{"crushing-blow":45,"blood-frenzy":45}'`;

  beforeEach(() => create());

  test('at class level 100 with the points spent the character sees its one form, takes it with its skills at 0 and keeps its stat points', async () => {
    await set(`level = 80, class_level = 99, evolution = 'barbarian', skills = '{"crushing-blow":45,"blood-frenzy":44}', points = '{"strength":3}'`);
    let view = await character();
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['barbarian', null, 100]);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker' } })).data.error.code, 'class_level');
    await set('class_level = 100');
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker' } })).data.error.code, 'skill_points');
    assert.equal((await character()).skills.evolution.need, 'skill_points');
    await set(`skills = '{"crushing-blow":45,"blood-frenzy":45}'`);
    view = await character();
    assert.equal(view.evolution.next.id, 'berserker');
    assert.equal(view.evolution.next.name, 'Berserker');
    assert.deepEqual(view.skills.evolution, { level: 100, need: 'evolve' });
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'arena-champion' } })).status, 400);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.evolution.name, 'Berserker');
    const after = taken.data.character;
    assert.equal(after.className, 'Berserker');
    assert.equal(after.baseClassName, 'Wojownik');
    assert.equal(after.evolution.current.trait.name, 'Szał');
    assert.equal(after.evolution.next, null);
    assert.equal(after.skills.points, 91);
    assert.deepEqual(after.skills.pools[0].options.map((skill) => [skill.id, skill.level, skill.maxLevel]), [
      ['shattering-blow', 0, 95],
      ['berserker-roar', 0, 95],
    ]);
    // No free reset of the stat points after the second form.
    assert.equal(after.evolutionReset, null);
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT points FROM characters').first()).points), { strength: 3 });
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker' } })).data.error.code, 'evolved');
    const raised = await call('POST', '/api/skills/raise', { cookie, body: { skillId: 'shattering-blow', count: 50 } });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.skills.points, 41);
  });

  test('a woman takes the form under its woman\'s name, in the ranking too', async () => {
    await (await db()).prepare('DELETE FROM characters').run();
    await call('POST', '/api/character', { cookie, body: { name: 'Drugaformka', classId: 'warrior', appearance: 'female' } });
    await set(ready);
    assert.equal((await character()).evolution.next.name, 'Berserkerka');
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker' } });
    assert.equal(taken.data.character.className, 'Berserkerka');
    assert.equal(taken.data.character.skills.pools[0].options[0].path, 'Berserkerka');
    const ranking = await call('GET', '/api/ranking', { cookie });
    assert.equal(ranking.status, 200, JSON.stringify(ranking.data));
    assert.equal(ranking.data.rows.find((row) => row.own).className, 'Berserkerka');
  });

  test('on the test version the second form can be tried at any level and undone back to the first evolution', async () => {
    await set(`level = 60, class_level = 60, evolution = 'barbarian', skills = '{"crushing-blow":11,"blood-frenzy":0}'`);
    const tried = await call('GET', '/api/evolution/test', { cookie });
    assert.deepEqual(tried.data.evolutions.map((evolution) => evolution.id), ['berserker']);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker', test: true } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.character.className, 'Berserker');
    assert.equal(taken.data.character.evolutionUndo, true);
    assert.deepEqual((await call('GET', '/api/evolution/test', { cookie })).data.evolutions, []);
    const undone = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(undone.status, 200, JSON.stringify(undone.data));
    assert.equal(undone.data.character.className, 'Barbarzyńca');
    const row = await (await db()).prepare('SELECT evolution, skills, evolution_undo FROM characters').first();
    assert.deepEqual([row.evolution, JSON.parse(row.skills), row.evolution_undo], ['barbarian', { 'crushing-blow': 11, 'blood-frenzy': 0 }, null]);
    // A first evolution tried, then its second form: undone back to the class.
    await set(`evolution = NULL, skills = '{"power-strike":6}'`);
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'barbarian', test: true } });
    await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'berserker', test: true } });
    const back = await call('POST', '/api/evolution/undo', { cookie });
    assert.equal(back.data.character.className, 'Wojownik');
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT skills FROM characters').first()).skills), { 'power-strike': 6 });
  });

  test('on the test version a first evolution gets class level 100 at once, and keeps its evolution', async () => {
    await set(`level = 60, class_level = 60, class_xp = 9, evolution = 'barbarian', skills = '{"crushing-blow":11,"blood-frenzy":0}'`);
    const raised = await call('POST', '/api/evolution/test-level?level=100', { cookie });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.classLevel, 100);
    assert.equal(raised.data.character.className, 'Barbarzyńca');
    const row = await (await db()).prepare('SELECT class_xp, evolution FROM characters').first();
    assert.deepEqual([row.class_xp, row.evolution], [0, 'barbarian']);
    await set(`evolution = 'berserker', skills = '{}'`);
    assert.equal((await call('POST', '/api/evolution/test-level?level=100', { cookie })).data.error.code, 'not_first');
    // The first evolution's level does not take an evolution taken for good away.
    assert.equal((await call('POST', '/api/evolution/test-level', { cookie })).data.error.code, 'evolved');
  });
});
