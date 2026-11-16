// Rolnictwo (999.2, the board of 1005, 1058): the Systemowe Pole farmed plot
// by plot, each plot with the crop chosen for it, the time shared among the
// sown plots, the crops kept in the Spiżarnia as the fish; in the engine and
// through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  cropsPerHour,
  expectedHarvest,
  farmingMinutes,
  farmingReport,
  growthStage,
  harvest,
  knownCrops,
  nextPlots,
  notificationsDue,
  plotCount,
  professionStats,
  workProfession,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const near = (actual, expected, share) => assert.ok(Math.abs(actual - expected) <= expected * share, `${actual} is not within ${share * 100}% of ${expected}`);

describe('Rolnictwo in the engine', () => {
  // The author, 16.11.2026: „Niech te nowe profesje odblokowują się tak jak
  // Górnictwo i Jubilerstwo na tym samym poziomie”.
  test('it opens at character level 25, as Górnictwo, next to Rybołówstwo, and raises Siła and Wytrzymałość up to the 200th level', () => {
    const farming = content.professionsById.farming;
    assert.deepEqual([farming.name, farming.unlockLevel, farming.stats, farming.maxLevel, farming.masteryLevel], ['Rolnictwo', content.professionsById.mining.unlockLevel, ['strength', 'endurance'], 200, 100]);
    assert.ok(content.professionRows.some((row) => row.includes('fishing') && row.includes('farming')));
    const stats = professionStats({ farming: { level: 11, xp: 0 } }, content);
    assert.deepEqual([stats.strength, stats.endurance, stats.dexterity], [10 * farming.statPerLevel, 10 * farming.statPerLevel, 0]);
  });

  test('the System shows the turnip first and the others by level; 4 plots, more from the 10th, 25th, 50th and 100th level', () => {
    assert.deepEqual(knownCrops(1, content).map((crop) => crop.id), ['turnip']);
    assert.deepEqual(knownCrops(8, content).map((crop) => crop.name), ['Rzepa', 'Groch', 'Proso', 'Owies']);
    assert.equal(knownCrops(180, content).length, 18);
    assert.deepEqual([1, 9, 10, 24, 25, 49, 50, 99, 100, 200].map((level) => plotCount(level, content)), [4, 4, 6, 6, 9, 9, 12, 12, 16, 16]);
    assert.deepEqual([nextPlots(1, content), nextPlots(30, content), nextPlots(100, content)], [{ level: 10, plots: 6 }, { level: 50, plots: 12 }, null]);
    assert.deepEqual(farmingMinutes(content).slice(0, 2), [10, 20]);
    assert.equal(farmingMinutes(content).at(-1), 480);
    // Every crop has its name, its genitive and a price for the innkeeper,
    // and no id of a fish: the Spiżarnia holds both.
    for (const crop of content.crops) assert.ok(crop.name && crop.genitive && crop.price > 0 && crop.perHour > 0 && !content.fishById[crop.id], crop.id);
    assert.equal(content.pantryById.turnip.group, 'crop');
    assert.equal(content.pantryById.roach.group, 'fish');
  });

  test('the time is shared among the sown plots: a field of one crop brings what one plot of it would, empty plots bring nothing', () => {
    const turnip = content.cropsById.turnip;
    assert.ok(Math.abs(cropsPerHour(turnip, 51, content) - turnip.perHour * 2) < 1e-9);
    const one = expectedHarvest(['turnip', null, null, null], 60, 1, content);
    const all = expectedHarvest(['turnip', 'turnip', 'turnip', 'turnip'], 60, 1, content);
    assert.ok(Math.abs(one.turnip.expected - all.turnip.expected) < 1e-9);
    // Two crops, a plot each and two of the turnip: a third and two thirds.
    const mixed = expectedHarvest(['turnip', 'turnip', 'peas', null], 60, 3, content);
    assert.ok(Math.abs(mixed.turnip.expected - (cropsPerHour(turnip, 3, content) * 2) / 3) < 1e-9);
    assert.ok(Math.abs(mixed.peas.expected - cropsPerHour(content.cropsById.peas, 3, content) / 3) < 1e-9);
    let grown = 0;
    for (let index = 0; index < 400; index += 1) grown += harvest({ plots: ['turnip', 'turnip', null, 'turnip'], minutes: 60, level: 1, seed: `r${index}` }, content).found.turnip ?? 0;
    near(grown / 400, turnip.perHour, 0.1);
  });

  test('a harvest plot by plot: each plot its count, null for an empty one, together the crops found; always one at least, and the seed decides it all', () => {
    const field = ['turnip', null, 'peas', 'turnip'];
    const result = harvest({ plots: field, minutes: 240, level: 10, seed: 'x' }, content);
    assert.equal(result.byPlot.length, 4);
    assert.equal(result.byPlot[1], null);
    assert.equal(result.byPlot[0] + result.byPlot[3], result.found.turnip);
    assert.equal(result.byPlot[2], result.found.peas);
    assert.deepEqual(result, harvest({ plots: field, minutes: 240, level: 10, seed: 'x' }, content));
    for (let index = 0; index < 50; index += 1) {
      const small = harvest({ plots: [null, 'mokosh-grain', null, null], minutes: 10, level: 180, seed: `g${index}` }, content);
      assert.ok(small.found['mokosh-grain'] > 0 && small.byPlot[1] > 0);
    }
  });

  test('past the 100th level each crop has the mastery\'s chance of one more, at the first plot of it', () => {
    let lucky = 0;
    let all = 0;
    for (let index = 0; index < 200; index += 1) {
      const grown = harvest({ plots: [null, 'turnip', 'turnip'], minutes: 120, level: 150, seed: `m${index}` }, content);
      lucky += grown.lucky.turnip ?? 0;
      all += grown.found.turnip ?? 0;
      assert.equal(grown.byPlot[1] + grown.byPlot[2], grown.found.turnip);
    }
    assert.ok(lucky > 0);
    assert.equal(harvest({ plots: ['turnip'], minutes: 480, level: 99, seed: 'n' }, content).lucky.turnip, undefined);
    near(lucky / (all - lucky), 0.05, 0.4);
  });

  test('the plants grow in four stages through the time of the work', () => {
    assert.deepEqual([0, 0.24, 0.25, 0.49, 0.5, 0.75, 0.99, 1].map((share) => growthStage(share, content)), [1, 1, 2, 2, 3, 4, 4, 4]);
    assert.equal(content.farming.texts.stages.length, content.farming.stages);
  });

  test('the report: the Pole, each plot\'s crops, together, the levels and the crops the System revealed', () => {
    const profession = content.professionsById.farming;
    const before = { level: 2, xp: 0 };
    const after = workProfession(profession, before, 300);
    const report = farmingReport(
      {
        minutes: 300,
        startedAt: 0,
        endsAt: 300 * 60000,
        seed: 's',
        plots: ['turnip', null, 'turnip', 'peas'],
        byPlot: [5, null, 7, 2],
        found: { turnip: 12, peas: 2 },
        before,
        after,
        character: { level: 25 },
        xp: 50,
        work: { level: 25, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.equal(report.kind, 'crops');
    assert.equal(report.placeName, 'Systemowe Pole');
    assert.deepEqual(report.plots, [{ id: 'turnip', name: 'Rzepa', count: 5 }, null, { id: 'turnip', name: 'Rzepa', count: 7 }, { id: 'peas', name: 'Groch', count: 2 }]);
    assert.deepEqual(report.crops, [
      { id: 'turnip', name: 'Rzepa', count: 12 },
      { id: 'peas', name: 'Groch', count: 2 },
    ]);
    assert.equal(report.lucky, null);
    assert.deepEqual(report.revealed, content.crops.filter((one) => one.level > 2 && one.level <= after.level).map((one) => one.id));
    assert.ok(content.farming.texts.report.includes(report.line));
  });

  test('a farming that ends sends its notification, to the Rolnictwo screen', () => {
    const due = notificationsDue({ level: 30, activity: { kind: 'crops', areaId: 'system-field', endsAt: 1000 }, buildings: {}, queue: [] }, 0, 2000, content);
    assert.deepEqual(due.map((notice) => [notice.tag, notice.url, notice.title]), [['crops', '#/profesje/rolnictwo', 'Koniec uprawy']]);
    assert.equal(due[0].body, 'Plony gotowe: Systemowe Pole. Raport czeka na odbiór.');
  });
});

describe('Rolnictwo through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('rolnik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rolnik', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const age = async (minutes, table = 'activities') =>
    (await db()).prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`).bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const farm = (body) => call('POST', '/api/professions/farm', { cookie, body });
  const claim = () => call('POST', '/api/hunts/claim', { cookie });
  const pantry = (view) => Object.fromEntries(view.pantry.map((good) => [good.id, good.count]));

  test('the Pole with its plots and the crops the System shows, the others hidden by level; locked below level 25', async () => {
    await set('level = 24');
    const before = (await character()).professions;
    const locked = before.list.find((profession) => profession.id === 'farming');
    assert.deepEqual([locked.locked, locked.unlockLevel, before.farming], [true, 25, null]);
    const refused = await farm({ plots: ['turnip'], minutes: 60 });
    assert.deepEqual([refused.status, refused.data.error.message], [403, 'Rolnictwo odblokujesz na poziomie postaci 25.']);
    await set('level = 25');
    const { professions } = await character();
    assert.ok(professions.rows.some((row) => row.includes('farming')));
    const square = professions.list.find((profession) => profession.id === 'farming');
    assert.deepEqual([square.name, square.locked, square.level], ['Rolnictwo', false, 1]);
    const { farming } = professions;
    assert.equal(farming.place.name, 'Systemowe Pole');
    assert.equal(farming.plots, 4);
    assert.deepEqual(farming.plotLevels[1], { level: 10, plots: 6 });
    assert.deepEqual(farming.stages, ['ziarna z kiełkami', 'siewki', 'młode rośliny', 'dojrzałe rośliny']);
    assert.deepEqual(farming.crops.filter((one) => !one.hidden).map((one) => one.name), ['Rzepa']);
    assert.equal(farming.crops.find((one) => one.id === 'peas').hint, 'Ukryte przez System do 3. poziomu Rolnictwa.');
    assert.equal(farming.mastery, null);
    assert.equal(farming.about.length, 2);
  });

  test('a farming: the character rests, and the report brings each plot\'s crops to the Spiżarnia, XP and levels', async () => {
    await set('hp = 1');
    assert.equal((await farm({ plots: [], minutes: 60 })).data.error.code, 'invalid_plots');
    assert.equal((await farm({ plots: ['turnip', 'turnip', 'turnip', 'turnip', 'turnip'], minutes: 60 })).data.error.code, 'invalid_plots');
    assert.equal((await farm({ plots: ['peas'], minutes: 60 })).data.error.code, 'unknown_crop');
    assert.equal((await farm({ plots: [null, null], minutes: 60 })).data.error.code, 'nothing_sown');
    assert.equal((await farm({ plots: ['turnip'], minutes: 45 })).data.error.code, 'invalid_duration');
    const started = await farm({ plots: ['turnip', null, 'turnip'], minutes: 480 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { activity } = started.data.character;
    assert.deepEqual(
      [activity.kind, activity.placeName, activity.profession, activity.plots],
      ['crops', 'Systemowe Pole', 'farming', [{ id: 'turnip', name: 'Rzepa' }, null, { id: 'turnip', name: 'Rzepa' }, null]],
    );
    assert.ok(started.data.character.regen, 'HP keeps coming back while farming');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.deepEqual([hunt.status, hunt.data.error.message], [409, 'Postać uprawia pole. Poczekaj na koniec uprawy.']);
    await age(480);
    const claimed = await claim();
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'crops');
    assert.equal(report.plots.length, 4);
    assert.deepEqual([report.plots[1], report.plots[3]], [null, null]);
    assert.equal(report.plots[0].count + report.plots[2].count, report.crops.find((one) => one.id === 'turnip').count);
    assert.deepEqual(pantry(after), Object.fromEntries(report.crops.map((one) => [one.id, one.count])));
    // The crops take no room in the bag.
    assert.equal(after.bagUsed, 0);
    // 480 minutes of work: 30 + 60 + 90 + 120 + 150 to level 6, and the
    // peas and the millet revealed on the way.
    assert.equal(report.profession.levelAfter, 6);
    assert.deepEqual(report.revealed, ['peas', 'millet']);
    assert.equal(after.stats.find((stat) => stat.id === 'strength').sources.professions, 5 * content.professionsById.farming.statPerLevel);
    assert.equal(after.stats.find((stat) => stat.id === 'endurance').sources.professions, 5 * content.professionsById.farming.statPerLevel);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'crops');
    assert.equal((await claim()).status, 409);
  });

  test('more plots from the 10th level; the Awatar farms too; calling back early gives nothing', async () => {
    await set(`professions = '{"farming":{"level":10,"xp":0}}'`);
    assert.equal((await farm({ plots: Array(7).fill('turnip'), minutes: 60 })).data.error.code, 'invalid_plots');
    const started = await farm({ plots: ['turnip', 'peas', 'millet', 'oats', 'turnip', 'peas'], minutes: 60 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual(started.data.character.activity.plots.map((one) => one.id), ['turnip', 'peas', 'millet', 'oats', 'turnip', 'peas']);
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    const back = await character();
    assert.deepEqual([back.activity, back.pantry, back.professions.list.find((profession) => profession.id === 'farming').xp], [null, [], 0]);
    // Time Points skip a farming, as any work.
    await farm({ plots: ['turnip'], minutes: 10 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.data.spent, 10);
    assert.equal((await claim()).data.report.kind, 'crops');
  });

  test('Zbylut buys the crops at their price, and they go into the Skrzynia Konta and come back out', async () => {
    await set(`gold = 0, pantry = '{"turnip":5,"roach":2}'`);
    const price = content.cropsById.turnip.price;
    const sold = await call('POST', '/api/pantry/sell', { cookie, body: { id: 'turnip', count: 3 } });
    assert.equal(sold.status, 200, JSON.stringify(sold.data));
    assert.deepEqual(sold.data.sold, { count: 3, gold: Math.floor(price * 3) });
    assert.deepEqual(pantry(sold.data.character), { roach: 2, turnip: 2 });
    assert.deepEqual(
      sold.data.character.pantry.map((good) => [good.id, good.group]),
      [
        ['roach', 'fish'],
        ['turnip', 'crop'],
      ],
    );
    const put = await call('POST', '/api/chest/goods/put', { cookie, body: { kind: 'pantry', id: 'turnip', count: 2 } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.deepEqual(
      put.data.chest.goods.map(({ kind, id, count, name }) => ({ kind, id, count, name })),
      [{ kind: 'pantry', id: 'turnip', count: 2, name: 'Rzepa' }],
    );
    const taken = await call('POST', '/api/chest/goods/take', { cookie, body: { kind: 'pantry', id: 'turnip', count: 1 } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(pantry(taken.data.character), { roach: 2, turnip: 1 });
  });
});
