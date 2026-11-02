// Gift codes (data/gift-codes.json): a code typed in the settings gives its
// rewards once per account until it ends.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { giftCodeOf, giftRewardsText, normalCode, withGiftResources } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tester = content.giftCodes.find((gift) => gift.id === 'testers-2026-11');
const before = Date.parse('2026-10-30T12:00:00+01:00');

describe('gift codes in the engine', () => {
  test('the testers\' code gives what the author asked for, until the end of 12 November in Warsaw', () => {
    assert.equal(tester.code, 'JESTEMTESTEREM');
    assert.deepEqual(tester.rewards, { systemPoints: 100, timePoints: 100, gold: 1000, resources: { wood: 100, stone: 100, 'iron-ore': 100 } });
    assert.deepEqual(Object.keys(tester.rewards.resources).sort(), content.resources.map((resource) => resource.id).sort());
    assert.equal(giftCodeOf('JESTEMTESTEREM', Date.parse('2026-11-12T23:59:00+01:00'), [], content).gift, tester);
    assert.equal(giftCodeOf('JESTEMTESTEREM', Date.parse('2026-11-13T00:00:00+01:00'), [], content).reason, 'expired');
  });

  test('TIGER gives 500 Punkty Systemu for a week from 3 November, to the end of 9 November in Warsaw', () => {
    const tiger = content.giftCodes.find((gift) => gift.id === 'tiger-2026-11');
    assert.equal(tiger.code, 'TIGER');
    assert.deepEqual(tiger.rewards, { systemPoints: 500 });
    assert.equal(giftCodeOf('tiger', Date.parse('2026-11-03T00:00:00+01:00'), [], content).gift, tiger);
    assert.equal(giftCodeOf('TIGER', Date.parse('2026-11-09T23:59:00+01:00'), [], content).gift, tiger);
    assert.equal(giftCodeOf('TIGER', Date.parse('2026-11-10T00:00:00+01:00'), [], content).reason, 'expired');
    assert.equal(giftCodeOf('TIGER', Date.parse('2026-11-05T12:00:00+01:00'), ['tiger-2026-11'], content).reason, 'used');
    assert.equal(giftCodeOf('TIGER', Date.parse('2026-11-05T12:00:00+01:00'), ['testers-2026-11'], content).gift, tiger);
    assert.equal(giftRewardsText(tiger.rewards, content), 'Punkty Systemu +500');
  });

  test('case, spaces and dashes do not matter; an unknown code, an ended one and one taken already give nothing', () => {
    assert.equal(normalCode(' jestem-testerem '), 'JESTEMTESTEREM');
    assert.equal(giftCodeOf('Jestem Testerem', before, [], content).gift, tester);
    assert.equal(giftCodeOf('NIEMATAKIEGO', before, [], content).reason, 'unknown');
    assert.equal(giftCodeOf('', before, [], content).reason, 'unknown');
    assert.equal(giftCodeOf('JESTEMTESTEREM', before, ['testers-2026-11'], content).reason, 'used');
  });

  test('the rewards in words, and the resources added to what the character has', () => {
    assert.equal(giftRewardsText(tester.rewards, content), 'Punkty Systemu +100, Punkty Czasu +100, złoto +1000, drewno +100, kamień +100, ruda żelaza +100');
    assert.deepEqual(withGiftResources({ wood: 5 }, tester.rewards), { wood: 105, stone: 100, 'iron-ore': 100 });
  });
});

describe('gift codes through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kodowiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kodowiec', classId: 'archer', appearance: 'female' } });
  });

  const row = async () => (await db()).prepare('SELECT gold, time_points, system_points, resources FROM characters').first();

  test('the code gives its rewards to the character once per account, also after starting over', async () => {
    assert.equal((await call('POST', '/api/gift-code', { cookie, body: { code: 'niematakiego' } })).data.error.code, 'unknown_code');
    const start = await row();
    const taken = await call('POST', '/api/gift-code', { cookie, body: { code: 'jestem testerem' } });
    // The code ends on 13 November 2026; after that it answers so.
    if (Date.now() >= Date.parse(tester.until)) {
      assert.equal(taken.data.error.code, 'expired_code');
      return;
    }
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.gift.text, 'Kod przyjęty. Odebrano: Punkty Systemu +100, Punkty Czasu +100, złoto +1000, drewno +100, kamień +100, ruda żelaza +100.');
    const after = await row();
    assert.equal(after.gold - start.gold, 1000);
    assert.equal(after.time_points - start.time_points, 100);
    assert.equal(after.system_points - start.system_points, 100);
    const resources = JSON.parse(after.resources);
    for (const id of ['wood', 'stone', 'iron-ore']) assert.equal(resources[id] - (JSON.parse(start.resources)[id] ?? 0), 100);
    const again = await call('POST', '/api/gift-code', { cookie, body: { code: 'JESTEMTESTEREM' } });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'used_code');
    // A new character of the same account cannot take it again.
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    assert.ok((await call('POST', '/api/character', { cookie, body: { name: 'Kodowiec2', classId: 'mage', appearance: 'male' } })).status < 300);
    assert.equal((await call('POST', '/api/gift-code', { cookie, body: { code: 'JESTEMTESTEREM' } })).data.error.code, 'used_code');
  });
});
