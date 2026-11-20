// Poboczne statystyki (1218 B and D, the author 20.11.2026, both marked on
// the review page at once; src/engine/side-stats.js): Siła or Intelekt the
// weapons of a class or a form do not hit with. Side Siła gives a point of
// maximum HP a point in every fight and 1% more of the explorations'
// resources for every 50 points, side Intelekt a point of resistance to
// every element for every 2 points and 1% more of the professions' XP for
// every 50 points, each share at most 10% (balance.sideStats). By the
// class or the form, never by the weapon held; a stat a form counts as
// another (`as`) or its skills' stat (skillStat) is none.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { computeStats, createRng, extraValues, generateItem, playerCombatant, sideStatIds, sideStats, simulateHunt, statShares } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// The game's data with the side stats giving nothing in the fights (B), or
// nothing outside them (D).
const withSide = (change) => ({ ...content, balance: { ...content.balance, sideStats: { ...content.balance.sideStats, ...change } } });
const noFights = withSide({ strengthHp: 0, intellectResistPer: 1e9 });
const noShares = withSide({ step: 0 });

const points = { strength: 300, intellect: 300, vitality: 200 };
const hero = (classId, overrides = {}) => newCharacter(classId, { level: 60, classLevel: 60, points, ...overrides });
const unitOf = (character, data = content, equipped = [], extra = {}) => playerCombatant({ character, equipped, name: 'Mira', ...extra }, data);
const elements = content.elements.map((element) => element.id);

describe('Poboczne statystyki (1218)', () => {
  test('the numbers in the data', () => {
    assert.deepEqual(content.balance.sideStats, { strengthHp: 1, intellectResistPer: 2, per: 50, step: 0.01, cap: 0.1 });
  });

  test('by the class or the form: the weapon\'s stat, a stat counted as another and the skills\' stat are none', () => {
    const ids = (classId, evolution = null) => sideStatIds({ classId, evolution }, content);
    assert.deepEqual(ids('warrior'), ['intellect']);
    assert.deepEqual(ids('archer'), ['strength', 'intellect']);
    assert.deepEqual(ids('shadow'), ['strength', 'intellect']);
    assert.deepEqual(ids('mage'), ['strength']);
    assert.deepEqual(ids('cleric'), ['strength']);
    // Strzelec Burzy hits with Intelekt, its Zręczność counts as Intelekt.
    assert.deepEqual(ids('archer', 'storm-archer'), ['strength']);
    assert.deepEqual(ids('archer', 'thunderer'), ['strength']);
    // Łowca hits with Siła, its Zręczność counts as Siła.
    assert.deepEqual(ids('archer', 'hunter'), ['intellect']);
    assert.deepEqual(ids('archer', 'beast-lord'), ['intellect']);
    // Wielki Inkwizytor's Intelekt counts as its Siła: none, in its line too.
    for (const form of ['grand-inquisitor', 'demon-slayer', 'heaven-avenger']) assert.deepEqual(ids('cleric', form), [], form);
    // Nekromanta takes a Mag's kostury, its Zręczność counts as Intelekt.
    assert.deepEqual(ids('shadow', 'necromancer'), ['strength']);
    assert.deepEqual(ids('shadow', 'navia-king'), ['strength']);
    // An evolution whose skills grow with Intelekt (986 B) keeps it.
    const marked = { ...content.evolutionsById.barbarian, skillStat: 'intellect' };
    const data = { ...content, evolutionsById: { ...content.evolutionsById, barbarian: marked } };
    assert.deepEqual(sideStatIds({ classId: 'warrior', evolution: 'barbarian' }, data), []);
    assert.deepEqual(ids('warrior', 'barbarian'), ['intellect']);
  });

  test('B: side Siła gives a point of HP a point, side Intelekt a point of resistance to every element for every 2 points', () => {
    for (const classId of ['warrior', 'archer', 'mage', 'cleric', 'shadow']) {
      const character = hero(classId);
      const { totals } = computeStats(character, [], content);
      const side = sideStatIds(character, content);
      const unit = unitOf(character);
      const plain = unitOf(character, noFights);
      assert.equal(unit.maxHp - plain.maxHp, side.includes('strength') ? totals.strength : 0, classId);
      for (const element of elements) assert.equal(unit.resist[element] ?? 0, side.includes('intellect') ? Math.floor(totals.intellect / 2) : 0, `${classId} ${element}`);
      // The weapon's own stat gives as before.
      assert.equal(unit.damageScale, plain.damageScale, classId);
    }
  });

  test('B: the Wielki Inkwizytor gets nothing', () => {
    const character = hero('cleric', { level: 150, classLevel: 150, evolution: 'grand-inquisitor' });
    assert.deepEqual(unitOf(character), unitOf(character, noFights));
  });

  test('B: taking the weapon off changes nothing, though the fists hit with Siła', () => {
    const base = content.bases.find((one) => (one.family ?? one.id) === 'staff' && one.slot === 'weapon');
    const staff = { ...generateItem({ baseId: base.id, level: 60 }, createRng('kostur'), content), implicit: null, affixes: [], imbue: null };
    const character = hero('mage');
    const armed = unitOf(character, content, [staff]);
    const bare = unitOf(character);
    assert.equal(armed.weapon.scaling, 'intellect');
    assert.equal(bare.weapon.scaling, 'strength');
    assert.equal(armed.maxHp, bare.maxHp);
    assert.deepEqual(armed.resist, bare.resist);
    assert.ok(bare.maxHp > unitOf(character, noFights).maxHp);
  });

  test('B: from the stats with the potions\' shares, before the trait raises the resistance', () => {
    const boosted = hero('warrior');
    const { totals } = computeStats(boosted, [], content);
    const unit = unitOf(boosted, content, [], { statBoost: { intellect: 0.5 } });
    assert.equal(unit.resist.fire, Math.floor(Math.round(totals.intellect * 1.5) / 2));
    // Opoka (the Strażnik's bulwark): +10% of the resistance, the side's too.
    const guardian = hero('warrior', { evolution: 'guardian' });
    const share = content.evolutionsById.guardian.trait.params.resist;
    const guarded = unitOf(guardian);
    const own = computeStats(guardian, [], content).totals.intellect;
    for (const element of elements) assert.equal(guarded.resist[element], Math.round(Math.floor(own / 2) * (1 + share)), element);
  });

  test('D: 1% for every whole 50 points, at most 10%; nothing from a stat that is no side stat', () => {
    const at = (classId, value) => sideStats({ classId }, { strength: value, intellect: value }, content);
    assert.deepEqual([at('archer', 49).resources, at('archer', 50).resources, at('archer', 499).resources, at('archer', 500).resources, at('archer', 5000).resources], [0, 0.01, 0.09, 0.1, 0.1]);
    assert.deepEqual([at('archer', 49).professionXp, at('archer', 450).professionXp, at('archer', 9000).professionXp], [0, 0.09, 0.1]);
    assert.equal(at('warrior', 5000).resources, 0);
    assert.equal(at('warrior', 5000).professionXp, 0.1);
    assert.equal(at('mage', 5000).professionXp, 0);
    assert.equal(at('mage', 5000).resources, 0.1);
  });

  test('D: side Siła brings more of the resources from an exploration, finds and gathering alike', () => {
    const { character, equipped } = typicalCharacter('mage', 60, content);
    const strong = { ...character, points: { ...character.points, strength: (character.points.strength ?? 0) + 600 } };
    // A place easy enough for the whole four hours.
    const area = content.areas.findLast((one) => one.maxLevel <= 50);
    const run = (who, data) => simulateHunt({ character: who, equipped, hp: null, name: 'Mira', areaId: area.id, minutes: 240, seed: 'zasoby' }, data);
    const sum = (hunt) => Object.values(hunt.resources).reduce((total, amount) => total + amount, 0);
    const more = run(strong, content);
    const plain = run(strong, noShares);
    // The same fights, as the share changes nothing in them.
    assert.deepEqual(more.fights, plain.fights);
    assert.equal(more.result, 'success');
    assert.ok(sum(plain) > 200, String(sum(plain)));
    const ratio = sum(more) / sum(plain);
    assert.ok(ratio > 1.08 && ratio < 1.12, String(ratio));
    // A Wojownik's Siła is its weapon's: no more resources.
    const warrior = typicalCharacter('warrior', 60, content);
    const mighty = { ...warrior.character, points: { ...warrior.character.points, strength: (warrior.character.points.strength ?? 0) + 600 } };
    const own = (data) => sum(simulateHunt({ character: mighty, equipped: warrior.equipped, hp: null, name: 'Mira', areaId: area.id, minutes: 240, seed: 'zasoby' }, data));
    assert.equal(own(content), own(noShares));
  });

  test('the stats screen: what each side stat gives, and none for the Wielki Inkwizytor', () => {
    const warrior = hero('warrior', { points: { strength: 300, intellect: 600 } });
    const shares = statShares(warrior, [], content);
    const intellect = computeStats(warrior, [], content).totals.intellect;
    assert.equal(shares.intellect.resist, Math.floor(intellect / 2));
    assert.equal(shares.intellect.professionXp, 0.1);
    assert.equal(shares.strength.resources, undefined);
    const side = extraValues(warrior, [], content).side;
    assert.deepEqual(side.ids, ['intellect']);
    assert.deepEqual([side.strength, side.intellect, side.hp, side.resist], [0, intellect, 0, Math.floor(intellect / 2)]);
    assert.deepEqual(side.rule, content.balance.sideStats);
    const inquisitor = hero('cleric', { level: 150, classLevel: 150, evolution: 'grand-inquisitor' });
    assert.deepEqual(extraValues(inquisitor, [], content).side.ids, []);
  });
});

describe('Poboczny Intelekt i doświadczenie profesji (1218 D)', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const age = async (minutes) => (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  let cookie;
  const gathered = async (classId) => {
    await call('POST', '/api/character', { cookie, body: { name: 'Zielarka', classId, appearance: 'female' } });
    await set('level = 10, xp = 0, points = ?', JSON.stringify({ intellect: 600 }));
    assert.equal((await call('POST', '/api/professions/gather', { cookie, body: { herbs: ['comfrey'], minutes: 60 } })).status, 201);
    await age(60);
    return (await call('POST', '/api/hunts/claim', { cookie })).data.report.profession.xp;
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('zielarka'));
  });

  test('a Wojownik with 600 Intelekt gets 10% more of the profession\'s XP', async () => {
    assert.equal(await gathered('warrior'), 66);
  });

  test('a Mag\'s Intelekt is its weapon\'s: no more', async () => {
    assert.equal(await gathered('mage'), 60);
  });
});
