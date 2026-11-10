// The Punkty Sławy of the characters (src/engine/fame.js, src/server/fame.js,
// data/fame.json; the author, 10.11.2026: „Przydałyby się Punkty Sławy dla
// postaci […] Niech trójka graczy z najwyższą aktywnością dostaje
// proporcjonalnie jakieś nagrody.”, „to mają być powtarzalne rzeczy czyli
// Wieże nie wchodzą, ale tygodniowo liczone git” and „760 A”): the numbers
// of each source, each added with its action and once for two taps; the
// week from Monday, midnight in Poland, to the end of Sunday; the week
// before closed once, the first time the new week asks; the pool of 150
// Punkty Systemu shared in proportion, always whole; the best character of
// three different accounts; the reward claimed once; the best one's name in
// gold for the next week only; and the Sława tab.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaUnlocked, createRng, fameShares, fameWeek, famePreviousWeek, fameWinners, huntFame, questFame, upgradeFame, workFame } from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.fame;
const source = (id) => rules.sources.find((one) => one.id === id);
const HOUR = 3600000;

describe('the Punkty Sławy: the rules', () => {
  test('the numbers the author asked for, each source once, the Wieże not among them', () => {
    const numbers = Object.fromEntries(rules.sources.map(({ id, points, minutes, from }) => [id, [points, minutes ?? null, from ?? null]]));
    assert.deepEqual(numbers, {
      explore: [1, 10, null],
      elite: [5, null, null],
      champion: [15, null, null],
      wanted: [20, null, null],
      sweep: [3, null, null],
      work: [1, 15, null],
      // A quarter of the work's: a point an hour instead of each 15 minutes.
      avatar: [1, 60, null],
      daily: [3, null, null],
      weekly: [15, null, null],
      monthly: [40, null, null],
      order: [10, null, null],
      beast: [5, null, null],
      trial: [10, null, null],
      upgrade: [2, null, null],
      'upgrade-high': [5, null, 5],
      sale: [2, null, null],
    });
    assert.equal(new Set(rules.sources.map((one) => one.id)).size, rules.sources.length);
    assert.deepEqual(rules.rewards, { places: 3, pool: 150, goldName: true });
    assert.equal(rules.table, 50);
  });

  test('an exploration: a point for each full 10 minutes, the elites and champions beaten, nothing for a lost one', () => {
    const fight = (won, kind = null) => ({ won, elite: kind === 'elite', champion: kind === 'champion' });
    const hunt = { fights: [fight(true), fight(true, 'elite'), fight(true, 'elite'), fight(true, 'champion'), fight(false, 'elite'), fight(false, 'champion')] };
    assert.equal(huntFame(hunt, 9, content), 2 * 5 + 15);
    assert.equal(huntFame(hunt, 10, content), 1 + 2 * 5 + 15);
    assert.equal(huntFame(hunt, 239, content), 23 + 2 * 5 + 15);
    assert.equal(huntFame({ fights: [] }, 240, content), 24);
    // A Szybkie and a Błyskawiczne polowanie by their minutes.
    assert.equal(huntFame({ fights: [] }, content.balance.quickHunt.minutes, content), Math.floor(content.balance.quickHunt.minutes / 10));
    // A lost one (a faint, the "porażka") brings nothing, its elite neither.
    assert.equal(huntFame({ ...hunt, forfeit: true }, 240, content), 0);
  });

  test('a profession\'s work: a point for each full 15 minutes, the Awatar Systemu\'s a quarter of it', () => {
    assert.deepEqual([14, 15, 29, 60, 480].map((minutes) => workFame(minutes, false, content)), [0, 1, 1, 4, 32]);
    assert.deepEqual([59, 60, 120, 480].map((minutes) => workFame(minutes, true, content)), [0, 1, 2, 8]);
    assert.equal(workFame(480, true, content) * 4, workFame(480, false, content));
  });

  test('the quests by their period, and the Kowadło: 2 for an upgrade that comes off, 5 for one to +5 and up, none for a failure', () => {
    assert.deepEqual(['daily', 'weekly', 'monthly'].map((period) => questFame(period, 1, content)), [3, 15, 40]);
    assert.equal(questFame('daily', 5, content), 15);
    assert.deepEqual(
      [1, 4, 5, 10].map((upgrade) => upgradeFame({ result: 'success', upgrade }, content)),
      [2, 2, 5, 5],
    );
    assert.equal(upgradeFame({ result: 'failure', upgrade: 3 }, content), 0);
    assert.equal(upgradeFame({ result: 'broken', upgrade: 0 }, content), 0);
  });

  test('the week: from Monday, midnight in Poland, to the end of Sunday, in winter and in summer time', () => {
    const at = (iso) => Date.parse(iso);
    // Winter (UTC+1): Monday 9 November 2026 starts at 23:00 UTC on Sunday.
    assert.equal(fameWeek(at('2026-11-08T22:59:59.999Z'), content).key, '2026-11-02');
    assert.equal(fameWeek(at('2026-11-08T23:00:00.000Z'), content).key, '2026-11-09');
    assert.equal(fameWeek(at('2026-11-15T22:59:59.999Z'), content).key, '2026-11-09');
    const week = fameWeek(at('2026-11-10T12:00:00Z'), content);
    assert.deepEqual([week.startsAt, week.endsAt], [at('2026-11-08T23:00:00Z'), at('2026-11-15T23:00:00Z')]);
    assert.equal(famePreviousWeek(at('2026-11-08T23:00:00.000Z'), content).key, '2026-11-02');
    // Summer (UTC+2): Monday 29 June 2026 starts at 22:00 UTC on Sunday.
    assert.equal(fameWeek(at('2026-06-28T21:59:59.999Z'), content).key, '2026-06-22');
    assert.equal(fameWeek(at('2026-06-28T22:00:00.000Z'), content).key, '2026-06-29');
    // The week the clocks go back is an hour longer.
    const autumn = fameWeek(at('2026-10-21T12:00:00Z'), content);
    assert.equal(autumn.key, '2026-10-19');
    assert.equal(autumn.endsAt - autumn.startsAt, 169 * HOUR);
    // As the weekly quests and the guilds' Sława count it.
    assert.deepEqual(fameWeek(at('2026-11-10T12:00:00Z'), content), { key: '2026-11-09', startsAt: week.startsAt, endsAt: week.endsAt });
  });

  test('the pool shared in proportion to the points, always exactly 150, each share within a point of its exact part', () => {
    assert.deepEqual(fameShares([50, 30, 20], 150), [75, 45, 30]);
    assert.deepEqual(fameShares([1, 1, 1], 150), [50, 50, 50]);
    // 75, 37.5, 37.5: the half left goes to the higher place.
    assert.deepEqual(fameShares([2, 1, 1], 150), [75, 38, 37]);
    assert.deepEqual(fameShares([90, 30, 20], 150), [97, 32, 21]);
    assert.deepEqual(fameShares([7], 150), [150]);
    assert.deepEqual(fameShares([5, 3], 150), [94, 56]);
    const rng = createRng('fame');
    for (let round = 0; round < 500; round++) {
      const points = Array.from({ length: rng.int(1, 3) }, () => rng.int(1, 5000)).sort((a, b) => b - a);
      const shares = fameShares(points, 150);
      const total = points.reduce((sum, value) => sum + value, 0);
      assert.equal(shares.reduce((sum, value) => sum + value, 0), 150, String(points));
      for (const [index, share] of shares.entries()) assert.ok(Math.abs(share - (points[index] * 150) / total) < 1, `${points}: ${shares}`);
      // A place never gets less than the one below it.
      for (let index = 1; index < shares.length; index++) assert.ok(shares[index - 1] >= shares[index], `${points}: ${shares}`);
    }
  });

  test('the rewarded: the best character of three different accounts, the others of an account left out, none without points', () => {
    const rows = [
      { characterId: 1, userId: 10, points: 900 },
      { characterId: 2, userId: 10, points: 800 },
      { characterId: 3, userId: 20, points: 300 },
      { characterId: 4, userId: 20, points: 250 },
      { characterId: 5, userId: 30, points: 200 },
      { characterId: 6, userId: 40, points: 100 },
    ];
    const winners = fameWinners(rows, content);
    // 900, 300 and 200 of 1400: 96.43, 32.14 and 21.43, the point left to
    // the higher of the two equal remainders.
    assert.deepEqual(
      winners.map(({ characterId, place, share }) => [characterId, place, share]),
      [
        [1, 1, 97],
        [3, 2, 32],
        [5, 3, 21],
      ],
    );
    assert.equal(winners.reduce((sum, winner) => sum + winner.share, 0), 150);
    // Fewer than three with points: the pool goes to those there are.
    assert.deepEqual(
      fameWinners([{ characterId: 7, userId: 1, points: 10 }, { characterId: 8, userId: 1, points: 9 }, { characterId: 9, userId: 2, points: 0 }], content).map(({ characterId, share }) => [characterId, share]),
      [[7, 150]],
    );
    assert.deepEqual(fameWinners([], content), []);
  });

  test('every word in English too: the sources, the tab\'s words and the Społeczność\'s part', () => {
    const english = contentIn('en');
    assert.equal(english.fame.texts.sources, 'What earns Fame');
    assert.equal(english.fame.sources.find((one) => one.id === 'explore').label, 'Exploration, for every {minutes} minutes');
    assert.equal(english.community.sections.find((one) => one.id === 'fame').name, 'Fame');
    assert.equal(contentIn('pl').community.sections.find((one) => one.id === 'fame').name, 'Sława');
    // The numbers stay the data's.
    assert.deepEqual(
      english.fame.sources.map(({ id, points }) => [id, points]),
      rules.sources.map(({ id, points }) => [id, points]),
    );
  });
});

describe('the Punkty Sławy through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', PROFESSIONS: 'on', CRAFTING: 'on' });
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const thisWeek = () => fameWeek(Date.now(), content).key;
  const lastWeek = () => famePreviousWeek(Date.now(), content).key;
  // The character's Punkty Sławy of this week.
  const fameOf = async (name) => (await first('SELECT points FROM fame_points WHERE week = ? AND character_id = (SELECT id FROM characters WHERE name = ?)', thisWeek(), name))?.points ?? 0;

  // What an exploration's report brings (huntFame, from what it tells).
  const huntPoints = (report) => {
    const beaten = (kind) => report.fights.filter((fight) => fight.won === true && fight[kind]).length;
    return report.result === 'fainted' ? 0 : Math.floor(report.minutes / 10) + beaten('elite') * 5 + beaten('champion') * 15;
  };

  async function player(login, name, level = 30, classLevel = 25) {
    ({ cookie: cookies[login] } = await signUp(login));
    const made = await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data).slice(0, 300));
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 100000, tutorial = NULL WHERE name = ?', level, classLevel, name);
  }

  // Another character of the same account, set aside (the account's
  // characters, roles.js), as a copy of `name` under `other`.
  async function sibling(name, other) {
    const columns = (await all('PRAGMA table_info(characters)')).map((column) => column.name).filter((column) => column !== 'id');
    const values = columns.map((column) => (column === 'name' || column === 'name_key' ? '?' : column === 'role' ? "'aside'" : column));
    await run(`INSERT INTO characters (${columns.join(', ')}) SELECT ${values.join(', ')} FROM characters WHERE name = ?`, ...columns.filter((column) => column === 'name' || column === 'name_key').map((column) => (column === 'name' ? other : other.toLowerCase())), name);
  }

  describe('each source with its action', () => {
    test('an exploration claimed: a point for each 10 minutes and its elites and champions; a lost one nothing', async () => {
      await player('lowca', 'Łowca');
      const quick = await as('lowca', 'POST', '/api/hunts/quick', { areaId: 'windfalls-edge' });
      assert.equal(quick.status, 200, JSON.stringify(quick.data).slice(0, 300));
      let total = huntPoints(quick.data.report);
      assert.equal(await fameOf('Łowca'), total);
      // An hour on the way, claimed by two taps at once.
      assert.equal((await as('lowca', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60 })).status, 201);
      await run('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', HOUR, HOUR);
      const claims = await Promise.all([1, 2].map(() => as('lowca', 'POST', '/api/hunts/claim')));
      const claimed = claims.filter((one) => one.status === 200 && one.data.report);
      assert.equal(claimed.length, 1, JSON.stringify(claims.map((one) => one.data)).slice(0, 300));
      total += huntPoints(claimed[0].data.report);
      assert.ok(total >= 1 + 6);
      assert.equal(await fameOf('Łowca'), total);
      // Far too strong a place for 1 HP: lost, and nothing for it.
      await run("UPDATE characters SET level = 5, class_level = 60 WHERE name = 'Łowca'");
      const strong = content.areas.find((area) => area.minLevel >= 40 && areaUnlocked(area, 60, content));
      const begun = await as('lowca', 'POST', '/api/hunts', { areaId: strong.id, minutes: 30 });
      assert.equal(begun.status, 201, JSON.stringify(begun.data).slice(0, 300));
      await run('UPDATE activities SET hp_at_start = 1, started_at = started_at - ?, ends_at = ends_at - ?', HOUR, HOUR);
      const lost = await as('lowca', 'POST', '/api/hunts/claim');
      assert.equal(lost.status, 200, JSON.stringify(lost.data).slice(0, 300));
      assert.equal(lost.data.report.result, 'fainted');
      assert.equal(await fameOf('Łowca'), total);
    });

    test('a profession\'s work claimed: a point for each 15 minutes, the Awatar Systemu\'s an hour', async () => {
      await player('zielarka', 'Zielarka', 12, 10);
      assert.equal((await as('zielarka', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
      await run('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', HOUR, HOUR);
      assert.equal((await as('zielarka', 'POST', '/api/hunts/claim')).status, 200);
      assert.equal(await fameOf('Zielarka'), 4);
      assert.equal((await as('zielarka', 'POST', '/api/avatar/buy')).status, 200);
      assert.equal((await as('zielarka', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 120, avatar: true })).status, 201);
      await run('UPDATE avatar_activities SET started_at = started_at - ?, ends_at = ends_at - ?', 2 * HOUR, 2 * HOUR);
      const claims = await Promise.all([1, 2].map(() => as('zielarka', 'POST', '/api/avatar/claim')));
      assert.equal(claims.filter((one) => one.status === 200 && one.data.report).length, 1, JSON.stringify(claims.map((one) => one.data)).slice(0, 300));
      assert.equal(await fameOf('Zielarka'), 4 + 2);
    });

    test('a Portal\'s sweep: 3 each, "Wyczyść wszystkie" 3 for every sweep; a new stage nothing', async () => {
      await player('wedrowiec', 'Wędrowiec', 30);
      await run("UPDATE characters SET portals = ? WHERE name = 'Wędrowiec'", JSON.stringify({ best: { gold: 4, wood: 3 } }));
      assert.equal((await as('wedrowiec', 'POST', '/api/portals/sweep', { portal: 'gold' })).status, 200);
      assert.equal(await fameOf('Wędrowiec'), 3);
      // Four sweeps of gold left and five of wood.
      const swept = await as('wedrowiec', 'POST', '/api/portals/sweep-all');
      assert.equal(swept.status, 200, JSON.stringify(swept.data).slice(0, 300));
      assert.equal(await fameOf('Wędrowiec'), 3 + 9 * 3);
      // Fights for new stages bring none, won or lost.
      for (let fight = 0; fight < 3; fight++) assert.equal((await as('wedrowiec', 'POST', '/api/portals/enter', { portal: 'stone' })).status, 200);
      assert.equal(await fameOf('Wędrowiec'), 30);
    });

    test('the narrator\'s quests: 3, 15 and 40 as their rewards are taken, once', async () => {
      await player('ola', 'Ola', 10, 10);
      await as('ola', 'GET', '/api/character');
      const quests = JSON.parse((await first('SELECT quests FROM characters')).quests);
      for (const period of ['daily', 'weekly', 'monthly']) quests[period].quests = quests[period].quests.map((quest) => ({ ...quest, progress: quest.count }));
      await run('UPDATE characters SET quests = ?', JSON.stringify(quests));
      const taps = await Promise.all([1, 2].map(() => as('ola', 'POST', '/api/quests/claim', { period: 'daily', index: 0 })));
      assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
      assert.equal(await fameOf('Ola'), 3);
      const rest = await as('ola', 'POST', '/api/quests/claim-all', { period: 'daily' });
      assert.equal(rest.status, 200);
      assert.equal(await fameOf('Ola'), 3 * quests.daily.quests.length);
      assert.equal((await as('ola', 'POST', '/api/quests/claim', { period: 'weekly', index: 0 })).status, 200);
      assert.equal((await as('ola', 'POST', '/api/quests/claim', { period: 'monthly', index: 0 })).status, 200);
      assert.equal(await fameOf('Ola'), 3 * quests.daily.quests.length + 15 + 40);
      // A period's chest is no quest.
      assert.equal((await as('ola', 'POST', '/api/quests/chest', { period: 'daily' })).status, 200);
      assert.equal(await fameOf('Ola'), 3 * quests.daily.quests.length + 15 + 40);
    });

    test('a wanted poster\'s bounty at the sołtys: 20, once', async () => {
      await player('lowczyni', 'Łowczyni', 80, 30);
      const { posters } = (await as('lowczyni', 'GET', '/api/settlement')).data.settlement.wanted;
      assert.equal((await as('lowczyni', 'POST', '/api/settlement/wanted', { posterId: posters[0].id })).status, 200);
      const stored = JSON.parse((await first('SELECT settlement FROM characters')).settlement);
      stored.wanted.taken.beaten = true;
      await run('UPDATE characters SET settlement = ?', JSON.stringify(stored));
      const taps = await Promise.all([1, 2].map(() => as('lowczyni', 'POST', '/api/settlement/wanted/claim')));
      assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
      assert.equal(await fameOf('Łowczyni'), 20);
      assert.equal((await as('lowczyni', 'POST', '/api/settlement/wanted/claim')).data.error.code, 'not_beaten');
      assert.equal(await fameOf('Łowczyni'), 20);
    });

    test('the Bestia Gildii: 5 for each attack', async () => {
      await player('bestia', 'Pogromczyni', 40, 25);
      assert.equal((await as('bestia', 'POST', '/api/guild/found', { name: 'Łowcy Bestii', tag: 'LB' })).status, 200);
      for (let attack = 1; attack <= content.guilds.beast.attacksPerDay; attack++) {
        const hit = await as('bestia', 'POST', '/api/guild/beast/attack');
        assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
        assert.equal(await fameOf('Pogromczyni'), 5 * attack);
      }
      assert.equal((await as('bestia', 'POST', '/api/guild/beast/attack')).data.error.code, 'no_attacks');
      assert.equal(await fameOf('Pogromczyni'), 5 * content.guilds.beast.attacksPerDay);
    });

    test('an order of the Osada delivered (10) and the Próba Gildii it finishes (10), once for two taps at once', async () => {
      await player('soltys', 'Sołtys', 30, 25);
      await run(`UPDATE characters SET met = '["wolf"]'`);
      assert.equal((await as('soltys', 'POST', '/api/guild/found', { name: 'Sołtysi', tag: 'SO' })).status, 200);
      await as('soltys', 'GET', '/api/guild/trials');
      await run('UPDATE guild_trial_boards SET trials = ?, opened = 0', JSON.stringify([{ kind: 'orders', size: 0, roll: 0 }]));
      await run("DELETE FROM guild_trials WHERE state = 'active'");
      await as('soltys', 'GET', '/api/guild/trials');
      await run("UPDATE guild_trials SET count = 1 WHERE state = 'active'");
      const STORE = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' };
      const { settlement } = (await as('soltys', 'GET', '/api/settlement')).data;
      const order = settlement.board.slots.map((slot) => slot.order).find((one) => one && one.kind !== 'craft');
      const key = order.kind === 'material' && order.key.startsWith('any:') ? `${content.materialsByMonster.wolf.id}:${order.key.slice(4)}` : order.key;
      await run(`UPDATE characters SET ${STORE[order.kind]} = json_set(${STORE[order.kind]}, ?, ?)`, `$."${key}"`, order.count);
      const taps = await Promise.all([1, 2].map(() => as('soltys', 'POST', '/api/settlement/deliver', { orderId: order.id })));
      assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
      assert.equal((await first("SELECT COUNT(*) AS count FROM guild_trials WHERE state = 'done'")).count, 1);
      assert.equal(await fameOf('Sołtys'), 10 + 10);
      assert.equal((await first('SELECT COUNT(*) AS count FROM fame_trials')).count, 1);
      // The trial done counts once, whatever moves the trials after it, also
      // when it is opened again and done once more.
      let total = 20;
      const quick = await as('soltys', 'POST', '/api/hunts/quick', { areaId: 'windfalls-edge' });
      assert.equal(quick.status, 200, JSON.stringify(quick.data).slice(0, 300));
      total += huntPoints(quick.data.report);
      assert.equal(await fameOf('Sołtys'), total);
      await run("UPDATE guild_trials SET state = 'active', progress = 0, done_at = NULL");
      await run("UPDATE guild_trials SET state = 'done', progress = count, done_at = 1");
      const again = await as('soltys', 'POST', '/api/hunts/quick', { areaId: 'windfalls-edge' });
      assert.equal(again.status, 200, JSON.stringify(again.data).slice(0, 300));
      total += huntPoints(again.data.report);
      assert.equal(await fameOf('Sołtys'), total);
    });

    test('the Kowadło: 2 for an upgrade that comes off, 5 for one to +5 and higher, none for a failure', async () => {
      await player('kowal', 'Kowalka', 30, 25);
      const item = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
      const { meta } = await run('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters', JSON.stringify(item));
      await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'anvil', 10, 0, 1 FROM characters");
      await run('UPDATE characters SET gold = 1000000, resources = ?, materials = ?', JSON.stringify({ wood: 0, stone: 0, 'iron-ore': 100000 }), JSON.stringify({ 'wolf-pelt:common': 1000 }));
      const at = (level) => run("UPDATE items SET data = json_set(data, '$.upgrade', ?) WHERE id = ?", level, meta.last_row_id);
      let expected = 0;
      // To +1 and +4 two points, to +5 and +6 five (no try below +7 breaks
      // the item).
      for (const [from, gain] of [[0, 2], [3, 2], [4, 5], [5, 5]]) {
        let success = false;
        for (let attempt = 0; attempt < 40 && !success; attempt++) {
          await at(from);
          const tried = await as('kowal', 'POST', `/api/items/${meta.last_row_id}/upgrade`);
          assert.equal(tried.status, 200, JSON.stringify(tried.data).slice(0, 300));
          success = tried.data.upgrade.result === 'success';
          if (success) expected += gain;
          assert.equal(await fameOf('Kowalka'), expected, `+${from}: ${tried.data.upgrade.result}`);
        }
        assert.ok(success, `+${from}`);
      }
    });

    test('a sale at the Targowisko: 2 for the seller, bought at once or at the end of the auction', async () => {
      await player('kramarka', 'Kramarka', 25, 25);
      await player('kupiec', 'Kupiec', 25, 25);
      const herb = content.herbs[0].id;
      await run("UPDATE characters SET herbs = ? WHERE name = 'Kramarka'", JSON.stringify({ [herb]: 10 }));
      const listed = await as('kramarka', 'POST', '/api/market/list', { kind: 'herb', key: herb, count: 1, startPrice: 20, buyNow: 40 });
      assert.equal(listed.status, 200, JSON.stringify(listed.data).slice(0, 300));
      const offerId = listed.data.market.mine[0].id;
      assert.equal(await fameOf('Kramarka'), 0);
      const bought = await as('kupiec', 'POST', '/api/market/buy', { offerId });
      assert.equal(bought.status, 200, JSON.stringify(bought.data).slice(0, 300));
      assert.equal(await fameOf('Kramarka'), 2);
      assert.equal(await fameOf('Kupiec'), 0);
      // An auction won when its time runs out, settled by the next request.
      const auction = await as('kramarka', 'POST', '/api/market/list', { kind: 'herb', key: herb, count: 1, startPrice: 20, buyNow: null });
      const auctionId = auction.data.market.mine.find((offer) => offer.id !== offerId)?.id ?? auction.data.market.mine[0].id;
      assert.equal((await as('kupiec', 'POST', '/api/market/bid', { offerId: auctionId, amount: 20 })).status, 200);
      await run("UPDATE market_offers SET ends_at = ? WHERE state = 'open'", Date.now() - 1);
      await as('kupiec', 'GET', '/api/market');
      assert.equal(await fameOf('Kramarka'), 4);
      // An offer that ends without a buyer brings nothing.
      await as('kramarka', 'POST', '/api/market/list', { kind: 'herb', key: herb, count: 1, startPrice: 20, buyNow: null });
      await run("UPDATE market_offers SET ends_at = ? WHERE state = 'open'", Date.now() - 1);
      await as('kupiec', 'GET', '/api/market');
      assert.equal(await fameOf('Kramarka'), 4);
    });
  });

  describe('the week closed and its rewards', () => {
    // Four players, the first with a second character, and last week's
    // points of each (as the actions left them).
    beforeEach(async () => {
      await player('ala', 'Ala');
      await sibling('Ala', 'Alicja');
      await player('ola', 'Ola');
      await player('ewa', 'Ewa');
      await player('iza', 'Iza');
      for (const [name, points] of [['Ala', 900], ['Alicja', 800], ['Ola', 300], ['Ewa', 200], ['Iza', 100]]) {
        await run('INSERT INTO fame_points (character_id, week, points) VALUES (?, ?, ?)', await idOf(name), lastWeek(), points);
      }
    });

    test('closed once, the first time the new week asks: the best of three accounts share 150 in proportion', async () => {
      // Many requests at once, of different players.
      const seen = await Promise.all(['ala', 'ola', 'ewa', 'iza', 'ala', 'ola'].map((login) => as(login, 'GET', '/api/character')));
      assert.ok(seen.every((one) => one.status === 200));
      assert.equal((await first('SELECT COUNT(*) AS count FROM fame_weeks WHERE week = ?', lastWeek())).count, 1);
      const rewards = await all('SELECT r.place, c.name, r.points, r.share, r.claimed_at FROM fame_rewards r JOIN characters c ON c.id = r.character_id WHERE r.week = ? ORDER BY r.place', lastWeek());
      // Alicja is Ala's: the account's best only (900, 300, 200 of 1400).
      assert.deepEqual(
        rewards.map(({ place, name, points, share }) => [place, name, points, share]),
        [
          [1, 'Ala', 900, 97],
          [2, 'Ola', 300, 32],
          [3, 'Ewa', 200, 21],
        ],
      );
      assert.equal(rewards.reduce((sum, row) => sum + row.share, 0), 150);
      assert.ok(rewards.every((row) => row.claimed_at === null));
      // Points coming late change nothing: the week is closed for good.
      await run('UPDATE fame_points SET points = 5000 WHERE character_id = ? AND week = ?', await idOf('Iza'), lastWeek());
      await as('iza', 'GET', '/api/character');
      assert.equal((await all('SELECT * FROM fame_rewards')).length, 3);
      assert.equal((await first('SELECT character_id FROM fame_rewards WHERE place = 1')).character_id, await idOf('Ala'));
    });

    test('the reward waits with its light until "Odbierz" takes it, once for two taps at once', async () => {
      const before = (await as('ola', 'GET', '/api/character')).data;
      assert.deepEqual(before.fame, { champion: 'Ala', reward: 32 });
      assert.equal((await as('iza', 'GET', '/api/character')).data.fame.reward, null);
      assert.equal((await as('ala', 'GET', '/api/character')).data.fame.reward, 97);
      const systemPoints = (await first("SELECT system_points FROM characters WHERE name = 'Ola'")).system_points;
      const taps = await Promise.all([1, 2].map(() => as('ola', 'POST', '/api/fame/claim')));
      const done = taps.filter((tap) => tap.status === 200);
      assert.equal(done.length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
      assert.deepEqual(done[0].data.claimed, { share: 32 });
      assert.equal(done[0].data.character.systemPoints, systemPoints + 32);
      assert.deepEqual(done[0].data.rewards, []);
      assert.equal(done[0].data.fame.reward, null);
      assert.equal((await first("SELECT system_points FROM characters WHERE name = 'Ola'")).system_points, systemPoints + 32);
      assert.ok((await first('SELECT claimed_at FROM fame_rewards WHERE place = 2')).claimed_at > 0);
      const again = await as('ola', 'POST', '/api/fame/claim');
      assert.equal(again.status, 409);
      assert.equal(again.data.error.code, 'nothing_to_claim');
      assert.equal((await as('ola', 'GET', '/api/character')).data.fame.reward, null);
      // Iza has none; the other character of Ala's account has none either.
      assert.equal((await as('iza', 'POST', '/api/fame/claim')).data.error.code, 'nothing_to_claim');
      assert.equal((await first('SELECT COUNT(*) AS count FROM fame_rewards WHERE character_id = ?', await idOf('Alicja'))).count, 0);
      // Two weeks not taken come together.
      await run("INSERT INTO fame_rewards (week, place, character_id, user_id, points, share) SELECT '2001-01-01', 1, id, user_id, 50, 150 FROM characters WHERE name = 'Ala'");
      assert.equal((await as('ala', 'GET', '/api/character')).data.fame.reward, 97 + 150);
      const taken = await as('ala', 'POST', '/api/fame/claim');
      assert.deepEqual(taken.data.claimed, { share: 97 + 150 });
    });

    test('the best one\'s name in gold for the next week only', async () => {
      assert.equal((await as('iza', 'GET', '/api/character')).data.fame.champion, 'Ala');
      // The week before last: its best is not the champion now.
      await run('DELETE FROM fame_rewards');
      await run("INSERT INTO fame_rewards (week, place, character_id, user_id, points, share) SELECT ?, 1, id, user_id, 900, 150 FROM characters WHERE name = 'Iza'", famePreviousWeek(famePreviousWeek(Date.now(), content).startsAt, content).key);
      assert.equal((await as('ola', 'GET', '/api/character')).data.fame.champion, null);
      // Last week's best, renamed, by its name now.
      await run("INSERT INTO fame_rewards (week, place, character_id, user_id, points, share) SELECT ?, 1, id, user_id, 300, 150 FROM characters WHERE name = 'Ola'", lastWeek());
      await run("UPDATE characters SET name = 'Olga', name_key = 'olga' WHERE name = 'Ola'");
      assert.equal((await as('ewa', 'GET', '/api/character')).data.fame.champion, 'Olga');
      // A week without anyone's points closes with no gold name.
      await run('DELETE FROM fame_rewards');
      assert.equal((await as('ewa', 'GET', '/api/character')).data.fame.champion, null);
    });
  });

  test('the Sława tab: the points and place, the week\'s table with the own row below it, last week\'s rewarded, the sources and the words', async () => {
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    // 52 characters of another account with more points than Ala this week.
    for (let index = 0; index < 52; index++) await sibling('Ola', `Klon${index}`);
    const ids = await all("SELECT id FROM characters WHERE name LIKE 'Klon%' ORDER BY id");
    for (const [index, { id }] of ids.entries()) await run('INSERT INTO fame_points (character_id, week, points) VALUES (?, ?, ?)', id, thisWeek(), 1000 - index);
    await run('INSERT INTO fame_points (character_id, week, points) VALUES (?, ?, ?)', await idOf('Ala'), thisWeek(), 7);
    await run('INSERT INTO fame_points (character_id, week, points) VALUES (?, ?, ?)', await idOf('Ola'), lastWeek(), 40);
    const view = (await as('ala', 'GET', '/api/fame')).data;
    assert.equal(view.points, 7);
    assert.equal(view.place, 53);
    assert.equal(view.rows.length, rules.table);
    assert.deepEqual(view.rows.slice(0, 2).map(({ place, name, points, own }) => [place, name, points, own]), [
      [1, 'Klon0', 1000, false],
      [2, 'Klon1', 999, false],
    ]);
    assert.deepEqual([view.ownRow.place, view.ownRow.name, view.ownRow.points, view.ownRow.own], [53, 'Ala', 7, true]);
    assert.equal(view.week.key, thisWeek());
    assert.equal(view.week.endsAt, fameWeek(Date.now(), content).endsAt);
    // Last week's: Ola alone, the whole pool.
    assert.deepEqual(view.last.winners.map(({ place, name, points, share }) => [place, name, points, share]), [[1, 'Ola', 40, 150]]);
    assert.equal(view.last.week, lastWeek());
    assert.deepEqual(view.rewards, []);
    assert.deepEqual(view.fame, { champion: 'Ola', reward: null });
    // The sources with their words filled in, and how the pool is shared.
    assert.deepEqual(view.sources.map((one) => one.id), rules.sources.map((one) => one.id));
    assert.equal(view.sources.find((one) => one.id === 'explore').label, 'Wyprawa, za każde 10 minut');
    assert.equal(view.sources.find((one) => one.id === 'upgrade').label, 'Udane ulepszenie na Kowadle, do +4');
    assert.equal(view.sources.find((one) => one.id === 'upgrade-high').label, 'Udane ulepszenie na Kowadle, od +5');
    assert.match(view.texts.how[0], /150 Punktów Systemu/);
    assert.ok(view.sources.every((one) => !one.label.includes('{')), JSON.stringify(view.sources));
    // In the top fifty, no row of its own below; as many points as Klon5,
    // and the older character stands higher.
    await run('UPDATE fame_points SET points = 995 WHERE character_id = ?', await idOf('Ala'));
    const higher = (await as('ala', 'GET', '/api/fame')).data;
    assert.equal(higher.place, 6);
    assert.equal(higher.ownRow, null);
    assert.deepEqual(higher.rows.slice(5, 7).map(({ place, name, points }) => [place, name, points]), [
      [6, 'Ala', 995],
      [7, 'Klon5', 995],
    ]);
    // Only from the Społeczność's level.
    await run("UPDATE characters SET level = 4 WHERE name = 'Ala'");
    assert.equal((await as('ala', 'GET', '/api/fame')).data.error.code, 'locked');
  });
});
