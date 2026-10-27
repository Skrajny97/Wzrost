// The chat of the Społeczność tab, from character level 5: messages of the
// Globalny channel after the rules are accepted, written no faster than the
// rules allow, without links and with rude words masked; reports, hidden
// players, and the moderation: the author's account (the admin) and the
// moderators it names.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { unlockMessages } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Czat', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  const players = {};

  // An account with a character at the chat's level, the chat's rules
  // accepted unless `rules` is false.
  async function player(login, { rules = true, level = 5 } = {}) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ? WHERE name = ?').bind(level, login).run();
    if (rules) await call('POST', '/api/chat/rules', { cookie });
    return cookie;
  }
  // The author's account, bound to Google as the author's must be.
  async function admin() {
    const cookie = await player('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    return cookie;
  }

  beforeEach(async () => {
    players.ala = await player('Ala');
    players.ola = await player('Ola');
  });

  const send = (cookie, text) => call('POST', '/api/chat', { cookie, body: { channel: 'global', text } });
  const read = async (cookie, query = '') => (await call('GET', `/api/chat?channel=global${query}`, { cookie })).data;
  // Moves every message `seconds` into the past, past the wait between messages.
  const age = async (seconds = 10) => (await db()).prepare('UPDATE chat_messages SET created_at = created_at - ?').bind(seconds * 1000).run();

  test('a message reaches every player, under the character\'s name, level and class', async () => {
    const sent = await send(players.ala, '  Cześć\nwszystkim!  ');
    assert.equal(sent.status, 201);
    assert.deepEqual(
      [sent.data.message.text, sent.data.message.name, sent.data.message.level, sent.data.message.classId, sent.data.message.own, sent.data.message.role],
      ['Cześć wszystkim!', 'Ala', 5, 'mage', true, null],
    );
    const seen = await read(players.ola);
    assert.deepEqual(seen.messages.map(({ name, text, own }) => [name, text, own]), [['Ala', 'Cześć wszystkim!', false]]);
    assert.equal(seen.rulesAccepted, true);
    assert.equal(seen.mutedUntil, null);
    assert.equal(seen.reports, undefined);
    assert.equal(seen.role, null);
    // Only what came after the last message the page has.
    await age();
    const next = await send(players.ola, 'Hej!');
    assert.deepEqual((await read(players.ala, `&after=${sent.data.message.id}`)).messages.map(({ id }) => id), [next.data.message.id]);
    assert.equal((await call('GET', '/api/chat?channel=nowhere', { cookie: players.ala })).status, 404);
  });

  test('opens at character level 5, which the report announces with Szybkie Polowanie', async () => {
    const young = await player('Ewa', { rules: false, level: 4 });
    for (const [method, path] of [['GET', '/api/chat?channel=global'], ['POST', '/api/chat'], ['POST', '/api/chat/rules'], ['POST', '/api/chat/report']]) {
      const answer = await call(method, path, { cookie: young, body: method === 'POST' ? { text: 'Hej', messageId: 1 } : undefined });
      assert.deepEqual([answer.status, answer.data.error.code], [403, 'locked'], path);
    }
    const level = content.unlocksById.community.level;
    assert.equal(level, 5);
    assert.equal(content.unlocksById['quick-hunts'].level, level);
    assert.deepEqual(unlockMessages(level, content), [content.unlocksById['quick-hunts'].message, content.unlocksById.community.message]);
  });

  test('writes after the rules are accepted, not too fast, without links, with rude words masked', async () => {
    const newcomer = await player('Ewa', { rules: false });
    assert.equal((await read(newcomer)).rulesAccepted, false);
    assert.equal((await send(newcomer, 'Hej')).data.error.code, 'rules');
    assert.equal((await call('POST', '/api/chat/rules', { cookie: newcomer })).status, 200);
    assert.equal((await send(newcomer, 'Hej')).status, 201);
    assert.equal((await send(newcomer, 'Hej znowu')).data.error.code, 'too_fast');
    await age();
    assert.equal((await send(newcomer, '   ')).data.error.code, 'empty');
    assert.equal((await send(newcomer, 'a'.repeat(content.chat.rules.maxLength + 1))).data.error.code, 'too_long');
    for (const link of ['https://example.com', 'wejdź na www.strona', 'mój serwer: discord.gg/abc', 'zobacz gra.pl']) {
      assert.equal((await send(newcomer, link)).data.error.code, 'link', link);
    }
    const masked = await send(newcomer, 'Ty KURWA, co za pierdoły');
    assert.equal(masked.data.message.text, 'Ty *****, co za ********');
    // A message without a character is not written.
    const { cookie } = await signUp('Bez');
    await call('POST', '/api/chat/rules', { cookie });
    assert.equal((await send(cookie, 'Hej')).data.error.code, 'no_character');
  });

  test('a player hides another one\'s messages and shows them again', async () => {
    const { message } = (await send(players.ola, 'Spam')).data;
    assert.equal((await call('POST', '/api/chat/block', { cookie: players.ola, body: { messageId: message.id } })).data.error.code, 'own');
    const blocked = await call('POST', '/api/chat/block', { cookie: players.ala, body: { messageId: message.id } });
    assert.deepEqual(blocked.data.blocked.map(({ name }) => name), ['Ola']);
    assert.equal((await read(players.ala)).messages.length, 0);
    assert.equal((await read(players.ola)).messages.length, 1);
    const shown = await call('POST', '/api/chat/unblock', { cookie: players.ala, body: { id: blocked.data.blocked[0].id } });
    assert.deepEqual(shown.data.blocked, []);
    assert.equal((await read(players.ala)).messages.length, 1);
  });

  test('reports reach the author, and a message reported by enough players goes down', async () => {
    const { message } = (await send(players.ola, 'Coś brzydkiego')).data;
    const reporters = [players.ala, await player('Ewa'), await player('Iza')];
    assert.equal((await call('POST', '/api/chat/report', { cookie: players.ola, body: { messageId: message.id } })).data.error.code, 'own');
    for (const cookie of reporters.slice(0, -1)) await call('POST', '/api/chat/report', { cookie, body: { messageId: message.id } });
    // The same player again counts once.
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    assert.equal((await read(players.ala)).messages.length, 1);
    const last = await call('POST', '/api/chat/report', { cookie: reporters.at(-1), body: { messageId: message.id } });
    assert.equal(last.data.text, 'Zgłoszono. Moderacja sprawdzi tę wiadomość.');
    const seen = await read(players.ala, `&after=${message.id}&from=${message.id}`);
    assert.deepEqual([seen.messages.length, seen.hidden], [0, [message.id]]);
    assert.equal((await read(players.ala)).messages.length, 0);
  });

  test('the admin takes a message down or keeps it, and silences an account', async () => {
    const author = await admin();
    const { message } = (await send(players.ola, 'Coś brzydkiego')).data;
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    assert.deepEqual([(await read(author)).role, (await read(author)).reports], ['admin', 1]);
    assert.equal((await call('POST', '/api/chat/moderate', { cookie: players.ala, body: { messageId: message.id, action: 'hide' } })).status, 404);
    assert.equal((await call('GET', '/api/chat/reports', { cookie: players.ala })).status, 404);

    let { reports } = (await call('GET', '/api/chat/reports', { cookie: author })).data;
    assert.deepEqual(reports.map(({ messageId, name, login, text, reports: count, hidden }) => [messageId, name, login, text, count, hidden]), [[message.id, 'Ola', 'Ola', 'Coś brzydkiego', 1, false]]);
    assert.equal((await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: message.id, action: 'keep' } })).status, 200);
    ({ reports } = (await call('GET', '/api/chat/reports', { cookie: author })).data);
    assert.deepEqual(reports, []);
    assert.equal((await read(players.ala)).messages.length, 1);
    // A report kept by the moderation does not come back from the same player.
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    assert.equal((await read(author)).reports, 0);

    await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: message.id, action: 'hide' } });
    assert.equal((await read(players.ala)).messages.length, 0);
    await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: message.id, action: 'muteDay' } });
    const muted = await send(players.ola, 'Już nic nie piszę');
    assert.deepEqual([muted.status, muted.data.error.code], [403, 'muted']);
    assert.match(muted.data.error.message, /wyciszony do/);
    assert.ok((await read(players.ola)).mutedUntil > Date.now());
    await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: message.id, action: 'muteForever' } });
    assert.match((await send(players.ola, 'Hej')).data.error.message, /na stałe/);
    const panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.ok(panel.accounts.find((account) => account.login === 'Ola').chatMutedUntil > Date.now());
    assert.equal(panel.chatReports, undefined);
    assert.equal((await call('POST', '/api/author/chat/unmute', { cookie: author, body: { login: 'Ola' } })).status, 200);
    await age();
    assert.equal((await send(players.ola, 'Dziękuję')).status, 201);
    assert.equal((await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: message.id, action: 'ban' } })).data.error.code, 'invalid_action');
  });

  test('the chat marks the admin and the moderators, and a moderator moderates the players only', async () => {
    const author = await admin();
    assert.equal((await call('POST', '/api/author/chat/moderator', { cookie: players.ola, body: { login: 'Ola', moderator: true } })).status, 404);
    assert.equal((await call('POST', '/api/author/chat/moderator', { cookie: author, body: { login: 'Ola', moderator: true } })).status, 200);
    assert.equal((await call('GET', '/api/author', { cookie: author })).data.accounts.find((account) => account.login === 'Ola').chatModerator, true);
    const fromAdmin = (await send(author, 'Witajcie w Insight!')).data.message;
    const fromModerator = (await send(players.ola, 'Pilnuję porządku.')).data.message;
    const fromPlayer = (await send(players.ala, 'Coś brzydkiego')).data.message;
    assert.deepEqual((await read(players.ala)).messages.map(({ name, role }) => [name, role]), [['szef', 'admin'], ['Ola', 'moderator'], ['Ala', null]]);
    assert.equal((await read(players.ola)).role, 'moderator');

    await call('POST', '/api/chat/report', { cookie: author, body: { messageId: fromPlayer.id } });
    const { reports } = (await call('GET', '/api/chat/reports', { cookie: players.ola })).data;
    assert.deepEqual(reports.map(({ name, login, role }) => [name, login, role]), [['Ala', undefined, null]]);
    assert.equal((await call('POST', '/api/chat/moderate', { cookie: players.ola, body: { messageId: fromPlayer.id, action: 'hide' } })).status, 200);
    for (const messageId of [fromAdmin.id, fromModerator.id]) {
      const refused = await call('POST', '/api/chat/moderate', { cookie: players.ola, body: { messageId, action: 'muteDay' } });
      assert.deepEqual([refused.status, refused.data.error.code], [403, 'protected']);
    }
    assert.equal((await call('POST', '/api/author/chat/unmute', { cookie: players.ola, body: { login: 'Ala' } })).status, 404);

    await call('POST', '/api/author/chat/moderator', { cookie: author, body: { login: 'Ola', moderator: false } });
    assert.equal((await read(players.ala)).messages.find(({ name }) => name === 'Ola').role, null);
    assert.equal((await call('GET', '/api/chat/reports', { cookie: players.ola })).status, 404);
  });

  test('the channel keeps its last messages and the reported ones, and they go with the character', async () => {
    const database = await db();
    const { message } = (await send(players.ola, 'Zgłoszona')).data;
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    const { keep } = content.chat.rules;
    const user = await database.prepare("SELECT u.id AS user_id, c.id AS character_id FROM users u JOIN characters c ON c.user_id = u.id WHERE u.login = 'Ala'").first();
    const rows = Array.from({ length: keep + 5 }, (_, i) =>
      database
        .prepare("INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at) VALUES ('global', ?, ?, 'Ala', 1, 'mage', ?, 0)")
        .bind(user.user_id, user.character_id, `Wiadomość ${i}`),
    );
    await database.batch(rows);
    await send(players.ala, 'Ostatnia');
    const count = async (where = '1') => (await database.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE ${where}`).first()).n;
    assert.equal(await count(), keep + 1);
    assert.equal(await count(`id = ${message.id}`), 1);
    assert.equal((await read(players.ola)).messages.length, content.chat.rules.page);

    assert.equal((await call('DELETE', '/api/character', { cookie: players.ola })).status, 200);
    assert.equal(await count(`id = ${message.id}`), 0);
    assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM chat_reports').first()).n, 0);
  });
});
