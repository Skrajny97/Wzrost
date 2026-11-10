// The Ranking in pages (the author, 10.11.2026: „Ranking max 50 postaci +
// przewijanie listy na dalsze pozycje strona po stronie”): the Ranking
// postaci and the guilds' one answer one page of at most 50 rows from an
// offset, with how many there are in all and the own place among all of
// them; a page asked for past the end comes as the last one. The page's
// turns (src/client/ranking-pages.js): the places shown, the pages before
// and after, and the one that holds the own place for "Moje miejsce".

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { rankingPage } from '../src/client/ranking-pages.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const PAGE = content.community.ranking.page;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('the pages of a ranking on the page', () => {
  test('the places shown, the turns at both ends and the page of the own place', () => {
    assert.equal(PAGE, 50);
    assert.deepEqual(rankingPage({ offset: 0, limit: 50, total: 121, place: 121 }), { from: 1, to: 50, previous: null, next: 50, mine: 100 });
    assert.deepEqual(rankingPage({ offset: 50, limit: 50, total: 121, place: 7 }), { from: 51, to: 100, previous: 0, next: 100, mine: 0 });
    assert.deepEqual(rankingPage({ offset: 100, limit: 50, total: 121, place: 100 }), { from: 101, to: 121, previous: 50, next: null, mine: 50 });
    // One page only: no turns; no place, no "Moje miejsce"; an empty list.
    assert.deepEqual(rankingPage({ offset: 0, limit: 50, total: 50, place: 50 }), { from: 1, to: 50, previous: null, next: null, mine: 0 });
    assert.deepEqual(rankingPage({ offset: 0, limit: 50, total: 51, place: null }), { from: 1, to: 50, previous: null, next: 50, mine: null });
    assert.deepEqual(rankingPage({ offset: 0, limit: 50, total: 0 }), { from: 0, to: 0, previous: null, next: null, mine: null });
  });
});

describe('the Ranking in pages through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  // `count` characters made straight in the database, each on its own
  // account, at the levels from `top` down, one a level.
  async function crowd(count, top) {
    const database = await db();
    const now = Date.now();
    const statements = [];
    for (let index = 0; index < count; index += 1) {
      statements.push(database.prepare('INSERT INTO users (login, password_hash, created_at) VALUES (?, ?, ?)').bind(`tlum${index}`, 'x', now));
      statements.push(
        database
          .prepare("INSERT INTO characters (user_id, role, name, name_key, class_id, level, position, hp, hp_at, created_at) VALUES (last_insert_rowid(), 'player', ?, ?, 'warrior', ?, 'front', 100, ?, ?)")
          .bind(`Tlum${index}`, `tlum${index}`, top - index, now, now),
      );
    }
    await database.batch(statements);
  }
  const ranking = async (query = '') => (await call('GET', `/api/ranking${query}`, { cookie })).data;
  const places = (answer) => answer.rows.map((row) => row.place);

  beforeEach(async () => {
    ({ cookie } = await signUp('Ala'));
    await call('POST', '/api/character', { cookie, body: { name: 'Ala', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 40, class_level = 30, gold = 5000 WHERE name = 'Ala'").run();
  });

  test('the characters come 50 a page, with how many there are and the own place among all', async () => {
    await crowd(120, 200);
    const first = await ranking();
    assert.deepEqual([first.by, first.offset, first.limit, first.total, first.place], ['level', 0, PAGE, 121, 121]);
    assert.deepEqual(places(first), range(1, 50));
    assert.deepEqual([first.rows[0].name, first.rows[0].level], ['Tlum0', 200]);
    const second = await ranking('?offset=50');
    assert.deepEqual(places(second), range(51, 100));
    assert.equal(second.rows[0].name, 'Tlum50');
    // The last page, with the own row lit at its end.
    const last = await ranking('?offset=100');
    assert.deepEqual(places(last), range(101, 121));
    assert.deepEqual(
      last.rows.slice(-2).map(({ name, own }) => [name, own]),
      [
        ['Tlum119', false],
        ['Ala', true],
      ],
    );
    assert.equal(last.rows.filter((row) => row.own).length, 1);
    // Past the end: the last page. A smaller page when asked; never more
    // than 50, and nonsense is the first page of 50.
    const past = await ranking('?offset=500');
    assert.deepEqual([past.offset, past.rows.length, past.rows.at(-1).name], [100, 21, 'Ala']);
    assert.deepEqual(places(await ranking('?offset=10&limit=10')), range(11, 20));
    assert.equal((await ranking('?limit=500')).rows.length, PAGE);
    for (const query of ['?limit=0', '?offset=-5', '?offset=abc&limit=x', '?offset=1.5']) {
      const answer = await ranking(query);
      assert.deepEqual([answer.offset, answer.limit, answer.rows[0].place], [0, PAGE, 1], query);
    }
  });

  test('every order pages the same way, the profession\'s among those who worked only', async () => {
    await crowd(60, 100);
    const database = await db();
    await database.prepare("UPDATE characters SET class_level = 90 WHERE name = 'Ala'").run();
    const byClass = await ranking('?by=class');
    assert.deepEqual([byClass.by, byClass.total, byClass.place, byClass.rows[0].name], ['class', 61, 1, 'Ala']);
    assert.deepEqual(places(await ranking('?by=class&offset=50')), range(51, 61));
    // Three characters worked in a profession.
    await database.prepare("UPDATE characters SET professions = '{\"herbalism\":{\"level\":4,\"xp\":0}}' WHERE name IN ('Tlum0', 'Tlum1', 'Ala')").run();
    const byProfession = await ranking('?by=profession');
    assert.deepEqual([byProfession.total, byProfession.place, places(byProfession)], [3, 3, [1, 2, 3]]);
    assert.deepEqual((await ranking('?by=profession&offset=50')).rows.map((row) => row.place), [1, 2, 3]);
  });

  test('the guilds come 50 a page too, with the own guild\'s place among all and last week\'s best tag', async () => {
    const database = await db();
    const now = Date.now();
    await database.batch(
      range(1, 55).map((index) => database.prepare('INSERT INTO guilds (name, name_key, tag, created_at) VALUES (?, ?, ?, ?)').bind(`Gildia ${index}`, `gildia ${index}`, `G${index}`, now)),
    );
    assert.equal((await call('POST', '/api/guild/found', { cookie, body: { name: 'Leśni Bracia', tag: 'LB' } })).status, 200);
    const guilds = async (query = '') => (await call('GET', `/api/ranking/guilds${query}`, { cookie })).data;
    // No Sława anywhere: of two with as much, the older first, so the own
    // guild, the newest, stands last.
    const first = await guilds();
    assert.deepEqual([first.period, first.offset, first.limit, first.total, first.place], ['week', 0, PAGE, 56, 56]);
    assert.deepEqual(places(first), range(1, 50));
    assert.ok(Object.hasOwn(first, 'championTag'));
    const second = await guilds('?offset=50');
    assert.deepEqual(places(second), range(51, 56));
    assert.deepEqual(
      second.rows.at(-1),
      { place: 56, id: second.rows.at(-1).id, name: 'Leśni Bracia', tag: 'LB', members: 1, fame: 0, own: true },
    );
    assert.equal((await guilds('?offset=900')).offset, 50);
    assert.deepEqual(places(await guilds('?period=all&offset=50&limit=3')), [51, 52, 53]);
  });
});
