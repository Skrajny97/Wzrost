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
    // A name the filter lets through stays as it is.
    assert.equal((await call('POST', '/api/character/name', { cookie, body: { name: 'Inna' } })).data.error.code, 'name_allowed');
  });
});
