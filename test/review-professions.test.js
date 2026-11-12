// Fixes from the code review of the professions, crafting, the bag and the
// camp of 12.11.2026 (DECISIONS.md, "Wersja 0.2.72"). Each test failed on
// the code as it was reviewed. The races (the two potions and the "Buduj"
// taps) depend on requests meeting at the right moment, so they try many
// times.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod, upgradeCost } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });

// Waits on this side without giving way, for a gap finer than a timer's.
const spin = (ms) => {
  const end = performance.now() + ms;
  while (performance.now() < end);
};

describe('the code review: professions, crafting, the bag and the camp', () => {
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('recenzent'));
    await call('POST', '/api/character', { cookie, body: { name: 'Recenzent', classId: 'warrior', appearance: 'female' } });
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async (columns) => (await db()).prepare(`SELECT ${columns} FROM characters`).first();
  const drink = (potionId) => call('POST', '/api/potions/drink', { cookie, body: { potionId } });
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  // The exploration's time passed, with a fixed seed.
  const finishHunt = async () =>
    (await db()).prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed'").bind(Date.now() - 1).run();

  // brewing.js drinkPotion → professions.js takeFromBag: the new `buffs` are
  // computed from the row read and written whole, and the write only checks
  // that the potion's count is as read. A change of the buffs meanwhile is
  // lost: here another potion drunk at the same moment, whose own count was
  // also as read.
  test('two strengthening potions drunk at the same moment both work', async () => {
    await set(`level = 60, class_level = 60, professions = '{"alchemy":{"level":90,"xp":0}}'`);
    for (let round = 0; round < 40; round++) {
      await set(`buffs = '{}', potions = '{"lesser-speed":5,"stoneskin-brew":5}'`);
      const taps = await Promise.all([drink('lesser-speed'), drink('stoneskin-brew')]);
      if (!taps.every((tap) => tap.status === 200)) continue;
      const { potions, buffs } = await row('potions, buffs');
      // Both potions left the bag...
      assert.deepEqual(JSON.parse(potions), { 'lesser-speed': 4, 'stoneskin-brew': 4 });
      // ...so both must work.
      assert.deepEqual(Object.keys(JSON.parse(buffs)).sort(), ['armor', 'speed'], `round ${round}: ${buffs}`);
    }
  });

  // The same write against the claim of an exploration: the claim takes off
  // the fights its strengthening potions worked in (hunts.js, spendFights),
  // and a potion drunk with a row read before the claim and saved after it
  // writes the buffs back as they were, plus its own fights. Repeated at
  // every claim, the potions' fights never run out.
  test('a strengthening potion drunk while the report is claimed does not give back the fights the report used up', async () => {
    await set(`level = 60, class_level = 60, professions = '{"alchemy":{"level":5,"xp":0}}', potions = '{"lesser-speed":50000}'`);
    for (let round = 0; round < 80; round++) {
      await set(`buffs = '{"speed":{"fights":500,"bonus":0.15}}', hp = 99999, hp_at = ?`, Date.now());
      assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 240 } })).status, 201);
      await finishHunt();
      // What a request settles first for a player back after a while (a
      // Time Point come, the day's quests and the Encyklopedia to save): a
      // few round trips to the database between the read and the write, as
      // the live game's D1 has anyway.
      await set(`quests = '{}', discovered = '{}', time_points_at = ?`, Date.now() - 10 * 3600000);
      const claim = call('POST', '/api/hunts/claim', { cookie, body: {} });
      spin(0.2 + (round % 60) * 0.2);
      const [claimed, drunk] = await Promise.all([claim, drink('lesser-speed')]);
      // A claim that lost to the potion is claimed again, from the buffs with it.
      const report = claimed.status === 200 ? claimed.data.report : (await call('POST', '/api/hunts/claim', { cookie })).data.report;
      const used = report.fights.length;
      const fights = JSON.parse((await row('buffs')).buffs).speed.fights;
      assert.equal(fights, 500 - used + (drunk.status === 200 ? 2 : 0), `round ${round}: claim ${claimed.status}, potion ${drunk.status}`);
    }
  });

  // avatar.js claimAvatar → professions.js workGains: since 10.11.2026 the
  // Awatar's report brings the character a quarter of the profession's XP,
  // with its levels and their stats, also while the character is on an
  // exploration. The exploration's fights are counted when its report is
  // claimed, with the stats of then (hunts.js), so they all count the new
  // level, as the gem set by the Awatar and the class level of the Plac
  // treningowy did before their fixes (jewelcraft.js, fortress.js: those
  // wait for the exploration's report).
  test("the Awatar's report claimed during an exploration changes nothing the exploration's fights are counted with", async () => {
    await set(`level = 30, class_level = 30, xp = 0, hp = 99999, hp_at = ?, avatar_at = ?, professions = '{"mining":{"level":1,"xp":0}}'`, Date.now(), Date.now());
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } })).status, 201);
    const setOut = await character();
    // The Awatar digs for 2 hours: a quarter of it is 30 minutes of
    // Górnictwo, its level 2 (Witalność and Wytrzymałość +3 each).
    assert.equal((await call('POST', '/api/professions/mine', { cookie, body: { minutes: 120, avatar: true } })).status, 201);
    await (await db()).prepare('UPDATE avatar_activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
    const avatar = await call('POST', '/api/avatar/claim', { cookie });
    const during = await character();
    await finishHunt();
    const { report } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const hero = report.fights[0].allies[0];
    assert.equal(
      hero.maxHp,
      setOut.maxHp,
      `Awatar's claim ${avatar.status}; Górnictwo ${JSON.parse((await row('professions')).professions).mining.level}; max HP at the start ${setOut.maxHp}, after the claim ${during.maxHp}, in the fights ${hero.maxHp}`,
    );
  });

  // camp.js beginBuilding: the payment (`pay`) holds while the building has
  // the level and the start (`started_at = now`) of the build asked for, not
  // while this request's own insert started it, and it checks no gold or
  // resources. Taps that come in the same millisecond (the Workers clock
  // moves only with I/O) all find the one build that started and all pay
  // for it; the extra ones answer 409 "Obóz zmienił się w międzyczasie".
  test('taps on "Buduj" at the same moment pay once for the one build they start', async () => {
    const price = upgradeCost(content.buildingsById.campfire, 1);
    assert.deepEqual(price, { gold: 5, wood: 3 });
    const database = await db();
    for (let round = 0; round < 80; round++) {
      await database.prepare('DELETE FROM buildings').run();
      // Exactly the price of the Ognisko's first level.
      await set(`gold = 5, resources = '{"wood":3,"stone":0,"iron-ore":0}', build_queue = '[]'`);
      const taps = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/api/camp/build', { cookie, body: { buildingId: 'campfire' } })));
      assert.equal(taps.filter((tap) => tap.status === 201).length, 1);
      const { gold, resources } = await row('gold, resources');
      assert.deepEqual([gold, JSON.parse(resources).wood], [0, 0], `round ${round}: ${taps.map((tap) => tap.data.error?.code ?? tap.status).join(', ')}`);
    }
  });
});

// workshop.js finishCrafting: the Warsztat's items move the Próby Gildii on
// with trialProgress(…, { made }, now) and no takenBefore(), and its orders
// keep no `begun`. Every other work that takes time counts only for a trial
// opened before it began (DECISIONS.md, „Próby Gildii: tylko wyprawy
// rozpoczęte po wzięciu próby”; the author: „żeby się nie naliczała wyprawa
// jedna do obu zadań”): explorations, gathering, brewing (professions.js,
// brewing.js) and the Stół rozbiórki (orderedAt).
describe('the code review: the Warsztat and the Próby Gildii', () => {
  test('a Warsztat order begun before its trial opened does not move the trial on', async () => {
    const { cookie } = await signUp('kowal');
    const as = (method, path, body) => call(method, path, { cookie, body });
    const database = await db();
    await as('POST', '/api/character', { name: 'Kowal', classId: 'warrior', appearance: 'female' });
    await database
      .prepare(`UPDATE characters SET level = 30, class_level = 25, gold = 5000, parts = '{"scraps":300}', resources = '{"wood":500,"stone":2000,"iron-ore":400}'`)
      .run();
    assert.equal((await as('POST', '/api/guild/found', { name: 'Kowale', tag: 'KW' })).status, 200);
    await as('GET', '/api/guild/trials');
    await database.prepare('UPDATE guild_trial_boards SET trials = ?, opened = 0').bind(JSON.stringify([{ kind: 'makeAny', size: 0, roll: 0 }])).run();
    await database.prepare("DELETE FROM guild_trials WHERE state = 'active'").run();
    await as('GET', '/api/guild/trials');
    const trial = () => database.prepare('SELECT progress, taken_at FROM guild_trials WHERE trial = 0 AND week = ?').bind(questPeriod('weekly', Date.now(), content).key).first();
    assert.ok(await trial());

    // The order begins, then the trial opens.
    const order = await as('POST', '/api/professions/craft', { baseId: 'sword', rarity: 'common', count: 1 });
    assert.equal(order.status, 201, JSON.stringify(order.data));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await database.prepare('UPDATE guild_trials SET taken_at = ?').bind(Date.now()).run();
    await database.prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
    const claimed = await as('POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal(claimed.data.report.items.length, 1);
    assert.equal((await trial()).progress, 0);
  });
});
