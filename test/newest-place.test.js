// The newest place dangerous again (19.11.2026). The author, on a
// measurement where a realistic player of class level 100–300 almost never
// fainted on a plain exploration there, alone with its companions or in a
// Drużyna: „nie może tak być, chyba że na niskim zagrożeniu i nizszych od
// aktualnego levelu krainach”, and his choice B: a 4-hour plain exploration
// of the newest place ends in a faint about one time in five, with the
// companions and in a Drużyna of three alike. From the character's level 30
// the creatures of the newest place, and of the higher ones, are stronger
// again by the character's level, place by place
// (balance.monsters.newestPlace.curve, on top of huntCurve), and each
// player of a Drużyna beyond the first adds its share by the highest class
// level among them (perPlayer). The first levels, the lower places, the
// Labirynt and the Sala prób keep their measure; the threat estimate meets
// the same creatures.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { exploreStrength, faintChances, huntStrength, labyrinthStrength, newestStrength, simulateHunt, threatSamples, trialHallFights, trialTarget } from '../src/engine/index.js';
import { companionsOf, measureCell, playerOf, roadKit } from '../tools/difficulty-sim.mjs';
import { content, newCharacter } from './helpers/content.js';

const newest = content.balance.monsters.newestPlace;
// The content without the newest place's class-level strength: the game
// before 19.11.2026.
const before = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, newestPlace: null } } };
// The content with `newestPlace` set to `values`.
const withNewest = (values) => ({ ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, newestPlace: values } } });
const near = (actual, expected, within = 1e-9) => assert.ok(Math.abs(actual - expected) <= within, `${actual} vs ${expected}`);
// The place that holds a level, `offset` places away.
const placeAt = (level, offset = 0) => content.areas.find((area) => area.minLevel <= level + 5 * offset && area.maxLevel >= level + 5 * offset);

// A player of a Drużyna's trip as parties.js keeps it: the realistic
// player of tools/difficulty-sim.mjs at full HP.
function member(id, classId, level) {
  const { character, equipped } = playerOf('realistic', classId, level, content);
  return { id, name: id, character, equipped, hp: null, windows: {}, trophies: {} };
}

describe('the strength of the newest place, in the engine', () => {
  const tried = withNewest({ fromLevel: 30, curve: [[30, 2, 1.6], [40, 3, 2.2]], perPlayer: [[100, 0.5, 0.3]] });
  const area = (id) => content.areasById[id];

  test('nothing below its character level nor in a lower place, by the character\'s level in the newest and the higher places, each player beyond the first adding its share by class level', () => {
    // mossy-boulders 26–30, spider-gully 31–35, lynx-ridge 36–40.
    assert.deepEqual([area('mossy-boulders').minLevel, area('spider-gully').minLevel, area('lynx-ridge').minLevel], [26, 31, 36]);
    assert.deepEqual(newestStrength(area('mossy-boulders'), 29, 200, 3, tried), [1, 1]);
    assert.deepEqual(newestStrength(area('spider-gully'), 29, 200, 1, tried), [1, 1]);
    assert.deepEqual(newestStrength(area('mossy-boulders'), 35, 200, 3, tried), [1, 1]);
    const [damage, hp] = newestStrength(area('spider-gully'), 35, 99, 3, tried);
    near(damage, 2.5);
    near(hp, 1.9);
    const [damage3, hp3] = newestStrength(area('spider-gully'), 35, 120, 3, tried);
    near(damage3, 2.5 * 2);
    near(hp3, 1.9 * 1.6);
    const [damage2, hp2] = newestStrength(area('spider-gully'), 35, 120, 2, tried);
    near(damage2, 2.5 * 1.5);
    near(hp2, 1.9 * 1.3);
    // A higher place as for its first level, as huntCurve.
    const [higher, higherHp] = newestStrength(area('lynx-ridge'), 35, 99, 1, tried);
    near(higher, 2.6);
    near(higherHp, 1.96);
    assert.deepEqual(newestStrength(area('lynx-ridge'), 35, 300, 3, before), [1, 1]);
    // The shares' curve gives nothing before its first point.
    assert.deepEqual(huntStrength(39, [[40, 0.5, 0.3]], [0, 0]), [0, 0]);
    assert.deepEqual(huntStrength(39, [[40, 2, 1.5]]), [1, 1]);
  });

  test('as it stands: from level 30, a point at the first and the last level of every place, never weaker, HP by 60% of the blows\' growth as in huntCurve', () => {
    assert.equal(newest.fromLevel, 30);
    for (const points of [newest.curve, newest.perPlayer]) {
      for (let i = 1; i < points.length; i++) assert.ok(points[i][0] > points[i - 1][0], 'points by rising levels');
    }
    const levels = new Set(newest.curve.map(([level]) => level));
    assert.equal(newest.curve[0][0], newest.fromLevel);
    for (const place of content.areas.filter((one) => one.minLevel > newest.fromLevel)) {
      assert.ok(levels.has(place.minLevel) && levels.has(place.maxLevel), place.id);
    }
    for (const [level, damage, hp] of newest.curve) {
      assert.ok(damage > 1, `level ${level}`);
      near(hp, 1 + 0.6 * (damage - 1), 0.0006);
    }
    assert.ok(newest.perPlayer.length >= 1);
    for (const [classLevel, damage, hp] of newest.perPlayer) {
      assert.ok(damage >= 0, `class ${classLevel}`);
      near(hp, 0.6 * damage, 0.0006);
    }
  });

  test('on an exploration the newest place and the higher ones get it, by its level and players; the lower places, a fight that is no exploration and the first levels do not', () => {
    for (const [level, classLevel] of [
      [30, 33],
      [100, 119],
      [217, 250],
      [300, 327],
    ]) {
      for (const [place, players] of [
        [placeAt(level), 1],
        [placeAt(level, 1), 1],
        [placeAt(level), 3],
      ]) {
        const [damage, hp] = newestStrength(place, level, classLevel, players, content);
        const [was, wasHp] = exploreStrength(place, level, before, false, { classLevel, players });
        const [now, nowHp] = exploreStrength(place, level, content, false, { classLevel, players });
        near(now, was * damage);
        near(nowHp, wasHp * hp);
        assert.ok(now > was, `level ${level}, ${place.id}`);
      }
      for (const offset of [-1, -2]) {
        const place = placeAt(level, offset);
        assert.deepEqual(exploreStrength(place, level, content, false, { classLevel, players: 3 }), exploreStrength(place, level, before, false, { classLevel, players: 3 }), `${place.id}`);
      }
      // No class level given (the Labirynt, the Sala prób): as before.
      assert.deepEqual(exploreStrength(placeAt(level), level, content), exploreStrength(placeAt(level), level, before));
    }
    for (const level of [10, 20, 29]) {
      assert.deepEqual(exploreStrength(placeAt(level), level, content, false, { classLevel: 300, players: 3 }), exploreStrength(placeAt(level), level, before, false, { classLevel: 300, players: 3 }), `level ${level}`);
    }
  });

  test('a Trudna and a Piekielna wyprawa keep their numbers on top', () => {
    const level = 150;
    const plain = exploreStrength(placeAt(level), level, content, false, { classLevel: 174 });
    for (const [hard, numbers] of [
      [true, content.balance.challenge.hard],
      ['hell', content.balance.challenge.hell],
    ]) {
      const [damage, hp] = exploreStrength(placeAt(level), level, content, hard, { classLevel: 174 });
      near(damage, plain[0] * numbers.damage);
      near(hp, plain[1] * numbers.hp);
    }
  });
});

describe('on an exploration', () => {
  test('the first levels go exactly as before, whatever the class level', () => {
    for (const [classId, level, classLevel] of [
      ['warrior', 29, 32],
      ['mage', 25, 60],
      ['cleric', 15, 17],
    ]) {
      const { character, equipped, plan } = playerOf('realistic', classId, level, content);
      const area = placeAt(level);
      const hunt = (data) =>
        simulateHunt({ character: { ...character, classLevel }, equipped, hp: null, name: 'Próba', areaId: area.id, minutes: 240, seed: `początek:${level}`, companions: companionsOf(plan, level, 0, data), ...roadKit(plan, area, 240, data) }, data);
      assert.deepEqual(hunt(content), hunt(before), `${classId} ${level}`);
    }
  });

  test('the newest place meets the stronger creatures; one place lower goes as before', () => {
    const level = 150;
    const { character, equipped, plan } = playerOf('realistic', 'archer', level, content);
    const hunt = (area, data) =>
      simulateHunt({ character, equipped, hp: null, name: 'Próba', areaId: area.id, minutes: 240, seed: 'najnowsze', companions: companionsOf(plan, level, 0, data), ...roadKit(plan, area, 240, data) }, data);
    const now = hunt(placeAt(level), content).fights[0].enemiesView;
    const was = hunt(placeAt(level), before).fights[0].enemiesView;
    const [, hp] = newestStrength(placeAt(level), level, character.classLevel, 1, content);
    assert.deepEqual(
      now.map((enemy) => [enemy.monsterId, enemy.level]),
      was.map((enemy) => [enemy.monsterId, enemy.level]),
    );
    now.forEach((enemy, index) => near(enemy.maxHp / was[index].maxHp, hp, 0.01));
    assert.deepEqual(hunt(placeAt(level, -1), content), hunt(placeAt(level, -1), before));
  });

  test('a Drużyna\'s trip: by the highest class level of its players, each player beyond the first adding its share; one place lower as before', () => {
    const level = 150;
    const roster = [member('lider', 'warrior', level), member('druh', 'cleric', level), member('trzeci', 'mage', level)];
    roster[1].character = { ...roster[1].character, classLevel: roster[0].character.classLevel + 6 };
    const highest = roster[1].character.classLevel;
    const trip = (players, area, data) =>
      simulateHunt({ character: players[0].character, equipped: players[0].equipped, hp: null, name: 'lider', areaId: area.id, minutes: 60, seed: 'drużyna', lootSeed: 'łup', roster: players, self: 'lider' }, data);
    const was = trip(roster, placeAt(level), before).fights[0].enemiesView;
    for (const size of [2, 3]) {
      const players = roster.slice(0, size);
      const now = trip(players, placeAt(level), content).fights[0].enemiesView;
      const [, hp] = newestStrength(placeAt(level), level, highest, size, content);
      now.forEach((enemy, index) => near(enemy.maxHp / was[index].maxHp, hp, 0.01));
      assert.deepEqual(trip(players, placeAt(level, -1), content), trip(players, placeAt(level, -1), before), `${size} one place lower`);
    }
    // The shares are a Drużyna's: three players meet more than two.
    assert.ok(newestStrength(placeAt(level), level, highest, 3, content)[1] > newestStrength(placeAt(level), level, highest, 2, content)[1]);
  });

  test('the newest place against the lower ones, as measured (tools/difficulty-sim.mjs): a real risk there, almost none a place lower, none two lower', () => {
    // At the 300th level: since the weaker creatures (24.11.2026) a 4-hour
    // exploration of the newest place seldom ends in a faint below the 200th
    // (at the 150th, where this was measured before, none from 24.11 and
    // about 1% since they stand halfway, 25.11.2026), and from the 240th
    // about 10–17% of them (6–10% from 24.11).
    const level = 300;
    const rate = (offset, party = 1) =>
      ['warrior', 'mage'].reduce((sum, classId) => sum + measureCell({ model: 'realistic', classId, level, minutes: 240, hunts: 30, offset, party }, content).faintRate, 0) / 2;
    const newestRate = rate(0);
    assert.ok(newestRate >= 0.05, `the newest place: ${newestRate}`);
    assert.ok(rate(-1) <= 0.02, `one place lower: ${rate(-1)}`);
    assert.equal(rate(-2), 0);
    // Before, the newest place was as safe as the lower ones.
    const was = ['warrior', 'mage'].reduce((sum, classId) => sum + measureCell({ model: 'realistic', classId, level, minutes: 240, hunts: 30, offset: 0 }, before).faintRate, 0) / 2;
    assert.ok(was <= 0.02, `before: ${was}`);
  });
});

describe('what follows and what keeps its measure', () => {
  test('the threat estimate fights the same creatures: higher in the newest place, as before a place lower', () => {
    // At the 300th level, as the measurement above (at the 150th both are
    // none since the weaker creatures of 24.11.2026).
    const level = 300;
    const { character, equipped, plan } = playerOf('realistic', 'warrior', level, content);
    const companions = companionsOf(plan, level, 0, content);
    for (const [offset, higher] of [
      [0, true],
      [-1, false],
    ]) {
      const areaId = placeAt(level, offset).id;
      const chances = (data) => {
        const samples = threatSamples({ character, equipped, areaId, companions }, data);
        return faintChances({ character, equipped, hp: samples.maxHp, areaId }, data, samples);
      };
      const [now, was] = [chances(content), chances(before)];
      if (higher) assert.ok(now[240] > was[240], `${now[240]} vs ${was[240]}`);
      else assert.deepEqual(now, was);
    }
  });

  test('the Labirynt\'s and the Sala prób\'s creatures stay as they were', () => {
    for (const charLevel of [60, 150, 300]) {
      for (const type of ['regular', 'elite', 'guardian']) assert.deepEqual(labyrinthStrength(3, type, charLevel, content), labyrinthStrength(3, type, charLevel, before));
    }
    const character = { ...newCharacter('warrior', { level: 150, classLevel: 174 }) };
    const target = trialTarget(character.classLevel, null, content);
    assert.ok(target);
    const trial = (data) => trialHallFights({ character, equipped: [], name: 'Próba', area: target.area, seed: 'sala' }, data);
    assert.deepEqual(trial(content), trial(before));
  });
});
