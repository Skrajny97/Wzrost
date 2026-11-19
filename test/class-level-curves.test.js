// The creatures and the companions by the class level (19.11.2026). The
// author chose 1207 A: from class level 100 the creatures grow evenly to
// twice as strong just before 250, and from 250 they stay three times as
// strong as before (balance.monsters.classLevelCurve on top of mythGame, by
// the class level of those who fight them, half in a fight alone). The
// companions grow with their character's class level
// (balance.companions.classLevelCurve; the author: „trzeba też w obliczu
// zmian wzmocnić towarzyszy jakoś, bo po zmianach - bez drużyny ciezko
// bedzie walczyć” and „to wypadaloby też wzmocnić towarzyszy od 100ego”):
// their blows and HP, wherever they fight, and their card shows it. A
// Drużyna's players are no companions, and what keeps its own measure keeps
// it.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  cardHomes,
  cardStats,
  classLevelFactor,
  companionBoost,
  companionCombatant,
  guildBeast,
  guildBeastFight,
  labyrinthFighters,
  monsterCombatant,
  newLabyrinth,
  portalFight,
  simulateHunt,
  towerFight,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { mythGame, soloGrowth, classLevelCurve: creatureCurve } = content.balance.monsters;
const companionCurve = content.balance.companions.classLevelCurve;
const near = (a, b, within = 1e-9) => Math.abs(a - b) < within;

// The content with balance.monsters' or balance.companions' curve set.
const withCurves = ({ monsters, companions }) => ({
  ...content,
  balance: {
    ...content.balance,
    monsters: { ...content.balance.monsters, ...(monsters && { classLevelCurve: monsters }) },
    companions: { ...content.balance.companions, ...(companions && { classLevelCurve: companions }) },
  },
});
const flat = withCurves({ monsters: [], companions: [] });

const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);
const monster = (level, extra = {}, data = content) => monsterCombatant({ monsterId, level, id: 'a', ...extra }, data);

// A hired companion, as the Osada keeps it.
const hired = (id, classId = 'warrior', level = 240) => ({
  id,
  name: `Towarzysz ${id}`,
  appearance: 'male',
  classId,
  level,
  xp: 0,
  traits: [],
  skills: content.skills.filter((skill) => skill.classId === classId).map((skill) => skill.id).slice(0, 2),
  profession: 'gathering',
  story: 0,
  gear: [],
  relation: 0,
});

describe('a curve by class level', () => {
  test('×1 below its first point and with no points, straight between two, as the last past it', () => {
    const curve = [[100, 1], [200, 2], [250, 1]];
    assert.equal(classLevelFactor(50, []), 1);
    assert.equal(classLevelFactor(99, curve), 1);
    assert.equal(classLevelFactor(100, curve), 1);
    assert.ok(near(classLevelFactor(150, curve), 1.5));
    assert.equal(classLevelFactor(200, curve), 2);
    assert.ok(near(classLevelFactor(225, curve), 1.5));
    assert.equal(classLevelFactor(250, curve), 1);
    assert.equal(classLevelFactor(400, curve), 1);
    assert.equal(classLevelFactor(300, [[250, 1.3]]), 1.3);
    assert.equal(classLevelFactor(249, [[250, 1.3]]), 1);
  });
});

describe('the creatures by the class level of those who fight them (1207 A)', () => {
  test('as it stands: evenly from ×1 at class level 100 to ×√2 (twice as strong) at 249, and from 250 the myth game\'s ×√3 alone', () => {
    assert.deepEqual(creatureCurve, [[100, 1], [249, 1.4142], [250, 1]]);
    assert.ok(near(1.4142 ** 2, 2, 0.001));
  });

  test('the same creature by class level: as before up to 100, twice as strong at 249, three times from 250', () => {
    for (const level of [60, 200, 300]) {
      const plain = monster(level);
      assert.deepEqual(monster(level, { classLevel: 99 }), plain, `class 99 at ${level}`);
      assert.deepEqual(monster(level, { classLevel: 100 }), plain, `class 100 at ${level}`);
      const strength = (classLevel) => {
        const unit = monster(level, { classLevel });
        return { blows: unit.weapon.max / plain.weapon.max, hp: unit.maxHp / plain.maxHp };
      };
      const middle = strength(175);
      assert.ok(near(middle.blows, classLevelFactor(175, creatureCurve)), `blows at class 175, ${level}`);
      const before = strength(249);
      assert.ok(near(before.blows, 1.4142), `blows at class 249, ${level}`);
      assert.ok(near(before.hp, 1.4142, 0.01), `HP at class 249, ${level}`);
      assert.ok(near(before.blows * before.hp, 2, 0.03), `twice as strong at class 249, ${level}`);
      const from = strength(250);
      assert.ok(near(from.blows, 1 + mythGame.damage), `blows at class 250, ${level}`);
      assert.ok(near(from.blows * from.hp, 3, 0.03), `three times as strong at class 250, ${level}`);
      assert.deepEqual(monster(level, { classLevel: 300 }), monster(level, { classLevel: 300 }, flat), `class 300 at ${level}: as before`);
    }
  });

  test('alone (the Wieża Solo, an event\'s fight without companions) half of it, as the myth game', () => {
    const plain = monster(200, { growth: soloGrowth });
    const alone = monster(200, { growth: soloGrowth, classLevel: 249 });
    assert.ok(near(alone.weapon.max / plain.weapon.max, 1 + 0.4142 * soloGrowth));
  });

  test('below class level 250 no more for a Drużyna\'s players than the ramp (612 C)', () => {
    assert.deepEqual(monster(200, { classLevel: 249, players: 3 }), monster(200, { classLevel: 249 }));
  });

  test('the Bestia Gildii and the cards of Talia Systemu keep their measure', () => {
    const wild = withCurves({ monsters: [[1, 5]] });
    const beast = guildBeast({ seed: 'bestia', levels: [200, 200] }, content);
    const attack = (data) => guildBeastFight({ character: newCharacter('warrior', { level: 200, classLevel: 240 }), equipped: [], name: 'Łowczyni', beast: { ...beast, hp: beast.maxHp }, seed: 's' }, data);
    assert.deepEqual(attack(wild), attack(content));
    for (const id of [...cardHomes(content).keys()].slice(0, 40)) assert.deepEqual(cardStats(id, 1, wild), cardStats(id, 1, content), id);
  });
});

describe('the companions by their character\'s class level', () => {
  const companion = hired('c1', 'cleric');

  test('as it stands: from class level 100 their blows and HP ×1.4, from 330 less, to ×1 at 390, about as well as a Drużyna of three of the same level', () => {
    assert.deepEqual(companionCurve, [[100, 1.4], [330, 1.4], [390, 1]]);
    const boosts = [99, 100, 249, 250, 300, 330, 360, 390, 400].map((classLevel) => companionBoost(classLevel, content));
    [1, 1.4, 1.4, 1.4, 1.4, 1.4, 1.2, 1, 1].forEach((boost, index) => assert.ok(near(boosts[index], boost), `${boosts[index]} for ${boost}`));
  });

  test('class 249 and 250 (and 99, 100): their blows and HP as the curve says, nothing else', () => {
    const plain = companionCombatant(companion, {}, flat);
    for (const classLevel of [0, 99, 100, 150, 200, 249, 250, 300]) {
      const boost = companionBoost(classLevel, content);
      assert.equal(boost, classLevelFactor(classLevel, companionCurve));
      const unit = companionCombatant(companion, { classLevel }, content);
      assert.equal(unit.maxHp, Math.round(plain.maxHp * boost), `HP at class ${classLevel}`);
      assert.equal(unit.weapon.min, boost === 1 ? plain.weapon.min : Math.round(plain.weapon.min * boost), `blows at class ${classLevel}`);
      assert.equal(unit.weapon.max, boost === 1 ? plain.weapon.max : Math.round(plain.weapon.max * boost), `blows at class ${classLevel}`);
      assert.deepEqual([unit.armor, unit.speed, unit.dodgeRating, unit.skills], [plain.armor, plain.speed, plain.dodgeRating, plain.skills]);
    }
    assert.equal(companionBoost(99, content), 1);
    // Without a class level (a fight that keeps its own measure) as before.
    assert.deepEqual(companionCombatant(companion, {}, content), plain);
  });

  test('in an exploration they fight with the boost of the character\'s class level', () => {
    const fought = (classLevel, data = content) =>
      simulateHunt(
        { character: newCharacter('warrior', { level: 120, classLevel }), equipped: [], hp: null, name: 'Wędrowiec', areaId: 'mossy-boulders', minutes: 60, seed: 'towarzysze', companions: [companion] },
        data,
      );
    for (const classLevel of [99, 150, 249, 250, 300]) {
      const mate = fought(classLevel).fights[0].allies.find((unit) => unit.companion);
      assert.equal(mate.maxHp, companionCombatant(companion, { classLevel }, content).maxHp, `class ${classLevel}`);
    }
    // Below the curve the exploration goes as before.
    assert.deepEqual(fought(99), fought(99, flat));
  });

  test('in the Labirynt they fight with it too, its HP shares kept', () => {
    const state = newLabyrinth({ day: '2026-11-19', charLevel: 230, companions: [companion], seed: 'l' });
    const team = (classLevel) =>
      labyrinthFighters({ ...state, hp: { ...state.hp, [state.team[0]]: 0.5 } }, { character: newCharacter('mage', { level: 230, classLevel }), equipped: [], name: 'Magini', companions: [companion] }, content);
    for (const classLevel of [249, 250]) {
      const mate = team(classLevel).find((fighter) => fighter.key !== 'me').unit;
      const full = companionCombatant(companion, { classLevel }, content).maxHp;
      assert.equal(mate.maxHp, full, `class ${classLevel}`);
      assert.equal(mate.hp, Math.round(full * 0.5));
    }
  });

  test('in the Wieża Drużyn and the Portale by their own character\'s class level, not a partner\'s', () => {
    const tower = (climber, partner) =>
      towerFight(
        {
          character: newCharacter('warrior', { level: 230, classLevel: climber }),
          equipped: [],
          name: 'Wspinacz',
          floor: 3,
          seed: 'moc',
          partners: [{ character: newCharacter('cleric', { level: 230, classLevel: partner }), equipped: [], name: 'Druh' }],
          companions: [companion],
        },
        content,
      ).fights[0].allies.find((unit) => unit.companion).maxHp;
    assert.equal(tower(250, 240), companionCombatant(companion, { classLevel: 250 }, content).maxHp);
    assert.equal(tower(240, 250), companionCombatant(companion, { classLevel: 240 }, content).maxHp);
    const portal = portalFight({ character: newCharacter('warrior', { level: 120, classLevel: 249 }), equipped: [], name: 'Wędrowiec', portalId: 'gold', stage: 40, seed: 'p', companions: [companion] }, content);
    assert.equal(portal.fights[0].allies.find((unit) => unit.companion).maxHp, companionCombatant(companion, { classLevel: 249 }, content).maxHp);
  });

  test('a Drużyna\'s trip has no companions: its players fight as before, whatever the companions\' curve', () => {
    const player = (classId, id, classLevel) => ({ id, name: id, character: newCharacter(classId, { level: 245, classLevel }), equipped: [], hp: null, windows: {}, trophies: {} });
    const trip = (data) => {
      const roster = [player('warrior', 'lead', 260), player('cleric', 'p1', 255), player('mage', 'p2', 252)];
      return simulateHunt({ character: roster[0].character, equipped: [], hp: null, name: 'lead', areaId: 'mossy-boulders', minutes: 60, seed: 'druzyna', lootSeed: 'lupy', roster, self: 'lead' }, data);
    };
    assert.deepEqual(trip(withCurves({ companions: [[1, 5]] })), trip(content));
    assert.ok(trip(content).fights[0].allies.every((unit) => !unit.companion));
  });
});

describe('the companion\'s card shows the HP it fights with', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  const companion = hired('w1:0', 'archer', 245);

  beforeEach(async () => {
    ({ cookie } = await signUp('kwatermistrzyni'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kwatermistrzyni', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 250, settlement = ?').bind(JSON.stringify({ companions: [companion] })).run();
  });

  test('in the Kwatery, by the character\'s class level', async () => {
    const shown = {};
    for (const classLevel of [99, 100, 249, 250]) {
      await (await db()).prepare('UPDATE characters SET class_level = ?').bind(classLevel).run();
      const answer = await call('GET', '/api/settlement', { cookie });
      assert.equal(answer.status, 200, JSON.stringify(answer.data).slice(0, 300));
      const [card] = answer.data.settlement.companions.hired;
      const unit = companionCombatant(companion, { classLevel }, content);
      assert.deepEqual([card.maxHp, card.armor], [unit.maxHp, unit.armor], `class ${classLevel}`);
      shown[classLevel] = card.maxHp;
    }
    assert.equal(shown[100], Math.round(shown[99] * companionBoost(100, content)));
    assert.equal(shown[250], Math.round(shown[99] * companionBoost(250, content)));
  });
});
