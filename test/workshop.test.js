// Rzemieślnictwo: the Warsztat in the engine (patterns, rarities, cost, time,
// chance, items, report, quests and notifications) and through the API,
// where the professions show only with PROFESSIONS on.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  campBonus,
  craftChance,
  craftCost,
  craftItems,
  craftLuck,
  craftParts,
  craftRarities,
  craftUpgrades,
  craftableBases,
  drawQuests,
  weekShare,
  itemMinutes,
  itemUpgradeCost,
  knownPatterns,
  notificationsDue,
  orderMinutes,
  partExchangeBlock,
  partPrice,
  partSource,
  patternFrom,
  questPeriod,
  questText,
  rollUpgrade,
  salvageYield,
  scrollCost,
  scrollMinutes,
  scrollOrderMinutes,
  sellPrice,
  shopBlock,
  shopBought,
  shopDay,
  shopLeft,
  shopOffer,
  workshopReport,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const base = (id) => content.basesById[id];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

describe('the Warsztat in the engine', () => {
  test('the first base of each family is known at once, the later ones from level 10 and their class levels, and no jewellery', () => {
    const first = knownPatterns(1, [], content).map((pattern) => pattern.id);
    assert.equal(first.length, 19);
    assert.ok(first.includes('sword') && first.includes('surplice') && first.includes('boots') && first.includes('misericorde'));
    assert.ok(!first.some((id) => ['broadsword', 'amulet', 'ring', 'talisman'].includes(id)));
    assert.deepEqual(knownPatterns(9, [], content).length, 19);
    const all = knownPatterns(10, [], content).map((pattern) => pattern.id);
    assert.equal(all.length, 38);
    assert.ok(all.includes('broadsword') && all.includes('pointed-shoes') && all.includes('dirk') && !all.includes('signet-ring'));
    // The bases of class levels 25 and 50 open at the same profession levels.
    assert.equal(knownPatterns(24, [], content).length, 38);
    const at25 = knownPatterns(25, [], content).map((pattern) => pattern.id);
    assert.equal(at25.length, 57);
    assert.ok(at25.includes('saber') && at25.includes('laced-shoes') && !at25.includes('estoc') && !at25.includes('band-ring'));
    const at50 = knownPatterns(50, [], content).map((pattern) => pattern.id);
    assert.equal(at50.length, 76);
    assert.ok(at50.includes('estoc') && at50.includes('greaves') && !at50.includes('family-ring'));
    // Tier V at 75 and Tier VI (665) at the 100th level, the profession's last.
    assert.equal(knownPatterns(74, [], content).length, 76);
    const at75 = knownPatterns(75, [], content).map((pattern) => pattern.id);
    assert.ok(at75.length === 95 && at75.includes('karabela') && !at75.includes('flamberge'));
    assert.equal(knownPatterns(99, [], content).length, 95);
    const at100 = knownPatterns(100, [], content).map((pattern) => pattern.id);
    assert.ok(at100.length === 114 && at100.includes('flamberge') && at100.includes('sabatons') && !at100.includes('cameo'));
    // Tier VII (814) at the 125th, which Rzemieślnictwo reaches since it goes
    // on to the 200th (825).
    assert.equal(knownPatterns(124, [], content).length, 114);
    const at125 = knownPatterns(125, [], content).map((pattern) => pattern.id);
    assert.ok(at125.length === 133 && at125.includes('coronation-sword') && at125.includes('safian-boots') && !at125.includes('pectoral'));
    assert.equal(content.professionsById[content.workshop.profession].maxLevel, 200);
    assert.equal(knownPatterns(200, [], content).length, 133);
    // Taking one apart teaches it earlier.
    assert.ok(knownPatterns(10, ['estoc'], content).some((pattern) => pattern.id === 'estoc'));
    assert.ok(knownPatterns(50, ['gothic-armor'], content).some((pattern) => pattern.id === 'gothic-armor'));
    assert.ok(knownPatterns(100, ['maximilian-armor'], content).some((pattern) => pattern.id === 'maximilian-armor'));
  });

  test('the rarities open with the level: rare at 5, unique at 15 and divine at 80', () => {
    assert.deepEqual(craftRarities(1, content).map((rarity) => rarity.id), ['common']);
    assert.deepEqual(craftRarities(5, content).map((rarity) => rarity.id), ['common', 'rare']);
    assert.deepEqual(craftRarities(15, content).map((rarity) => rarity.id), ['common', 'rare', 'unique']);
    assert.equal(craftRarities(79, content).length, 6);
    assert.equal(craftRarities(80, content).length, 7);
  });

  test('an item takes parts of its rarity and stone, and iron ore or wood for its family, more with each rarity up', () => {
    assert.deepEqual(craftCost(base('sword'), 'common', 1, 1, content), { parts: { scraps: 6 }, resources: { stone: 18, 'iron-ore': 6 } });
    assert.deepEqual(craftCost(base('bow'), 'rare', 2, 1, content), { parts: { straps: 12 }, resources: { stone: 72, wood: 24 } });
    assert.deepEqual(craftCost(base('broadsword'), 'epic', 1, 1, content), { parts: { shards: 6 }, resources: { stone: 72, 'iron-ore': 24 } });
    assert.deepEqual(craftCost(base('pavise'), 'common', 1, 1, content), { parts: { scraps: 4 }, resources: { stone: 12, wood: 4 } });
    assert.deepEqual(craftCost(base('hood'), 'common', 1, 1, content), { parts: { scraps: 4 }, resources: { stone: 12 } });
    assert.deepEqual(craftCost(base('gloves'), 'common', 3, 1, content), { parts: { scraps: 9 }, resources: { stone: 27 } });
  });

  test('a common item takes half an hour at level 1, each rarity up twice as long, each level 1% less, down to half', () => {
    assert.equal(itemMinutes('common', 1, content), 30);
    assert.equal(itemMinutes('rare', 1, content), 60);
    assert.equal(itemMinutes('divine', 1, content), 1920);
    near(itemMinutes('common', 11, content), 27);
    assert.equal(itemMinutes('common', 51, content), 15);
    assert.equal(itemMinutes('common', 100, content), 15);
    // Past the 100th (825) still half.
    assert.equal(itemMinutes('common', 200, content), 15);
    assert.equal(orderMinutes(5, 'common', 1, content), 150);
    assert.equal(orderMinutes(3, 'common', 11, content), 81);
    assert.equal(orderMinutes(1, 'rare', 5, content), 58);
  });

  test('a common item always comes out; the others more often with each level, at most 95%', () => {
    assert.equal(craftChance('common', 1, content), 1);
    assert.equal(craftChance('common', 100, content), 1);
    near(craftChance('rare', 5, content), 0.92);
    near(craftChance('epic', 25, content), 0.67);
    near(craftChance('divine', 80, content), 0.495);
    assert.equal(craftChance('rare', 100, content), 0.95);
    // Past the 100th (825) never above 95%.
    assert.equal(craftChance('divine', 200, content), 0.95);
    assert.equal(craftChance('common', 200, content), 1);
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

  test('luck makes an item one rarity above the ordered one 5% of the time and two above 1%, both a point more every 20 levels', () => {
    near(craftLuck(1, content).oneUp, 0.05);
    near(craftLuck(19, content).twoUp, 0.01);
    near(craftLuck(20, content).oneUp, 0.06);
    near(craftLuck(20, content).twoUp, 0.02);
    near(craftLuck(100, content).oneUp, 0.1);
    near(craftLuck(100, content).twoUp, 0.06);
    // The author's rule goes on past the 100th (825): a point every 20 levels.
    near(craftLuck(200, content).oneUp, 0.15);
    near(craftLuck(200, content).twoUp, 0.11);
    const counts = { common: 0, rare: 0, unique: 0 };
    for (let index = 0; index < 400; index++) {
      for (const { item } of craftItems({ baseId: 'sword', rarityId: 'common', count: 5, level: 12, professionLevel: 1, seed: `l${index}` }, content)) counts[item.rarity] += 1;
    }
    // Of 2000 items about 100 rare and 20 unique.
    assert.ok(counts.rare > 65 && counts.rare < 140, JSON.stringify(counts));
    assert.ok(counts.unique > 6 && counts.unique < 40, JSON.stringify(counts));
    // Never above the last rarity.
    for (let index = 0; index < 100; index++) {
      for (const { made, item } of craftItems({ baseId: 'sword', rarityId: 'divine', count: 5, level: 90, professionLevel: 100, seed: `d${index}` }, content)) {
        if (made) assert.equal(item.rarity, 'divine');
      }
    }
    // The report says which item came out rarer than ordered.
    let index = 0;
    let rare = craftItems({ baseId: 'axe', rarityId: 'rare', count: 1, level: 12, professionLevel: 5, seed: 'luck0' }, content)[0];
    while (!rare.made) rare = craftItems({ baseId: 'axe', rarityId: 'rare', count: 1, level: 12, professionLevel: 5, seed: `luck${++index}` }, content)[0];
    const report = workshopReport(
      {
        base: base('axe'),
        rarityId: 'common',
        results: [rare],
        minutes: 30,
        startedAt: 0,
        endsAt: 1800000,
        seed: 'luck',
        stopped: false,
        before: { level: 5, xp: 0 },
        after: { level: 5, xp: 0 },
        character: newCharacter('warrior', { level: 12 }),
        xp: 1,
        work: { level: 12, xp: 0, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.ok(report.system[0].startsWith('Łut szczęścia! Przedmiot wyższej rzadkości: '), report.system.join(' | '));
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
    assert.equal(report.revealed.length, 19);
    assert.ok(report.revealed.includes('war-axe'));
    assert.ok(report.system.includes('Osiągnięto poziom Rzemieślnictwa: 10'), report.system.join(' | '));
    assert.ok(report.system.includes(`Zdobyto Siłę: +${6 * content.professionsById[content.workshop.profession].statPerLevel}`), report.system.join(' | '));
    assert.ok(report.system.some((line) => line.startsWith('System odsłania nowe wzory: Pałasz, Czekan, Kordelas')));
    assert.ok(report.system.includes('System pozwala już wykonywać przedmioty rzadkości: rzadki'));
    // At the 100th level the System reveals Tier VI (665), the Warsztat's 19.
    const last = workshopReport(
      { base: base('axe'), rarityId: 'common', results: [], minutes: 30, startedAt: 0, endsAt: 1, seed: 'r', stopped: false, before: { level: 99, xp: 0 }, after: { level: 100, xp: 0 }, character, xp: 0, work },
      content,
    );
    assert.equal(last.revealed.length, 19);
    assert.ok(last.revealed.includes('flamberge') && last.revealed.includes('cassock') && !last.revealed.includes('cameo') && !last.revealed.includes('coronation-sword'));
    assert.ok(last.system.some((line) => line.startsWith('System odsłania nowe wzory: Flamberg, Topór dwusieczny, Cinquedea')), last.system.join(' | '));
    // And at the 125th Tier VII (814), now that Rzemieślnictwo goes on to the 200th (825).
    const seventh = workshopReport(
      { base: base('axe'), rarityId: 'common', results: [], minutes: 30, startedAt: 0, endsAt: 1, seed: 'r', stopped: false, before: { level: 124, xp: 0 }, after: { level: 125, xp: 0 }, character, xp: 0, work },
      content,
    );
    assert.equal(seventh.revealed.length, 19);
    assert.ok(seventh.revealed.includes('coronation-sword') && seventh.revealed.includes('safian-boots') && !seventh.revealed.includes('pectoral'));
    assert.ok(seventh.system.includes('Osiągnięto poziom Rzemieślnictwa: 125'), seventh.system.join(' | '));
    assert.ok(seventh.system.some((line) => line.startsWith('System odsłania nowe wzory: Miecz koronacyjny, Nadziak, Baselard')), seventh.system.join(' | '));
    assert.ok(seventh.profession.xpToNext > 0);
  });

  test('narrator quests ask for items only where Rzemieślnictwo works, count the ones made and pay twice as much', () => {
    const character = newCharacter('warrior', { level: 12 });
    const drawn = (hasCrafting, periodId) =>
      Array.from({ length: 60 }, (_, index) => drawQuests(periodId, { character, hasTable: true, hasProfessions: true, hasCrafting, seed: `q${index}` }, content)).flat();
    assert.ok(!drawn(false, 'daily').some((quest) => quest.kind.startsWith('make')));
    assert.ok(!drawn(false, 'weekly').some((quest) => quest.kind.startsWith('make')));
    const daily = drawn(true, 'daily');
    const made = daily.filter((quest) => quest.kind === 'make');
    assert.ok(made.length > 0 && made.every((quest) => quest.count === 1));
    assert.equal(questText(made[0], content), 'Wykonaj 1 przedmiot.');
    // Gold for a level-12 character: (10 + 4 × 12) ± 20%, and twice that here.
    const gold = (quests) => quests.filter((quest) => quest.reward.kind === 'gold').map((quest) => quest.reward.amount);
    assert.ok(gold(made).every((amount) => amount >= 92), gold(made).join());
    assert.ok(gold(daily.filter((quest) => quest.kind === 'explore')).every((amount) => amount <= 70));
    // The week's 10 at level 12's share (weekly.curve).
    // …times the week's targetFactor, to the kind's step (761 C).
    const tuning = content.quests.kinds.find((kind) => kind.id === 'makeAny').weekly;
    const step = tuning.step ?? 1;
    const factor = content.quests.periods.weekly.targetFactor ?? 1;
    const week = Math.max(step, Math.round((Math.round(10 * weekShare(12, 7, content)) * factor) / step) * step);
    const weekly = drawn(true, 'weekly').filter((quest) => quest.kind.startsWith('make'));
    assert.ok(weekly.length > 0 && weekly.every((quest) => quest.kind === 'makeAny' && quest.count === week));
    assert.match(questText(weekly[0], content), new RegExp(`^Wykonaj łącznie ${week} przedmiot(y|ów)\\.$`));
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
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kowalka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kowalka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 15, xp = 0, parts = '{"scraps":30}', resources = '{"wood":50,"stone":200,"iron-ore":40}'`).run();
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

  test('Rzemieślnictwo opens at character level 15, later than the other professions', async () => {
    await set('level = 14, quests = ?', '{}');
    const before = await character();
    const square = before.professions.list.find((profession) => profession.id === 'crafting');
    assert.deepEqual([square.locked, square.unlockLevel, square.soon], [true, 15, false]);
    // Zielarstwo and Alchemia open with the tab; Górnictwo and Jubilerstwo at 25.
    const open = before.professions.list.filter((profession) => !['crafting', 'mining', 'jewelcrafting'].includes(profession.id));
    assert.deepEqual(open.map((profession) => profession.id), ['herbalism', 'alchemy']);
    assert.ok(open.every((profession) => !profession.locked && profession.unlockLevel === 10));
    assert.equal(before.professions.workshop, null);
    const order = await craft({ baseId: 'sword', rarity: 'common', count: 1 });
    assert.equal(order.status, 403);
    assert.equal(order.data.error.message, 'Rzemieślnictwo odblokujesz na poziomie postaci 15.');
    assert.ok(![...before.quests.daily.quests, ...before.quests.weekly.quests].some((quest) => quest.kind.startsWith('make')));
    await set('level = 15');
    const after = await character();
    assert.equal(after.professions.list.find((profession) => profession.id === 'crafting').locked, false);
    assert.ok(after.professions.workshop);
  });

  test('the Warsztat shows the slots with their patterns, what one item takes, and the rarities', async () => {
    const { workshop } = (await character()).professions;
    assert.equal(workshop.place.name, 'Systemowy Warsztat');
    // No cap of its own on an order (the author, 12.11.2026).
    assert.equal('maxCount' in workshop, false);
    assert.deepEqual(workshop.slots.map((slot) => slot.name), ['Broń', 'Pancerz', 'Druga ręka', 'Hełm', 'Rękawice', 'Buty']);
    const [sword, broadsword] = workshop.slots[0].patterns;
    assert.deepEqual(sword, {
      id: 'sword',
      name: 'Miecz',
      level: 1,
      // 6 for a weapon and 1 more for the character's level 15.
      parts: 7,
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
    assert.deepEqual(common, { id: 'common', name: 'pospolity', color: '#9b9b9b', level: 1, step: 1, part: { id: 'scraps', name: 'Ścinki' }, chance: 1, itemMinutes: 30 });
    assert.equal(rare.hidden, true);
    assert.equal(rare.hint, 'Ukryte przez System do 5. poziomu Rzemieślnictwa.');
  });

  test('an order has as many items as the parts, the resources and the bag allow, however long it takes', async () => {
    // The author, 12.11.2026: "Zrób warsztat i szlifiernie zalezna od czesci
    // i materialow po prostu", "bez ograniczeń czasowych". Before, 5 items
    // at most, 2.5 h at the profession's first level.
    await set(`parts = '{"scraps":140}', resources = '{"stone":360,"iron-ore":120}'`);
    const started = await craft({ baseId: 'sword', rarity: 'common', count: 20 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual([started.data.character.activity.count, started.data.character.activity.minutes], [20, 600]);
    assert.deepEqual(parts(started.data.character), {});
    await call('POST', '/api/hunts/cancel', { cookie });
    // One more than the parts allow is refused by the parts alone.
    assert.equal((await craft({ baseId: 'sword', rarity: 'common', count: 21 })).data.error.code, 'no_parts');
  });

  test('an order checks the pattern, the rarity, the count, the parts, the resources and the bag, and takes it all at the start', async () => {
    const error = async (body) => (await craft(body)).data.error?.code;
    assert.equal(await error({ baseId: 'broadsword', rarity: 'common', count: 1 }), 'unknown_pattern');
    assert.equal(await error({ baseId: 'ring', rarity: 'common', count: 1 }), 'unknown_pattern');
    assert.equal(await error({ baseId: 'sword', rarity: 'rare', count: 1 }), 'unknown_rarity');
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 0 }), 'invalid_count');
    assert.equal(await error({ baseId: 'sword', rarity: 'common', count: 1.5 }), 'invalid_count');
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
    assert.equal(after.activity.minutes, 60);
    // 7 parts for each sword at the character's level 15.
    assert.deepEqual(parts(after), { scraps: 16 });
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
    await set(`parts = '{"scraps":3}', crafting = ?`, JSON.stringify(queue));
    const started = await craft({ baseId: 'sword', rarity: 'common', count: 1 });
    assert.equal(started.status, 201);
    assert.deepEqual(parts(started.data.character), {});
    assert.deepEqual(started.data.character.crafting.queue.map((order) => order.id), ['b']);
  });

  test('the report brings the items into the bag, the profession\'s levels, the quests and the character\'s XP', async () => {
    const now = Date.now();
    const quest = (kind, count) => ({ kind, count, progress: 0, reward: { kind: 'gold', amount: 10 }, claimed: false });
    // A week as drawn now (`scaled`), kept as it is.
    const period = (periodId, quests) => ({ period: questPeriod(periodId, now, content).key, chest: false, quests, ...(periodId === 'weekly' && { scaled: true }) });
    await set('quests = ?', JSON.stringify({ daily: period('daily', [quest('make', 1)]), weekly: period('weekly', [quest('makeAny', 5)]) }));
    await craft({ baseId: 'axe', rarity: 'common', count: 2 });
    await age(120);
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'items');
    assert.equal(report.minutes, 60);
    assert.equal(report.items.length, 2);
    // The rarity ordered, or by luck one or two above it (the server's seed).
    assert.ok(report.items.every((item) => item.base === 'axe' && item.level === 15 && ['common', 'rare', 'unique'].includes(item.rarity)));
    assert.equal(report.failed, 0);
    assert.equal(report.made, 'Wykonano: 2 × Topór.');
    assert.equal(report.profession.levelAfter, 2);
    assert.ok(report.summary.xp > 0);
    assert.equal(after.activity, null);
    assert.equal(after.bag.filter((item) => item.base === 'axe').length, 2);
    assert.equal(after.professions.list[2].level, 2);
    assert.equal(after.stats.find((stat) => stat.id === 'strength').sources.professions, content.professionsById[content.workshop.profession].statPerLevel);
    // Nothing comes back from an order made in full.
    assert.deepEqual(parts(after), { scraps: 16 });
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
    // 5 parts for each helmet at level 15, and stone 3 × 4 parts of the slot
    // × step 7 and iron ore 1 × 4 × 7.
    assert.deepEqual(parts(after), { 'star-shard': 5 });
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
    await age(40);
    const { report, character: after } = (await call('POST', '/api/hunts/cancel', { cookie })).data;
    assert.equal(report.kind, 'items');
    assert.equal(report.minutes, 40);
    assert.equal(report.items.length, 1);
    assert.equal(report.stopped, 'Wyrób przerwany. Części i zasoby na resztę wróciły.');
    assert.equal(report.profession.xp, 40);
    assert.equal(after.activity, null);
    // 21 parts taken for the three, 14 back for the two not done.
    assert.deepEqual(parts(after), { scraps: 23 });
    assert.deepEqual(after.resources, { wood: 50, stone: 182, 'iron-ore': 34 });
    assert.equal(after.bag.filter((item) => item.base === 'sword').length, 1);
  });

  test('Time Points skip an order', async () => {
    await craft({ baseId: 'gloves', rarity: 'common', count: 1 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 30);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.report.kind, 'items');
  });
});

describe('the Warsztat switched off', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'off' });

  test('Rzemieślnictwo waits as "Wkrótce": no Warsztat, no orders and no quests for items', async () => {
    const { cookie } = await signUp('zamknieta');
    await call('POST', '/api/character', { cookie, body: { name: 'Zamknieta', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 12, xp = 0, parts = '{"scraps":30}', resources = '{"stone":200,"iron-ore":40}'`).run();
    const { professions, quests } = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(professions.list.map((profession) => [profession.id, profession.soon]), [
      ['herbalism', false],
      ['alchemy', false],
      ['crafting', true],
      ['mining', false],
      ['jewelcrafting', false],
    ]);
    assert.equal(professions.workshop, null);
    const order = await call('POST', '/api/professions/craft', { cookie, body: { baseId: 'sword', rarity: 'common', count: 1 } });
    assert.equal(order.status, 404);
    assert.ok(![...quests.daily.quests, ...quests.weekly.quests].some((quest) => quest.kind.startsWith('make')));
  });
});

describe('the Warsztat, step 2, in the engine', () => {
  test('an item takes one more part every 10 item levels, and the resources stay those of its slot', () => {
    assert.deepEqual([1, 9, 10, 15, 99, 100, 500].map((level) => craftParts(base('sword'), level, content)), [6, 6, 7, 7, 15, 16, 56]);
    assert.equal(craftParts(base('gloves'), 510, content), 54);
    assert.deepEqual(craftCost(base('sword'), 'common', 2, 15, content), { parts: { scraps: 14 }, resources: { stone: 36, 'iron-ore': 12 } });
  });

  // The author's rule (R16): the parts of an item cost more at the Skup
  // złomu than the dealer pays for that item, for every rarity, slot, level
  // of the Skup złomu (which raises what he pays too) and item level, and
  // the upgrades an item comes with add nothing to his price.
  test('the parts of a made item cost more than the scrapper pays for it', () => {
    const bench = content.buildingsById['scrap-bench'];
    const bases = Object.keys(content.workshop.parts).map((slot) => craftableBases(content).find((candidate) => candidate.slot === slot));
    for (let level = 1; level <= bench.maxLevel; level++) {
      const bonus = campBonus({ 'scrap-bench': level }, 'sellPrice', content);
      for (const { partId, price } of shopOffer(level, content)) {
        const rarityId = content.partsById[partId].rarity;
        for (const each of bases) {
          for (let itemLevel = 1; itemLevel <= 510; itemLevel++) {
            const parts = craftParts(each, itemLevel, content);
            const item = { base: each.id, slot: each.slot, level: itemLevel, rarity: rarityId, affixes: [], upgrade: 5, crafted: { parts, upgrade: 5 } };
            assert.ok(price * parts > sellPrice(item, content, bonus), `${each.id} ${partId} at level ${level}, item level ${itemLevel}`);
          }
        }
      }
    }
  });

  test('from level 10 of the profession a made item may come out upgraded, up to +5 from level 80', () => {
    assert.deepEqual(craftUpgrades(9, content), []);
    const first = craftUpgrades(10, content);
    assert.deepEqual(first.map((tier) => tier.upgrade), [1]);
    near(first[0].chance, 0.1);
    near(craftUpgrades(30, content)[0].chance, 0.2 * (1 - 0.0625));
    const top = craftUpgrades(100, content);
    assert.deepEqual(top.map((tier) => tier.upgrade), [1, 2, 3, 4, 5]);
    near(top[4].chance, 0.02);
    near(top[3].chance, 0.98 * 0.05);
    assert.ok(top.reduce((sum, tier) => sum + tier.chance, 0) < 0.65);
    // Every tier has reached its max by the 100th, so the 200th (825) adds nothing.
    assert.deepEqual(craftUpgrades(200, content), top);

    // Below level 10 nothing comes out upgraded; each item keeps its parts
    // and the upgrade it came with.
    const order = (professionLevel, seed) => craftItems({ baseId: 'sword', rarityId: 'common', count: 5, level: 20, professionLevel, seed }, content);
    const plain = order(9, 'u').map((result) => result.item);
    assert.ok(plain.every((item) => item.upgrade === undefined && item.crafted.parts === 8 && item.crafted.upgrade === 0));
    let upgraded = 0;
    for (let index = 0; index < 200; index++) {
      for (const { item } of order(100, `u${index}`)) {
        assert.equal(item.upgrade ?? 0, item.crafted.upgrade);
        if (item.upgrade) upgraded += 1;
      }
    }
    const share = upgraded / 1000;
    assert.ok(share > 0.52 && share < 0.67, String(share));
  });

  test('a made item taken apart gives back half its parts, and the Kowadło\'s upgrades above those it came with', () => {
    const made = { base: 'sword', rarity: 'rare', level: 25, upgrade: 2, crafted: { parts: 8, upgrade: 2 } };
    assert.deepEqual(salvageYield(made, content), { partId: 'straps', count: 4 });
    assert.equal(salvageYield({ ...made, upgrade: 5 }, content).count, 7);
    assert.equal(salvageYield({ ...made, upgrade: 1 }, content).count, 4);
    assert.equal(salvageYield({ ...made, crafted: { parts: 9, upgrade: 2 } }, content).count, 4);
    // Loot is taken apart as before: 2 + 25 / 10 + 2.
    assert.equal(salvageYield({ base: 'sword', rarity: 'rare', level: 25, upgrade: 2 }, content).count, 6);
  });

  test('the scrapper pays for the upgrades of a made item only above those it came with', () => {
    const loot = { base: 'sword', slot: 'weapon', rarity: 'rare', level: 25, affixes: [], upgrade: 3 };
    const made = { ...loot, crafted: { parts: 8, upgrade: 3 } };
    assert.equal(sellPrice(made, content), sellPrice({ ...loot, upgrade: 0 }, content));
    assert.ok(sellPrice(loot, content) > sellPrice(made, content));
    assert.equal(sellPrice({ ...made, upgrade: 4 }, content) - sellPrice(made, content), Math.round(itemUpgradeCost(made, 4, content).gold * content.balance.upgrades.sellRefund));
  });

  test('a Zwój ochronny turns a break on the Kowadło into a failure, with the lost level', () => {
    // Draws that fail the try and then break the item.
    const draws = () => {
      const values = [false, true];
      return { chance: () => values.shift() };
    };
    const item = { base: 'sword', rarity: 'rare', level: 25, affixes: [], upgrade: 7 };
    assert.deepEqual(rollUpgrade(item, draws(), content), { result: 'broken', upgrade: 7 });
    assert.deepEqual(rollUpgrade(item, draws(), content, { warded: true }), { result: 'failure', upgrade: 6, saved: true });
    const success = { chance: () => true };
    assert.deepEqual(rollUpgrade(item, success, content, { warded: true }), { result: 'success', upgrade: 8 });
  });

  test('Zwoje ochronne take two shards each and an hour at level 1, less with each level', () => {
    assert.deepEqual(scrollCost(3, content), { parts: { shards: 6 } });
    near(scrollMinutes(25, content), 45.6);
    assert.equal(scrollOrderMinutes(3, 25, content), 137);
    assert.equal(scrollOrderMinutes(5, 100, content), 150);
  });

  test('taking apart an item of a later pattern teaches it once, and only for gear the Warsztat makes', () => {
    assert.equal(patternFrom({ base: 'broadsword' }, [], content), 'broadsword');
    assert.equal(patternFrom({ base: 'coronation-sword' }, [], content), 'coronation-sword');
    assert.equal(patternFrom({ base: 'broadsword' }, ['broadsword'], content), null);
    assert.equal(patternFrom({ base: 'sword' }, [], content), null);
    assert.equal(patternFrom({ base: 'ring' }, [], content), null);
    const known = (learned) => knownPatterns(1, learned, content).map((pattern) => pattern.id);
    assert.ok(!known([]).includes('broadsword'));
    assert.ok(known(['broadsword']).includes('broadsword'));
  });

  // The author: "10 Ścinek = 1 Rzemień jeśli to adekwatne". Ten for one
  // keeps the rarer parts earned (a Gwiezdny odprysk would take a million
  // Ścinki), and buying a part at the Skup złomu always costs less than
  // buying the parts it is had for.
  test('ten parts of a rarity go for one of the next, never cheaper than at the dealer', () => {
    assert.equal(partSource('scraps', content), null);
    assert.deepEqual(partSource('straps', content), { partId: 'scraps', rate: 10 });
    assert.deepEqual(partSource('star-shard', content), { partId: 'bloodstone', rate: 10 });
    const block = (changes) => partExchangeBlock({ parts: { scraps: 100 }, partId: 'straps', count: 10, ...changes }, content)?.code ?? null;
    assert.equal(block({}), null);
    assert.equal(block({ count: 1 }), null);
    assert.equal(block({ parts: { scraps: 99 } }), 'not_enough');
    assert.equal(block({ partId: 'fittings' }), 'not_enough');
    assert.deepEqual([5, 0, '1', undefined].map((count) => block({ count })), Array(4).fill('invalid_count'));
    assert.deepEqual(['scraps', 'nothing', 'toString', undefined].map((partId) => block({ partId })), Array(4).fill('invalid_part'));
    assert.equal(partExchangeBlock({ parts: { scraps: 99 }, partId: 'straps', count: 10 }, content).message, 'Brakuje części: Ścinki (potrzeba 100).');
    for (let level = 1; level <= content.buildingsById['scrap-bench'].maxLevel; level++) {
      for (const part of content.parts.slice(1)) {
        const source = partSource(part.id, content);
        assert.ok(source.rate * partPrice(source.partId, level, content) > partPrice(part.id, level, content), `${part.id} at level ${level}`);
      }
    }
  });

  test('the dealer sells a character 30 scraps a day, fewer of the rarer parts, and more again from midnight', () => {
    const ids = ['scraps', 'straps', 'fittings', 'shards', 'amber', 'bloodstone', 'star-shard'];
    assert.deepEqual(ids.map((id) => shopLeft(id, {}, content)), [30, 20, 10, 5, 3, 2, 1]);
    const block = (changes) => shopBlock({ level: 10, gold: 100000, partId: 'scraps', count: 10, ...changes }, content);
    assert.equal(block({ bought: { scraps: 20 } }), null);
    assert.equal(block({ bought: { scraps: 21 } }).message, 'Złomiarz sprzeda Ci dziś jeszcze 9 szt.: Ścinki.');
    assert.equal(block({ bought: { scraps: 30 }, count: 1 }).message, 'Złomiarz nie sprzeda Ci już dziś więcej: Ścinki. Wróć jutro.');
    assert.equal(block({ partId: 'star-shard', count: 1, bought: { 'star-shard': 1 } }).code, 'daily_limit');
    assert.equal(block({ partId: 'star-shard', count: 1, bought: { scraps: 30 } }), null);
    const now = Date.UTC(2026, 9, 27, 12);
    assert.deepEqual(shopBought({ day: shopDay(now, content), parts: { scraps: 5 } }, now, content), { scraps: 5 });
    assert.deepEqual(shopBought({ day: shopDay(now - 86400000, content), parts: { scraps: 5 } }, now, content), {});
  });
});

describe('the Warsztat, step 2, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('platnerz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Platnerz', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare(`UPDATE characters SET level = 15, xp = 0, gold = 100000, parts = '{"scraps":30,"shards":20}', resources = '{"wood":50,"stone":200,"iron-ore":400}'`).run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const age = async (minutes) =>
    (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  const craft = (body) => call('POST', '/api/professions/craft', { cookie, body });
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const addItem = async (item) => {
    const database = await db();
    return (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(item)).run()).meta.last_row_id;
  };
  const build = async (buildingId, level) =>
    (await db())
      .prepare(
        'INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, ?, ?, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level',
      )
      .bind(buildingId, level)
      .run();

  test('Zwoje ochronne from level 25 of the profession: shards only, always made, kept for the Kowadło', async () => {
    const locked = await craft({ scroll: true, count: 2 });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.message, 'Ukryte przez System do 25. poziomu Rzemieślnictwa.');
    const hidden = (await character()).professions.workshop.scroll;
    assert.deepEqual([hidden.hidden, hidden.owned, hidden.name], [true, 0, 'Zwój ochronny']);

    await set(`professions = '{"crafting":{"level":25,"xp":0}}'`);
    const { scroll } = (await character()).professions.workshop;
    assert.deepEqual([scroll.part.name, scroll.parts, scroll.minutes], ['Odłamki', 2, 45.6]);
    const started = await craft({ scroll: true, count: 3 });
    assert.equal(started.status, 201);
    const { activity } = started.data.character;
    assert.deepEqual([activity.base.name, activity.scroll, activity.count, activity.minutes], ['Zwój ochronny', true, 3, 137]);
    await age(137);
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.made, 'Wykonano: 3 × Zwój ochronny.');
    assert.deepEqual([report.scrolls, report.items.length, report.failed, report.rarity], [3, 0, 0, null]);
    assert.equal(after.scrolls, 3);
    assert.equal(after.professions.workshop.scroll.owned, 3);
    assert.equal(after.crafting.parts.find((part) => part.id === 'shards').count, 14);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.deepEqual(data.reports[0].items, [{ name: 'Zwój ochronny', count: 3 }]);
  });

  test('a scroll order called back early keeps the scrolls done and gives back the shards for the rest', async () => {
    await set(`professions = '{"crafting":{"level":25,"xp":0}}'`);
    await craft({ scroll: true, count: 3 });
    await age(50);
    const { report, character: after } = (await call('POST', '/api/hunts/cancel', { cookie })).data;
    assert.equal(report.scrolls, 1);
    assert.equal(after.scrolls, 1);
    assert.equal(after.crafting.parts.find((part) => part.id === 'shards').count, 18);
  });

  test('a Zwój ochronny on the Kowadło is used only where the item may break, and saves it', async () => {
    await build('anvil', 10);
    const itemId = await addItem({ base: 'sword', slot: 'weapon', level: 15, rarity: 'common', affixes: [], damage: { min: 5, max: 9 }, upgrade: 3 });
    const upgrade = (body) => call('POST', `/api/items/${itemId}/upgrade`, { cookie, body });
    const none = await upgrade({ ward: true });
    assert.equal(none.status, 200);
    assert.equal(none.data.upgrade.warded, undefined);

    await (await db()).prepare("UPDATE items SET data = json_set(data, '$.upgrade', 7)").run();
    const missing = await upgrade({ ward: true });
    assert.equal(missing.data.error.code, 'no_scroll');
    // A break would come about once in 15 tries at +7 without the scroll;
    // from +5 on, each upgrade takes a material of the item's rarity too.
    await set(`scrolls = 40, resources = '{"iron-ore":100000}', materials = '{"wolf-pelt:common":1000}'`);
    for (let index = 0; index < 40; index++) {
      await (await db()).prepare("UPDATE items SET data = json_set(data, '$.upgrade', 7)").run();
      const { data } = await upgrade({ ward: true });
      assert.equal(data.upgrade.warded, true);
      assert.notEqual(data.upgrade.result, 'broken');
      if (data.upgrade.saved) assert.equal(data.upgrade.to, 6);
      assert.equal(data.character.scrolls, 39 - index);
    }
    assert.ok((await character()).bag.some((item) => item.id === itemId), 'the sword is still there');
  });

  test('taking apart an item of a later pattern teaches it in the Warsztat, and the card says so', async () => {
    await build('craft-table', 1);
    const itemId = await addItem({ base: 'broadsword', slot: 'weapon', level: 15, rarity: 'common', affixes: [], damage: { min: 6, max: 10 } });
    const card = (await character()).bag.find((item) => item.id === itemId);
    assert.deepEqual([card.salvage.pattern, card.salvage.patternAt], ['Pałasz', 'w Warsztacie']);
    const { status, data } = await call('POST', `/api/items/${itemId}/salvage`, { cookie, body: {} });
    assert.equal(status, 200);
    assert.deepEqual([data.salvage.pattern, data.salvage.patternAt], ['Pałasz', 'w Warsztacie']);
    const broadsword = data.character.professions.workshop.slots[0].patterns.find((pattern) => pattern.id === 'broadsword');
    assert.equal(broadsword.learned, true);
    assert.equal(broadsword.parts, 7);
    assert.equal((await craft({ baseId: 'broadsword', rarity: 'common', count: 1 })).status, 201);
  });

  test('a made item taken apart gives back half its parts', async () => {
    await build('craft-table', 1);
    const itemId = await addItem({ base: 'sword', slot: 'weapon', level: 15, rarity: 'common', affixes: [], damage: { min: 5, max: 9 }, crafted: { parts: 7, upgrade: 0 } });
    assert.equal((await character()).bag.find((item) => item.id === itemId).salvage.parts, 3);
  });

  test('parts go for one of the next rarity at once, also while the character works, with the table\'s parts done by now', async () => {
    const exchange = (partId, count) => call('POST', '/api/professions/exchange', { cookie, body: { partId, count } });
    // Ścinki, Rzemienie and Odłamki.
    const owned = (view) => ['scraps', 'straps', 'shards'].map((id) => view.crafting.parts.find((part) => part.id === id).count);
    const card = (await character()).professions.workshop.exchange;
    assert.deepEqual([card.title, card.rate, card.counts], ['Wymiana części', 10, [1, 10]]);
    assert.deepEqual(card.parts.slice(0, 2), [{ id: 'straps', from: 'scraps' }, { id: 'fittings', from: 'straps' }]);
    assert.equal(card.parts.length, content.parts.length - 1);
    assert.equal((await exchange('scraps', 1)).status, 400);
    assert.equal((await exchange('straps', 3)).data.error.code, 'invalid_count');
    const short = await exchange('fittings', 1);
    assert.deepEqual([short.status, short.data.error.message], [409, 'Brakuje części: Rzemienie (potrzeba 10).']);
    const first = await exchange('straps', 1);
    assert.equal(first.status, 200);
    assert.deepEqual(first.data.exchanged, { from: 'scraps', partId: 'straps', given: 10, count: 1 });
    assert.deepEqual(owned(first.data.character), [20, 1, 20]);
    // Two taps at once: each exchange made takes its parts once.
    const taps = await Promise.all([exchange('straps', 1), exchange('straps', 1)]);
    const made = taps.filter((tap) => tap.status === 200).length;
    assert.ok(made >= 1);
    assert.deepEqual(owned(await character()), [20 - 10 * made, 1 + made, 20]);
    // While the character is away, with 5 Ścinki and a table's order of 15
    // done by now: they count, and the queue keeps the rest.
    const now = Date.now();
    const done = { id: 'a', kind: 'material', key: 'wolf-pelt:common', count: 15, partId: 'scraps', parts: 15, bonus: 0, startsAt: now - 7200000, endsAt: now - 3600000 };
    const later = { ...done, id: 'b', startsAt: now - 3600000, endsAt: now + 3600000 };
    await set("parts = '{\"scraps\":5,\"shards\":20}', crafting = ?", JSON.stringify([done, later]));
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    const away = await exchange('straps', 1);
    assert.equal(away.status, 200);
    assert.deepEqual(owned(away.data.character), [10, 1, 20]);
    assert.deepEqual(away.data.character.crafting.queue.map((order) => order.id), ['b']);
  });

  test('the dealer keeps count of the parts sold today', async () => {
    await build('scrap-bench', 10);
    const buy = (partId, count) => call('POST', '/api/camp/buy', { cookie, body: { partId, count } });
    const shop = async () => (await character()).camp.buildings.find((building) => building.id === 'scrap-bench').shop;
    assert.deepEqual((await shop()).parts.find((part) => part.id === 'shards'), { id: 'shards', price: 183, daily: 5, left: 5 });
    for (const count of [10, 10, 10]) assert.equal((await buy('scraps', count)).status, 200);
    const over = await buy('scraps', 1);
    assert.equal(over.status, 409);
    assert.equal(over.data.error.message, 'Złomiarz nie sprzeda Ci już dziś więcej: Ścinki. Wróć jutro.');
    assert.equal((await shop()).parts.find((part) => part.id === 'scraps').left, 0);
    assert.equal((await buy('shards', 1)).status, 200);
    // From an earlier day the count no longer holds.
    await set("shop_day = '2000-01-01'");
    assert.equal((await shop()).parts.find((part) => part.id === 'scraps').left, 30);
  });
});
