// The Sala prób in the Osada (src/engine/trial-hall.js,
// src/server/trial-hall.js; the author's 620 B): the next place the class
// level has not opened yet, its two encounters and elite at its first
// level, a won trial opening it for good, a lost one costing nothing; and
// through the API once a day, never on an exploration, the place opened
// early open to an exploration.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaOpenFor, areaUnlockLevel, autoDistribute, questPeriod, trialEncounters, trialHallFights, trialTarget } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const areaAt = (id) => content.areasById[id];

describe('the Sala prób', () => {
  test('it tests for the first place the class level has not opened yet; passed, the place is open early', () => {
    // A class at level 30 opens the places up to 31–35 (one opens a level before its first).
    const target = trialTarget(30, null, content);
    assert.equal(target.area.id, 'lynx-ridge');
    assert.equal(areaUnlockLevel(target.area, content), 35);
    assert.equal(target.passed, false);
    assert.equal(trialTarget(30, 'lynx-ridge', content).passed, true);
    assert.equal(areaOpenFor(target.area, 30, null, content), false);
    assert.equal(areaOpenFor(target.area, 30, 'lynx-ridge', content), true);
    // At its own class level the place opens anyway, and the next one is tested.
    assert.equal(trialTarget(35, 'lynx-ridge', content).area.id, 'wolf-circles');
    assert.equal(areaOpenFor(target.area, 35, null, content), true);
    // Nothing to test once every place is open.
    assert.equal(trialTarget(content.balance.progression.maxLevel, null, content), null);
  });

  test('two of the place\'s encounters at its first level, then its elite as on an exploration, the same for the same seed', () => {
    const area = areaAt('lynx-ridge');
    const fights = trialEncounters(area, 'seed', content);
    assert.deepEqual(trialEncounters(area, 'seed', content), fights);
    assert.equal(fights.length, 3);
    for (const fight of fights.slice(0, 2)) {
      assert.equal(fight.elite, false);
      assert.ok(fight.members.every((member) => member.level === area.minLevel));
      assert.ok(area.encounters.some((encounter) => encounter.monsters.join() === fight.members.map((member) => member.monsterId).join()));
    }
    assert.deepEqual(fights[2], { elite: true, members: [{ monsterId: area.elite, level: area.minLevel + content.balance.hunt.eliteLevelBonus }] });
  });

  test('a strong character passes all three fights for XP and gold; a weak one is led out after the first, for nothing', () => {
    const area = areaAt('raven-hollows');
    const strong = newCharacter('warrior', { level: 60, classLevel: 50 });
    strong.points = autoDistribute(strong, content);
    const won = trialHallFights({ character: strong, equipped: [], name: 'Mocarz', area, seed: 'a' }, content);
    assert.equal(won.hall.won, true);
    assert.equal(won.result, 'success');
    assert.equal(won.fights.length, 3);
    assert.ok(won.fights.every((fight) => fight.won === true));
    assert.ok(won.xp > 0 && won.gold > 0);
    assert.equal(won.xp, won.fights.reduce((sum, fight) => sum + fight.xp, 0));
    assert.equal(won.fights[2].elite, true);
    // The HP goes on from fight to fight.
    assert.equal(won.fights[1].hpBefore, won.fights[0].hpAfter);
    assert.equal(won.fights[2].hpBefore, won.fights[1].hpAfter);
    const weak = newCharacter('mage', { level: 1, classLevel: 1 });
    const lost = trialHallFights({ character: weak, equipped: [], name: 'Słaby', area: areaAt('glade-heart'), seed: 'b' }, content);
    assert.equal(lost.hall.won, false);
    assert.equal(lost.result, 'escaped');
    assert.equal(lost.fights.length, 1);
    assert.equal(lost.xp, 0);
  });

  test('the healing potions of the bag are drunk as on an exploration, and counted', () => {
    const area = areaAt('spider-gully');
    const character = newCharacter('warrior', { level: 33, classLevel: 30 });
    character.points = autoDistribute(character, content);
    const heal = content.potions.find((potion) => potion.effect.heal);
    const hunt = trialHallFights({ character, equipped: [], name: 'Pijący', area, seed: 'c', potions: { [heal.id]: 5 } }, content);
    const drunk = hunt.potionsUsed[heal.id] ?? 0;
    assert.ok(drunk <= 5);
    assert.deepEqual(Object.keys(hunt.potionsUsed).filter((id) => id !== heal.id), []);
  });
});

describe('the Sala prób through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT trial_hall, potions, met, gold FROM characters').first();
  const hall = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.trialHall;
  const enter = () => call('POST', '/api/settlement/trial-hall', { cookie });

  beforeEach(async () => {
    ({ cookie } = await signUp('probant'));
    await call('POST', '/api/character', { cookie, body: { name: 'Probant', classId: 'warrior', appearance: 'female' } });
    await set('level = 30, class_level = 30, tutorial = NULL');
  });

  test('the Osada shows the place tested, its three fights and the free trial of the day', async () => {
    const view = await hall();
    assert.equal(view.used, false);
    assert.equal(view.target.areaId, 'lynx-ridge');
    assert.equal(view.target.unlockClassLevel, 35);
    assert.equal(view.target.passed, false);
    assert.equal(view.target.fights.length, 3);
    assert.equal(view.target.fights[2].elite, true);
    assert.ok(view.texts.start);
  });

  test('a trial brings its report at once, once a day; the creatures go into the Bestiariusz', async () => {
    const entered = await enter();
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const { report } = entered.data;
    assert.equal(report.kind, 'trial-hall');
    assert.equal(report.hall.areaId, 'lynx-ridge');
    assert.ok(report.fights.length >= 1 && report.fights.length <= 3);
    const saved = await row();
    const record = JSON.parse(saved.trial_hall);
    assert.equal(record.day, questPeriod('daily', Date.now(), content).key);
    assert.equal(record.early ?? null, report.hall.won ? 'lynx-ridge' : null);
    assert.ok(report.fights[0].enemies.every((enemy) => JSON.parse(saved.met).includes(enemy.monsterId)));
    assert.equal(entered.data.hall.used, true);
    // Once a day.
    const again = await enter();
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'used');
    // The Dziennik keeps it.
    const journal = (await call('GET', '/api/reports', { cookie })).data.reports;
    assert.equal(journal[0].kind, 'trial-hall');
    assert.equal(journal[0].hall.areaName, report.hall.areaName);
  });

  test('a place opened early is open for explorations; the hall then waits for the class level', async () => {
    const locked = await call('POST', '/api/hunts', { cookie, body: { areaId: 'lynx-ridge', minutes: 5 } });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'area_locked');
    await set('trial_hall = ?', JSON.stringify({ day: '2020-01-01', early: 'lynx-ridge' }));
    const view = await hall();
    assert.equal(view.target.passed, true);
    assert.deepEqual(view.target.fights, []);
    assert.equal((await enter()).data.error.code, 'passed');
    const character = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(character.earlyArea, 'lynx-ridge');
    const going = await call('POST', '/api/hunts', { cookie, body: { areaId: 'lynx-ridge', minutes: 5 } });
    assert.equal(going.status, 201, JSON.stringify(going.data).slice(0, 300));
    // Not during an exploration.
    await set('trial_hall = ?', JSON.stringify({}));
    assert.equal((await enter()).status, 409);
  });

  test('the healing potions drunk in the trial leave the bag', async () => {
    const heal = content.potions.find((potion) => potion.effect.heal);
    await set('potions = ?', JSON.stringify({ [heal.id]: 3 }));
    const { report } = (await enter()).data;
    const left = JSON.parse((await row()).potions)[heal.id] ?? 0;
    assert.equal(left, 3 - (report.potionsUsed?.[heal.id] ?? 0));
  });
});
