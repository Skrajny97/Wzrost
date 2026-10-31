// The filter of character names (src/engine/names.js): the mildest there
// can be, the chat's words only, and a character whose name it blocks takes
// a new one before anything else.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { blockedName } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the name filter in the engine', () => {
  test('a name with one of the chat words is blocked, also hidden behind digits, look-alikes, doubled letters or signs between', () => {
    for (const name of ['Kurwa', 'kuuurwa', 'Kurw4', 'K u r w a', 'K-u_r\'wa', 'Chuj', 'ChUjOwY', 'Jebaka', 'Fuck', 'F_u_c_k', 'Ѕhit', 'Nigga', 'Faggot', 'Pizd3c', 'Skurwiel', 'Ćwel', 'Kutas1']) {
      assert.equal(blockedName(name, content), true, name);
    }
  });

  test('names that only look like those words, and ordinary names, are allowed', () => {
    for (const name of ['Nigel', 'Fagin', 'Kurt', 'Hubert', 'Chudy', 'Pierwszy', 'Bogumił', 'Wiedana', 'Justi_725', 'Ragnar', 'Kot w Butach']) {
      assert.equal(blockedName(name, content), false, name);
    }
  });
});

describe('names through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('imiennik'));
  });

  test('a new character cannot take a blocked name, with the reason given', async () => {
    const refused = await call('POST', '/api/character', { cookie, body: { name: 'Kurw4', classId: 'archer', appearance: 'female' } });
    assert.equal(refused.status, 400);
    assert.equal(refused.data.error.code, 'invalid_name');
    assert.equal(refused.data.error.message, content.chat.names.refused);
  });

  test('a character with a blocked name is told so and takes a new one; its chat messages take it too', async () => {
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Imiennik', classId: 'archer', appearance: 'female' } })).status, 201);
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare("UPDATE characters SET name = 'Chujek', name_key = 'chujek' WHERE id = ?").bind(id).run();
    await database
      .prepare("INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at) SELECT 'global', user_id, id, 'Chujek', 1, 'archer', 'Witam', 0 FROM characters WHERE id = ?")
      .bind(id)
      .run();
    const before = await call('GET', '/api/character', { cookie });
    assert.equal(before.data.character.nameBlocked, true);
    const again = await call('POST', '/api/character/name', { cookie, body: { name: 'Ch-uj' } });
    assert.equal(again.data.error.code, 'invalid_name');
    const renamed = await call('POST', '/api/character/name', { cookie, body: { name: 'Łuczniczka' } });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    assert.equal(renamed.data.character.name, 'Łuczniczka');
    assert.equal(renamed.data.character.nameBlocked, false);
    assert.equal((await database.prepare('SELECT name FROM chat_messages').first()).name, 'Łuczniczka');
    // The change the filter forced leaves the one change of the
    // Ustawienia, and after it the option locks.
    assert.equal(renamed.data.character.canRename, true);
    const chosen = await call('POST', '/api/character/name', { cookie, body: { name: 'Inna' } });
    assert.deepEqual([chosen.status, chosen.data.character.name, chosen.data.character.canRename], [200, 'Inna', false]);
    const again2 = await call('POST', '/api/character/name', { cookie, body: { name: 'Jeszcze Inna' } });
    assert.deepEqual([again2.status, again2.data.error.code, again2.data.error.message], [409, 'name_locked', content.chat.names.locked]);
  });

  test('any character changes its name once in the Ustawienia, then the option locks; a taken name is refused', async () => {
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Pierwsza', classId: 'mage', appearance: 'female' } })).status, 201);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.canRename, true);
    const second = await signUp('drugiimiennik');
    assert.equal((await call('POST', '/api/character', { cookie: second.cookie, body: { name: 'Zajeta', classId: 'mage', appearance: 'male' } })).status, 201);
    assert.equal((await call('POST', '/api/character/name', { cookie, body: { name: 'ZAJETA' } })).data.error.code, 'name_taken');
    assert.equal((await call('POST', '/api/character/name', { cookie, body: { name: 'Kurwiszon' } })).data.error.code, 'invalid_name');
    const changed = await call('POST', '/api/character/name', { cookie, body: { name: 'Druga' } });
    assert.deepEqual([changed.data.character.name, changed.data.character.canRename], ['Druga', false]);
    assert.equal((await call('POST', '/api/character/name', { cookie, body: { name: 'Trzecia' } })).data.error.code, 'name_locked');
  });
});

describe('the new names the System gives', () => {
  const { server, call, db, signUp } = useServer();
  const names = content.chat.names;
  const at = Date.parse(names.renameAt);
  const run = (when) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(when) });

  test('every name the System gives is allowed', () => {
    for (const name of [...names.generated.female, ...names.generated.male]) {
      assert.equal(blockedName(name, content), false, name);
      assert.match(name, /^\p{L}[\p{L} ]{1,19}$/u, name);
    }
  });

  test('from Monday 1:00 Polish time a blocked name gets a new one by the look, its messages too, and the player is told once', async () => {
    assert.equal(new Date(at).toISOString(), '2026-11-02T00:00:00.000Z');
    const { cookie } = await signUp('nazwany');
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Nazwany', classId: 'warrior', appearance: 'female' } })).status, 201);
    const database = await db();
    await database.prepare("UPDATE characters SET name = 'Skurwielka', name_key = 'skurwielka'").run();
    await database
      .prepare("INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at) SELECT 'global', user_id, id, name, 1, 'warrior', 'Witam', 0 FROM characters")
      .run();
    // Not before the hour, and only at the top of an hour.
    await run(at - 60000);
    await run(at + 60000);
    assert.equal((await database.prepare('SELECT name FROM characters').first()).name, 'Skurwielka');
    await run(at);
    const row = await database.prepare('SELECT name, name_notice FROM characters').first();
    assert.ok(names.generated.female.includes(row.name), row.name);
    assert.equal(row.name_notice, names.renamed.replace('{name}', row.name));
    assert.equal((await database.prepare('SELECT name FROM chat_messages').first()).name, row.name);
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.name, view.nameBlocked, view.nameNotice, view.canRename], [row.name, false, row.name_notice, true]);
    assert.equal((await call('POST', '/api/character/name/seen', { cookie })).data.character.nameNotice, null);
    // A later hour finds nothing more to rename.
    await run(at + 3600000);
    assert.equal((await database.prepare('SELECT name FROM characters').first()).name, row.name);
  });

  test('two blocked names of one look get two different names', async () => {
    for (const [login, name] of [['pierwszy', 'Kurwiszon'], ['drugi', 'Chujek']]) {
      const { cookie } = await signUp(login);
      assert.equal((await call('POST', '/api/character', { cookie, body: { name: `Gracz ${login}`, classId: 'archer', appearance: 'male' } })).status, 201);
      await (await db()).prepare('UPDATE characters SET name = ?, name_key = ? WHERE name = ?').bind(name, name.toLowerCase(), `Gracz ${login}`).run();
    }
    await run(at);
    const { results } = await (await db()).prepare('SELECT name FROM characters ORDER BY id').all();
    assert.equal(new Set(results.map((one) => one.name)).size, 2);
    assert.ok(results.every((one) => names.generated.male.includes(one.name)), JSON.stringify(results));
  });
});
