// The fourth evolution ("Czwarta ewolucja klas", 1095 A): at class level 300
// each of the 15 third forms grows into one further form, where the
// deployment has the fourth forms on (FOURTH_EVOLUTION, with
// THIRD_EVOLUTION; off in the live game until their art is done). The
// class waits there until the form is taken, the form's skills take every
// Skill Point back and grow to level 195, the names have a woman's form,
// the Pustelnik changes it with the other paths' fourth forms, every new
// skill and trait works in fights as its words say, and a fourth form is
// at least as strong as its third form on explorations while the 15 stay
// close to each other in the Arena.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import {
  applyHunt,
  buildContent,
  classNameOf,
  computeStats,
  createRng,
  evolutionBlock,
  evolutionChanges,
  evolutionChoices,
  evolutionName,
  evolutionPanel,
  evolveBlock,
  evolvedSkills,
  monsterCombatant,
  nextFormOf,
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
  'ravager', 'immortal', 'titan', 'celestial-archer', 'thunderer', 'beast-lord', 'primordial', 'frost-god',
  'elder-druid', 'archangel', 'heaven-avenger', 'seer', 'soul-reaper', 'navia-king', 'dark-prince',
];
const thirds = content.evolutions.filter((evolution) => evolution.stage === 3);
const fourths = content.evolutions.filter((evolution) => evolution.stage === 4);

// The game's data without the fourth forms and the fifth forms that grow out
// of them (as a deployment has it with FOURTH_EVOLUTION "off").
const thirdOnly = (() => {
  const raw = loadData();
  const fourthIds = new Set(content.evolutions.filter((evolution) => evolution.stage >= 4).map((evolution) => evolution.id));
  raw.evolutions.evolutions = raw.evolutions.evolutions.filter((evolution) => !fourthIds.has(evolution.id));
  raw.evolutions.skills = raw.evolutions.skills.filter((skill) => !fourthIds.has(skill.evolution));
  return buildContent(raw);
})();

// The balance of the fourth forms was set at class level 320 against the
// creatures and gear of character level 260 (and 365 at 300 in the Arena).
// Since 0.4.44 the class levels from 250 take longer, so a character of
// level 260 is usually of class level 275; the simulations below keep the
// curve they were tuned with (without the late levels' slowdown), so that
// they still compare the forms at those class levels. Since 0.4.46 a
// character from level 250 also earns half the gold, materials and chests
// (balance.rewards.lateRewards): fewer chests among the finds change the
// draws of the fights after them, so the simulations keep the rewards they
// were tuned with too. Since 19.11.2026 the creatures from level 250 are
// twice as strong (balance.monsters.mythGame), from class level 100 they
// grow by the class level (classLevelCurve, 1207 A), and the newest place's
// are stronger again (newestPlace): the forms are compared against the
// creatures they were tuned with as well.
const tuned = (data) => ({
  ...data,
  balance: {
    ...data.balance,
    progression: { ...data.balance.progression, lateLevels: undefined },
    rewards: { ...data.balance.rewards, lateRewards: undefined },
    monsters: { ...data.balance.monsters, mythGame: { ...data.balance.monsters.mythGame, damage: 0, hp: 0 }, classLevelCurve: [], newestPlace: null },
  },
});
// On the explorations the gear they were tuned with too: since Tiers XI and
// XII (DECISIONS.md, „Tiery XI i XII przedmiotów”) the realistic player of
// level 260 wears Tier XII, and with it every fourth form ends with 80–100%
// of its HP, so the comparison of the HP left says little (the Książę
// Ciemności 95.4% against its third form's 96.2%); Tier X stays the latest
// base here, as when the forms were tuned. The Arena below keeps the game's
// gear.
const tunedGear = (data) => ({ ...tuned(data), bases: data.bases.filter((base) => (base.classLevel ?? 1) <= 200) });

// A Pogromca Hord at a class level, its skills at their top by default.
const hordeSlayer = (classLevel, skills = { 'smashing-blow': 145, slaughter: 145 }, extra = {}) => ({
  classId: 'warrior',
  level: 250,
  xp: 0,
  classLevel,
  classXp: 0,
  points: {},
  appearance: 'male',
  evolution: 'horde-slayer',
  skills,
  ...extra,
});
const ravager = (classLevel, skills) => hordeSlayer(classLevel, skills, { evolution: 'ravager' });

describe('the fourth evolution in the engine', () => {
  test('each third form grows into exactly one fourth form of its class, with its names and description', () => {
    assert.equal(thirds.length, 15);
    assert.deepEqual(thirds.map((form) => nextFormOf(form, content).id), FORMS);
    for (const form of fourths) {
      const third = content.evolutionsById[form.from];
      assert.equal(form.classId, third.classId, form.id);
      assert.equal(form.stage, 4, form.id);
      assert.ok(form.description, form.id);
      // Its first skill grows one of the third form's, the other is new; the
      // Pradruid's grows the Arcydruid's other one (Pradawne stado from Zew
      // zwierząt, 1221 A).
      assert.ok(third.skills.includes(content.skillsById[form.skills[0]].from), form.id);
      if (form.id === 'elder-druid') assert.equal(content.skillsById[form.skills[1]].from, 'bison-call');
      else assert.ok(!content.skillsById[form.skills[1]].from, form.id);
      for (const id of form.skills) {
        assert.equal(content.skillsById[id].maxLevel, 195, id);
        assert.equal(content.skillsById[id].classLevel, 300, id);
      }
    }
    // Fourth forms are taken, not chosen.
    assert.deepEqual(evolutionChoices({ classId: 'warrior', skills: {} }, content, { all: true }).map((evolution) => evolution.id), ['barbarian', 'gladiator', 'guardian']);
    // The approved names (1095 A), a man's and a woman's.
    assert.deepEqual(fourths.map((form) => form.name), [
      'Burzyciel', 'Nieśmiertelny', 'Tytan', 'Niebiański Łucznik', 'Gromowładny', 'Pan Zwierząt', 'Stwórca Żywiołów', 'Lodowy Bóg',
      'Pradruid', 'Archanioł', 'Mściciel Niebios', 'Wieszcz', 'Żniwiarz Dusz', 'Król Nawii', 'Książę Ciemności',
    ]);
    assert.deepEqual(fourths.map((form) => evolutionName(form, 'female')), [
      'Burzycielka', 'Nieśmiertelna', 'Tytanida', 'Niebiańska Łuczniczka', 'Gromowładna', 'Pani Zwierząt', 'Stwórczyni Żywiołów', 'Lodowa Bogini',
      'Pradruidka', 'Archanielica', 'Mścicielka Niebios', 'Wieszczka', 'Żniwiarka Dusz', 'Królowa Nawii', 'Księżna Ciemności',
    ]);
  });

  test('the class waits at 300 while a Skill Point is left, then until the fourth form is taken; after it at 400 only for points', () => {
    assert.deepEqual(evolutionBlock(hordeSlayer(299, { 'smashing-blow': 145, slaughter: 130 }), content), { code: 'skill_points', level: 300 });
    assert.deepEqual(evolutionBlock(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 144 }), content), { code: 'skill_points', level: 300 });
    assert.deepEqual(evolutionBlock(hordeSlayer(300), content), { code: 'evolve', level: 300 });
    // A class already past 300 (it grew on before the fourth forms) waits
    // for nothing and takes its form at once.
    assert.equal(evolutionBlock(hordeSlayer(330), content), null);
    assert.equal(evolveBlock(hordeSlayer(330), 'ravager', content), null);
    // The exploration holds the class at 300, and its XP adds up.
    const hunt = { xp: 1e13, result: 'success', timePoints: 0 };
    const held = applyHunt(hordeSlayer(300), hunt, content);
    assert.equal(held.classLevel, 300);
    assert.ok(held.classXp > 0);
    assert.ok(held.messages.some((line) => line.includes('u progu ewolucji')));
    // With the form the class grows on, at 400 waits for its points, and
    // with them spent for its fifth form (test/fifth-evolution.test.js).
    assert.equal(applyHunt(ravager(300, { carnage: 1, breach: 0 }), hunt, content).classLevel, 400);
    assert.deepEqual(evolutionBlock(ravager(400, { carnage: 195, breach: 194 }), content), { code: 'skill_points', level: 400 });
    assert.deepEqual(evolutionBlock(ravager(400, { carnage: 195, breach: 195 }), content), { code: 'evolve', level: 400 });
    assert.equal(applyHunt(ravager(400, { carnage: 195, breach: 195 }), hunt, content).classLevel, 400);
    // Without the fourth forms the third form waits at 300 only for points.
    assert.equal(nextFormOf(thirdOnly.evolutionsById['horde-slayer'], thirdOnly), null);
    assert.equal(evolutionBlock(hordeSlayer(300), thirdOnly), null);
  });

  test('the fourth form asks for its third form, class level 300 and the points spent; the test lifts the level', () => {
    assert.equal(evolveBlock(hordeSlayer(299), 'ravager', content).code, 'class_level');
    assert.match(evolveBlock(hordeSlayer(299), 'ravager', content).message, /300\. poziomie klasy/);
    assert.equal(evolveBlock(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 100 }), 'ravager', content).code, 'skill_points');
    assert.equal(evolveBlock(hordeSlayer(300), 'immortal', content).code, 'unknown_evolution');
    // Not past the third form: a second form grows into its third first.
    assert.equal(evolveBlock(hordeSlayer(300, { 'shattering-blow': 95, 'berserker-roar': 95 }, { evolution: 'berserker' }), 'ravager', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(ravager(300, {}), 'ravager', content).code, 'evolved');
    assert.equal(evolveBlock(hordeSlayer(150, { 'smashing-blow': 3 }), 'ravager', content, { test: true }), null);
    assert.equal(evolveBlock(hordeSlayer(300), 'ravager', content), null);
  });

  test('taking it: the two skills at 0 with the 290 points back, class levels 300–399 bring 100 more, up to level 195 each', () => {
    const taken = ravager(300, evolvedSkills('ravager', content));
    assert.deepEqual(taken.skills, { carnage: 0, breach: 0 });
    assert.deepEqual(skillPoints(taken, content), { earned: 291, spent: 0, free: 291 });
    assert.equal(skillPoints({ ...taken, classLevel: 399 }, content).earned, 390);
    assert.equal(skillPoints({ ...taken, classLevel: 460 }, content).earned, 390);
    assert.equal(raiseBlock({ ...taken, classLevel: 399, skills: { carnage: 194, breach: 0 } }, 'carnage', content), null);
    assert.equal(raiseBlock({ ...taken, classLevel: 399, skills: { carnage: 195, breach: 0 } }, 'carnage', content).code, 'max_level');
    const view = skillsView(taken, content);
    assert.deepEqual(view.pools[0].options.map((skill) => [skill.name, skill.state, skill.maxLevel]), [
      ['Pogrom', 'main', 195],
      ['Wyłom', 'second', 195],
    ]);
    assert.equal(view.lastPointLevel, 399);
    assert.deepEqual(view.evolution, { level: 400, need: 'skill_points' });
    // At the level the 290 points bring it to at once (145 each), a grown
    // skill strikes, heals and calls at least as strongly as its root at the
    // top level (a summon's HP and blows counted for all it calls at once,
    // as the fifth forms' test counts them: Gaj wieków's two oaks, each
    // weaker than the Arcydruid's one, 21.11.2026; Legion Nawii's two
    // knights, each weaker than the Licz's one since its Armia umarłych
    // struck half as hard again, 1277 A). The Pradruid's Pradawne stado
    // grows Zew zwierząt too, with weaker beasts: four summons at once keep
    // the Pradruid in the Arena's band (1221 A).
    for (const form of fourths) {
      const grown = content.skillsById[form.skills[0]];
      const root = skillParams(content.skillsById[grown.from], 145, content);
      const now = skillParams(grown, 145, content);
      const called = now.pack?.length ?? Math.round(now.count ?? 1);
      for (const key of ['power', 'single', 'heal', 'hp']) {
        if (typeof root[key] !== 'number') continue;
        const counted = key === 'hp' || (key === 'power' && grown.kind === 'summon') ? now[key] * called : now[key];
        assert.ok(counted >= root[key] - 1e-9, `${grown.id} ${key}: ${counted} vs ${grown.from} ${root[key]}`);
      }
    }
  });

  test('the stats grow by each form over its span and by the fourth form from 301', () => {
    const at = (classLevel, evolution) => computeStats({ classId: 'warrior', level: 250, classLevel, points: {}, evolution }, [], content).totals;
    assert.equal(at(300, 'ravager').strength, at(300, 'horde-slayer').strength);
    assert.equal(at(320, 'ravager').strength - at(320, 'horde-slayer').strength, 20);
    assert.equal(at(320, 'ravager').vitality - at(320, 'horde-slayer').vitality, 20);
  });

  test('a woman goes by the form\'s woman\'s name wherever the class name shows', () => {
    const female = { ...ravager(300, evolvedSkills('ravager', content)), appearance: 'female' };
    assert.equal(classNameOf(female, content), 'Burzycielka');
    assert.equal(classNameOf({ ...female, appearance: 'male' }, content), 'Burzyciel');
    assert.equal(classNameOf({ ...female, classId: 'shadow', evolution: 'navia-king' }, content), 'Królowa Nawii');
    assert.equal(skillsView(female, content).pools[0].options[0].path, 'Burzycielka');
  });

  test('the panel shows the one form to take at 300 once the points are spent, and after it the fifth form\'s class level', () => {
    const before = evolutionPanel(hordeSlayer(299), content);
    assert.deepEqual([before.current.id, before.next, before.nextLevel], ['horde-slayer', null, 300]);
    assert.equal(evolutionPanel(hordeSlayer(300, { 'smashing-blow': 145, slaughter: 140 }), content).next, null);
    const ready = evolutionPanel(hordeSlayer(300), content);
    assert.deepEqual(ready.choices, []);
    assert.equal(ready.next.id, 'ravager');
    assert.equal(ready.next.stage, 4);
    assert.equal(ready.next.skillLevel, 195);
    assert.equal(ready.next.fromName, 'Pogromca Hord');
    assert.equal(ready.next.skills[0].from, 'Rzeź');
    assert.equal(ready.next.skills[1].from, null);
    assert.equal(ready.next.trait.name, 'Gniew bez dna');
    const after = evolutionPanel(ravager(300, {}), content);
    assert.deepEqual([after.current.id, after.next, after.nextLevel], ['ravager', null, 400]);
  });

  test('the Pustelnik changes a fourth form for another path\'s fourth form', () => {
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'ravager' }, content).map((evolution) => evolution.id), ['immortal', 'titan']);
    assert.deepEqual(evolutionChanges({ classId: 'shadow', evolution: 'navia-king' }, content).map((evolution) => evolution.id), ['soul-reaper', 'dark-prince']);
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'horde-slayer' }, content).map((evolution) => evolution.id), ['arena-legend', 'colossus']);
  });
});

describe('the fourth forms in fights', () => {
  // A character of a fourth form (level 270, class level 330) with the
  // form's skills at `skillLevel` (`only`: just these of them).
  function form(evolutionId, { skillLevel = 150, only, classLevel = 330, level = 270, hpShare, id = 'a0', position } = {}) {
    const evolution = content.evolutionsById[evolutionId];
    const { character, equipped } = typicalCharacter(evolution.classId, level, content);
    const skills = Object.fromEntries(evolution.skills.filter((skill) => !only || only.includes(skill)).map((skill) => [skill, skillLevel]));
    const unit = playerCombatant({ character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: evolution.name, id }, content);
    return { ...unit, ...(position && { position }), ...(hpShare !== undefined && { hp: Math.round(unit.maxHp * hpShare) }) };
  }
  const withParam = (unit, skillId, key, value) => ({ ...unit, skills: unit.skills.map((skill) => (skill.id === skillId ? { ...skill, params: { ...skill.params, [key]: value } } : skill)) });
  const withFeat = (unit, key, value) => ({ ...unit, feat: { ...unit.feat, [key]: value } });
  const paramOf = (unit, skillId, key) => unit.skills.find((skill) => skill.id === skillId).params[key];
  const LEVEL = 268;
  const foe = (monsterId, id, extra = {}) => ({ ...monsterCombatant({ monsterId, level: LEVEL, id }, content), ...extra });
  // A sturdy foe lasts a long fight and strikes softly.
  const sturdy = (monsterId, id, extra = {}) => {
    const unit = foe(monsterId, id);
    return { ...unit, hp: 300000, maxHp: 300000, damageScale: unit.damageScale * 0.25, ...extra };
  };
  const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
  const BLOWS = ['hit', 'crit'];
  const blowsOf = (result, actor) => result.events.filter((event) => event.actor === actor && BLOWS.includes(event.kind));
  const many = (count, seed, run) => Array.from({ length: count }, (_, index) => run(`${seed}:${index}`));
  const near = (actual, expected, margin, told) => assert.ok(Math.abs(actual - expected) < margin, `${told}: ${actual} vs ${expected}`);
  const line = () => [sturdy('boar', 'e0'), sturdy('crow', 'e1'), sturdy('wolf', 'e2')];

  test('Gniew bez dna: a plain blow strikes the foe behind too; Wyłom passes all armour, stuns its target and the one behind and breaks its guard; Pogrom rages', () => {
    const plain = fight('gniew', [form('ravager', { only: [] })], [sturdy('boar', 'e0'), sturdy('crow', 'e1')]);
    assert.deepEqual(blowsOf(plain, 'a0').slice(0, 2).map((event) => [event.target, Boolean(event.pierced)]), [['e0', false], ['e1', true]]);
    const breached = fight('wylom', [form('ravager', { only: ['breach'] })], line());
    const blow = breached.events.findIndex((event) => event.skill === 'breach' && BLOWS.includes(event.kind));
    const target = breached.events[blow].target;
    const stunned = breached.events.slice(blow, blow + 6).filter((event) => event.kind === 'stun' && event.skill === 'breach').map((event) => event.target);
    assert.equal(stunned.length, 2);
    assert.ok(stunned.includes(target));
    assert.ok(breached.events.some((event) => event.skill === 'breach' && /rozbitą osłonę/.test(event.text)));
    // Every blow at the sundered foe after it hits harder: twin fights.
    const firstAfter = (unit) => {
      const result = fight('wylom-rozbicie', [unit], line());
      const at = result.events.findIndex((event) => event.skill === 'breach' && BLOWS.includes(event.kind));
      return result.events.slice(at + 1).find((event) => event.actor === 'a0' && event.target === result.events[at].target && BLOWS.includes(event.kind) && !event.skill && !event.pierced);
    };
    const breaker = form('ravager', { only: ['breach'] });
    const sundered = firstAfter(breaker);
    const plainAfter = firstAfter(withParam(breaker, 'breach', 'sunder', 0));
    if (sundered.kind === plainAfter.kind) near(sundered.damage / plainAfter.damage, 1 + paramOf(breaker, 'breach', 'sunder'), 0.03, 'Wyłom');
    const raging = form('ravager', { only: ['carnage'], hpShare: 0.1 });
    const firstSweep = (unit) => fight('pogrom', [unit], [sturdy('boar', 'e0', { speed: 1 })]).events.find((event) => event.skill === 'carnage' && BLOWS.includes(event.kind)).damage;
    near(firstSweep(raging) / firstSweep(withParam(raging, 'carnage', 'rage', 0)), 1 + paramOf(raging, 'carnage', 'rage'), 0.03, 'Pogrom');
  });

  test('Wieczna chwała: the Nieśmiertelny rises once from a deadly blow; Huragan chwały turns three times; Wyzwanie czempiona: the strongest foe strikes only it, and weaker', () => {
    const immortal = form('immortal', { only: [], hpShare: 0.02 });
    const result = fight('wieczna', [immortal], [foe('wolf', 'e0', { damageScale: 4 })]);
    const rise = result.events.find((event) => event.actor === 'a0' && /Śmierć odchodzi z niczym/.test(event.text ?? ''));
    assert.ok(rise, result.events.map((event) => event.text).join('\n'));
    assert.ok(rise.amount >= Math.round(immortal.maxHp * immortal.feat.undyingHeal) - 2);
    const spun = fight('huragan', [form('immortal', { only: ['glory-hurricane'] })], line());
    const casts = spun.events.filter((event) => event.skill === 'glory-hurricane' && event.kind === 'skill').slice(0, 3);
    assert.deepEqual(casts.map((event) => event.t), [casts[0].t, casts[0].t, casts[0].t]);
    assert.match(casts[1].text, /drugi obrót/);
    assert.match(casts[2].text, /trzeci obrót/);
    const challenged = fight('wyzwanie', [form('immortal', { only: ['champion-challenge'], position: 'front' }), form('seer', { only: [], id: 'a1', position: 'back' })], line());
    const call = challenged.events.findIndex((event) => event.skill === 'champion-challenge' && /przyjmuje wyzwanie/.test(event.text));
    assert.ok(call >= 0);
    const caller = challenged.events[call].targets?.[0] ?? challenged.events[call].target;
    const next = challenged.events.slice(call + 1).filter((event) => event.actor === caller && BLOWS.concat('dodge').includes(event.kind)).slice(0, 2);
    assert.ok(next.length > 0 && next.every((event) => event.target === 'a0'), JSON.stringify(next));
  });

  test('Tarcza tytana: the party takes less and the foes strike only the Tytan; Żywa forteca throws back a share; Gniew góry may stun any foe', () => {
    const titan = form('titan', { only: ['titan-shield'], position: 'front' });
    const friend = form('celestial-archer', { only: [], id: 'a1', position: 'back' });
    const result = fight('tarcza', [titan, friend], line());
    const raised = result.events.findIndex((event) => event.skill === 'titan-shield' && event.kind === 'skill');
    const faded = result.events.findIndex((event, index) => index > raised && event.skill === 'titan-shield' && event.kind === 'fade');
    const under = result.events.slice(raised + 1, faded).filter((event) => event.actor?.startsWith('e') && BLOWS.concat('dodge').includes(event.kind));
    assert.ok(under.length > 0 && under.every((event) => event.target === 'a0'), JSON.stringify(under.map((event) => event.target)));
    assert.ok(result.events.some((event) => event.kind === 'reflect' && event.actor === 'a0'));
    // Twin fights: the first foe's blow at the Tytan under the shield.
    const firstTaken = (unit) => {
      const one = fight('tarcza-mniej', [unit], [sturdy('wolf', 'e0')]);
      const at = one.events.findIndex((event) => event.skill === 'titan-shield' && event.kind === 'skill');
      return one.events.slice(at + 1).find((event) => event.actor === 'e0' && event.target === 'a0' && BLOWS.includes(event.kind));
    };
    const shielded = firstTaken(titan);
    const bare = firstTaken(withParam(titan, 'titan-shield', 'reduction', 0));
    if (shielded.kind === bare.kind) near(shielded.damage / bare.damage, 1 - paramOf(titan, 'titan-shield', 'reduction'), 0.03, 'Tarcza tytana');
    const stunned = new Set(many(6, 'gniew-gory', (seed) => fight(seed, [form('titan', { only: ['mountain-wrath'] })], line())).flatMap((one) => one.events.filter((event) => event.kind === 'stun' && event.skill === 'mountain-wrath').map((event) => event.target)));
    assert.ok(stunned.size >= 2, [...stunned].join());
  });

  test('Gwiezdny grot: no foe dodges the Łucznik and its criticals pass armour; Strzała z niebios is always critical and goes through every row; Deszcz gwiazd falls eight times', () => {
    const archer = form('celestial-archer', { only: [] });
    const quick = (seed) => fight(seed, [archer], [sturdy('fox', 'e0', { dodgeRating: 100000 })]);
    assert.ok(many(4, 'gwiazdy', quick).every((result) => !result.events.some((event) => event.actor === 'a0' && event.kind === 'dodge')));
    const shot = fight('niebiosa', [form('celestial-archer', { only: ['heaven-arrow'] })], line());
    const arrow = shot.events.filter((event) => event.skill === 'heaven-arrow' && BLOWS.concat('dodge').includes(event.kind));
    assert.equal(arrow[0].kind, 'crit');
    assert.ok(arrow.slice(1, 3).some((event) => event.pierced));
    const rain = fight('deszcz', [form('celestial-archer', { only: ['star-rain'] })], line());
    const cast = rain.events.findIndex((event) => event.skill === 'star-rain' && event.kind === 'skill');
    const drops = rain.events.slice(cast + 1).filter((event) => event.skill === 'star-rain' && BLOWS.concat('dodge').includes(event.kind) && event.t === rain.events[cast].t);
    assert.equal(drops.length, 8);
  });

  test('Władca burzy: the spark leaps on to every foe, weaker each time; Burza Peruna\'s bolts always leap on; Kula piorunów strikes the strongest foe every move', () => {
    const storm = fight('burza', [form('thunderer', { only: ['perun-storm'] })], line());
    assert.ok(storm.events.some((event) => /przeskakuje dalej/.test(event.text ?? '')));
    const sparks = many(6, 'iskra', (seed) => fight(seed, [form('thunderer', { only: [] })], line())).flatMap((result) => result.events);
    const leaps = sparks.filter((event) => /Piorun z grotu przeskakuje dalej/.test(event.text ?? ''));
    assert.ok(new Set(leaps.map((event) => event.target)).size >= 2);
    const orb = fight('kula', [form('thunderer', { only: ['ball-lightning'] })], [sturdy('boar', 'e0', { hp: 150000 }), sturdy('crow', 'e1'), sturdy('wolf', 'e2', { hp: 100000 })]);
    const raised = orb.events.findIndex((event) => event.skill === 'ball-lightning' && event.kind === 'skill');
    assert.match(orb.events[raised].text, /kula piorunów/);
    const bolts = orb.events.slice(raised).filter((event) => event.skill === 'ball-lightning' && BLOWS.includes(event.kind)).slice(0, 3);
    assert.ok(bolts.length >= 2 && bolts.every((event) => event.target === 'e1'), JSON.stringify(bolts.map((event) => event.target)));
  });

  test('Prawo stada: two beasts stand at once; Wódz watahy\'s wolf makes its foe bleed; Zew niedźwiedzia\'s bear strikes the foe in front and may stun it', () => {
    const lord = form('beast-lord');
    const result = fight('stado', [lord], line());
    const called = result.events.filter((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual(new Set(called.slice(0, 2).map((event) => event.skill)), new Set(['pack-chief', 'bear-call']));
    assert.ok(result.events.some((event) => event.skill === 'pack-chief' && event.kind === 'effect') || result.events.some((event) => event.kind === 'effect' && /Krwawienie/.test(event.text)));
    const front = ['e0', 'e2'];
    const bites = result.events.filter((event) => event.skill === 'bear-call' && BLOWS.includes(event.kind));
    assert.ok(bites.length > 0 && bites.every((event) => front.includes(event.target)), JSON.stringify(bites.map((event) => event.target)));
    const stunned = many(6, 'niedzwiedz', (seed) => fight(seed, [form('beast-lord', { only: ['bear-call'] })], line())).flatMap((one) => one.events).filter((event) => event.kind === 'stun' && event.skill === 'bear-call');
    assert.ok(stunned.length > 0 && stunned.every((event) => front.includes(event.target)));
  });

  test('Pierwotna moc: plain blows go with the foe\'s weakest element; Pierwotny chaos burns, chills and stuns the foes in front; the Żywiołak strikes with the weakest element too', () => {
    const maker = form('primordial', { only: [] });
    assert.equal(maker.feat.weakest, true);
    const chaos = fight('chaos', [form('primordial', { only: ['primal-chaos'] })], line());
    const stuns = chaos.events.filter((event) => event.kind === 'stun' && event.skill === 'primal-chaos');
    assert.ok(stuns.length > 0);
    assert.ok(chaos.events.some((event) => event.kind === 'effect' && /Oparzenie/.test(event.text)));
    const elemental = fight('zywiolak', [form('primordial', { only: ['elemental'] })], line());
    const strike = elemental.events.find((event) => event.skill === 'elemental' && BLOWS.includes(event.kind));
    assert.match(strike.text, /Żywiołak uderza \((ogień|mróz|piorun|ziemia)\)/);
  });

  test('Wieczna zima: every foe starts chilled; Lodowa wieczność locks two foes in ice; Lodowe serce stops a share of every blow and freezes some who strike it', () => {
    const god = fight('zima', [form('frost-god', { only: [] })], line());
    assert.match(god.events[0].text, /Wszyscy wrogowie są wychłodzeni/);
    const tomb = fight('wiecznosc', [form('frost-god', { only: ['ice-eternity'] })], line());
    const cast = tomb.events.find((event) => event.skill === 'ice-eternity' && event.kind === 'stun');
    const locked = tomb.events.filter((event) => event.kind === 'stun' && event.skill === 'ice-eternity' && event.t === cast.t);
    assert.equal(locked.length, 2);
    assert.notEqual(locked[0].target, locked[1].target);
    const heart = fight('serce', [form('frost-god', { only: ['ice-heart'], hpShare: 0.5 })], line());
    const raised = heart.events.find((event) => event.skill === 'ice-heart');
    assert.ok(raised, 'Lodowe serce');
    assert.match(raised.text, /zatrzymuje \d+% obrażeń/);
  });

  test('Korzenie świata: four summons may stand, Gaj wieków\'s two oaks and Pradawne stado\'s bison and bear (1221 A); the grove heals the party once a move; the bison charges the foe in front and stuns it', () => {
    const druid = form('elder-druid');
    assert.equal(druid.feat.summons, 4);
    const oak = fight('dab', [form('elder-druid', { only: ['oak-of-ages'] }), form('archangel', { only: [], id: 'a1' })], line());
    assert.ok(oak.events.some((event) => event.skill === 'oak-of-ages' && event.kind === 'heal'));
    // Gaj wieków (21.11.2026): two Dęby wieków in one cast, each with the
    // trait's HP (40% more and 1% for every 20 points of Wisdom), and while
    // both stand the party heals once a move, not twice.
    const [first, second] = oak.events.filter((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual([first.t, first.order, first.summon, first.figure, second.order, second.summon, second.figure], [second.t, 1, 'Dąb wieków', 'oak', 2, 'Dąb wieków', 'oak']);
    const grove = form('elder-druid', { only: ['oak-of-ages'] });
    const wise = grove.wisdom / 20 / 100;
    // Since 24.11.2026 each summon has 75% of the Pradruid's maximum HP on
    // top (`summonLife`, test/druid-summons.test.js).
    assert.equal(first.summonHp, Math.max(1, Math.round(grove.maxMana * skillParams(content.skillsById['oak-of-ages'], 150, content).hp * (1 + 0.4 + wise) + grove.maxHp * 0.75)));
    const heals = oak.events.filter((event) => event.skill === 'oak-of-ages' && event.kind === 'heal');
    assert.equal(new Set(heals.map((event) => `${event.t} ${event.target}`)).size, heals.length, 'the grove healed someone twice in one move');
    // Pradawne stado (1221 A): the bison and the bear in one cast, each its
    // own summon with its numbers and the trait's HP; the bison charges the
    // foe in front at once and stuns it.
    const caller = form('elder-druid', { only: ['ancient-herd'] });
    const called = fight('stado', [caller], line());
    const [bison, bear] = called.events.filter((event) => event.kind === 'summon' && event.state === 'up');
    assert.deepEqual([bison.t, bison.skill, bison.order, bison.summon, bison.figure], [bear.t, 'ancient-herd', 1, 'Żubr', 'aurochs']);
    assert.deepEqual([bear.skill, bear.order, bear.summon, bear.figure], ['ancient-herd', 2, 'Niedźwiedź', 'bear']);
    const [ownBison, ownBear] = skillParams(content.skillsById['ancient-herd'], 150, content).pack;
    const trait = 1 + 0.4 + caller.wisdom / 20 / 100;
    assert.equal(bison.summonHp, Math.max(1, Math.round(caller.maxMana * ownBison.hp * trait + caller.maxHp * 0.75)));
    assert.equal(bear.summonHp, Math.max(1, Math.round(caller.maxMana * ownBear.hp * trait + caller.maxHp * 0.75)));
    const charge = called.events.findIndex((event) => event.skill === 'ancient-herd' && /Żubr szarżuje/.test(event.text ?? ''));
    assert.ok(charge > 0);
    assert.equal(called.events[charge].summonOrder, 1);
    if (called.events[charge].kind !== 'dodge') assert.deepEqual([called.events[charge + 1].kind, called.events[charge + 1].target], ['stun', called.events[charge].target]);
    assert.ok(called.events.some((event) => event.skill === 'ancient-herd' && BLOWS.includes(event.kind) && event.summonOrder === 2 && /Niedźwiedź atakuje/.test(event.text)));
    // Four at once in a Pradruid's own fight: the two oaks, the bison and the
    // bear, each under its name.
    const standingNames = (result) => {
      const standing = new Map();
      let most = [];
      for (const event of result.events.filter((one) => one.kind === 'summon')) {
        if (event.state === 'up') standing.set(`${event.skill} ${event.order}`, event.summon);
        else if (['gone', 'fell'].includes(event.state)) standing.delete(`${event.summonSkill} ${event.summonOrder}`);
        if (standing.size > most.length) most = [...standing.values()].sort();
      }
      return most;
    };
    assert.deepEqual(standingNames(fight('gaj', [druid], line())), ['Dąb wieków', 'Dąb wieków', 'Niedźwiedź', 'Żubr']);
    // With room for two, a pack waits while the other stands.
    assert.equal(standingNames(fight('gaj-ciasno', [withFeat(druid, 'summons', 2)], line())).length, 2);
  });

  test('Anielska opieka: healing past full HP becomes a shield; Skrzydła światłości shield the party and burn whoever strikes the shield; Boskie uzdrowienie heals the party and keeps healing it', () => {
    const angel = form('archangel', { only: ['wings-of-light'] });
    const result = fight('skrzydla', [angel, form('ravager', { only: [], id: 'a1' })], line());
    const raised = result.events.find((event) => event.skill === 'wings-of-light' && event.kind === 'skill');
    assert.match(raised.text, /tarczą za \d+% maks\. HP/);
    assert.ok(result.events.some((event) => event.kind === 'reflect' && event.actor === 'a0'));
    const healer = fight('boskie', [form('archangel', { only: ['divine-healing'], hpShare: 0.6 })], line());
    const heal = healer.events.find((event) => event.skill === 'divine-healing' && event.kind === 'heal');
    assert.ok(heal && heal.amount > 0);
    assert.ok(healer.events.some((event) => event.skill === 'divine-healing' && /kolejnych ruchów/.test(event.text ?? '')));
  });

  test('Ogień niebios blinds some foes it strikes, once; Słup światła blinds every foe; Dzień gniewu falls on another foe when its target falls', () => {
    const pillar = fight('slup', [form('heaven-avenger', { only: ['pillar-of-light'] })], line());
    const cast = pillar.events.find((event) => event.skill === 'pillar-of-light' && event.kind === 'skill');
    const blinded = pillar.events.filter((event) => event.kind === 'effect' && event.t === cast.t && /Oślepienie/.test(event.text)).map((event) => event.target);
    assert.deepEqual([...blinded].sort(), ['e0', 'e1', 'e2']);
    const wrath = form('heaven-avenger', { only: ['day-of-wrath'] });
    const result = fight('dzien-gniewu', [wrath], [foe('wolf', 'e0', { hp: 10 }), sturdy('crow', 'e1', { hp: 100000 })]);
    const blows = result.events.filter((event) => event.skill === 'day-of-wrath' && BLOWS.includes(event.kind));
    if (blows[0]?.target === 'e0') assert.ok(blows.some((event) => event.target === 'e1' && event.t === blows[0].t));
  });

  test('Dar widzenia: the first blow at each of the party misses; Jasnowidzenie dodges blows and spells and answers them; Odwrócenie losu takes a move from every foe and heals the party', () => {
    const seer = form('seer', { only: [] });
    const first = fight('dar', [seer], [sturdy('wolf', 'e0')]);
    const blow = first.events.find((event) => event.actor === 'e0');
    assert.equal(blow.kind, 'dodge');
    assert.match(blow.text, /przewidział/);
    const witches = many(4, 'jasnowidzenie', (seed) => fight(seed, [form('seer', { only: ['clairvoyance'] })], [sturdy('broom-witch', 'e0'), sturdy('broom-witch', 'e1')]));
    const answered = witches.flatMap((result) => result.events).filter((event) => event.skill === 'clairvoyance' && BLOWS.includes(event.kind));
    assert.ok(answered.length > 0, 'a spell foreseen and answered');
    const turned = fight('odwrocenie', [form('seer', { only: ['fate-reversal'], hpShare: 0.3 })], line());
    const heal = turned.events.find((event) => event.skill === 'fate-reversal' && event.kind === 'heal');
    assert.ok(heal);
    const reversed = turned.events.find((event) => event.skill === 'fate-reversal' && event.kind === 'skill');
    assert.match(reversed.text, /wszyscy wrogowie tracą najbliższy ruch/);
    assert.deepEqual([...reversed.targets].sort(), ['e0', 'e1', 'e2']);
  });

  test('Żniwo: every foe that falls makes the Żniwiarz strike harder; Ścięcie dusz cuts the foe beside too; Taniec kosy turns twice and heals for every foe it fells', () => {
    const reaper = form('soul-reaper', { only: [] });
    const result = fight('zniwo', [reaper], [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1', { speed: 1 })]);
    const onBoar = (one) => one.events.find((event) => event.actor === 'a0' && event.target === 'e1' && BLOWS.includes(event.kind));
    const quiet = fight('zniwo', [withFeat(reaper, 'soul', 0)], [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1', { speed: 1 })]);
    if (onBoar(result).kind === onBoar(quiet).kind) near(onBoar(result).damage / onBoar(quiet).damage, 1 + reaper.feat.soul, 0.03, 'Żniwo');
    const cut = fight('sciecie', [form('soul-reaper', { only: ['soul-harvest'] })], line());
    const first = cut.events.filter((event) => event.skill === 'soul-harvest' && BLOWS.includes(event.kind));
    assert.ok(first.length >= 2 && first[0].t === first[1].t && first[0].target !== first[1].target);
    const dance = fight('taniec', [form('soul-reaper', { only: ['scythe-dance'] })], line());
    assert.ok(dance.events.some((event) => event.skill === 'scythe-dance' && /drugi obrót/.test(event.text ?? '')));
  });

  test('Władca Nawii: any foe that falls rises for the Król Nawii; Legion Nawii calls two knights at once; Mgła Nawii poisons every foe and drains', () => {
    const king = form('navia-king', { only: [] });
    const raised = fight('nawia', [king, form('ravager', { only: [], id: 'a1' })], [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1')]);
    const risen = raised.events.find((event) => event.kind === 'summon' && event.state === 'up' && event.actor === 'a0');
    assert.ok(risen, 'a fallen foe rises');
    assert.match(risen.text, /wstaje jako upiór Nawii/);
    assert.equal(risen.figure, 'upior');
    const legion = fight('legion', [form('navia-king', { only: ['navia-legion'] })], line());
    const call = legion.events.find((event) => event.skill === 'navia-legion' && event.kind === 'summon');
    const knights = legion.events.filter((event) => event.skill === 'navia-legion' && BLOWS.includes(event.kind) && event.t > call.t);
    assert.ok(new Set(knights.slice(0, 4).map((event) => event.t)).size < knights.slice(0, 4).length, 'two knights strike in one move');
    const mist = fight('mgla', [form('navia-king', { only: ['navia-mist'] })], line());
    const cast = mist.events.find((event) => event.skill === 'navia-mist' && event.kind === 'skill');
    const poisoned = mist.events.filter((event) => event.kind === 'effect' && event.t === cast.t && /Zatrucie/.test(event.text)).map((event) => event.target);
    assert.deepEqual([...new Set(poisoned)].sort(), ['e0', 'e1', 'e2']);
  });

  test('Dziecię nocy: no foe can strike the Książę at first; Wieczna noc makes the foes\' blows miss and answers them; Cios z cienia strikes the weakest foe and hides its striker', () => {
    const prince = form('dark-prince', { only: [] });
    assert.ok(prince.feat.hidden > 0);
    const night = fight('noc', [form('dark-prince', { only: ['eternal-night'] })], line());
    assert.ok(night.events.some((event) => event.kind === 'dodge' && /w ciemności/.test(event.text)));
    assert.ok(night.events.some((event) => event.skill === 'eternal-night' && BLOWS.includes(event.kind)));
    const strike = fight('cien', [form('dark-prince', { only: ['shadow-strike'] })], [sturdy('boar', 'e0', { hp: 200000 }), sturdy('crow', 'e1', { hp: 50000 }), sturdy('wolf', 'e2')]);
    const blow = strike.events.find((event) => event.skill === 'shadow-strike' && BLOWS.includes(event.kind));
    assert.equal(blow.target, 'e1');
    assert.equal(blow.kind, 'crit');
    assert.ok(strike.events.some((event) => /znika w cieniu/.test(event.text ?? '')));
  });
});

describe('the fourth forms against the third forms (tools/class-balance-sim.mjs, tools/pvp-arena-sim.mjs)', () => {
  test('on four-hour explorations at level 260 a fourth form faints no more often than its third form, and ends them with as much HP or kills clearly quicker', () => {
    // The realistic player of tools/difficulty-sim.mjs, alone (without
    // companions it is harder), at class level 320 (the tuned curve).
    const rows = [];
    for (const cls of content.classes) {
      content.skills.filter((skill) => skill.classId === cls.id).forEach((skill, index) => {
        const path = index === 0 ? null : skill.id;
        const options = { model: 'realistic-nocomp', classId: cls.id, level: 260, minutes: 240, hunts: 120, path };
        rows.push([measureClass(options, tunedGear(thirdOnly)), measureClass(options, tunedGear(content))]);
      });
    }
    assert.deepEqual(rows.map(([, fourth]) => fourth.evolution).sort(), [...FORMS].sort());
    for (const [third, fourth] of rows) {
      const told = `${fourth.evolution}: ${fourth.defeats} faints, HP ${fourth.endHp.toFixed(3)}, kills ${(fourth.killSpeed / third.killSpeed).toFixed(2)}× vs ${third.defeats} and ${third.endHp.toFixed(3)}`;
      assert.ok(fourth.defeats <= third.defeats, told);
      assert.ok(fourth.endHp >= third.endHp || fourth.killSpeed >= 1.15 * third.killSpeed, told);
    }
    assert.ok(Math.max(...rows.map(([, fourth]) => fourth.defeats)) <= 0.05);
  });

  test('in the Arena at levels 260 and 300 each fourth form wins 25–75% of its duels against the other paths, and the duels last a few rounds', () => {
    // Until 1271 B fourteen fourth forms had their own strength in the
    // players' duels (evolutions.json duelPower, duelHp): the Tytan, a
    // shield for its party, struck little in a duel of one against one. Now
    // no form has, and its shockwave passes all armour and strikes a lone
    // foe harder, everywhere.
    // Class levels about 320 and 365 (the tuned curve).
    for (const level of [260, 300]) {
      const result = measure({ level, seeds: 1, model: 'realistic', paths: true }, tuned(content));
      assert.deepEqual(Object.keys(result.paths).sort(), [...FORMS].sort());
      for (const [id, share] of Object.entries(result.paths)) assert.ok(share >= 0.25 && share <= 0.75, `level ${level}: ${id} wins ${share}`);
      assert.ok(result.median >= 16 && result.median <= 40, `level ${level}: median ${result.median} moves`);
      assert.ok(result.limits <= 0.12, `level ${level}: the judge ended ${result.limits}`);
    }
  });
});

describe('the fourth evolution through the API (FOURTH_EVOLUTION "on")', () => {
  const { call, db, signUp } = useServer({ FOURTH_EVOLUTION: 'on' });
  let cookie;

  const create = async () => {
    ({ cookie } = await signUp('czwartaforma'));
    await call('POST', '/api/character', { cookie, body: { name: 'Czwartaforma', classId: 'warrior', appearance: 'male' } });
  };
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  beforeEach(() => create());

  test('at class level 300 with the points spent the character sees its one form, takes it with its skills at 0 and keeps its stat points', async () => {
    await set(`level = 250, class_level = 299, evolution = 'horde-slayer', skills = '{"smashing-blow":145,"slaughter":144}', points = '{"strength":3}'`);
    let view = await character();
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['horde-slayer', null, 300]);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'ravager' } })).data.error.code, 'class_level');
    await set(`class_level = 300, skills = '{"smashing-blow":145,"slaughter":145}'`);
    view = await character();
    assert.equal(view.evolution.next.id, 'ravager');
    assert.deepEqual(view.skills.evolution, { level: 300, need: 'evolve' });
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'ravager' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    const after = taken.data.character;
    assert.equal(after.className, 'Burzyciel');
    assert.equal(after.evolution.current.trait.name, 'Gniew bez dna');
    assert.equal(after.skills.points, 291);
    assert.deepEqual(after.skills.pools[0].options.map((skill) => [skill.id, skill.level, skill.maxLevel]), [
      ['carnage', 0, 195],
      ['breach', 0, 195],
    ]);
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT points FROM characters').first()).points), { strength: 3 });
  });

  test('a Pradruid keeps its Skill Points: its level in Odrodzenie puszczy moves to Pradawne stado (migrations/0169_ancient_herd.sql, 1221 A)', async () => {
    await set(`class_id = 'mage', level = 270, class_level = 330, evolution = 'elder-druid', skills = '{"oak-of-ages":150,"forest-rebirth":141}', evolution_undo = '{"forest-rebirth":5,"oak-of-ages":2}'`);
    const before = (await character()).skills.points;
    const database = await db();
    const migration = readFileSync('migrations/0169_ancient_herd.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));
    const row = await database.prepare('SELECT skills, evolution_undo FROM characters').first();
    assert.equal(row.skills, '{"oak-of-ages":150,"ancient-herd":141}');
    assert.deepEqual(JSON.parse(row.evolution_undo), { 'oak-of-ages': 2, 'ancient-herd': 5 });
    const view = await character();
    assert.deepEqual(view.skills.pools[0].options.map((skill) => [skill.id, skill.level]), [['oak-of-ages', 150], ['ancient-herd', 141]]);
    assert.equal(view.skills.points, before);
  });

  test('on the test version a third form gets class level 300 at once, and keeps its form', async () => {
    await set(`level = 120, class_level = 210, evolution = 'horde-slayer', skills = '{"smashing-blow":11,"slaughter":0}'`);
    const raised = await call('POST', '/api/evolution/test-level?level=300', { cookie });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.classLevel, 300);
    assert.equal(raised.data.character.className, 'Pogromca Hord');
    await set(`evolution = 'berserker', skills = '{}'`);
    assert.equal((await call('POST', '/api/evolution/test-level?level=300', { cookie })).data.error.code, 'not_third');
  });
});

describe('the fourth evolution where the deployment has it off (FOURTH_EVOLUTION unset, the switch kept)', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('bezczwartej'));
    await call('POST', '/api/character', { cookie, body: { name: 'Bezczwartej', classId: 'warrior', appearance: 'male' } });
  });
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();

  test('through the API a third form has no fourth form: the class waits at 300 only for its points', async () => {
    await set(`level = 250, class_level = 300, evolution = 'horde-slayer', skills = '{"smashing-blow":145,"slaughter":140}'`);
    let view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['horde-slayer', null, null]);
    assert.deepEqual(view.skills.evolution, { level: 300, need: 'skill_points' });
    await set(`skills = '{"smashing-blow":145,"slaughter":145}'`);
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(view.skills.evolution.need, null);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'ravager' } });
    assert.ok(taken.status >= 400 && taken.data.error);
    assert.equal((await (await db()).prepare('SELECT evolution FROM characters').first()).evolution, 'horde-slayer');
    assert.equal((await call('POST', '/api/evolution/test-level?level=300', { cookie })).data.error.code, 'not_third');
    const { evolutionArt: art } = (await call('GET', '/api/content')).data;
    assert.equal(art.forms['horde-slayer'], 'berserker');
    assert.equal(art.forms.ravager, undefined);
  });
});
