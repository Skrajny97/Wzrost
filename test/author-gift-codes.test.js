// Gift codes made in the Panel autora (the author, 17.11.2026: „Musisz mi
// dodac opcję w Panel Autora generowania takich kodów z pozycji gry, które
// działają od razu”): stored in author_gift_codes, they work at once, once
// per account, and the author may end them early.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { warsawDayEnd } from '../src/server/gift-codes.js';
import { useServer } from './helpers/server.js';

describe('gift codes made in the Panel autora', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let author;
  let player;
  let other;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Bożydar', classId: 'mage', appearance: 'male' } });
    ({ cookie: other } = await signUp('drugi'));
    await call('POST', '/api/character', { cookie: other, body: { name: 'Mirosława', classId: 'cleric', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await call('POST', '/api/character', { cookie: author, body: { name: 'Szef', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  // Two days ahead of the server's clock, so the code is open.
  const soon = () => new Date(Date.now() + 2 * 24 * 3600000).toISOString().slice(0, 10);
  const make = (body) => call('POST', '/api/author/gift-codes', { cookie: author, body: { until: soon(), ...body } });
  const redeem = (cookie, code) => call('POST', '/api/gift-code', { cookie, body: { code } });

  test('a code for everyone works at once, once per account, and the list counts its uses', async () => {
    const made = await make({ code: 'zima-100', systemPoints: 100, timePoints: '50', gold: '' });
    assert.equal(made.status, 200);
    const [code] = made.data.codes;
    assert.deepEqual([code.code, code.rewards, code.forName, code.open, code.uses], ['ZIMA100', 'Punkty Systemu +100, Punkty Czasu +50', null, true, 0]);
    // The data's codes are listed too.
    assert.ok(made.data.files.some((file) => file.code === 'DISCORD100' && file.personal));
    const before = (await call('GET', '/api/character', { cookie: player })).data.character;
    const taken = await redeem(player, 'Zima 100');
    assert.equal(taken.status, 200);
    assert.equal(taken.data.character.systemPoints, before.systemPoints + 100);
    assert.equal(taken.data.character.timePoints, before.timePoints + 50);
    assert.equal((await redeem(player, 'ZIMA100')).data.error.code, 'used_code');
    assert.equal((await redeem(other, 'ZIMA100')).status, 200);
    const listed = (await call('GET', '/api/author/gift-codes', { cookie: author })).data.codes;
    assert.equal(listed[0].uses, 2);
    // The same text again is refused while the code works.
    assert.equal((await make({ code: 'ZIMA100', gold: 5 })).data.error.code, 'code_taken');
  });

  test("a character's code is only that character's, by its name in any letter case", async () => {
    assert.equal((await make({ code: 'TYLKOTY', gold: 500, name: 'Nikt' })).data.error.code, 'no_character');
    const made = await make({ code: 'TYLKOTY', gold: 500, name: 'bożydar' });
    assert.equal(made.data.codes[0].forName, 'Bożydar');
    assert.equal((await redeem(other, 'TYLKOTY')).data.error.code, 'unknown_code');
    assert.equal((await redeem(player, 'TYLKOTY')).status, 200);
    // The same text for another character is its own code.
    assert.equal((await make({ code: 'TYLKOTY', gold: 300, name: 'Mirosława' })).status, 200);
    assert.equal((await make({ code: 'TYLKOTY', gold: 300, name: 'Mirosława' })).data.error.code, 'code_taken');
    assert.equal((await redeem(other, 'TYLKOTY')).status, 200);
  });

  test('an ended code works no more, and only the author may make or end codes', async () => {
    const made = await make({ code: 'KONIEC', timePoints: 10 });
    const ended = await call('POST', '/api/author/gift-codes/end', { cookie: author, body: { id: made.data.codes[0].id } });
    assert.equal(ended.status, 200);
    assert.equal(ended.data.codes[0].open, false);
    assert.equal((await redeem(player, 'KONIEC')).data.error.code, 'expired_code');
    assert.equal((await call('POST', '/api/author/gift-codes/end', { cookie: author, body: { id: made.data.codes[0].id } })).status, 404);
    // Bad input.
    assert.equal((await make({ code: 'AB', gold: 1 })).data.error.code, 'bad_code');
    assert.equal((await make({ code: 'NIC' })).data.error.code, 'no_rewards');
    assert.equal((await make({ code: 'DUZO', systemPoints: 10001 })).data.error.code, 'bad_rewards');
    assert.equal((await make({ code: 'WCZORAJ', gold: 1, until: '2020-01-01' })).data.error.code, 'bad_until');
    assert.equal((await make({ code: 'ZADALEKO', gold: 1, until: '2099-01-01' })).data.error.code, 'bad_until');
    // Nobody else.
    assert.equal((await call('GET', '/api/author/gift-codes', { cookie: player })).status, 404);
    assert.equal((await call('POST', '/api/author/gift-codes', { cookie: player, body: { code: 'MOJ', gold: 1, until: soon() } })).status, 404);
  });
});

test('a day ends at midnight in Warsaw, in winter and in summer time', () => {
  assert.equal(new Date(warsawDayEnd('2026-12-17')).toISOString(), '2026-12-17T23:00:00.000Z');
  assert.equal(new Date(warsawDayEnd('2026-07-01')).toISOString(), '2026-07-01T22:00:00.000Z');
});
