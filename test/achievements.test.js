// Osiągnięcia z tytułami (1030; 1036.1–1036.2 accepted, the title only in
// the profile and the Ranking: 1036.3 B): the window's counts from what the
// character has, each achievement given once with its reward at a look, its
// title to wear, and the counts kept from the version that brought them.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import achievementsData from '../data/achievements.json' with { type: 'json' };
import englishAchievements from '../data/en/achievements.json' with { type: 'json' };
import professionsData from '../data/professions.json' with { type: 'json' };
import { achievementFact } from '../src/engine/achievements.js';
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

  test('41 in their groups, none done at first, with the words of the counts that begin now', async () => {
    const { achievements, fresh } = await look();
    // 24, Andrzejki's (1084 A), Nawia's explorer, the Kram Gildii's
    // Strażnik Sztandaru (1202 A) and the 14 smaller ones of the Profesje
    // (20.11.2026).
    assert.equal(all(achievements).length, 41);
    assert.equal(achievements.groups.find((group) => group.id === 'professions').list.length, 17);
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
    // Górnictwo at 120 and Rybołówstwo at 60: the best profession's four,
    // the Górnik's and the Rybak's.
    assert.deepEqual(done, ['apprentice', 'bald-explorer', 'craftsman', 'fisher', 'journeyman', 'master-craft', 'miner', 'veteran', 'wanderer']);
    assert.deepEqual(first.fresh.map((one) => one.name).sort(), ['Czeladnik', 'Fachowiec', 'Górnik', 'Mistrz rzemiosła', 'Odkrywca Łysogór', 'Rybak', 'Terminator', 'Weteran', 'Wędrowiec']);
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

  // Two achievements of one count, each of its own land: below the 276th
  // level the Łysogóry's explorer only, from it Nawia's too.
  test('the explorers of the Łysogóry and of Nawia each count their own land', async () => {
    const levelTo = async (level) => (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Wytrwała'").bind(level).run();
    const explorers = (view) => ['bald-explorer', 'nav-explorer'].map((id) => [id, find(view.achievements, id).done]);
    await levelTo(275);
    assert.deepEqual(explorers(await look()), [['bald-explorer', true], ['nav-explorer', false]]);
    await levelTo(276);
    const reached = await look();
    assert.deepEqual(explorers(reached), [['bald-explorer', true], ['nav-explorer', true]]);
    assert.deepEqual(reached.fresh.map((one) => one.name), ['Odkrywca Nawii']);
    assert.equal(find(reached.achievements, 'nav-explorer').title, 'Odkrywczyni Nawii');
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

  // The smaller achievements of the Profesje (20.11.2026): the best
  // profession at 10, 25 and 50, many professions at 10 and 25, and each
  // profession at 25, each counting its own (professionLevel).
  test('the smaller ones of the Profesje: their counts, each given once with its reward', async () => {
    const database = await db();
    const timePoints = async () => (await database.prepare("SELECT time_points FROM characters WHERE name = 'Wytrwała'").first()).time_points;
    const professionsAre = (levels) => database.prepare("UPDATE characters SET professions = ? WHERE name = 'Wytrwała'").bind(JSON.stringify(levels)).run();
    const profession = (view) => view.achievements.groups.find((group) => group.id === 'professions').list;
    const counts = (view) => Object.fromEntries(profession(view).map((one) => [one.id, [one.count, one.done]]));
    await professionsAre({ herbalism: { level: 10, xp: 0 }, alchemy: { level: 10, xp: 0 }, crafting: { level: 25, xp: 40 }, mining: { level: 9, xp: 0 }, jewelcrafting: { level: 30, xp: 0 } });
    const before = await timePoints();
    const first = await look();
    assert.deepEqual(counts(first), {
      apprentice: [10, true],
      journeyman: [25, true],
      craftsman: [30, false],
      'master-craft': [30, false],
      'many-hands': [4, true],
      'little-of-everything': [4, false],
      'many-trades': [2, false],
      handy: [0, false],
      versatile: [0, false],
      herbalist: [10, false],
      alchemist: [10, false],
      artisan: [25, true],
      miner: [9, false],
      jeweller: [25, true],
      fisher: [0, false],
      farmer: [0, false],
      cook: [0, false],
    });
    assert.deepEqual(first.fresh.map((one) => one.name), ['Terminator', 'Czeladnik', 'Na wiele rąk', 'Rzemieślnik', 'Jubiler']);
    assert.deepEqual(first.fresh.map((one) => one.title), ['Terminatorka', 'Czeladniczka', 'Zaradna', 'Rzemieślniczka', 'Jubilerka']);
    assert.equal((await timePoints()) - before, 10 + 20 + 15 + 15 + 15);
    // Given once.
    assert.deepEqual((await look()).fresh, []);
    assert.equal((await timePoints()) - before, 75);
    // Every profession at 25: the rest of those at 10 and 25, and each
    // profession's own; the best one is still below 50.
    await professionsAre(Object.fromEntries(['herbalism', 'alchemy', 'crafting', 'mining', 'jewelcrafting', 'fishing', 'farming', 'cooking'].map((id) => [id, { level: 25, xp: 0 }])));
    const second = await look();
    assert.deepEqual(second.fresh.map((one) => one.name), ['Wszystkiego po trochu', 'Wiele fachów', 'Zielarz', 'Alchemik', 'Górnik', 'Rybak', 'Rolnik', 'Kucharz']);
    assert.equal((await timePoints()) - before, 75 + 25 + 40 + 6 * 15);
    assert.deepEqual(
      profession(second).filter((one) => !one.done).map((one) => one.id),
      ['craftsman', 'master-craft', 'handy', 'versatile'],
    );
    // A title of one, worn.
    const worn = await call('POST', '/api/achievements/title', { cookie, body: { id: 'cook' } });
    assert.equal(worn.data.achievements.worn, 'Kucharka');
  });
});

// The data: ids and titles of their own in both languages, and each
// profession's achievement at 25 counting its own profession.
describe('the achievements in the data', () => {
  test('ids and titles of their own, Polish and English; one at 25 for each profession', () => {
    const polish = achievementsData.groups.flatMap((group) => group.list);
    const english = Object.values(englishAchievements.groups).flatMap((group) => Object.entries(group.list).map(([id, one]) => ({ id, ...one })));
    assert.equal(new Set(polish.map((one) => one.id)).size, polish.length);
    assert.deepEqual(english.map((one) => one.id).sort(), polish.map((one) => one.id).sort());
    for (const list of [polish, english]) {
      const titles = list.flatMap((one) => [...new Set(one.title)]);
      assert.equal(new Set(titles).size, titles.length);
    }
    const single = polish.filter((one) => one.count === 'professionLevel');
    assert.deepEqual(
      single.map((one) => [one.profession, one.target, one.reward.timePoints]),
      professionsData.professions.map((one) => [one.id, 25, 15]),
    );
    assert.deepEqual(single.map(achievementFact), professionsData.professions.map((one) => `professionLevel:${one.id}`));
  });
});
