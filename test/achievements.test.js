// Osiągnięcia z tytułami (1030; 1036.1–1036.2 accepted, the title only in
// the profile and the Ranking: 1036.3 B): the window's counts from what the
// character has, each achievement given once with its reward at a look, its
// title to wear, and the counts kept from the version that brought them.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { featGains } from '../src/server/achievements.js';
import { useServer } from './helpers/server.js';

describe('the achievements (1036)', () => {
  const { call, db, signUp } = useServer();
  let cookie;
  const all = (view) => view.groups.flatMap((group) => group.list);
  const find = (view, id) => all(view).find((one) => one.id === id);
  const look = async () => (await call('GET', '/api/achievements', { cookie })).data;
  const points = async () => (await (await db()).prepare("SELECT system_points FROM characters WHERE name = 'Wytrwała'").first()).system_points;

  beforeEach(async () => {
    ({ cookie } = await signUp('osiagi'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wytrwała', classId: 'mage', appearance: 'female' } });
  });

  test('24 in their groups, none done at first, with the words of the counts that begin now', async () => {
    const { achievements, fresh } = await look();
    assert.equal(all(achievements).length, 24);
    assert.deepEqual(fresh, []);
    assert.ok(all(achievements).every((one) => !one.done));
    assert.ok(achievements.since.length > 0);
    assert.equal(find(achievements, 'veteran').title, 'Weteranka');
    assert.equal(find(achievements, 'first-blood').since, true);
    assert.equal(find(achievements, 'veteran').since, false);
  });

  test('done from what the character has, given once with the reward; its title worn in the profile and the Ranking', async () => {
    await (await db()).prepare("UPDATE characters SET level = 201, professions = ? WHERE name = 'Wytrwała'").bind(JSON.stringify({ mining: { level: 120, xp: 0 }, fishing: { level: 60, xp: 0 } })).run();
    const before = await points();
    const first = await look();
    const done = all(first.achievements).filter((one) => one.done).map((one) => one.id).sort();
    assert.deepEqual(done, ['bald-explorer', 'master-craft', 'veteran', 'wanderer']);
    assert.deepEqual(first.fresh.map((one) => one.name).sort(), ['Mistrz rzemiosła', 'Odkrywca Łysogór', 'Weteran', 'Wędrowiec']);
    assert.equal((await points()) - before, 10);
    // Given once.
    const again = await look();
    assert.deepEqual(again.fresh, []);
    assert.equal((await points()) - before, 10);
    // A title of one given, worn; another not given, refused.
    assert.equal((await call('POST', '/api/achievements/title', { cookie, body: { id: 'gladiator' } })).data.error.code, 'invalid_title');
    const worn = await call('POST', '/api/achievements/title', { cookie, body: { id: 'veteran' } });
    assert.deepEqual([worn.data.achievements.worn, worn.data.achievements.wornId], ['Weteranka', 'veteran']);
    assert.equal((await call('GET', '/api/profile/Wytrwała', { cookie })).data.profile.title, 'Weteranka');
    const row = (await call('GET', '/api/ranking', { cookie })).data.rows.find((one) => one.name === 'Wytrwała');
    assert.equal(row.title, 'Weteranka');
    // And taken off.
    assert.equal((await call('POST', '/api/achievements/title', { cookie, body: { id: null } })).data.achievements.worn, null);
    assert.equal((await call('GET', '/api/profile/Wytrwała', { cookie })).data.profile.title, null);
  });

  test('the counts kept from now on: creatures, champions, gold and the rest add up', async () => {
    const database = await db();
    const { id } = await database.prepare("SELECT id FROM characters WHERE name = 'Wytrwała'").first();
    for (const statement of featGains(database, id, { monsters: 60, champions: 2, gold: 900 })) await statement.run();
    for (const statement of featGains(database, id, { monsters: 45, gold: 0 })) await statement.run();
    const { achievements, fresh } = await look();
    assert.equal(find(achievements, 'beast-slayer').count, 105);
    assert.equal(find(achievements, 'champion-slayer').count, 2);
    assert.equal(find(achievements, 'rich').count, 900);
    assert.deepEqual(fresh.map((one) => one.name), ['Pierwsza krew']);
    assert.equal(find(achievements, 'first-blood').done, true);
  });
});
