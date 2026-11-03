// Gift codes (data/gift-codes.json): a code typed in the settings gives its
// rewards once per account until it ends.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createHash } from 'node:crypto';

import { giftCodeOf, giftMovePair, giftRewardsText, normalCode, withGiftResources } from '../src/engine/index.js';
import { characterKey, looseKey, moveGiftRewards } from '../src/server/gift-codes.js';
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

describe('a code\'s rewards moved by the author\'s word', () => {
  test('TIGER\'s 500 Punkty Systemu move once between two characters of one account, named by keys only', () => {
    assert.equal(content.giftMoves.length, 1);
    const [move] = content.giftMoves;
    assert.deepEqual([move.id, move.gift, move.systemPoints], ['tiger-2026-11-move', 'tiger-2026-11', 500]);
    assert.ok(content.giftCodes.some((gift) => gift.id === move.gift));
    assert.match(move.from, /^[0-9a-f]{64}$/);
    assert.match(move.to, /^[0-9a-f]{64}$/);
  });

  test('a name\'s loose key keeps only its letters and digits, in small letters', async () => {
    assert.equal(await looseKey('Ala ma_Kota'), await looseKey('alamakota'));
    assert.equal(await looseKey('  Żbik  '), await looseKey('żbik'));
    assert.notEqual(await looseKey('Ala'), await looseKey('Ola'));
    assert.equal(await looseKey('alamakota'), createHash('sha256').update('alamakota').digest('hex'));
  });

  test('the giving character must have taken the code, and the other one be on its account', () => {
    const move = { id: 'm', gift: 'g', from: 'A', to: 'B', systemPoints: 500 };
    const characters = [
      { id: 1, userId: 7, key: 'A' },
      { id: 2, userId: 7, key: 'B' },
      { id: 3, userId: 8, key: 'B' },
    ];
    const pair = giftMovePair(move, characters, [{ userId: 7, characterId: 1, giftId: 'g' }]);
    assert.deepEqual([pair.from.id, pair.to.id], [1, 2]);
    // Another character of the account took the code: nothing moves.
    assert.equal(giftMovePair(move, characters, [{ userId: 7, characterId: 2, giftId: 'g' }]).reason, 'missing');
    assert.equal(giftMovePair(move, characters, [{ userId: 7, characterId: 1, giftId: 'other' }]).reason, 'missing');
    // The receiver only on another account: nothing moves.
    assert.equal(giftMovePair(move, characters.filter((one) => one.id !== 2), [{ userId: 7, characterId: 1, giftId: 'g' }]).reason, 'missing');
    // Two receivers on the account: the author did not say which, nothing moves.
    assert.equal(giftMovePair(move, [...characters, { id: 4, userId: 7, key: 'B' }], [{ userId: 7, characterId: 1, giftId: 'g' }]).reason, 'ambiguous');
  });
});

describe('a code\'s rewards moved by the scheduled run', () => {
  const { call, db, signUp } = useServer();
  const minute = Date.parse('2026-11-04T10:00:00Z');

  test('the points go from the character that took the code to the other one once, the code\'s record with them', async () => {
    const { cookie } = await signUp('przenosiny');
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Darczyńca Próbny', classId: 'archer', appearance: 'female' } })).status, 201);
    const database = await db();
    const idOf = async (name) => (await database.prepare('SELECT id, user_id FROM characters WHERE name = ?').bind(name).first());
    const giver = await idOf('Darczyńca Próbny');
    // As if it took TIGER: the code's record and its 500 points, plus 30 of its own.
    await database.prepare('UPDATE characters SET system_points = 530 WHERE id = ?').bind(giver.id).run();
    await database.prepare("INSERT INTO gift_codes_used (user_id, gift_id, character_id, used_at) VALUES (?, 'tiger-2026-11', ?, ?)").bind(giver.user_id, giver.id, minute).run();
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Obdarowana', classId: 'mage', appearance: 'female' } })).status, 201);
    const taker = await idOf('Obdarowana');
    const points = async (id) => (await database.prepare('SELECT system_points FROM characters WHERE id = ?').bind(id).first()).system_points;
    const before = await points(taker.id);
    // The data's own move names nobody here and moves nothing.
    assert.equal(await moveGiftRewards({ DB: database }, minute), 0);
    const moves = [{ id: 'test-move', gift: 'tiger-2026-11', from: await looseKey('darczyńca_próbny'), to: await looseKey('OBDAROWANA'), systemPoints: 500 }];
    // Only every ten minutes.
    assert.equal(await moveGiftRewards({ DB: database }, minute + 5 * 60000, moves), 0);
    assert.equal(await moveGiftRewards({ DB: database }, minute, moves), 1);
    assert.deepEqual([await points(giver.id), await points(taker.id) - before], [30, 500]);
    const record = await database.prepare("SELECT character_id FROM gift_codes_used WHERE gift_id = 'tiger-2026-11'").first();
    assert.equal(record.character_id, taker.id);
    // Once only.
    assert.equal(await moveGiftRewards({ DB: database }, minute + 10 * 60000, moves), 0);
    assert.deepEqual([await points(giver.id), await points(taker.id) - before], [30, 500]);
    // The player sees it on the character's card.
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.name, 'Obdarowana');
  });

  test('a giver with fewer points than the move keeps none, never below none', async () => {
    const { cookie } = await signUp('przenosiny2');
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Wydawca', classId: 'archer', appearance: 'male' } })).status, 201);
    const database = await db();
    const giver = await database.prepare("SELECT id, user_id FROM characters WHERE name = 'Wydawca'").first();
    await database.prepare('UPDATE characters SET system_points = 120 WHERE id = ?').bind(giver.id).run();
    await database.prepare("INSERT INTO gift_codes_used (user_id, gift_id, character_id, used_at) VALUES (?, 'tiger-2026-11', ?, ?)").bind(giver.user_id, giver.id, minute).run();
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Biorca', classId: 'mage', appearance: 'male' } })).status, 201);
    const moves = [{ id: 'test-move-2', gift: 'tiger-2026-11', from: await looseKey('Wydawca'), to: await looseKey('Biorca'), systemPoints: 500 }];
    assert.equal(await moveGiftRewards({ DB: database }, minute, moves), 1);
    assert.equal((await database.prepare('SELECT system_points FROM characters WHERE id = ?').bind(giver.id).first()).system_points, 0);
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
