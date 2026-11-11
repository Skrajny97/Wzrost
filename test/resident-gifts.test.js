// Gifts for the Osada's residents and presents from friends (the author's
// 818.1 and 818.2): once a narrator's day each resident takes one piece of
// what they like, or gold, for relation, a rarer piece for more; a resident
// at the standing of a friend leaves a small present once a week.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  friendPresent,
  giftGoods,
  giftLiked,
  giftRelation,
  giftStep,
  givenToday,
  goldGift,
  residentGift,
  withGiven,
  withTaken,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// A Friday morning in Poland; the narrator's day ends at Polish midnight and
// the week on Monday.
const NOW = Date.UTC(2026, 9, 30, 10, 0);
const DAY = 86400000;
const WEEK = 7 * DAY;
const rules = content.settlement.gifts;
const friend = content.settlement.standings.find((standing) => standing.id === rules.from);
const trophy = content.materials.find((material) => content.monstersById[material.monster]?.elite || content.monstersById[material.monster]?.champion);

describe('gifts for the residents in the engine', () => {
  test('every resident likes what the author named: herbs, ores, gems, hides, potions, and the others gold', () => {
    const likes = Object.fromEntries(content.settlement.residents.map((resident) => [resident.id, residentGift(resident.id, content)?.kind]));
    assert.deepEqual(likes, {
      headman: 'gold',
      enchantress: 'gem',
      hermit: 'herb',
      groom: 'gold',
      innkeeper: 'potion',
      herbalist: 'herb',
      tanner: 'material',
      merchant: 'gold',
      smith: 'ore',
      gamehost: 'gold',
    });
  });

  test('a piece is liked only by its kind: herbs, potions, ores apart from gems, and no trophy of an elite or a champion', () => {
    const herb = content.herbs[0].id;
    const potion = content.potions[0].id;
    const ore = content.minerals.find((mineral) => mineral.kind === 'ore').id;
    const gem = content.minerals.find((mineral) => mineral.kind === 'gem').id;
    assert.ok(giftLiked('herb', herb, content));
    assert.ok(!giftLiked('herb', potion, content));
    assert.ok(giftLiked('potion', potion, content));
    assert.ok(giftLiked('ore', ore, content));
    assert.ok(!giftLiked('ore', gem, content));
    assert.ok(giftLiked('gem', gem, content));
    assert.ok(!giftLiked('gem', ore, content));
    assert.ok(giftLiked('material', 'wolf-pelt:common', content));
    assert.ok(giftLiked('material', 'wolf-pelt:epic', content));
    assert.ok(trophy, 'the data has a trophy');
    assert.ok(!giftLiked('material', `${trophy.id}:${trophy.rarity}`, content));
    assert.ok(!giftLiked('material', 'wolf-pelt', content));
    assert.ok(!giftLiked('herb', undefined, content));
  });

  test('gold and the commonest pieces give +10, a rarer piece more, and never less than a commoner one', () => {
    assert.equal(rules.relation[0], 10);
    assert.equal(giftRelation('gold', null, content), 10);
    // Gems and materials: their rarity is their step.
    for (const gem of content.minerals.filter((mineral) => mineral.kind === 'gem')) {
      assert.equal(giftStep('gem', gem.id, content), content.rarities.findIndex((rarity) => rarity.id === gem.rarity), gem.id);
    }
    content.rarities.forEach((rarity, index) => assert.equal(giftStep('material', `wolf-pelt:${rarity.id}`, content), index, rarity.id));
    assert.equal(giftRelation('material', 'wolf-pelt:common', content), 10);
    assert.ok(giftRelation('material', 'wolf-pelt:rare', content) > 10);
    // Herbs, potions and ores: a step for each doubling of the price.
    for (const kind of ['herb', 'potion', 'ore']) {
      const list = kind === 'herb' ? content.herbs : kind === 'potion' ? content.potions : content.minerals.filter((mineral) => mineral.kind === 'ore');
      const steps = list.map((piece) => giftStep(kind, piece.id, content));
      assert.equal(Math.min(...steps), 0, kind);
      assert.ok(Math.max(...steps) > 0, `${kind}: some are rarer`);
      for (const piece of list) assert.ok(giftRelation(kind, piece.id, content) >= 10, piece.id);
    }
    assert.ok(giftRelation('herb', 'fern-blossom', content) > giftRelation('herb', 'comfrey', content));
    // The last number for anything rarer than the list goes.
    assert.equal(giftRelation('gem', 'diamond', content), rules.relation[Math.min(6, rules.relation.length - 1)]);
  });

  test('the gold of a gift grows with the level', () => {
    assert.equal(goldGift(20, content), rules.goldPerLevel * 20);
    assert.ok(goldGift(100, content) > goldGift(20, content));
  });

  test('what a resident likes among the goods: only their kind, held, the commonest first', () => {
    const held = {
      herbs: { 'fern-blossom': 1, comfrey: 4, nettle: 0 },
      potions: { 'lesser-healing': 2 },
      minerals: { quartz: 3, 'silver-ore': 5, diamond: 1 },
      materials: { 'wolf-pelt:rare': 2, 'wolf-pelt:common': 1, [`${trophy.id}:${trophy.rarity}`]: 1 },
    };
    assert.deepEqual(
      giftGoods('herb', held, content).map((good) => [good.key, good.count]),
      [
        ['comfrey', 4],
        ['fern-blossom', 1],
      ],
    );
    assert.deepEqual(
      giftGoods('gem', held, content).map((good) => good.key),
      ['quartz', 'diamond'],
    );
    assert.deepEqual(
      giftGoods('ore', held, content).map((good) => good.key),
      ['silver-ore'],
    );
    assert.deepEqual(
      giftGoods('material', held, content).map((good) => good.key),
      ['wolf-pelt:common', 'wolf-pelt:rare'],
    );
    assert.deepEqual(giftGoods('gold', held, content), []);
  });

  test("one gift to each resident a narrator's day: the next from midnight", () => {
    const gifts = withGiven(undefined, 'herbalist', NOW, content);
    assert.ok(givenToday(gifts, 'herbalist', NOW, content));
    assert.ok(givenToday(gifts, 'herbalist', NOW + 3 * 3600000, content));
    assert.ok(!givenToday(gifts, 'hermit', NOW, content));
    assert.ok(!givenToday(gifts, 'herbalist', NOW + DAY, content));
    assert.ok(!givenToday(undefined, 'herbalist', NOW, content));
    // Another resident's gift keeps the first one's day.
    const both = withGiven(gifts, 'smith', NOW, content);
    assert.ok(givenToday(both, 'herbalist', NOW, content) && givenToday(both, 'smith', NOW, content));
  });
});

describe("a friend's present of the week in the engine", () => {
  const character = { ...newCharacter('warrior', { level: 40, classLevel: 40 }), professions: {}, met: ['wolf', 'fox', trophy.monster], patterns: [], settlement: {} };
  const present = (residentId, points = friend.points, gifts = undefined, now = NOW) => friendPresent(residentId, { character, points, gifts, seed: 's' }, now, content);

  test('only from the standing of a friend', () => {
    for (const resident of content.settlement.residents) {
      assert.equal(present(resident.id, friend.points - 1), null, resident.id);
      assert.notEqual(present(resident.id), null, resident.id);
    }
  });

  test('of the trade the author named, the same all week, once a week', () => {
    const kinds = Object.fromEntries(content.settlement.residents.map((resident) => [resident.id, present(resident.id).kind]));
    assert.equal(kinds.herbalist, 'herb');
    assert.equal(kinds.smith, 'material');
    assert.equal(kinds.innkeeper, 'potion');
    assert.equal(kinds.merchant, 'gold');
    for (const resident of content.settlement.residents) {
      const gift = present(resident.id);
      assert.deepEqual(present(resident.id, friend.points, undefined, NOW + DAY), gift, `${resident.id}: the same on Saturday`);
      assert.equal(present(resident.id, friend.points, withTaken(undefined, resident.id, gift.week)), null, `${resident.id}: taken`);
      assert.notEqual(present(resident.id, friend.points, withTaken(undefined, resident.id, gift.week), NOW + WEEK), null, `${resident.id}: next week`);
    }
  });

  test('of what the character knows: its first herbs and potions before the professions open, materials of creatures it met, no trophy', () => {
    const herbs = new Set(content.herbs.filter((herb) => herb.level <= 1).map((herb) => herb.id));
    const potions = new Set(content.potions.filter((potion) => potion.level <= 1).map((potion) => potion.id));
    const herb = present('herbalist');
    assert.ok(herbs.has(herb.key), herb.key);
    const weekly = residentGift('herbalist', content).weekly;
    assert.ok(herb.count >= weekly.min + Math.floor(weekly.perTenLevels * 4) && herb.count <= weekly.max + Math.floor(weekly.perTenLevels * 4));
    assert.ok(potions.has(present('innkeeper').key));
    for (const resident of ['smith', 'tanner', 'enchantress']) {
      const gift = present(resident);
      assert.ok(['wolf-pelt:common', 'fox-pelt:common'].includes(gift.key), `${resident}: ${gift.key}`);
    }
    assert.equal(present('merchant').count, residentGift('merchant', content).weekly.perLevel * 40);
    assert.equal(present('hermit').kind, 'time-points');
    assert.equal(present('hermit').count, residentGift('hermit', content).weekly.count);
    // No creature met: no materials to give.
    assert.equal(friendPresent('smith', { character: { ...character, met: [] }, points: friend.points, seed: 's' }, NOW, content), null);
  });
});

describe('gifts and presents through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  const LEVEL = 30;

  beforeEach(async () => {
    ({ cookie } = await signUp('podarunki'));
    await call('POST', '/api/character', { cookie, body: { name: 'Darczyńca', classId: 'archer', appearance: 'female' } });
    await (await db())
      .prepare("UPDATE characters SET level = ?, class_level = ?, gold = 10000, herbs = ?, potions = ?, minerals = ?, materials = ?, met = '[\"wolf\"]'")
      .bind(
        LEVEL,
        LEVEL,
        JSON.stringify({ comfrey: 2, 'fern-blossom': 1 }),
        JSON.stringify({ 'lesser-healing': 1 }),
        JSON.stringify({ quartz: 1, 'silver-ore': 1 }),
        JSON.stringify({ 'wolf-pelt:rare': 1, [`${trophy.id}:${trophy.rarity}`]: 1 }),
      )
      .run();
  });

  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const resident = async (id) => (await settlement()).residents.find((one) => one.id === id);
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement ?? '{}');
  const column = async (name) => JSON.parse((await (await db()).prepare(`SELECT ${name} AS goods FROM characters`).first()).goods);
  // The narrator's next day, as the server will see it: the gifts kept as
  // given on a day long gone.
  const yesterday = async () => {
    const osada = await stored();
    osada.gifts.given = Object.fromEntries(Object.keys(osada.gifts.given).map((id) => [id, '2000-01-01']));
    await (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify(osada)).run();
  };

  test('a piece of what the resident likes leaves the goods for relation, once a day', async () => {
    const jagna = await resident('herbalist');
    assert.deepEqual(
      jagna.gift.goods.map((good) => [good.key, good.count, good.relation]),
      [
        ['comfrey', 2, 10],
        ['fern-blossom', 1, giftRelation('herb', 'fern-blossom', content)],
      ],
    );
    assert.equal(jagna.gift.given, false);
    assert.equal(jagna.present, null);
    const given = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'herbalist', key: 'comfrey' } });
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.deepEqual(given.data.given, { resident: 'herbalist', kind: 'herb', name: content.herbsById.comfrey.name, count: 1, relation: 10 });
    assert.equal((await column('herbs')).comfrey, 1);
    assert.equal((await stored()).relations.herbalist, 10);
    assert.equal(given.data.settlement.residents.find((one) => one.id === 'herbalist').gift.given, true);
    // Once a day, also with another piece.
    const again = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'herbalist', key: 'fern-blossom' } });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'given_today');
    // Sambor likes herbs too, and his day is his own.
    assert.equal((await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'hermit', key: 'comfrey' } })).status, 200);
    assert.equal((await column('herbs')).comfrey, undefined, 'the last piece leaves its stack');
    // The next day a rarer piece gives more.
    await yesterday();
    const rare = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'herbalist', key: 'fern-blossom' } });
    assert.equal(rare.status, 200, JSON.stringify(rare.data));
    assert.ok(rare.data.given.relation > 10);
    assert.equal((await stored()).relations.herbalist, 10 + rare.data.given.relation);
  });

  test('only what the resident likes and the character holds', async () => {
    const wrong = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'herbalist', key: 'lesser-healing' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.code, 'not_liked');
    const gem = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'smith', key: 'quartz' } });
    assert.equal(gem.data.error.code, 'not_liked');
    const trophyGift = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'tanner', key: `${trophy.id}:${trophy.rarity}` } });
    assert.equal(trophyGift.data.error.code, 'not_liked');
    const none = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'herbalist', key: 'nettle' } });
    assert.equal(none.status, 409);
    assert.equal(none.data.error.code, 'not_enough');
    assert.equal((await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'nobody' } })).status, 404);
    // Each one's own kind goes: an ore, a gem, a material, a potion.
    for (const [id, key, from] of [
      ['smith', 'silver-ore', 'minerals'],
      ['enchantress', 'quartz', 'minerals'],
      ['tanner', 'wolf-pelt:rare', 'materials'],
      ['innkeeper', 'lesser-healing', 'potions'],
    ]) {
      const given = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: id, key } });
      assert.equal(given.status, 200, `${id}: ${JSON.stringify(given.data)}`);
      assert.equal((await column(from))[key], undefined, `${id}: ${key} gone`);
    }
    assert.equal((await stored()).relations.tanner, giftRelation('material', 'wolf-pelt:rare', content));
    // Wszebor's list never shows a trophy.
    assert.deepEqual((await resident('tanner')).gift.goods, []);
  });

  test('to those who like gold, gold for the level; not without it', async () => {
    const bogumil = await resident('headman');
    assert.deepEqual([bogumil.gift.kind, bogumil.gift.gold, bogumil.gift.relation], ['gold', goldGift(LEVEL, content), 10]);
    const given = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'headman' } });
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.equal(given.data.character.gold, 10000 - goldGift(LEVEL, content));
    assert.equal((await stored()).relations.headman, 10);
    await (await db()).prepare('UPDATE characters SET gold = 1').run();
    const poor = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident: 'merchant' } });
    assert.equal(poor.status, 409);
    assert.equal(poor.data.error.code, 'not_enough_gold');
    assert.equal((await stored()).relations.merchant, undefined);
  });

  test("a friend's present waits in their place once a week, and goes into the goods", async () => {
    const osada = await stored();
    osada.relations = { herbalist: friend.points, merchant: friend.points, hermit: friend.points, tanner: friend.points - 1 };
    await (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify(osada)).run();
    const view = await settlement();
    const at = (id) => view.residents.find((one) => one.id === id);
    assert.equal(at('tanner').present, null, 'not a friend yet');
    const herbs = at('herbalist').present;
    assert.equal(herbs.kind, 'herb');
    assert.ok(herbs.name && herbs.count > 0);
    const before = await column('herbs');
    const taken = await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'herbalist' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(taken.data.present, { resident: 'herbalist', ...herbs });
    const key = content.herbs.find((herb) => herb.name === herbs.name).id;
    assert.equal((await column('herbs'))[key], (before[key] ?? 0) + herbs.count);
    // Kept out of the Encyklopedia, as bought goods are.
    assert.equal((await column('foreign_stacks'))[`herb:${key}`], herbs.count);
    assert.equal(taken.data.settlement.residents.find((one) => one.id === 'herbalist').present, null);
    const twice = await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'herbalist' } });
    assert.equal(twice.status, 409);
    assert.equal(twice.data.error.code, 'no_present');
    // Gościwit's gold and Sambor's Punkty Czasu.
    const gold = await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'merchant' } });
    assert.equal(gold.data.character.gold, 10000 + residentGift('merchant', content).weekly.perLevel * LEVEL);
    const { timePoints: timeBefore } = (await call('GET', '/api/character', { cookie })).data.character;
    const time = await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'hermit' } });
    assert.equal(time.status, 200, JSON.stringify(time.data));
    assert.ok(time.data.character.timePoints >= timeBefore + residentGift('hermit', content).weekly.count);
    assert.equal((await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'tanner' } })).data.error.code, 'no_present');
  });

  test('herbs of a present wait while the bag has no room for them', async () => {
    const osada = await stored();
    osada.relations = { herbalist: friend.points };
    const database = await db();
    await database.prepare("UPDATE characters SET settlement = ?, herbs = '{}', potions = '{}'").bind(JSON.stringify(osada)).run();
    const { present } = await resident('herbalist');
    const key = content.herbs.find((herb) => herb.name === present.name).id;
    const { stack } = content.professionRules;
    const other = content.herbs.find((herb) => herb.id !== key).id;
    const { bagUsed, bagCapacity } = (await call('GET', '/api/character', { cookie })).data.character;
    await database.prepare('UPDATE characters SET herbs = ?').bind(JSON.stringify({ [other]: (bagCapacity - bagUsed) * stack })).run();
    const full = await call('POST', '/api/settlement/residents/present', { cookie, body: { resident: 'herbalist' } });
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.ok((await resident('herbalist')).present, 'the present still waits');
  });
});
