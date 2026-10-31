// "Zgłoś błąd" (the author: "Trzeba dodac przycisk Zgłoś błąd i zeby
// przychodzil mi w Panel Autora"): a player's report waits in the author's
// panel with the screen, the game's version and the character, until the
// author marks it done; the author's settings show how many wait.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { BUG_REPORTS } from '../src/server/bugs.js';
import { useServer } from './helpers/server.js';

describe('Zgłoś błąd', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let player;
  let author;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Gracz', classId: 'mage', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  const report = (cookie, text, screen = '#/walka') => call('POST', '/api/bug-reports', { cookie, body: { text, screen } });

  test('a report waits in the author\'s panel with the screen, the version and the character, until done', async () => {
    const sent = await report(player, '  Po stuknięciu „Wyrusz” nic się nie dzieje.  ', '#/walka/peat-bogs');
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    // The author's settings know that one waits.
    assert.equal((await call('GET', '/api/me', { cookie: author })).data.user.bugReports, 1);
    assert.equal((await call('GET', '/api/me', { cookie: player })).data.user.bugReports, undefined);
    const panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.equal(panel.counts.bugs, 1);
    const [bug] = panel.bugs;
    assert.equal(bug.login, 'gracz');
    assert.equal(bug.text, 'Po stuknięciu „Wyrusz” nic się nie dzieje.');
    assert.equal(bug.screen, '#/walka/peat-bogs');
    assert.match(bug.character, /^Gracz · Mag, poziom 1, klasa 1$/);
    assert.ok(bug.version);
    assert.equal(bug.resolvedAt, null);
    // Done, and back again.
    const done = await call('POST', '/api/author/bugs/resolve', { cookie: author, body: { id: bug.id } });
    assert.deepEqual(done.data, { ok: true, open: 0 });
    assert.ok((await call('GET', '/api/author', { cookie: author })).data.bugs[0].resolvedAt > 0);
    assert.equal((await call('POST', '/api/author/bugs/resolve', { cookie: author, body: { id: bug.id, done: false } })).data.open, 1);
    // Only the author sees the reports and marks them.
    assert.equal((await call('GET', '/api/author', { cookie: player })).status, 404);
    assert.equal((await call('POST', '/api/author/bugs/resolve', { cookie: player, body: { id: bug.id } })).status, 404);
  });

  test('a report has a few words at least and a limit a day, and goes with its account', async () => {
    assert.equal((await report(player, 'krótko')).data.error.code, 'too_short');
    assert.equal((await report(player, 'x'.repeat(BUG_REPORTS.longest + 1))).data.error.code, 'too_long');
    for (let index = 0; index < BUG_REPORTS.daily; index += 1) assert.equal((await report(player, `Błąd numer ${index + 1} w grze.`)).status, 201);
    assert.equal((await report(player, 'Jeszcze jeden błąd w grze.')).data.error.code, 'too_many');
    // Without a session, nothing.
    assert.equal((await call('POST', '/api/bug-reports', { body: { text: 'Błąd bez logowania.' } })).status, 401);
    // The account deleted, its reports go with it.
    assert.equal((await call('DELETE', '/api/me', { cookie: player, body: { login: 'gracz' } })).status, 200);
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM bug_reports').first()).count, 0);
  });
});
