// The Wieże Systemu (src/engine/towers.js, src/server/towers.js): the floors
// of a climb, the creatures of every land in turn at the floor's level,
// elites on the fifth floors of every other lap of the regions and
// champions on the fifteenth, every creature somewhere, the top open to a
// party; an entry's fight and its pay, the champion's trophy only at the
// first win of its floor; and the towers through the API, from level 50,
// with the entries of a day, the chest of a tenth floor once, the trophy
// once, the Wieża Drużyn with a Drużyna, never on an exploration, and
// their reports kept in the Dziennik apart from the explorations'.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaDangers, createRng, encountersFor, materialDrops, parseStack, towerArea, towerEliteFloor, towerFight, towerFloor, towerTop } from '../src/engine/index.js';
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

  test('every fifth floor an elite only in every other lap of the regions (484 A), every fifteenth a champion in every lap (342 A), and elites now and then on other floors', () => {
    const lap = (floor) => Math.floor((floor - 1) / content.areas.length);
    for (let floor = 5; floor <= 400; floor += 5) {
      const { encounter } = towerFloor(floor, 'climb', content);
      const area = towerArea(floor, content);
      // The first lap as before, the next one without, and so on in turn.
      assert.equal(towerEliteFloor(floor, content), lap(floor) % 2 === 0, `floor ${floor}`);
      if (floor % 15 === 0 && area.champion) assert.equal(encounter.members[0].monsterId, area.champion, `floor ${floor}`);
      else if (lap(floor) % 2 === 0 && area.elite) assert.equal(encounter.members[0].monsterId, area.elite, `floor ${floor}`);
    }
    // A lap is as long as the inner regions are many (25 with the Czarne
    // Bagno), so the floors of each lap follow from the data.
    const regions = content.areas.length;
    const fifths = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index).filter((floor) => floor % 5 === 0);
    assert.ok(fifths(1, regions).every((floor) => towerEliteFloor(floor, content)), 'the first lap keeps its elites');
    assert.ok(fifths(regions + 1, 2 * regions).every((floor) => !towerEliteFloor(floor, content)), 'the second lap has none');
    assert.ok(fifths(2 * regions + 1, 3 * regions).every((floor) => towerEliteFloor(floor, content)), 'the third lap has them again');
    assert.equal([1, 2, 3, 4, regions + 1, regions + 4, 2 * regions + 1].some((floor) => towerEliteFloor(floor, content)), false);
    // In the laps between, a fifth floor (not a champion's) is a usual floor
    // of its region: its creatures, an elite only now and then.
    const usual = Array.from({ length: 400 }, (_, index) => index + 1).filter((floor) => floor % 5 === 0 && lap(floor) % 2 === 1 && floor % 15 !== 0);
    let elites = 0;
    for (const floor of usual) {
      for (let n = 0; n < 10; n++) {
        const { encounter } = towerFloor(floor, `usual${n}`, content);
        if (encounter.elite) {
          elites += 1;
          continue;
        }
        const open = encountersFor(towerArea(floor, content), floor).map((group) => group.monsters.join());
        assert.ok(open.includes(encounter.members.map((member) => member.monsterId).join()), `floor ${floor}: ${JSON.stringify(encounter)}`);
      }
    }
    assert.ok(elites > usual.length * 10 * 0.03 && elites < usual.length * 10 * 0.2, `${elites} of ${usual.length * 10}`);
    // Champions of four lands, not of two (342 A).
    const champions = new Set(Array.from({ length: 20 }, (_, index) => (index + 1) * 15).map((floor) => towerFloor(floor, 'climb', content).encounter).filter((encounter) => encounter.champion).map((encounter) => encounter.members[0].monsterId));
    assert.ok(champions.size >= 4, [...champions].join(', '));
    const others = Array.from({ length: 1000 }, (_, index) => index + 1).filter((floor) => floor % 5 !== 0);
    const random = others.filter((floor) => towerFloor(floor, 'climb', content).encounter.elite).length;
    assert.ok(random > others.length * 0.05 && random < others.length * 0.2, `${random}`);
  });

  test('every creature of every region comes on some floor, those of each land\'s last region too, as usual creatures (484 A)', () => {
    // The first four laps of the regions, many climbs on each floor.
    const met = new Map(content.areas.map((area) => [area.id, new Set()]));
    const usual = new Map(content.areas.map((area) => [area.id, new Set()]));
    for (let floor = 1; floor <= 4 * content.areas.length; floor++) {
      for (let n = 0; n < 40; n++) {
        const { areaId, encounter } = towerFloor(floor, `every${n}`, content);
        for (const { monsterId } of encounter.members) {
          met.get(areaId).add(monsterId);
          if (!encounter.elite && !encounter.champion) usual.get(areaId).add(monsterId);
        }
      }
    }
    for (const area of content.areas) {
      for (const danger of areaDangers(area, content)) {
        assert.ok(met.get(area.id).has(danger.monsterId), `${area.id}: ${danger.monsterId}`);
        if (!danger.elite && !danger.champion) assert.ok(usual.get(area.id).has(danger.monsterId), `${area.id}: ${danger.monsterId} in a usual fight`);
      }
    }
    // Before 484 A these never came: the creatures of each land's last region.
    for (const monsterId of ['boar', 'stag', 'wildcat', 'black-stork', 'bear', 'aurochs', 'aesculapian-snake', 'strzyga', 'skeleton', 'drowner', 'sludger', 'mud-goblin', 'peat-cutter', 'bog-worm', 'mine-spirit', 'giant-rat']) {
      assert.ok([...usual.values()].some((seen) => seen.has(monsterId)), monsterId);
    }
  });
});

describe('an entry\'s fight', () => {
  const character = newCharacter('warrior', { level: 60, classLevel: 50 });

  test('alone on a floor the monsters have half the late growth, with a partner all of it; up to 50 the same (438.3 A)', () => {
    const climber = newCharacter('warrior', { level: 110, classLevel: 100 });
    const partner = { character: newCharacter('mage', { level: 110, classLevel: 100 }), equipped: [], name: 'Druh' };
    const hp = (floor, partners) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor, seed: 'g', partners }, content).fights[0].enemiesView[0].maxHp;
    assert.equal(hp(40, []), hp(40, [partner]));
    for (const floor of [100, 140]) assert.ok(hp(floor, []) < hp(floor, [partner]) * 0.8, `${floor}: ${hp(floor, [])} vs ${hp(floor, [partner])}`);
  });

  test('a floor starts and ends in the towers\' own words, the name after a colon', () => {
    const won = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 3, seed: 'a' }, content);
    const starts = [...content.towers.texts.fightStart, ...content.towers.texts.eliteStart, ...content.towers.texts.championStart].map((line) => line.split('{enemies}')[0]);
    assert.ok(starts.some((start) => won.entries[0].text.startsWith(start)), won.entries[0].text);
    assert.ok(!/zarośli|drzewami|las /i.test(won.entries[0].text), won.entries[0].text);
    const weak = { ...newCharacter('mage', { level: 60, classLevel: 50 }), stats: { ...newCharacter('mage').stats } };
    const lost = towerFight({ character: weak, equipped: [], name: 'Słaby', floor: 60, seed: 'd' }, content);
    if (!lost.tower.won) assert.match(lost.entries[0].text, /z Wieży: Słaby\./);
  });

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
    const champion = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 15, seed: 'b' }, content);
    assert.equal(champion.fights[0].champion, true);
    const monster = content.monstersById[champion.fights[0].enemies[0].monsterId];
    const { xpBase, xpExponent } = content.balance.rewards;
    const regular = xpBase * 10 ** xpExponent * monster.reward.xp;
    assert.ok(champion.xp < regular * 2, `${champion.xp} vs ${regular}`);
  });

  test('a champion leaves its trophy only when asked (the first win of its floor in the tower), and then for certain; the rest of the pay the same (483 A)', () => {
    const champion = towerFloor(15, 'any', content).encounter.members[0].monsterId;
    assert.ok(content.monstersById[champion].champion);
    const trophy = content.materialsByMonster[champion].id;
    const pieces = (found) => Object.entries(found).filter(([key]) => parseStack(key).materialId === trophy).reduce((sum, [, count]) => sum + count, 0);
    for (let n = 0; n < 20; n++) {
      const first = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 15, seed: `trofeum${n}`, championTrophy: true }, content);
      assert.equal(first.tower.won, true);
      assert.equal(first.tower.champion, true);
      assert.equal(pieces(first.materials), 1, JSON.stringify(first.materials));
      const again = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 15, seed: `trofeum${n}`, championTrophy: false }, content);
      assert.equal(pieces(again.materials), 0, JSON.stringify(again.materials));
      assert.deepEqual([again.tower.won, again.xp, again.gold], [true, first.xp, first.gold]);
      // Not asked, none.
      assert.equal(pieces(towerFight({ character, equipped: [], name: 'Wspinacz', floor: 15, seed: `trofeum${n}` }, content).materials), 0);
    }
    // Elsewhere (an exploration, the Bestia Gildii) a champion leaves it by its chance, as before.
    const rng = createRng('czempion');
    const drops = Array.from({ length: 400 }, () => pieces(materialDrops(champion, 15, 1, rng, content)));
    const share = drops.reduce((sum, count) => sum + count, 0) / drops.length;
    assert.ok(Math.abs(share - content.balance.rewards.championMaterialChance) < 0.06, `${share}`);
    assert.equal(pieces(materialDrops(champion, 15, 1, createRng('a'), content, true)), 1);
    assert.equal(pieces(materialDrops(champion, 15, 1, createRng('a'), content, false)), 0);
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

  test('a champion\'s floor won the first time brings its trophy, a second win not; the page knows the floors won (483 A)', async () => {
    const champion = towerFloor(15, 'any', content).encounter.members[0].monsterId;
    const trophy = content.materialsByMonster[champion].id;
    const row = async () => (await db()).prepare('SELECT materials, towers FROM characters').first();
    const pieces = async () =>
      Object.entries(JSON.parse((await row()).materials))
        .filter(([key]) => parseStack(key).materialId === trophy)
        .reduce((sum, [, count]) => sum + count, 0);
    const solo = async () => (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'solo');
    assert.deepEqual((await solo()).champions, []);
    let first = null;
    for (let i = 0; i < 5 && !first?.tower.won; i++) first = (await enter('wspinacz', { tower: 'solo', floor: 15 })).data.report;
    assert.equal(first.tower.won, true, 'the floor is won');
    assert.equal(first.fights[0].champion, true);
    assert.equal(await pieces(), 1);
    assert.deepEqual((await solo()).champions, [15]);
    let again = null;
    for (let i = 0; i < 5 && !again?.tower.won; i++) again = (await enter('wspinacz', { tower: 'solo', floor: 15 })).data.report;
    assert.equal(again.tower.won, true);
    assert.ok(again.summary.xp > 0);
    assert.equal(await pieces(), 1);
    assert.deepEqual(JSON.parse((await row()).towers).champions, { solo: [15] });
    // A floor lost is not won: its trophy still waits.
    const lost = (await enter('wspinacz', { tower: 'solo', floor: 30 })).data.report;
    assert.equal((await solo()).champions.includes(30), lost.tower.won);
  });

  test('the Dziennik keeps the towers\' reports apart from the others: each new report pushes out only the oldest of its own kind (486 A)', async () => {
    const { reports: kept, towerReports } = content.balance.journal;
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const insert = database.prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)');
    await database.batch([
      ...Array.from({ length: kept }, (_, index) => insert.bind(id, `old-hunt-${index}`, 'hunt', index, '{}', '{}')),
      ...Array.from({ length: towerReports }, (_, index) => insert.bind(id, `old-tower-${index}`, 'tower', index, '{}', '{}')),
    ]);
    const kinds = async () => Object.fromEntries((await database.prepare('SELECT kind, COUNT(*) AS count FROM reports GROUP BY kind').all()).results.map((one) => [one.kind, one.count]));
    const stays = async (key) => Boolean(await database.prepare('SELECT 1 AS found FROM reports WHERE activity_key = ?').bind(key).first());
    // An entry: the oldest tower report goes, every exploration stays.
    const entered = await enter('wspinacz', { tower: 'solo', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.deepEqual(await kinds(), { hunt: kept, tower: towerReports });
    assert.equal(await stays('old-tower-0'), false);
    assert.equal(await stays('old-tower-1'), true);
    assert.equal(await stays('old-hunt-0'), true);
    // The Dziennik lists both, newest first.
    const journal = (await as('wspinacz', 'GET', '/api/reports')).data.reports;
    assert.equal(journal.length, kept + towerReports);
    assert.equal(journal[0].id, entered.data.report.id);
    assert.deepEqual(
      journal.map((report) => report.id),
      journal.map((report) => report.id).sort((a, b) => b - a),
    );
    // An exploration's report: the oldest exploration goes, the towers' stay.
    assert.equal((await as('wspinacz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await database.prepare('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000').run();
    let claimed = await as('wspinacz', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('wspinacz', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.deepEqual(await kinds(), { hunt: kept, tower: towerReports });
    assert.equal(await stays('old-hunt-0'), false);
    assert.equal(await stays('old-hunt-1'), true);
    assert.equal(await stays('old-tower-1'), true);
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
    // One grown beyond the class levels' spread leaves the party, so it
    // climbs no more (parties.js).
    await (await db()).prepare("UPDATE characters SET class_level = ? WHERE name = 'Druh'").bind(50 + content.balance.parties.classSpread + 1).run();
    const apart = (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');
    assert.deepEqual(apart.partners, []);
    assert.match(apart.missing, /co najmniej/);
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
