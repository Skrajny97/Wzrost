// The Wieże Systemu (src/engine/towers.js, src/server/towers.js): the floors
// of a climb, the creatures of every land in turn at the floor's level,
// elites and champions on the fifth and tenth floors, the top open to a
// party; an entry's fight and its pay; and the towers through the API,
// from level 50, with the entries of a day, the chest of a tenth floor
// once, the Wieża Drużyn with a Drużyna, never on an exploration.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { towerArea, towerFight, towerFloor, towerTop } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the Wieże Systemu', () => {
  test('the highest floor open is the lowest level in the party', () => {
    assert.equal(towerTop([30]), 30);
    assert.equal(towerTop([30, 26, 41]), 26);
  });

  test('a floor holds one inner region\'s creatures at its level, the regions in turn from the first', () => {
    const { areas } = content;
    assert.equal(towerArea(1, content).id, areas[0].id);
    assert.equal(towerArea(2, content).id, areas[1].id);
    assert.equal(towerArea(areas.length + 1, content).id, areas[0].id);
    const floor = towerFloor(3, 'climb', content);
    assert.equal(floor.level, 3);
    assert.equal(floor.areaId, areas[2].id);
    const living = new Set(areas[2].encounters.flatMap((encounter) => encounter.monsters));
    assert.ok(floor.encounter.members.every((member) => member.level === 3 && living.has(member.monsterId)));
    assert.deepEqual(towerFloor(3, 'climb', content), floor);
  });

  test('every fifth floor an elite, every tenth a champion, and elites now and then on other floors', () => {
    for (let floor = 5; floor <= 200; floor += 5) {
      const { encounter } = towerFloor(floor, 'climb', content);
      const area = towerArea(floor, content);
      if (floor % 10 === 0 && area.champion) assert.equal(encounter.members[0].monsterId, area.champion, `floor ${floor}`);
      else if (area.elite) assert.equal(encounter.members[0].monsterId, area.elite, `floor ${floor}`);
    }
    const others = Array.from({ length: 1000 }, (_, index) => index + 1).filter((floor) => floor % 5 !== 0);
    const elites = others.filter((floor) => towerFloor(floor, 'climb', content).encounter.elite).length;
    assert.ok(elites > others.length * 0.05 && elites < others.length * 0.2, `${elites}`);
  });
});

describe('an entry\'s fight', () => {
  const character = newCharacter('warrior', { level: 60, classLevel: 50 });

  test('a won floor pays as a fight of an hour\'s exploration, an elite and a champion as a regular creature', () => {
    const won = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 3, seed: 'a' }, content);
    assert.equal(won.tower.won, true);
    assert.equal(won.result, 'success');
    assert.ok(won.xp > 0 && won.gold > 0);
    assert.equal(won.fights.length, 1);
    assert.equal(won.areaId, towerArea(3, content).id);
    // The same seed, the same fight.
    assert.deepEqual(towerFight({ character, equipped: [], name: 'Wspinacz', floor: 3, seed: 'a' }, content), won);
    // A champion floor: no champion's multiplier on the pay.
    const champion = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 10, seed: 'b' }, content);
    assert.equal(champion.fights[0].champion, true);
    const monster = content.monstersById[champion.fights[0].enemies[0].monsterId];
    const { xpBase, xpExponent } = content.balance.rewards;
    const regular = xpBase * 10 ** xpExponent * monster.reward.xp;
    assert.ok(champion.xp < regular * 2, `${champion.xp} vs ${regular}`);
  });

  test('the chest comes only when asked, with an item of the character\'s class it can wear', () => {
    const none = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 10, seed: 'c' }, content);
    assert.equal(none.items.length, 0);
    const chest = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 10, seed: 'c', chest: true }, content);
    assert.equal(chest.items.length, 1);
    const [item] = chest.items;
    assert.equal(item.level, 10);
    assert.ok(content.rarities.findIndex((rarity) => rarity.id === item.rarity) >= content.rarities.findIndex((rarity) => rarity.id === 'epic'));
  });

  test('a lost floor pays nothing and costs no XP', () => {
    const weak = newCharacter('mage', { level: 1, classLevel: 1 });
    const lost = towerFight({ character: weak, equipped: [], name: 'Słaby', floor: 60, seed: 'd' }, content);
    assert.equal(lost.tower.won, false);
    assert.equal(lost.result, 'escaped');
    assert.equal(lost.xp, 0);
    assert.equal(lost.gold, 0);
    assert.deepEqual(lost.items, []);
  });
});

describe('the Wieże through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();

  async function player(login, name, level = 60) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = 50 WHERE name = ?').bind(level, name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const enter = (login, body) => as(login, 'POST', '/api/towers/enter', body);

  beforeEach(async () => {
    await player('wspinacz', 'Wspinacz');
  });

  test('the Wieże open at character level 50', async () => {
    await set('level = 49');
    const locked = await as('wspinacz', 'GET', '/api/towers');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).data.error.code, 'locked');
  });

  test('an entry fights one floor and brings its report at once; floors go up to the character\'s level', async () => {
    const { towers } = (await as('wspinacz', 'GET', '/api/towers')).data;
    assert.equal(towers.left, content.towers.entries.perDay);
    assert.equal(towers.cycle.length, content.areas.length);
    const solo = towers.towers.find((tower) => tower.id === 'solo');
    assert.equal(solo.top, 60);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 61 })).data.error.code, 'invalid_floor');
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 0 })).data.error.code, 'invalid_floor');
    assert.equal((await enter('wspinacz', { tower: 'none', floor: 1 })).data.error.code, 'invalid_tower');
    const entered = await enter('wspinacz', { tower: 'solo', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const { report } = entered.data;
    assert.equal(report.kind, 'tower');
    assert.equal(report.tower.floor, 1);
    assert.equal(report.fights.length, 1);
    assert.equal(entered.data.towers.left, content.towers.entries.perDay - 1);
    // The creatures fought are in the Bestiariusz, and the report in the Dziennik.
    const row = await (await db()).prepare('SELECT met, towers FROM characters').first();
    const met = JSON.parse(row.met);
    assert.ok(report.fights[0].enemies.every((enemy) => met.includes(enemy.monsterId)));
    assert.equal(JSON.parse(row.towers).best.solo, report.tower.won ? 1 : 0);
    const journal = (await as('wspinacz', 'GET', '/api/reports')).data.reports;
    assert.equal(journal[0].kind, 'tower');
    assert.equal(journal[0].tower.floor, 1);
  });

  test('the entries of a day run out and come back from midnight', async () => {
    const today = (await as('wspinacz', 'GET', '/api/towers')).data;
    assert.ok(today.towers.left > 0);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: content.quests.timeZone }).format(new Date());
    await set('towers = ?', JSON.stringify({ day, used: content.towers.entries.perDay }));
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).data.error.code, 'no_entries');
    await set('towers = ?', JSON.stringify({ day: '2020-01-01', used: content.towers.entries.perDay }));
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).status, 200);
  });

  test('a tenth floor won the first time brings the chest, once in each tower', async () => {
    let first = null;
    for (let i = 0; i < 5 && !first?.tower.won; i++) first = (await enter('wspinacz', { tower: 'solo', floor: 10 })).data.report;
    assert.equal(first.tower.won, true, 'the floor is won');
    assert.equal(first.items.length, 1);
    const items = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM items').first()).count;
    const before = await items();
    let again = null;
    for (let i = 0; i < 5 && !again?.tower.won; i++) again = (await enter('wspinacz', { tower: 'solo', floor: 10 })).data.report;
    assert.equal(again.tower.won, true);
    assert.equal(again.items.length, 0);
    assert.equal(await items(), before);
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT towers FROM characters').first()).towers).chests.solo, [10]);
  });

  test('the Wieża Drużyn needs a Drużyna of two players; the lowest of them sets the top', async () => {
    const shut = await enter('wspinacz', { tower: 'party', floor: 1 });
    assert.equal(shut.data.error.code, 'no_party');
    await player('druh', 'Druh', 40);
    const { data } = await as('wspinacz', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const party = (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');
    assert.equal(party.missing, null);
    assert.equal(party.top, 40);
    assert.deepEqual(party.partners.map((partner) => partner.name), ['Druh']);
    assert.equal((await enter('wspinacz', { tower: 'party', floor: 41 })).data.error.code, 'invalid_floor');
    const entered = await enter('wspinacz', { tower: 'party', floor: 5 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.deepEqual(entered.data.report.tower.partners, ['Druh']);
    assert.ok(entered.data.report.fights[0].allies.some((unit) => unit.name === 'Druh'));
  });

  test('no climb on an exploration or before its report: the report is made with the character as it is then', async () => {
    assert.equal((await as('wspinacz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'busy');
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000').run();
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'claim_first');
    let claimed = await as('wspinacz', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('wspinacz', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200);
    // Home again: in it goes, and its HP stays.
    const before = await (await db()).prepare('SELECT hp, hp_at, level FROM characters').first();
    const entered = await enter('wspinacz', { tower: 'solo', floor: 2 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const after = await (await db()).prepare('SELECT hp, hp_at, level FROM characters').first();
    if (after.level === before.level) assert.deepEqual(after, before);
  });
});
