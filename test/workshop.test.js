// Rzemieślnictwo: the Warsztat in the engine (patterns, rarities, cost, time,
// chance, items, report, quests and notifications) and through the API,
// where the professions show only with PROFESSIONS on.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  craftChance,
  craftCost,
  craftItems,
  craftRarities,
  drawQuests,
  itemMinutes,
  knownPatterns,
  notificationsDue,
  orderMinutes,
  questPeriod,
  questText,
  workshopReport,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const base = (id) => content.basesById[id];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

describe('the Warsztat in the engine', () => {
  test('the first base of each family is known at once, the later ones from level 10, and no jewellery', () => {
    const first = knownPatterns(1, content).map((pattern) => pattern.id);
    assert.equal(first.length, 18);
    assert.ok(first.includes('sword') && first.includes('surplice') && first.includes('boots'));
    assert.ok(!first.some((id) => ['broadsword', 'amulet', 'ring', 'talisman'].includes(id)));
    assert.deepEqual(knownPatterns(9, content).length, 18);
    const all = knownPatterns(10, content).map((pattern) => pattern.id);
    assert.equal(all.length, 36);
    assert.ok(all.includes('broadsword') && all.includes('pointed-shoes') && !all.includes('signet-ring'));
  });

  test('the rarities open with the level: rare at 5, unique at 15 and divine at 80', () => {
    assert.deepEqual(craftRarities(1, content).map((rarity) => rarity.id), ['common']);
    assert.deepEqual(craftRarities(5, content).map((rarity) => rarity.id), ['common', 'rare']);
    assert.deepEqual(craftRarities(15, content).map((rarity) => rarity.id), ['common', 'rare', 'unique']);
    assert.equal(craftRarities(79, content).length, 6);
    assert.equal(craftRarities(80, content).length, 7);
  });

  test('an item takes parts of its rarity and stone, and iron ore or wood for its family, more with each rarity up', () => {
    assert.deepEqual(craftCost(base('sword'), 'common', 1, content), { parts: { scraps: 6 }, resources: { stone: 18, 'iron-ore': 6 } });
    assert.deepEqual(craftCost(base('bow'), 'rare', 2, content), { parts: { straps: 12 }, resources: { stone: 72, wood: 24 } });
    assert.deepEqual(craftCost(base('broadsword'), 'epic', 1, content), { parts: { shards: 6 }, resources: { stone: 72, 'iron-ore': 24 } });
    assert.deepEqual(craftCost(base('pavise'), 'common', 1, content), { parts: { scraps: 4 }, resources: { stone: 12, wood: 4 } });
    assert.deepEqual(craftCost(base('hood'), 'common', 1, content), { parts: { scraps: 4 }, resources: { stone: 12 } });
    assert.deepEqual(craftCost(base('gloves'), 'common', 3, content), { parts: { scraps: 9 }, resources: { stone: 27 } });
  });

  test('a common item takes an hour at level 1, each rarity up twice as long, each level 1% less, down to half', () => {
    assert.equal(itemMinutes('common', 1, content), 60);
    assert.equal(itemMinutes('rare', 1, content), 120);
    assert.equal(itemMinutes('divine', 1, content), 3840);
    near(itemMinutes('common', 11, content), 54);
    assert.equal(itemMinutes('common', 51, content), 30);
    assert.equal(itemMinutes('common', 100, content), 30);
    assert.equal(orderMinutes(5, 'common', 1, content), 300);
    assert.equal(orderMinutes(3, 'common', 11, content), 162);
    assert.equal(orderMinutes(1, 'rare', 5, content), 116);
  });

  test('a common item always comes out; the others more often with each level, at most 95%', () => {
    assert.equal(craftChance('common', 1, content), 1);
    assert.equal(craftChance('common', 100, content), 1);
    near(craftChance('rare', 5, content), 0.92);
    near(craftChance('epic', 25, content), 0.67);
    near(craftChance('divine', 80, content), 0.495);
    assert.equal(craftChance('rare', 100, content), 0.95);
  });

  test('the items come from the seed one after another, as loot of the base, rarity and level, named by the creatures met', () => {
    const order = (count, seed, more = {}) =>
      craftItems({ baseId: 'sword', rarityId: 'common', count, level: 12, professionLevel: 1, seed, ...more }, content);
    const five = order(5, 'w');
    assert.equal(five.length, 5);
    assert.ok(five.every((result) => result.made && result.item.base === 'sword' && result.item.rarity === 'common' && result.item.level === 12));
    assert.deepEqual(order(5, 'w'), five);
    // An order stopped after two keeps the draws of those two.
    assert.deepEqual(order(2, 'w'), five.slice(0, 2));

    const named = Object.values(content.affixNamesByMonster).filter((name) => name.prefix);
    const met = [named[0].monster, named[1].monster];
    for (let index = 0; index < 20; index++) {
      const results = craftItems({ baseId: 'helmet', rarityId: 'epic', count: 5, level: 30, professionLevel: 25, met, seed: `m${index}` }, content);
      for (const { item } of results.filter((result) => result.made)) {
        assert.ok(item.affixes.length > 0);
        assert.ok(item.affixes.every((affix) => met.includes(affix.monster)), JSON.stringify(item.affixes));
      }
    }
    const unnamed = craftItems({ baseId: 'helmet', rarityId: 'epic', count: 5, level: 30, professionLevel: 25, met: [], seed: 'n' }, content);
    assert.ok(unnamed.filter((result) => result.made).every(({ item }) => item.affixes.every((affix) => affix.monster === undefined)));
  });

  test('a rarer item fails as often as its chance says', () => {
    let failed = 0;
    for (let index = 0; index < 200; index++) {
      const results = craftItems({ baseId: 'axe', rarityId: 'rare', count: 5, level: 10, professionLevel: 5, seed: `f${index}` }, content);
      failed += results.filter((result) => !result.made).length;
      assert.ok(results.every((result) => result.made === Boolean(result.item)));
    }
    const share = failed / 1000;
    assert.ok(share > 0.04 && share < 0.12, String(share));
  });

  test('the report names the items made and failed, and the patterns and rarities the System opens', () => {
    const character = newCharacter('warrior', { level: 12 });
    const work = { level: 12, xp: 0, timePoints: 0, messages: [] };
    const results = craftItems({ baseId: 'axe', rarityId: 'common', count: 2, level: 12, professionLevel: 9, seed: 'r' }, content);
    const report = workshopReport(
      {
        base: base('axe'),
        rarityId: 'common',
        results: [...results, { made: false }],
        minutes: 180,
        startedAt: 0,
        endsAt: 10800000,
        seed: 'r',
        stopped: false,
        before: { level: 4, xp: 0 },
        after: { level: 10, xp: 0 },
        character,
        xp: 30,
        work,
      },
      content,
    );
    assert.equal(report.kind, 'items');
    assert.equal(report.placeName, 'Systemowy Warsztat');
    assert.ok(content.workshop.texts.report.includes(report.line));
    assert.deepEqual(report.base, { id: 'axe', name: 'Topór' });
    assert.deepEqual(report.rarity, { id: 'common', name: 'pospolity' });
    assert.equal(report.items.length, 2);
    assert.equal(report.items[0].rarityName, 'pospolity');
    assert.equal(report.failed, 1);
    assert.equal(report.made, 'Wykonano: 2 × Topór.');
    assert.equal(report.failedText, 'Nie udało się: 1 × Topór. Części przepadły, a zasoby obozu wróciły.');
    assert.equal(report.stopped, null);
    assert.equal(report.revealed.length, 18);
    assert.ok(report.revealed.includes('war-axe'));
    assert.ok(report.system.includes('Osiągnięto poziom Rzemieślnictwa: 10'), report.system.join(' | '));
    assert.ok(report.system.includes('Zdobyto Siłę: +6'));
    assert.ok(report.system.some((line) => line.startsWith('System odsłania nowe wzory: Pałasz, Czekan, Kordelas')));
    assert.ok(report.system.includes('System pozwala już wykonywać przedmioty rzadkości: rzadki'));
  });

  test('narrator quests ask for items with professions only, count the ones made and pay twice as much', () => {
    const character = newCharacter('warrior', { level: 12 });
    const drawn = (hasProfessions, periodId) =>
      Array.from({ length: 60 }, (_, index) => drawQuests(periodId, { character, hasTable: true, hasProfessions, seed: `q${index}` }, content)).flat();
    assert.ok(!drawn(false, 'daily').some((quest) => quest.kind.startsWith('make')));
    const daily = drawn(true, 'daily');
    const made = daily.filter((quest) => quest.kind === 'make');
    assert.ok(made.length > 0 && made.every((quest) => quest.count === 1));
    assert.equal(questText(made[0], content), 'Wykonaj 1 przedmiot.');
    // Gold for a level-12 character: (10 + 4 × 12) ± 20%, and twice that here.
    const gold = (quests) => quests.filter((quest) => quest.reward.kind === 'gold').map((quest) => quest.reward.amount);
    assert.ok(gold(made).every((amount) => amount >= 92), gold(made).join());
    assert.ok(gold(daily.filter((quest) => quest.kind === 'explore')).every((amount) => amount <= 70));
    const weekly = drawn(true, 'weekly').filter((quest) => quest.kind.startsWith('make'));
    assert.ok(weekly.length > 0 && weekly.every((quest) => quest.kind === 'makeAny' && quest.count === 5));
    assert.equal(questText(weekly[0], content), 'Wykonaj łącznie 5 przedmiotów.');
    const quests = {
      daily: { period: 'd', chest: false, quests: [{ kind: 'make', count: 1, progress: 0, claimed: false }] },
      weekly: { period: 'w', chest: false, quests: [{ kind: 'makeAny', count: 5, progress: 1, claimed: false }] },
    };
    const moved = addQuestProgress(quests, { made: 3 });
    assert.equal(moved.daily.quests[0].progress, 1);
    assert.equal(moved.weekly.quests[0].progress, 4);
  });

  test('the end of an order comes as a phone notification', () => {
    const activity = { kind: 'items', areaId: 'system-workbench', endsAt: 2000 };
    const [due] = notificationsDue({ level: 12, activity, buildings: {}, queue: [] }, 1000, 3000, content);
    assert.equal(due.title, 'Koniec wyrobu');
    assert.equal(due.body, 'Przedmioty gotowe: Systemowy Warsztat. Raport czeka na odbiór.');
    assert.equal(due.url, '#/profesje/rzemieslnictwo');
  });
});

describe('the Warsztat through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kowalka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kowalka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 12, xp = 0, parts = '{"scraps":30}', resources = '{"wood":50,"stone":200,"iron-ore":40}'`).run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  // Moves the current activity `minutes` into the past.
  const age = async (minutes) =>
    (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  const craft = (body) => call('POST', '/api/professions/craft', { cookie, body });
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const parts = (view) => Object.fromEntries(view.crafting.parts.filter((part) => part.count > 0).map((part) => [part.id, part.count]));
  const addItems = async (count) => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (let index = 0; index < count; index++) {
      await database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)')
        .bind(id, JSON.stringify({ base: 'ring', slot: 'ring', level: 1, rarity: 'common', affixes: [] }))
        .run();
    }
  };

  test('the Warsztat shows the slots with their patterns, what one item takes, and the rarities', async () => {
    const { workshop } = (await character()).professions;
    assert.equal(workshop.place.name, 'Systemowy Warsztat');
    assert.equal(workshop.maxCount, 5);
    assert.deepEqual(workshop.slots.map((slot) => slot.name), ['Broń', 'Pancerz', 'Druga ręka', 'Hełm', 'Rękawice', 'Buty']);
    const [sword, broadsword] = workshop.slots[0].patterns;
    assert.deepEqual(sword, {
      id: 'sword',
      name: 'Miecz',
      level: 1,
      parts: 6,
      resources: [
        { id: 'stone', name: 'Kamień', amount: 18 },
        { id: 'iron-ore', name: 'Ruda żelaza', amount: 6 },
      ],
      classNames: ['Wojownik'],
      classLevel: null,
    });
    assert.deepEqual(broadsword, { id: 'broadsword', level: 10, hidden: true, hint: 'Ukryte przez System do 10. poziomu Rzemieślnictwa.' });
    assert.equal(workshop.slots[5].patterns[0].classNames, null);
    const [common, rare] = workshop.rarities;
    assert.deepEqual(common, { id: 'common', name: 'pospolity', color: '#9b9b9b', level: 1, step: 1, part: { id: 'scraps', name: 'Ścinki' }, chance: 1, itemMinutes: 60 });
    assert.equal(rare.hidden, true);
    assert.equal(rare.hint, 'Ukryte przez System do 5. poziomu Rzemieślnictwa.');
  });

  test('an order checks the pattern, the rarity, the count, the parts, the resources and the bag, and takes it all at the start', async () => {
    const error = async (body) => (await craft(body)).data.error?.code;
    assert.equal(await error({ baseId: 'broadsword', rarity: 'common', count: 1 }), 'unknown_pattern');
    assert.equal(await error({ baseId: 'ring', rarity: 'common', count: 1 }), 'unknown_pattern');
    assert.equal(await error({ baseId: 'sword', rarity: 'rare', count: 1 }), 'unknown_rarity');
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 0 }), 'invalid_count');
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 6 }), 'invalid_count');
    assert.equal((await craft({ baseId: 'sword', rarity: 'common', count: 1 })).data.error === undefined, true);
    await call('POST', '/api/hunts/cancel', { cookie });
    await set(`parts = '{"scraps":5}'`);
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 1 }), 'no_parts');
    await set(`parts = '{"scraps":30}', resources = '{"stone":17,"iron-ore":40}'`);
    const short = await craft({ baseId: 'sword', rarity: 'common', count: 1 });
    assert.equal(short.data.error.code, 'no_resources');
    assert.equal(short.data.error.message, 'Brakuje zasobów: Kamień (potrzeba 18).');
    await set(`resources = '{"wood":50,"stone":200,"iron-ore":40}'`);
    await addItems(28);
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 3 }), 'bag_full');

    await set('hp = 1');
    const started = await craft({ baseId: 'sword', rarity: 'common', count: 2 });
    assert.equal(started.status, 201);
    const after = started.data.character;
    assert.deepEqual(after.activity.base, { id: 'sword', name: 'Miecz' });
    assert.equal(after.activity.kind, 'items');
    assert.equal(after.activity.placeName, 'Systemowy Warsztat');
    assert.equal(after.activity.rarityName, 'pospolity');
    assert.equal(after.activity.count, 2);
    assert.equal(after.activity.minutes, 120);
    assert.deepEqual(parts(after), { scraps: 18 });
    assert.deepEqual(after.resources, { wood: 50, stone: 164, 'iron-ore': 28 });
    assert.ok(after.regen, 'HP keeps coming back while crafting');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.equal(hunt.data.error.message, 'Postać wykonuje przedmioty. Poczekaj na koniec wyrobu.');
    assert.equal((await craft({ baseId: 'sword', rarity: 'common', count: 1 })).status, 409);
  });

  test('the parts of the table\'s orders done by now count, and the queue keeps the rest', async () => {
    const now = Date.now();
    const queue = [
      { id: 'a', kind: 'material', key: 'wolf-pelt:common', count: 4, partId: 'scraps', parts: 4, bonus: 0, startsAt: now - 7200000, endsAt: now - 3600000 },
      { id: 'b', kind: 'material', key: 'wolf-pelt:common', count: 3, partId: 'scraps', parts: 3, bonus: 0, startsAt: now - 3600000, endsAt: now + 3600000 },
    ];
    await set(`parts = '{"scraps":2}', crafting = ?`, JSON.stringify(queue));
    const started = await craft({ baseId: 'sword', rarity: 'common', count: 1 });
    assert.equal(started.status, 201);
    assert.deepEqual(parts(started.data.character), {});
    assert.deepEqual(started.data.character.crafting.queue.map((order) => order.id), ['b']);
  });

  test('the report brings the items into the bag, the profession\'s levels, the quests and the character\'s XP', async () => {
    const now = Date.now();
    const quest = (kind, count) => ({ kind, count, progress: 0, reward: { kind: 'gold', amount: 10 }, claimed: false });
    const period = (periodId, quests) => ({ period: questPeriod(periodId, now, content).key, chest: false, quests });
    await set('quests = ?', JSON.stringify({ daily: period('daily', [quest('make', 1)]), weekly: period('weekly', [quest('makeAny', 5)]) }));
    await craft({ baseId: 'axe', rarity: 'common', count: 2 });
    await age(120);
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'items');
    assert.equal(report.minutes, 120);
    assert.equal(report.items.length, 2);
    assert.ok(report.items.every((item) => item.base === 'axe' && item.level === 12 && item.rarity === 'common'));
    assert.equal(report.failed, 0);
    assert.equal(report.made, 'Wykonano: 2 × Topór.');
    assert.equal(report.profession.levelAfter, 3);
    assert.ok(report.summary.xp > 0);
    assert.equal(after.activity, null);
    assert.equal(after.bag.filter((item) => item.base === 'axe').length, 2);
    assert.equal(after.professions.list[2].level, 3);
    assert.equal(after.stats.find((stat) => stat.id === 'strength').sources.professions, 2);
    // Nothing comes back from an order made in full.
    assert.deepEqual(parts(after), { scraps: 18 });
    assert.deepEqual(after.resources, { wood: 50, stone: 164, 'iron-ore': 28 });
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'items');
    assert.deepEqual(data.reports[0].items, [{ name: 'Topór', count: 2 }]);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 409);
    // The narrator's quests for items count the two.
    const stored = JSON.parse((await (await db()).prepare('SELECT quests FROM characters').first()).quests);
    assert.deepEqual([stored.daily.quests[0].progress, stored.weekly.quests[0].progress], [1, 2]);
  });

  test('a failed item loses its parts and gives back its resources', async () => {
    await set(`professions = '{"crafting":{"level":80,"xp":0}}', parts = '{"star-shard":30}', resources = '{"wood":100,"stone":2000,"iron-ore":500}'`);
    await craft({ baseId: 'helmet', rarity: 'divine', count: 5 });
    await age(10000);
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.items.length + report.failed, 5);
    assert.ok(report.items.every((item) => item.rarity === 'divine'));
    // Stone 3 × 4 parts × step 7 and iron ore 1 × 4 × 7 for each helmet.
    assert.deepEqual(parts(after), { 'star-shard': 10 });
    assert.equal(after.resources.stone, 2000 - 84 * 5 + 84 * report.failed);
    assert.equal(after.resources['iron-ore'], 500 - 28 * 5 + 28 * report.failed);
    assert.equal(report.failedText === null, report.failed === 0);
  });

  test('called back early, the character keeps the items done and gets back the parts and resources for the rest', async () => {
    await craft({ baseId: 'sword', rarity: 'common', count: 3 });
    const none = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(none.status, 200);
    assert.equal(none.data.report, null);
    assert.deepEqual(parts(none.data.character), { scraps: 30 });
    assert.deepEqual(none.data.character.resources, { wood: 50, stone: 200, 'iron-ore': 40 });
    assert.equal(none.data.character.professions.list[2].xp, 0);

    await craft({ baseId: 'sword', rarity: 'common', count: 3 });
    await age(70);
    const { report, character: after } = (await call('POST', '/api/hunts/cancel', { cookie })).data;
    assert.equal(report.kind, 'items');
    assert.equal(report.minutes, 70);
    assert.equal(report.items.length, 1);
    assert.equal(report.stopped, 'Wyrób przerwany. Części i zasoby na resztę wróciły.');
    assert.equal(report.profession.xp, 70);
    assert.equal(after.activity, null);
    assert.deepEqual(parts(after), { scraps: 24 });
    assert.deepEqual(after.resources, { wood: 50, stone: 182, 'iron-ore': 34 });
    assert.equal(after.bag.filter((item) => item.base === 'sword').length, 1);
  });

  test('Time Points skip an order', async () => {
    await craft({ baseId: 'gloves', rarity: 'common', count: 1 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 60);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.report.kind, 'items');
  });
});
