// Harder explorations from the 10th level of the character (balance.challenge;
// the author, 5.11.2026: 628 B, 629 A and "od 10-ego poziomu postaci wchodzą
// te duże zmiany trudności"): less HP back after each won fight, from the
// level of its strength stronger creatures in every place, and the Trudna
// wyprawa, a box at "Wyrusz" for creatures stronger still and more XP and
// gold. The numbers come from the data, so the tests hold whatever they are,
// but those of the Piekielna wyprawa, the box under it, which the author set
// against the Trudna's (19.11.2026: „2 razy trudniejsza niz Trudna wyprawa
// 1,5x lepszy drop”).

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

  test('below the challenge\'s level a Trudna wyprawa is a plain one, and so is a Piekielna', () => {
    const young = typicalCharacter('warrior', from - 1, content);
    const setOut = (hard) => simulateHunt({ ...young, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 15, seed: 'młody', hard }, content);
    assert.deepEqual(setOut(true), setOut(false));
    assert.deepEqual(setOut('hell'), setOut(false));
  });

  test('the threat estimate counts the Trudna wyprawa\'s stronger creatures', () => {
    const { character, equipped } = typicalCharacter('mage', 30, content);
    const input = { character, equipped, hp: 99999, areaId: 'mossy-boulders' };
    const plain = faintChances(input, content);
    const hard = faintChances({ ...input, hard: true }, content);
    // On the shortest exploration: from an hour on a typical Mag faints
    // there all but surely either way, so the two hours' chances differ
    // only by the rounding of numbers (1218: a point of HP from a side Siła
    // turned it).
    assert.ok(plain[1] < 0.9, String(plain[1]));
    assert.ok(hard[1] > plain[1] + 0.1, `${hard[1]} vs ${plain[1]}`);
    assert.ok(hard[60] > plain[60] - 1e-9, `${hard[60]} vs ${plain[60]}`);
  });
});

describe('the Piekielna wyprawa in the engine', () => {
  const hell = challenge.hell;

  test('its numbers are the author\'s: twice the Trudna\'s creatures, its XP, half as much gold again and half as much loot again', () => {
    close(hell.damage, 2 * challenge.hard.damage);
    close(hell.hp, 2 * challenge.hard.hp);
    // No more XP than the Trudna gives: the high levels come fast enough.
    close(hell.xp, challenge.hard.xp);
    close(1 + hell.gold, 1.5 * (1 + challenge.hard.gold));
    close(1 + hell.drop, 1.5);
  });

  test('its creatures are stronger still by the hell numbers, from the challenge\'s level', () => {
    const level = Math.max(strongFrom, 31);
    const [plainDamage, plainHp] = exploreStrength(place('windfalls-edge'), level, content);
    const [hellDamage, hellHp] = exploreStrength(place('windfalls-edge'), level, content, 'hell');
    close(hellDamage, plainDamage * hell.damage);
    close(hellHp, plainHp * hell.hp);
    close(hellDamage / plainDamage, 3);
    close(hellHp / plainHp, 3);
    // The newest place's: its curve, the challenge's strength and the hell's.
    const newest = content.areas.find((area) => area.minLevel <= level && area.maxLevel >= level);
    const [newDamage, newHp] = exploreStrength(newest, level, content, 'hell');
    close(newDamage, curveAt(level)[0] * challenge.strength.damage * hell.damage);
    close(newHp, curveAt(level)[1] * challenge.strength.hp * hell.hp);
    // Before the challenge's level, a plain exploration's.
    assert.deepEqual(exploreStrength(place('windfalls-edge'), from - 1, content, 'hell'), [1, 1]);
  });

  test('the threat estimate counts its creatures, stronger than the Trudna\'s', () => {
    const { character, equipped } = typicalCharacter('warrior', 40, content);
    const input = { character, equipped, hp: 99999, areaId: 'mossy-boulders' };
    const hard = faintChances({ ...input, hard: true }, content);
    const hellish = faintChances({ ...input, hard: 'hell' }, content);
    assert.ok(hellish[60] > hard[60], `${hellish[60]} vs ${hard[60]}`);
  });

  test('it pays more XP and gold for the same fight, and says so in its report', () => {
    // The first fight comes before any find, so its gold is drawn alike.
    const settled = typicalCharacter('warrior', 40, content);
    const setOut = (hard) => simulateHunt({ ...settled, hp: 99999, name: 'Mira', areaId: 'mossy-boulders', minutes: 15, seed: 'piekielna', lootSeed: 'łup', hard }, content);
    const plain = setOut(false);
    const hellish = setOut('hell');
    assert.equal(plain.entries[0].type, 'fight');
    assert.equal(plain.fights[0].won, true);
    assert.equal(hellish.fights[0].won, true);
    assert.deepEqual(
      hellish.fights[0].enemies.map((enemy) => [enemy.monsterId, enemy.level]),
      plain.fights[0].enemies.map((enemy) => [enemy.monsterId, enemy.level]),
    );
    assert.ok(plain.fights[0].gold >= 20, `${plain.fights[0].gold}`);
    assert.ok(Math.abs(hellish.fights[0].xp - plain.fights[0].xp * (1 + hell.xp)) <= 1.5, `${hellish.fights[0].xp} vs ${plain.fights[0].xp}`);
    assert.ok(Math.abs(hellish.fights[0].gold - plain.fights[0].gold * (1 + hell.gold)) <= 1.5, `${hellish.fights[0].gold} vs ${plain.fights[0].gold}`);
    assert.equal(hellish.hell, true);
    assert.equal(hellish.hard, undefined);
    assert.equal(plain.hell, undefined);
    const report = huntReport({ hunt: hellish, applied: applyHunt(settled.character, hellish, content), character: settled.character, areaId: 'mossy-boulders', startedAt: 0, endsAt: 1 }, content);
    assert.equal(report.hell, true);
    assert.equal(report.hard, undefined);
  });

  // Its creatures as strong as a plain exploration's, and its loot drawn
  // from a seed of its own, so the fights go the same and only the loot
  // tells the two apart.
  const even = { ...content, balance: { ...content.balance, challenge: { ...challenge, hell: { ...challenge.hell, damage: 1, hp: 1 } } } };
  const withoutLate = (data) => ({ ...data, balance: { ...data.balance, rewards: { ...data.balance.rewards, lateRewards: { ...data.balance.rewards.lateRewards, fromClassLevel: Infinity } } } });
  // What `count` explorations of four hours bring: their fights and finds,
  // the chests among the finds and the pieces of materials.
  function loot(data, build, areaId, prefix, hard, count) {
    const found = { fights: 0, finds: 0, chests: 0, pieces: 0 };
    for (let index = 0; index < count; index += 1) {
      const hunt = simulateHunt({ ...build, hp: 99999, name: 'Mira', areaId, minutes: 240, seed: `${prefix}:${index}`, lootSeed: `${prefix}:łup:${index}`, hard }, data);
      const finds = hunt.entries.filter((entry) => entry.type === 'find');
      found.fights += hunt.fights.length;
      found.finds += finds.length;
      found.chests += finds.filter((entry) => entry.item !== undefined).length;
      found.pieces += Object.values(hunt.materials).reduce((sum, pieces) => sum + pieces, 0);
    }
    return found;
  }

  test('its finds hold a chest and its creatures leave materials half as often again', () => {
    // Past the young levels' chests and before the late levels' part.
    const build = typicalCharacter('warrior', 100, content);
    const plain = loot(even, build, 'mossy-boulders', 'łupy', false, 200);
    const hellish = loot(even, build, 'mossy-boulders', 'łupy', 'hell', 200);
    assert.equal(hellish.fights, plain.fights);
    assert.equal(hellish.finds, plain.finds);
    for (const kind of ['chests', 'pieces']) {
      const ratio = hellish[kind] / plain[kind];
      assert.ok(Math.abs(ratio - (1 + hell.drop)) < 0.15, `${kind}: ${plain[kind]} → ${hellish[kind]}`);
    }
  });

  test('from the late levels on its gold, chests and materials are a part of what they would be, as on every exploration', () => {
    const late = content.balance.rewards.lateRewards;
    const old = typicalCharacter('warrior', late.fromClassLevel, content);
    // One fight before any find: its gold that part, its XP all of it.
    const setOut = (data) => simulateHunt({ ...old, hp: 99999, name: 'Mira', areaId: 'beaver-dams', minutes: 15, seed: 'późna', lootSeed: 'łup', hard: 'hell' }, data);
    const halved = setOut(content);
    const full = setOut(withoutLate(content));
    assert.equal(halved.hell, true);
    assert.equal(halved.entries[0].type, 'fight');
    assert.equal(halved.fights[0].won, true);
    assert.equal(halved.fights[0].xp, full.fights[0].xp);
    assert.ok(full.fights[0].gold >= 50, `${full.fights[0].gold}`);
    assert.ok(Math.abs(halved.fights[0].gold - full.fights[0].gold * late.factor) <= 1, `${full.fights[0].gold} → ${halved.fights[0].gold}`);
    // Its chests and materials over many explorations: the hell's drop and
    // the late levels' part, both.
    const kept = loot(even, old, 'mossy-boulders', 'późne', 'hell', 100);
    const all = loot(withoutLate(even), old, 'mossy-boulders', 'późne', 'hell', 100);
    assert.equal(kept.finds, all.finds);
    for (const kind of ['chests', 'pieces']) {
      const ratio = kept[kind] / all[kind];
      assert.ok(Math.abs(ratio - late.factor) < 0.1, `${kind}: ${all[kind]} → ${kept[kind]}`);
    }
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

  test('the box opens at the challenge\'s level, not on a Szybkie Polowanie', async () => {
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
    assert.equal(quick.data.error.message, 'Trudna wyprawa nie działa na Szybkim i Błyskawicznym polowaniu.');
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

describe('the Piekielna wyprawa through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;
  // Every character of the test's game.
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  beforeEach(async () => {
    ({ cookie } = await signUp('piekielna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Piekielna', classId: 'warrior', appearance: 'female' } });
  });

  test('the box opens with the Trudna\'s, not on a Szybkie or a Błyskawiczne polowanie, and wins over the Trudna', async () => {
    await set('level = ?, class_level = ?, tutorial = NULL', from - 1, from - 1);
    assert.equal((await character()).hellHunt, null);
    const early = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hell: true } });
    assert.equal(early.status, 403);
    assert.equal(early.data.error.code, 'hell_locked');

    await set('level = 30, class_level = 30');
    const opened = await character();
    assert.deepEqual(opened.hellHunt, challenge.hell);
    assert.deepEqual(opened.hardHunt, challenge.hard);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hell: 'tak' } })).data.error.code, 'invalid_hell');
    // Not on a Szybkie Polowanie nor a Błyskawiczne.
    const quick = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge', hell: true } });
    assert.equal(quick.data.error?.code, 'hell_plain_only', JSON.stringify(quick.data).slice(0, 300));
    const flash = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge', kind: 'flash', hell: true } });
    assert.equal(flash.data.error?.code, 'hell_plain_only', JSON.stringify(flash.data).slice(0, 300));
    assert.equal(flash.data.error.message, 'Piekielna wyprawa nie działa na Szybkim i Błyskawicznym polowaniu.');
    // Both boxes sent: a Piekielna.
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, hard: true, hell: true } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    assert.equal(started.data.character.activity.hell, true);
    assert.equal(started.data.character.activity.hard, undefined);
    assert.equal((await character()).activity.hell, true);
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.equal(options.hell, true);
    assert.equal(options.hard, undefined);
    // Its report says so.
    await call('POST', '/api/test/skip-time', { cookie });
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal(claimed.data.report.hell, true);
    assert.equal(claimed.data.report.hard, undefined);
  });

  // On a Drużyna's trip, since 19.11.2026, it is the whole trip's
  // (party-challenge.test.js).

  test('the threat of a Piekielna wyprawa, asked with ?hell=1, which wins over ?hard=1', async () => {
    await set('level = 30, class_level = 30, tutorial = NULL');
    const asked = async (query) => (await call('GET', `/api/hunts/options?area=mossy-boulders${query}`, { cookie })).data.areas[0];
    const hard = await asked('&hard=1');
    const hellish = await asked('&hell=1');
    const both = await asked('&hard=1&hell=1');
    assert.equal(hellish.hell, true);
    assert.equal(hellish.hard, undefined);
    assert.equal(both.hell, true);
    assert.deepEqual(both.threat, hellish.threat);
    const order = ['low', 'moderate', 'high', 'very-high'];
    for (const minutes of Object.keys(hard.threat)) {
      assert.ok(order.indexOf(hellish.threat[minutes]) >= order.indexOf(hard.threat[minutes]), minutes);
    }
    // Below the challenge's level the question is the plain one.
    await set('level = ?, class_level = ?', from - 1, from - 1);
    assert.equal((await call('GET', '/api/hunts/options?area=windfalls-edge&hell=1', { cookie })).data.areas[0].hell, undefined);
  });
});
