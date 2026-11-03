// Gift codes (data/gift-codes.json): a code typed in the settings gives its
// rewards once per account until it ends.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createHash } from 'node:crypto';

import { giftCodeOf, giftRewardsText, normalCode, withGiftResources } from '../src/engine/index.js';
import { characterKey } from '../src/server/gift-codes.js';
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

  // The key of a name as the server works it out (characterKey).
  const key = (name) => createHash('sha256').update(name.normalize('NFC').trim().toLocaleLowerCase('pl')).digest('hex');

  test('the server keys a name by its SHA-256 in small letters, so the data never holds the name', async () => {
    assert.equal(await characterKey('Testowa'), key('Testowa'));
    assert.equal(await characterKey(' TESTOWA '), key('testowa'));
    assert.equal(await characterKey('Żółw'), key('żółw'));
  });

  test('a code given to one character is unknown to the others, and the same code can go to several characters', () => {
    const at = Date.parse('2026-11-05T12:00:00+01:00');
    const mine = { id: 'pc-test-a', code: 'PC', for: key('Testowa'), until: '2026-11-17T00:00:00+01:00', rewards: { timePoints: 60 } };
    const theirs = { ...mine, id: 'pc-test-b', for: key('Inna') };
    const world = { ...content, giftCodes: [mine, theirs] };
    assert.equal(giftCodeOf('pc', at, [], world, key('Testowa')).gift, mine);
    assert.equal(giftCodeOf('pc', at, [], world, key('Inna')).gift, theirs);
    assert.equal(giftCodeOf('pc', at, [], world, key('Ktoś')).reason, 'unknown');
    assert.equal(giftCodeOf('pc', at, [], world, null).reason, 'unknown');
    assert.equal(giftCodeOf('pc', at, ['pc-test-a'], world, key('Testowa')).reason, 'used');
    assert.equal(giftCodeOf('pc', Date.parse('2026-11-17T00:00:00+01:00'), [], world, key('Testowa')).reason, 'expired');
  });

  test('PC gives 60 Punkty Czasu to one chosen character only, until the end of 16 November in Warsaw', () => {
    const pc = content.giftCodes.find((gift) => gift.id === 'pc-2026-11-03-a');
    assert.equal(pc.code, 'PC');
    assert.match(pc.for, /^[0-9a-f]{64}$/);
    assert.deepEqual(pc.rewards, { timePoints: 60 });
    assert.equal(pc.until, '2026-11-17T00:00:00+01:00');
    assert.equal(giftRewardsText(pc.rewards, content), 'Punkty Czasu +60');
    // Every code for one character is keyed, never named.
    for (const gift of content.giftCodes.filter((each) => each.for)) assert.match(gift.for, /^[0-9a-f]{64}$/);
    assert.equal(giftCodeOf('PC', Date.parse('2026-11-05T12:00:00+01:00'), [], content, key('Kodowiec')).reason, 'unknown');
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
    // A code given to another character is unknown here.
    assert.equal((await call('POST', '/api/gift-code', { cookie, body: { code: 'PC' } })).data.error.code, 'unknown_code');
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
