// The Panel autora's search of a player and its new players' path (1027,
// mock-ups 1032 accepted): only the author's account, bound to Google.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe("the author's search and the new players' path (1032)", () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let author;
  let player;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Bożydar', classId: 'mage', appearance: 'male' } });
    const { cookie: other } = await signUp('drugi');
    await call('POST', '/api/character', { cookie: other, body: { name: 'Mirosława', classId: 'cleric', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await call('POST', '/api/character', { cookie: author, body: { name: 'Szef', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  test("a player is found by a part of the character's name, the login or the e-mail, with every character", async () => {
    const byName = (await call('GET', '/api/author/search?q=%C5%BCyd', { cookie: author })).data;
    assert.deepEqual(byName.accounts.map((account) => account.login), ['gracz']);
    assert.deepEqual(byName.accounts[0].characters.map((one) => [one.name, one.playing]), [['Bożydar', true]]);
    assert.equal(byName.accounts[0].email, 'gracz@example.com');
    // Upper case and a part of the login find it too; a short query is refused.
    assert.deepEqual((await call('GET', '/api/author/search?q=BO%C5%BB', { cookie: author })).data.accounts.map((account) => account.login), ['gracz']);
    assert.deepEqual((await call('GET', '/api/author/search?q=drug', { cookie: author })).data.accounts.map((account) => account.login), ['drugi']);
    assert.equal((await call('GET', '/api/author/search?q=b', { cookie: author })).status, 400);
    // "%" is a sign to look for, not every account.
    assert.deepEqual((await call('GET', '/api/author/search?q=%25%25', { cookie: author })).data.accounts, []);
    // Nobody else may search.
    assert.equal((await call('GET', '/api/author/search?q=gracz', { cookie: player })).status, 404);
  });

  test('the path counts the accounts made in the period and the steps they took', async () => {
    const { funnel } = (await call('GET', '/api/author', { cookie: author })).data;
    assert.deepEqual(funnel.map((period) => period.days), [7, 30, 0]);
    const week = funnel[0];
    assert.deepEqual([week.accounts, week.characters], [3, 3]);
    // Made just now: none is a day old yet, so none counts as back.
    assert.deepEqual([week.dayOld, week.dayBack, week.weekOld, week.weekBack], [0, 0, 0, 0]);
    assert.ok(week.trip <= week.characters && week.intro <= week.characters);
  });
});
