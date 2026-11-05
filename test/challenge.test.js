// Harder explorations from the 10th level of the character (balance.challenge;
// the author, 5.11.2026: 628 B, 629 A and "od 10-ego poziomu postaci wchodzą
// te duże zmiany trudności"): less HP back after each won fight, from the
// level of its strength stronger creatures in every place, and the Trudna
// wyprawa, a box at "Wyrusz" for creatures stronger still and more XP and
// gold. The numbers come from the data, so the tests hold whatever they are.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  challengeAt,
  explorationPace,
  exploreStrength,
  faintChances,
  huntReport,
  huntStrength,
  applyHunt,
  playerCombatant,
  simulateHunt,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const challenge = content.balance.challenge;
const from = challenge.fromLevel;
const strongFrom = challenge.strength.fromLevel;
const place = (id) => content.areasById[id];
const curveAt = (level) => huntStrength(level, content.balance.monsters.huntCurve);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

describe('the challenge in the engine', () => {
  test('it begins at its level: before it the explorations are as they were', () => {
    assert.equal(challengeAt(from - 1, content), null);
    assert.equal(challengeAt(from, content), challenge);
    assert.ok(strongFrom >= from);
    // A lower place, below the challenge: its creatures as ever.
    assert.deepEqual(exploreStrength(place('windfalls-edge'), from - 1, content), [1, 1]);
    assert.deepEqual(exploreStrength(place('windfalls-edge'), from - 1, content, true), [1, 1]);
  });

  test('from its strength\'s level every place\'s creatures are stronger, the newest place\'s on top of the curve', () => {
    const level = Math.max(strongFrom, 31);
    const { damage, hp } = challenge.strength;
    // A lower place: the challenge alone.
    const [lowerDamage, lowerHp] = exploreStrength(place('windfalls-edge'), level, content);
    close(lowerDamage, damage);
    close(lowerHp, hp);
    // The place that holds the level: the curve and the challenge.
    const newest = content.areas.find((area) => area.minLevel <= level && area.maxLevel >= level);
    const [newDamage, newHp] = exploreStrength(newest, level, content);
    close(newDamage, curveAt(level)[0] * damage);
    close(newHp, curveAt(level)[1] * hp);
    // Below the strength's level the creatures keep their curve alone.
    if (strongFrom > from) assert.deepEqual(exploreStrength(place('windfalls-edge'), strongFrom - 1, content), [1, 1]);
  });

  test('a Trudna wyprawa\'s creatures are stronger still by the hard numbers', () => {
    const level = Math.max(strongFrom, 31);
    const [plainDamage, plainHp] = exploreStrength(place('windfalls-edge'), level, content);
    const [hardDamage, hardHp] = exploreStrength(place('windfalls-edge'), level, content, true);
    close(hardDamage, plainDamage * challenge.hard.damage);
    close(hardHp, plainHp * challenge.hard.hp);
  });

  test('less HP back after each won fight, and less rest on a long exploration, from the challenge\'s level', () => {
    const warrior = (level) => playerCombatant({ character: newCharacter('warrior', { level, classLevel: level }), equipped: [], name: 'Mira' }, content);
    close(warrior(from - 1).recovery, content.balance.hunt.recoveryAfterFight);
    close(warrior(from).recovery, challenge.recoveryAfterFight);
    // The cleric's own recovery stays on top of it.
    const cleric = playerCombatant({ character: newCharacter('cleric', { level: from, classLevel: from }), equipped: [], name: 'Lea' }, content);
    assert.ok(cleric.recovery > challenge.recoveryAfterFight);
    const rest = (level) => explorationPace(240, content, level).restBonus;
    assert.ok(rest(from) < rest(from - 1), `${rest(from)} vs ${rest(from - 1)}`);
    assert.equal(explorationPace(240, content).restBonus, rest(from - 1));
    assert.equal(rest(from), challenge.restBonusByMinutes.at(-1)[1]);
  });

  test('a Trudna wyprawa pays more XP and gold for the same fight, and says so in its report', () => {
    // A strong character in an easy place, so both win; the loot's own seed
    // keeps the gold's draws the same in both.
    const settled = typicalCharacter('warrior', 40, content);
    const setOut = (hard) => simulateHunt({ ...settled, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 1, seed: 'trudna', lootSeed: 'łup', hard }, content);
    const plain = setOut(false);
    const hard = setOut(true);
    assert.equal(plain.fights[0].won, true);
    assert.equal(hard.fights[0].won, true);
    assert.deepEqual(
      hard.fights[0].enemies.map((enemy) => [enemy.monsterId, enemy.level]),
      plain.fights[0].enemies.map((enemy) => [enemy.monsterId, enemy.level]),
    );
    assert.ok(Math.abs(hard.fights[0].xp - plain.fights[0].xp * (1 + challenge.hard.xp)) <= 1.5, `${hard.fights[0].xp} vs ${plain.fights[0].xp}`);
    assert.ok(Math.abs(hard.fights[0].gold - plain.fights[0].gold * (1 + challenge.hard.gold)) <= 1.5, `${hard.fights[0].gold} vs ${plain.fights[0].gold}`);
    assert.equal(hard.hard, true);
    assert.equal(plain.hard, undefined);
    const report = huntReport({ hunt: hard, applied: applyHunt(settled.character, hard, content), character: settled.character, areaId: 'raven-hollows', startedAt: 0, endsAt: 1 }, content);
    assert.equal(report.hard, true);
  });

  test('below the challenge\'s level a Trudna wyprawa is a plain one', () => {
    const young = typicalCharacter('warrior', from - 1, content);
    const setOut = (hard) => simulateHunt({ ...young, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 15, seed: 'młody', hard }, content);
    assert.deepEqual(setOut(true), setOut(false));
  });

  test('the threat estimate counts the Trudna wyprawa\'s stronger creatures', () => {
    const { character, equipped } = typicalCharacter('mage', 30, content);
    const input = { character, equipped, hp: 99999, areaId: 'mossy-boulders' };
    const plain = faintChances(input, content);
    const hard = faintChances({ ...input, hard: true }, content);
    assert.ok(hard[60] > plain[60], `${hard[60]} vs ${plain[60]}`);
  });
});

describe('the Trudna wyprawa through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  beforeEach(async () => {
    ({ cookie } = await signUp('trudna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Twarda', classId: 'warrior', appearance: 'female' } });
  });

  test('the box opens at the challenge\'s level, on a plain exploration only', async () => {
    await set('level = ?, class_level = ?, tutorial = NULL', from - 1, from - 1);
    assert.equal((await character()).hardHunt, null);
    const early = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hard: true } });
    assert.equal(early.status, 403);
    assert.equal(early.data.error.code, 'hard_locked');

    await set('level = 30, class_level = 30');
    assert.deepEqual((await character()).hardHunt, challenge.hard);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hard: 'tak' } })).data.error.code, 'invalid_hard');
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hard: true } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    assert.equal(started.data.character.activity.hard, true);
    assert.equal(JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options).hard, true);
    // Its report says so.
    await call('POST', '/api/test/skip-time', { cookie });
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal(claimed.data.report.hard, true);
    // Not on a Szybkie Polowanie.
    const quick = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge', hard: true } });
    assert.equal(quick.data.error?.code, 'hard_plain_only', JSON.stringify(quick.data).slice(0, 300));
  });

  test('the threat of a Trudna wyprawa, asked with ?hard=1', async () => {
    await set('level = 30, class_level = 30, tutorial = NULL');
    const plain = await call('GET', '/api/hunts/options?area=mossy-boulders', { cookie });
    const hard = await call('GET', '/api/hunts/options?area=mossy-boulders&hard=1', { cookie });
    assert.equal(plain.data.areas[0].hard, undefined);
    assert.equal(hard.data.areas[0].hard, true);
    const order = ['low', 'moderate', 'high', 'very-high'];
    for (const minutes of Object.keys(plain.data.areas[0].threat)) {
      assert.ok(order.indexOf(hard.data.areas[0].threat[minutes]) >= order.indexOf(plain.data.areas[0].threat[minutes]), minutes);
    }
    // Below the challenge's level the question is the plain one.
    await set('level = ?, class_level = ?', from - 1, from - 1);
    assert.equal((await call('GET', '/api/hunts/options?area=windfalls-edge&hard=1', { cookie })).data.areas[0].hard, undefined);
  });
});
