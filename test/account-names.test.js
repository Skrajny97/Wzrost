// The account's name for the chat (832 A, src/server/names.js and
// accounts.js setAccountName): chosen in the Ustawienia by the rules of a
// character's name, not shared by two players, changed at most once in 30
// days, and shown by the chat before the name of the character that writes.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const words = content.chat.accounts;

describe('the account name', () => {
  const { call, db, signUp } = useServer();

  // An account with a character of that name at the chat's level, the
  // chat's rules accepted.
  async function player(login, name) {
    const { cookie } = await signUp(login);
    assert.equal((await call('POST', '/api/character', { cookie, body: { name, classId: 'mage', appearance: 'female' } })).status, 201);
    await (await db()).prepare('UPDATE characters SET level = 5 WHERE name = ?').bind(name).run();
    await call('POST', '/api/chat/rules', { cookie });
    return cookie;
  }
  const choose = (cookie, name) => call('POST', '/api/account/name', { cookie, body: { name } });
  const me = async (cookie) => (await call('GET', '/api/me', { cookie })).data.user;
  let ala;

  beforeEach(async () => {
    ala = await player('ala', 'Radomira');
  });

  test('the first choice comes at once, then a change at most once in 30 days', async () => {
    const before = await me(ala);
    assert.deepEqual([before.accountName, before.accountNameFrom, before.accountNameHint], [null, 0, true]);
    const chosen = await choose(ala, '  Wędrowiec ');
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
    assert.equal(chosen.data.accountName, 'Wędrowiec');
    assert.ok(chosen.data.accountNameFrom > Date.now() + 29 * DAY && chosen.data.accountNameFrom < Date.now() + 31 * DAY);
    const after = await me(ala);
    assert.deepEqual([after.accountName, after.accountNameFrom, after.accountNameHint], ['Wędrowiec', chosen.data.accountNameFrom, false]);
    assert.equal((await choose(ala, 'Wędrowiec')).data.error.code, 'same_account_name');
    const locked = await choose(ala, 'Tułacz');
    assert.deepEqual([locked.status, locked.data.error.code], [409, 'account_name_locked']);
    assert.match(locked.data.error.message, /^Nazwę konta zmienisz od \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\.$/);
    // 30 days on, the next change.
    await (await db()).prepare('UPDATE users SET account_name_at = account_name_at - ?').bind(30 * DAY + 1000).run();
    const changed = await choose(ala, 'Tułacz');
    assert.deepEqual([changed.status, changed.data.accountName], [200, 'Tułacz']);
    // The old name is free again for anyone.
    const ola = await player('ola', 'Bogumiła');
    assert.equal((await choose(ola, 'wędrowiec')).status, 200);
  });

  test('the rules of a character name, and no name of another player', async () => {
    for (const [name, message] of [
      ['W', words.length],
      ['Wędro@wiec', words.sign.replace('{sign}', '@')],
      ['1Wędrowiec', words.start],
      ['Wędrowiec-', words.end],
      ['Kurw4', words.refused],
      // The rules of the security review of 12.11.2026: one alphabet, no
      // invisible signs.
      ['Wędroвiec', words.alphabet],
      ['Wędro\u3164wiec', words.invisible],
    ]) {
      const refused = await choose(ala, name);
      assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [400, 'invalid_name', message], name);
    }
    const ola = await player('ola', 'Bogumiła');
    assert.equal((await choose(ola, 'Zajęty')).status, 200);
    // Another account's name, or another player's character's, whatever the
    // letter case.
    for (const name of ['ZAJĘTY', 'bogumiła']) {
      const taken = await choose(ala, name);
      assert.deepEqual([taken.status, taken.data.error.code, taken.data.error.message], [409, 'account_name_taken', words.taken], name);
    }
    // The account's own character's name is its own.
    assert.equal((await choose(ala, 'radomira')).status, 200);
    // No character takes another account's name, new or renamed.
    const { cookie: ewa } = await signUp('ewa');
    const made = await call('POST', '/api/character', { cookie: ewa, body: { name: 'Zajęty', classId: 'mage', appearance: 'female' } });
    assert.deepEqual([made.status, made.data.error.code, made.data.error.message], [409, 'name_taken', words.takenByAccount]);
    const renamed = await call('POST', '/api/character/name', { cookie: ala, body: { name: 'zajęty' } });
    assert.deepEqual([renamed.status, renamed.data.error?.message], [409, words.takenByAccount]);
    // Its own account's name the character may take.
    assert.equal((await call('POST', '/api/character/name', { cookie: ola, body: { name: 'Zajęty' } })).status, 200);
  });

  test('no name that looks like another player\'s, of letters of another alphabet that look alike', async () => {
    // Ola's character is "Kapac", in Latin letters; "Карас" is all Cyrillic
    // and looks the same.
    const ola = await player('ola', 'Kapac');
    const lookAlike = await choose(ala, 'Карас');
    assert.deepEqual([lookAlike.status, lookAlike.data.error.code, lookAlike.data.error.message], [409, 'account_name_taken', words.taken]);
    // Ola's account name, and a look-alike of it for Ala's account or for a
    // character of another account.
    // "Нора" is all Cyrillic; "Hopa" is its Latin look-alike.
    assert.equal((await choose(ola, 'Нора')).status, 200);
    const accountLike = await choose(ala, 'Hopa');
    assert.deepEqual([accountLike.status, accountLike.data.error.code], [409, 'account_name_taken']);
    const { cookie: ewa } = await signUp('ewa');
    const made = await call('POST', '/api/character', { cookie: ewa, body: { name: 'Hopa', classId: 'mage', appearance: 'female' } });
    assert.deepEqual([made.status, made.data.error.code, made.data.error.message], [409, 'name_taken', words.takenByAccount]);
    // A name only of letters that differ goes.
    assert.equal((await choose(ala, 'Кошка')).status, 200);
  });

  test('the chat shows the account name before the character name; without one, the name alone', async () => {
    const ola = await player('ola', 'Bogumiła');
    assert.equal((await choose(ala, 'Wędrowiec')).status, 200);
    const sent = await call('POST', '/api/chat', { cookie: ala, body: { channel: 'global', text: 'Cześć!' } });
    assert.deepEqual([sent.status, sent.data.message.account, sent.data.message.name], [201, 'Wędrowiec', 'Radomira']);
    await (await db()).prepare('UPDATE chat_messages SET created_at = created_at - 10000').run();
    assert.equal((await call('POST', '/api/chat', { cookie: ola, body: { channel: 'global', text: 'Hej!' } })).status, 201);
    const read = await call('GET', '/api/chat?channel=global', { cookie: ola });
    assert.deepEqual(
      read.data.messages.map(({ account, name }) => [account, name]),
      [
        ['Wędrowiec', 'Radomira'],
        [null, 'Bogumiła'],
      ],
    );
    // A new name shows on the old messages too.
    await (await db()).prepare('UPDATE users SET account_name_at = 0').run();
    assert.equal((await choose(ala, 'Tułacz')).status, 200);
    assert.equal((await call('GET', '/api/chat?channel=global', { cookie: ola })).data.messages[0].account, 'Tułacz');
    // The account's name that is the character's own shows once; one the
    // filter blocks now shows not at all, and may change at once.
    await (await db()).prepare('UPDATE users SET account_name_at = 0').run();
    assert.equal((await choose(ala, 'RADOMIRA')).status, 200);
    assert.equal((await call('GET', '/api/chat?channel=global', { cookie: ola })).data.messages[0].account, null);
    await (await db()).prepare("UPDATE users SET account_name = 'Chujek', account_name_key = 'chujek' WHERE login = 'ala'").run();
    assert.equal((await call('GET', '/api/chat?channel=global', { cookie: ola })).data.messages[0].account, null);
    assert.equal((await me(ala)).accountNameFrom, 0);
    assert.equal((await choose(ala, 'Wędrowiec')).status, 200);
  });

  test('the chat tells once where to set the name', async () => {
    assert.equal((await me(ala)).accountNameHint, true);
    assert.deepEqual((await call('POST', '/api/account/name/hint', { cookie: ala })).data, { accountNameHint: false });
    assert.equal((await me(ala)).accountNameHint, false);
  });
});
