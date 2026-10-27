// The chat of the Społeczność tab: messages of the Globalny channel after
// the rules are accepted, written no faster than the rules allow, without
// links and with rude words masked; reports, hidden players and the
// author's decisions.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Czat', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  const players = {};

  // An account with a character, the chat's rules accepted unless `rules` is false.
  async function player(login, { rules = true } = {}) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    if (rules) await call('POST', '/api/chat/rules', { cookie });
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
    assert.deepEqual([sent.data.message.text, sent.data.message.name, sent.data.message.level, sent.data.message.classId, sent.data.message.own], ['Cześć wszystkim!', 'Ala', 1, 'mage', true]);
    const seen = await read(players.ola);
    assert.deepEqual(seen.messages.map(({ name, text, own }) => [name, text, own]), [['Ala', 'Cześć wszystkim!', false]]);
    assert.equal(seen.rulesAccepted, true);
    assert.equal(seen.mutedUntil, null);
    assert.equal(seen.reports, undefined);
    // Only what came after the last message the page has.
    await age();
    const next = await send(players.ola, 'Hej!');
    assert.deepEqual((await read(players.ala, `&after=${sent.data.message.id}`)).messages.map(({ id }) => id), [next.data.message.id]);
    assert.equal((await call('GET', '/api/chat?channel=nowhere', { cookie: players.ala })).status, 404);
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
    assert.match(last.data.text, /Zgłoszono/);
    const seen = await read(players.ala, `&after=${message.id}&from=${message.id}`);
    assert.deepEqual([seen.messages.length, seen.hidden], [0, [message.id]]);
    assert.equal((await read(players.ala)).messages.length, 0);
  });

  test('the author takes a message down or keeps it, and silences an account', async () => {
    const author = await player('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    const { message } = (await send(players.ola, 'Coś brzydkiego')).data;
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    assert.equal((await read(author)).reports, 1);
    assert.equal((await call('POST', '/api/author/chat', { cookie: players.ala, body: { messageId: message.id, action: 'hide' } })).status, 404);

    let panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.deepEqual(panel.chatReports.map(({ messageId, login, text, reports, hidden }) => [messageId, login, text, reports, hidden]), [[message.id, 'Ola', 'Coś brzydkiego', 1, false]]);
    assert.equal((await call('POST', '/api/author/chat', { cookie: author, body: { messageId: message.id, action: 'keep' } })).status, 200);
    panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.deepEqual(panel.chatReports, []);
    assert.equal((await read(players.ala)).messages.length, 1);
    // A report the author kept does not come back from the same player.
    await call('POST', '/api/chat/report', { cookie: players.ala, body: { messageId: message.id } });
    assert.equal((await read(author)).reports, 0);

    await call('POST', '/api/author/chat', { cookie: author, body: { messageId: message.id, action: 'hide' } });
    assert.equal((await read(players.ala)).messages.length, 0);
    await call('POST', '/api/author/chat', { cookie: author, body: { messageId: message.id, action: 'muteDay' } });
    const muted = await send(players.ola, 'Już nic nie piszę');
    assert.deepEqual([muted.status, muted.data.error.code], [403, 'muted']);
    assert.match(muted.data.error.message, /wyciszony do/);
    assert.ok((await read(players.ola)).mutedUntil > Date.now());
    await call('POST', '/api/author/chat', { cookie: author, body: { messageId: message.id, action: 'muteForever' } });
    assert.match((await send(players.ola, 'Hej')).data.error.message, /na stałe/);
    panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.ok(panel.accounts.find((account) => account.login === 'Ola').chatMutedUntil > Date.now());
    assert.equal((await call('POST', '/api/author/chat/unmute', { cookie: author, body: { login: 'Ola' } })).status, 200);
    await age();
    assert.equal((await send(players.ola, 'Dziękuję')).status, 201);
    assert.equal((await call('POST', '/api/author/chat', { cookie: author, body: { messageId: message.id, action: 'ban' } })).data.error.code, 'invalid_action');
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
