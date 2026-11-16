// Rybołówstwo (999.1, 1057): fishing in the Systemowy Staw as herbs are
// gathered in the Zagajnik, the fish kept in the Spiżarnia outside the bag
// and sold to the innkeeper; in the engine and through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { expectedFish, fishCatch, fishPerHour, fishSlots, fishingMinutes, fishingReport, knownFish, notificationsDue, professionStats, workProfession } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const near = (actual, expected, share) => assert.ok(Math.abs(actual - expected) <= expected * share, `${actual} is not within ${share * 100}% of ${expected}`);

describe('Rybołówstwo in the engine', () => {
  // The author, 16.11.2026: „Niech te nowe profesje odblokowują się tak jak
  // Górnictwo i Jubilerstwo na tym samym poziomie”.
  test('it opens at character level 25, as Górnictwo, next to Rolnictwo, and raises Zręczność and Wola up to the 200th level', () => {
    const fishing = content.professionsById.fishing;
    assert.deepEqual([fishing.name, fishing.unlockLevel, fishing.stats, fishing.maxLevel, fishing.masteryLevel], ['Rybołówstwo', content.professionsById.mining.unlockLevel, ['dexterity', 'will'], 200, 100]);
    assert.equal(fishing.unlockLevel, 25);
    assert.ok(content.professionRows.some((row) => row.includes('fishing') && row.includes('farming')));
    const stats = professionStats({ fishing: { level: 11, xp: 0 } }, content);
    assert.deepEqual([stats.dexterity, stats.will, stats.strength], [10 * fishing.statPerLevel, 10 * fishing.statPerLevel, 0]);
  });

  test('the System shows the roach first and the others by level; one kind at once, more from the 10th, 25th and 50th level', () => {
    assert.deepEqual(knownFish(1, content).map((fish) => fish.id), ['roach']);
    assert.deepEqual(knownFish(10, content).map((fish) => fish.name), ['Płotka', 'Okoń', 'Karaś', 'Leszcz']);
    assert.equal(knownFish(180, content).length, 18);
    assert.deepEqual([1, 9, 10, 24, 25, 49, 50, 200].map((level) => fishSlots(level, content)), [1, 1, 2, 2, 3, 3, 4, 4]);
    assert.deepEqual(fishingMinutes(content).slice(0, 2), [10, 20]);
    assert.equal(fishingMinutes(content).at(-1), 480);
    // Every fish has its name, its genitive and a price for the innkeeper.
    for (const fish of content.fish) assert.ok(fish.name && fish.genitive && fish.price > 0 && fish.perHour > 0, fish.id);
  });

  test('each level catches 2% more; a fishing brings about the expected fish, always at least one, and the seed decides it all', () => {
    const roach = content.fishById.roach;
    assert.ok(Math.abs(fishPerHour(roach, 51, content) - roach.perHour * 2) < 1e-9);
    let caught = 0;
    for (let index = 0; index < 400; index += 1) caught += fishCatch({ fishIds: ['roach'], minutes: 60, level: 1, seed: `r${index}` }, content).found.roach ?? 0;
    near(caught / 400, roach.perHour, 0.1);
    // Two kinds share the time.
    const shared = expectedFish(['roach', 'perch'], 60, 10, content);
    assert.ok(Math.abs(shared.roach.expected - fishPerHour(roach, 10, content) / 2) < 1e-9);
    for (let index = 0; index < 50; index += 1) {
      assert.ok(Object.keys(fishCatch({ fishIds: ['golden-fish'], minutes: 10, level: 180, seed: `g${index}` }, content).found).length > 0);
    }
    assert.deepEqual(fishCatch({ fishIds: ['roach', 'perch'], minutes: 240, level: 30, seed: 'x' }, content), fishCatch({ fishIds: ['roach', 'perch'], minutes: 240, level: 30, seed: 'x' }, content));
  });

  test('past the 100th level each fish has the mastery\'s chance of one more', () => {
    let lucky = 0;
    let all = 0;
    for (let index = 0; index < 200; index += 1) {
      const caught = fishCatch({ fishIds: ['roach'], minutes: 120, level: 150, seed: `m${index}` }, content);
      lucky += caught.lucky.roach ?? 0;
      all += caught.found.roach ?? 0;
    }
    assert.ok(lucky > 0);
    assert.equal(fishCatch({ fishIds: ['roach'], minutes: 480, level: 99, seed: 'n' }, content).lucky.roach, undefined);
    near(lucky / (all - lucky), 0.05, 0.4);
  });

  test('the report: the Staw, the fish, the levels and the fish the System revealed', () => {
    const profession = content.professionsById.fishing;
    const before = { level: 9, xp: 0 };
    const after = workProfession(profession, before, 300);
    const character = { level: 25 };
    const report = fishingReport(
      { minutes: 300, startedAt: 0, endsAt: 300 * 60000, seed: 's', found: { roach: 12, perch: 3 }, before, after, character, xp: 50, work: { level: 25, timePoints: 0, messages: [] } },
      content,
    );
    assert.equal(report.kind, 'fish');
    assert.equal(report.placeName, 'Systemowy Staw');
    assert.deepEqual(report.fish, [
      { id: 'roach', name: 'Płotka', count: 12 },
      { id: 'perch', name: 'Okoń', count: 3 },
    ]);
    assert.equal(report.lucky, null);
    assert.deepEqual(report.revealed, content.fish.filter((one) => one.level > 9 && one.level <= after.level).map((one) => one.id));
    assert.ok(content.fishing.texts.report.includes(report.line));
  });

  test('a fishing that ends sends its notification, to the Rybołówstwo screen', () => {
    const due = notificationsDue({ level: 20, activity: { kind: 'fish', areaId: 'system-pond', endsAt: 1000 }, buildings: {}, queue: [] }, 0, 2000, content);
    assert.deepEqual(due.map((notice) => [notice.tag, notice.url, notice.title]), [['fish', '#/profesje/rybolowstwo', 'Koniec połowu']]);
    assert.equal(due[0].body, 'Połów zakończony: Systemowy Staw. Raport czeka na odbiór.');
  });
});

describe('Rybołówstwo through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('rybak'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rybak', classId: 'archer', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const age = async (minutes, table = 'activities') =>
    (await db()).prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`).bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const fish = (body) => call('POST', '/api/professions/fish', { cookie, body });
  const claim = () => call('POST', '/api/hunts/claim', { cookie });
  const pantry = (view) => Object.fromEntries(view.pantry.map((good) => [good.id, good.count]));

  test('the Staw with the fish the System shows, the others hidden by level; the square next to Rolnictwo, locked below level 25', async () => {
    await set('level = 24');
    const before = (await character()).professions;
    const locked = before.list.find((profession) => profession.id === 'fishing');
    assert.deepEqual([locked.locked, locked.unlockLevel, before.fishing], [true, 25, null]);
    const refused = await fish({ fish: ['roach'], minutes: 60 });
    assert.deepEqual([refused.status, refused.data.error.message], [403, 'Rybołówstwo odblokujesz na poziomie postaci 25.']);
    await set('level = 25');
    const { professions } = await character();
    assert.deepEqual(professions.rows, [['herbalism', 'mining'], ['alchemy', 'jewelcrafting'], ['fishing', 'farming'], ['cooking', 'crafting']]);
    const square = professions.list.find((profession) => profession.id === 'fishing');
    assert.deepEqual([square.name, square.locked, square.level], ['Rybołówstwo', false, 1]);
    const { fishing } = professions;
    assert.equal(fishing.place.name, 'Systemowy Staw');
    assert.equal(fishing.slots, 1);
    assert.deepEqual(fishing.fish.filter((one) => !one.hidden).map((one) => one.name), ['Płotka']);
    assert.equal(fishing.fish.find((one) => one.id === 'perch').hint, 'Ukryte przez System do 3. poziomu Rybołówstwa.');
    assert.equal(fishing.mastery, null);
    assert.equal(fishing.about.length, 2);
  });

  test('a fishing: the character rests, and the report brings the fish to the Spiżarnia, XP and levels', async () => {
    await set('hp = 1');
    assert.equal((await fish({ fish: [], minutes: 60 })).data.error.code, 'invalid_fish');
    assert.equal((await fish({ fish: ['perch'], minutes: 60 })).data.error.code, 'unknown_fish');
    assert.equal((await fish({ fish: ['roach', 'roach'], minutes: 60 })).data.error.code, 'invalid_fish');
    assert.equal((await fish({ fish: ['roach'], minutes: 45 })).data.error.code, 'invalid_duration');
    const started = await fish({ fish: ['roach'], minutes: 480 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { activity } = started.data.character;
    assert.deepEqual([activity.kind, activity.placeName, activity.profession, activity.fish], ['fish', 'Systemowy Staw', 'fishing', [{ id: 'roach', name: 'Płotka' }]]);
    assert.ok(started.data.character.regen, 'HP keeps coming back while fishing');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.deepEqual([hunt.status, hunt.data.error.message], [409, 'Postać łowi ryby. Poczekaj na koniec połowu.']);
    await age(480);
    const claimed = await claim();
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'fish');
    assert.ok(report.fish.some((one) => one.id === 'roach' && one.count > 0));
    assert.deepEqual(pantry(after), Object.fromEntries(report.fish.map((one) => [one.id, one.count])));
    // The fish take no room in the bag.
    assert.equal(after.bagUsed, 0);
    // 480 minutes of work: 30 + 60 + 90 + 120 + 150 to level 6, and the
    // perch and the crucian revealed on the way.
    assert.equal(report.profession.levelAfter, 6);
    assert.deepEqual(report.revealed, ['perch', 'crucian']);
    assert.equal(after.stats.find((stat) => stat.id === 'dexterity').sources.professions, 5 * content.professionsById.fishing.statPerLevel);
    assert.equal(after.stats.find((stat) => stat.id === 'will').sources.professions, 5 * content.professionsById.fishing.statPerLevel);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'fish');
    assert.equal((await claim()).status, 409);
  });

  test('more kinds at once from the 10th level, and never more than the slots', async () => {
    await set(`professions = '{"fishing":{"level":10,"xp":0}}'`);
    const tooMany = await fish({ fish: ['roach', 'perch', 'crucian'], minutes: 60 });
    assert.deepEqual([tooMany.data.error.code, tooMany.data.error.message], ['too_many_fish', 'Na tym poziomie łowisz naraz najwyżej 2 rodzaje ryb.']);
    const started = await fish({ fish: ['roach', 'perch'], minutes: 60 });
    assert.equal(started.status, 201);
    assert.deepEqual(started.data.character.activity.fish.map((one) => one.id), ['roach', 'perch']);
  });

  test('calling back early gives nothing; Time Points skip a fishing; Zbylut buys the fish, or they go away', async () => {
    await fish({ fish: ['roach'], minutes: 60 });
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    const back = await character();
    assert.deepEqual([back.activity, back.pantry, back.professions.list.find((profession) => profession.id === 'fishing').xp], [null, [], 0]);
    await fish({ fish: ['roach'], minutes: 10 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.data.spent, 10);
    assert.equal((await claim()).data.report.kind, 'fish');

    await set(`gold = 0, pantry = '{"roach":5,"perch":3}'`);
    const price = content.fishById.roach.price;
    const sold = await call('POST', '/api/pantry/sell', { cookie, body: { id: 'roach', count: 3 } });
    assert.equal(sold.status, 200, JSON.stringify(sold.data));
    assert.deepEqual(sold.data.sold, { count: 3, gold: Math.floor(price * 3) });
    assert.deepEqual(pantry(sold.data.character), { roach: 2, perch: 3 });
    assert.equal(sold.data.character.pantry.find((good) => good.id === 'roach').price, price);
    assert.equal((await call('POST', '/api/pantry/sell', { cookie, body: { id: 'roach', count: 3 } })).data.error.code, 'invalid_count');
    const thrown = await call('POST', '/api/pantry/discard', { cookie, body: { id: 'perch', count: 3 } });
    assert.deepEqual(pantry(thrown.data.character), { roach: 2 });
    assert.equal((await call('POST', '/api/pantry/sell', { cookie, body: { id: 'pike', count: 1 } })).data.error.code, 'no_good');
    assert.equal((await call('POST', '/api/pantry/sell', { cookie, body: { id: 'boot', count: 1 } })).data.error.code, 'unknown_good');
  });

  test('the fish go into the Skrzynia Konta and come back out', async () => {
    await set(`pantry = '{"carp":4}'`);
    const put = await call('POST', '/api/chest/goods/put', { cookie, body: { kind: 'pantry', id: 'carp', count: 3 } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.deepEqual(
      put.data.chest.goods.map(({ kind, id, count, name }) => ({ kind, id, count, name })),
      [{ kind: 'pantry', id: 'carp', count: 3, name: 'Karp' }],
    );
    assert.deepEqual(pantry(put.data.character), { carp: 1 });
    const taken = await call('POST', '/api/chest/goods/take', { cookie, body: { kind: 'pantry', id: 'carp', count: 2 } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(pantry(taken.data.character), { carp: 3 });
  });
});
