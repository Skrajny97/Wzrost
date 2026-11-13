// "A→ Przetłumacz" on the chat (714 A, src/server/translate.js): where
// English is on and a translator is bound, a message in the other language
// than the reader's is translated by the machine, once for everyone who
// reads in that language, within an account's daily number of new
// translations; only messages the reader may read. Tests use the stand-in
// translator (FAKE_TRANSLATOR), which marks the text with its languages.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { guessLanguage, translateText } from '../src/server/translate.js';
import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

test('the language of a message: Polish letters and words only one language writes, else the writer\'s', () => {
  assert.equal(guessLanguage('Hej! Ktoś wie, gdzie najlepiej expić na 20 poziomie?'), 'pl');
  assert.equal(guessLanguage('siema, ktos idzie na bagno?'), 'pl');
  assert.equal(guessLanguage('Hi all! Does anyone know where Misfortune drops its eye?'), 'en');
  assert.equal(guessLanguage('xD', 'en'), 'en');
  assert.equal(guessLanguage('xD', 'pl'), 'pl');
  assert.equal(guessLanguage('ok', undefined), 'pl');
});

test('Workers AI: the codes first, the names when the codes give nothing, null when neither does', async () => {
  const asked = [];
  const answers = [{}, { translated_text: '  Hello everyone!  ' }];
  const env = { AI: { run: async (model, input) => (asked.push([model, input]), answers.shift()) } };
  assert.equal(await translateText(env, 'Cześć wszystkim!', 'pl', 'en'), 'Hello everyone!');
  assert.deepEqual(asked, [
    ['@cf/meta/m2m100-1.2b', { text: 'Cześć wszystkim!', source_lang: 'pl', target_lang: 'en' }],
    ['@cf/meta/m2m100-1.2b', { text: 'Cześć wszystkim!', source_lang: 'polish', target_lang: 'english' }],
  ]);
  const failing = { AI: { run: async () => Promise.reject(new Error('down')) } };
  assert.equal(await translateText(failing, 'Cześć', 'pl', 'en'), null);
  assert.equal(await translateText({}, 'Cześć', 'pl', 'en'), null);
  assert.equal(await translateText({ FAKE_TRANSLATOR: 'on' }, 'Cześć', 'pl', 'en'), '[pl→en] Cześć');
});

// A request in a language, the page's own (X-Lang).
function caller(server) {
  return async (method, path, { body, cookie, lang } = {}) => {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
}

describe('Tłumaczenie na czacie', () => {
  const { server, db, signUp } = useServer({ ENGLISH: 'on', FAKE_TRANSLATOR: 'on' });
  const ask = caller(server);
  const players = {};

  async function player(login, language) {
    const { cookie } = await signUp(login);
    await ask('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 5 WHERE name = ?').bind(login).run();
    await (await db()).prepare('UPDATE users SET language = ? WHERE login = ?').bind(language, login).run();
    await ask('POST', '/api/chat/rules', { cookie });
    return cookie;
  }

  beforeEach(async () => {
    players.ala = await player('Ala', 'pl');
    players.rowan = await player('Rowan', 'en');
    players.ola = await player('Ola', 'pl');
  });

  const send = (cookie, text, lang) => ask('POST', '/api/chat', { cookie, lang, body: { channel: 'global', text } });
  const read = async (cookie, lang) => (await ask('GET', '/api/chat?channel=global', { cookie, lang })).data.messages;
  const translate = (cookie, id, lang) => ask('POST', '/api/chat/translate', { cookie, lang, body: { id } });
  const used = async (login) => (await db()).prepare('SELECT translations_day AS day, translations_used AS used FROM users WHERE login = ?').bind(login).first();
  const today = () => questPeriod('daily', Date.now(), content).key;

  test('a Polish message for an English reader: translated once, then read again for free', async () => {
    const sent = await send(players.ala, 'Hej! Ktoś wie, gdzie najlepiej expić?', 'pl');
    assert.equal(sent.data.message.language, 'pl');
    const [message] = await read(players.rowan, 'en');
    assert.equal(message.language, 'pl');
    const first = await translate(players.rowan, message.id, 'en');
    assert.deepEqual(first.data, { id: message.id, text: '[pl→en] Hej! Ktoś wie, gdzie najlepiej expić?' });
    assert.deepEqual(await used('Rowan'), { day: today(), used: 1 });
    // Asked again, by anyone reading in English, it is the one kept.
    await (await db()).prepare("UPDATE users SET language = 'en' WHERE login = 'Ola'").run();
    assert.equal((await translate(players.ola, message.id, 'en')).data.text, first.data.text);
    assert.deepEqual(await used('Ola'), { day: null, used: 0 });
    assert.equal((await translate(players.rowan, message.id, 'en')).data.text, first.data.text);
    assert.deepEqual(await used('Rowan'), { day: today(), used: 1 });
    // A Polish reader gets the words as they are, counting nothing.
    assert.equal((await translate(players.ala, message.id, 'pl')).data.text, 'Hej! Ktoś wie, gdzie najlepiej expić?');
    assert.deepEqual(await used('Ala'), { day: null, used: 0 });
  });

  test('an English message for a Polish reader, in a private conversation too', async () => {
    const rowan = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Rowan'").first()).id;
    const ala = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Ala'").first()).id;
    const sent = await ask('POST', '/api/chat', { cookie: players.rowan, lang: 'en', body: { with: ala, text: 'Hi! Do you know where the Bog Hag is?' } });
    assert.equal(sent.status, 201);
    const talk = (await ask('GET', `/api/chat?with=${rowan}`, { cookie: players.ala, lang: 'pl' })).data.messages;
    assert.equal(talk[0].language, 'en');
    assert.equal((await translate(players.ala, talk[0].id, 'pl')).data.text, '[en→pl] Hi! Do you know where the Bog Hag is?');
    // Ola is not in that conversation.
    assert.equal((await translate(players.ola, talk[0].id, 'pl')).data.error.code, 'no_message');
  });

  test('the day\'s translations: no new one past the number, again from the next day', async () => {
    const most = content.chat.rules.translations;
    assert.equal(most, 100);
    const sent = await send(players.ala, 'Cześć wszystkim, kto idzie na bagno?', 'pl');
    await (await db()).prepare("UPDATE users SET translations_day = ?, translations_used = ? WHERE login = 'Rowan'").bind(today(), most).run();
    const refused = await translate(players.rowan, sent.data.message.id, 'en');
    assert.equal(refused.status, 429);
    assert.equal(refused.data.error.code, 'translations_used');
    assert.equal(refused.data.error.message, "Today's translations (100) are all used up. New ones from midnight.");
    await (await db()).prepare("UPDATE users SET translations_day = '2000-01-01' WHERE login = 'Rowan'").run();
    assert.equal((await translate(players.rowan, sent.data.message.id, 'en')).status, 200);
    assert.deepEqual(await used('Rowan'), { day: today(), used: 1 });
  });

  // The code review of 13.11.2026, as for the other limits of a day
  // (0.2.71, 0.2.74, 0.2.76): a request begun before midnight and done after
  // one of the new day took the new day's count for none, counted itself as
  // the first of its own day and wrote that day back over it, so the new
  // day's count began again. A count of a later day is the day's limit used.
  test("the day's translations: a count of a later day is neither used again nor written over", async () => {
    const sent = await send(players.ala, 'Cześć wszystkim, kto idzie na bagno?', 'pl');
    await (await db()).prepare("UPDATE users SET translations_day = '2999-01-01', translations_used = 3 WHERE login = 'Rowan'").run();
    const refused = await translate(players.rowan, sent.data.message.id, 'en');
    assert.deepEqual([refused.status, refused.data.error?.code], [429, 'translations_used']);
    assert.deepEqual(await used('Rowan'), { day: '2999-01-01', used: 3 });
  });

  test('only messages the reader may read: not taken down, not the System\'s, not another guild\'s, not of a hidden player', async () => {
    const sent = await send(players.ala, 'Cześć, ktoś ma zbędne zioła?', 'pl');
    const id = sent.data.message.id;
    const base = await db();
    await base.prepare('UPDATE chat_messages SET hidden_at = 1 WHERE id = ?').bind(id).run();
    assert.equal((await translate(players.rowan, id, 'en')).status, 404);
    await base.prepare('UPDATE chat_messages SET hidden_at = NULL, system = 1 WHERE id = ?').bind(id).run();
    assert.equal((await translate(players.rowan, id, 'en')).status, 404);
    await base.prepare("UPDATE chat_messages SET system = 0, channel = 'guild:999' WHERE id = ?").bind(id).run();
    assert.equal((await translate(players.rowan, id, 'en')).status, 404);
    await base.prepare("UPDATE chat_messages SET channel = 'global' WHERE id = ?").bind(id).run();
    await ask('POST', '/api/chat/block', { cookie: players.rowan, body: { messageId: id } });
    assert.equal((await translate(players.rowan, id, 'en')).status, 404);
    for (const bad of [0, -1, 'x', 999999]) assert.equal((await translate(players.ola, bad, 'en')).data.error.code, 'no_message');
  });
});

describe('Tłumaczenie na czacie bez tłumacza', () => {
  const { server, signUp, db } = useServer({ ENGLISH: 'on' });
  const ask = caller(server);

  test('without a translator the chat offers none', async () => {
    const { cookie } = await signUp('Ala');
    await ask('POST', '/api/character', { cookie, body: { name: 'Ala', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 5 WHERE name = 'Ala'").run();
    await ask('POST', '/api/chat/rules', { cookie });
    const sent = await ask('POST', '/api/chat', { cookie, lang: 'en', body: { channel: 'global', text: 'Cześć wszystkim!' } });
    assert.equal(sent.data.message.language, undefined);
    assert.equal((await ask('POST', '/api/chat/translate', { cookie, lang: 'en', body: { id: sent.data.message.id } })).status, 404);
  });
});
