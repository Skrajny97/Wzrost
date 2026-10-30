// Five characters on one account (DECISIONS.md, "Pięć postaci na koncie"):
// the player plays one and the others wait aside, their explorations going
// on (176 A); characters of one account never trade nor befriend (177 A);
// each keeps its own Punkty Systemu (178 A).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe('five characters on one account', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const create = (name, classId = 'warrior', who = cookie) => call('POST', '/api/character', { cookie: who, body: { name, classId, appearance: 'female' } });
  const list = async (who = cookie) => (await call('GET', '/api/characters', { cookie: who })).data;
  const played = async (who = cookie) => (await call('GET', '/api/character', { cookie: who })).data.character;
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  const choose = async (name, who = cookie) => call('POST', '/api/characters/choose', { cookie: who, body: { id: await idOf(name) } });

  beforeEach(async () => {
    ({ cookie } = await signUp('wielu'));
  });

  test('a new character sets the one played aside, whose exploration goes on, and the player chooses between them', async () => {
    assert.equal((await create('Mira')).status, 201);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal((await create('Druga', 'mage')).status, 201);
    assert.equal((await played()).name, 'Druga');
    const both = await list();
    assert.equal(both.max, 5);
    assert.equal(both.parked, null);
    assert.deepEqual(
      both.characters.map(({ name, className, level, played: now }) => ({ name, className, level, now })),
      [
        { name: 'Mira', className: 'Wojownik', level: 1, now: false },
        { name: 'Druga', className: 'Mag', level: 1, now: true },
      ],
    );
    // The exploration of the character set aside goes on.
    assert.equal(both.characters[0].activity.kind, 'hunt');
    assert.equal(both.characters[0].activity.finished, false);
    assert.equal(both.characters[1].activity, null);

    assert.equal((await choose('Mira')).status, 200);
    const back = await played();
    assert.equal(back.name, 'Mira');
    assert.equal(back.activity.kind, 'hunt');
    assert.deepEqual((await list()).characters.map((character) => character.played), [true, false]);
    // The character played already: nothing changes.
    assert.equal((await choose('Mira')).status, 200);
    // Another account's character cannot be chosen.
    const { cookie: other } = await signUp('obcy');
    await create('Obca', 'archer', other);
    assert.equal((await choose('Obca')).data.error.code, 'no_character');
    assert.equal((await played(other)).name, 'Obca');
  });

  test('five at most; a name stays its character\'s while it waits aside, too', async () => {
    for (const name of ['Jeden', 'Dwa', 'Trzy', 'Cztery']) assert.equal((await create(name)).status, 201);
    // A name taken, also by a character of one's own set aside: the
    // character played stays as it was.
    assert.equal((await create('Jeden')).data.error.code, 'name_taken');
    assert.equal((await played()).name, 'Cztery');
    const { cookie: other } = await signUp('drugi');
    assert.equal((await create('Dwa', 'mage', other)).data.error.code, 'name_taken');
    assert.equal((await create('Pięć')).status, 201);
    const full = await create('Sześć');
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'characters_full');
    assert.equal(full.data.error.message, 'Masz już 5 postaci. Usuń jedną z nich, żeby stworzyć nową.');
    assert.equal((await list()).characters.length, 5);
    assert.equal((await played()).name, 'Pięć');
    // Removing one makes room again.
    await call('DELETE', '/api/character', { cookie });
    assert.equal((await create('Sześć')).status, 201);
    assert.deepEqual((await list()).characters.map((character) => character.name), ['Jeden', 'Dwa', 'Trzy', 'Cztery', 'Sześć']);
  });

  test('removing the character played leaves the others aside to choose from', async () => {
    await create('Mira');
    await create('Druga');
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    assert.equal((await call('GET', '/api/character', { cookie })).data.error.code, 'no_character');
    assert.deepEqual((await list()).characters.map((character) => [character.name, character.played]), [['Mira', false]]);
    // Punkty Systemu earned meanwhile come with the one chosen.
    await (await db()).prepare('UPDATE users SET system_points_waiting = 10').run();
    assert.equal((await choose('Mira')).status, 200);
    assert.equal((await played()).systemPoints, 10);
    assert.equal((await (await db()).prepare('SELECT system_points_waiting AS waiting FROM users').first()).waiting, 0);
  });

  test("the list counts the game's characters of each class, those set aside too", async () => {
    await create('Mira');
    await create('Druga', 'mage');
    const { cookie: other } = await signUp('inny');
    await create('Obca', 'mage', other);
    assert.deepEqual((await list()).classes, { warrior: 1, archer: 0, mage: 2, cleric: 0, shadow: 0 });
  });

  test('each character keeps its own Punkty Systemu', async () => {
    await create('Mira');
    await (await db()).prepare("UPDATE characters SET system_points = 25 WHERE name = 'Mira'").run();
    await create('Druga');
    assert.equal((await played()).systemPoints, 0);
    await choose('Mira');
    assert.equal((await played()).systemPoints, 25);
  });

  test('the Ranking and the profiles show the characters set aside; one account\'s characters neither trade, befriend nor write to each other', async () => {
    await create('Mira');
    await create('Druga');
    const { cookie: other } = await signUp('sasiad');
    await create('Sąsiad', 'archer', other);
    await (await db()).prepare('UPDATE characters SET level = 6').run();
    const ranking = (await call('GET', '/api/ranking', { cookie: other })).data;
    assert.deepEqual(ranking.rows.map((row) => row.name).sort(), ['Druga', 'Mira', 'Sąsiad']);
    // The profile of one's own character set aside, with no actions.
    const own = (await call('GET', `/api/profile/${encodeURIComponent('Mira')}`, { cookie })).data.profile;
    assert.equal(own.name, 'Mira');
    assert.equal(own.classId, 'warrior');
    assert.deepEqual(own.relation, { state: 'self' });
    // Another player's look at it: as at any character.
    assert.equal((await call('GET', `/api/profile/${encodeURIComponent('Mira')}`, { cookie: other })).data.profile.relation, null);

    const invited = await call('POST', '/api/friends/invite', { cookie, body: { name: 'Mira' } });
    assert.equal(invited.data.error.code, 'self');
    assert.equal((await call('POST', '/api/trade/propose', { cookie, body: { id: await idOf('Mira') } })).data.error.code, 'own');
    assert.equal((await call('POST', '/api/chat', { cookie, body: { with: await idOf('Mira'), text: 'Hej' } })).data.error.code, 'self');

    // Another player trades only with the character played, while online.
    await call('GET', '/api/chat/latest', { cookie });
    assert.equal((await call('POST', '/api/trade/propose', { cookie: other, body: { id: await idOf('Mira') } })).data.error.code, 'offline');
    const proposed = await call('POST', '/api/trade/propose', { cookie: other, body: { id: await idOf('Druga') } });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    // Switching ends the live trade of the character set aside.
    await choose('Mira');
    const { state } = await (await db()).prepare('SELECT state FROM trades').first();
    assert.equal(state, 'expired');
    // A friend invitation to a character set aside waits for it.
    assert.equal((await call('POST', '/api/friends/invite', { cookie: other, body: { name: 'Druga' } })).status, 200);
    await choose('Druga');
    assert.deepEqual((await call('GET', '/api/friends', { cookie })).data.incoming.map((person) => person.name), ['Sąsiad']);
  });

  test('on the test version the introduction\'s character keeps its place until the parked one is back', async () => {
    await create('Mira');
    await create('Druga');
    assert.equal((await call('POST', '/api/test/introduction', { cookie })).status, 200);
    assert.equal((await list()).parked, 'Druga');
    assert.equal((await create('Testowa')).status, 201);
    // The parked character is not one of the game's characters to count.
    assert.equal((await list()).classes.warrior, 2);
    assert.equal((await choose('Mira')).data.error.code, 'parked');
    assert.equal((await create('Kolejna')).data.error.code, 'parked');
    assert.equal((await call('POST', '/api/test/back', { cookie })).status, 200);
    assert.equal((await played()).name, 'Druga');
    assert.deepEqual((await list()).characters.map((character) => character.name), ['Mira', 'Druga']);
  });
});
