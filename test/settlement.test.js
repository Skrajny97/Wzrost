// The Osada, part I, in the engine: standings, the board of orders (what
// they ask for, drawing, refilling, delivering, rejecting, the week's big
// order), the Zaklinaczka's reforging and the Pustelnik's prices.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  createRng,
  deliverBlock,
  deliverOrder,
  drawOrder,
  drawQuests,
  emptyBoard,
  evolutionChangeCost,
  fireBuilding,
  fireTrade,
  generateItem,
  goodPrice,
  orderGoods,
  partPrice,
  pathResetCost,
  questPeriod,
  reforgeBlock,
  reforgeCost,
  reforgeItem,
  rejectOrder,
  settleBoard,
  shopBuilding,
  standingOf,
  statResetCost,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 9, 30, 10, 0);
const HOUR = 3600000;
// A character of level 20 that has met a wolf and a crow, with both
// professions of gathering and brewing at level 1.
const character = newCharacter('warrior', { level: 20, classLevel: 20, met: ['wolf', 'crow'], professions: {} });

describe('the Osada in the engine', () => {
  test('standings grow with points, the last one has no next', () => {
    const { standings } = content.settlement;
    assert.equal(standingOf(0, content).id, standings[0].id);
    assert.equal(standingOf(standings[1].points - 1, content).id, standings[0].id);
    assert.equal(standingOf(standings[1].points, content).id, standings[1].id);
    assert.equal(standingOf(standings[1].points, content).toNext, standings[2].points - standings[1].points);
    const top = standingOf(standings.at(-1).points + 500, content);
    assert.equal(top.id, standings.at(-1).id);
    assert.equal(top.next, null);
    assert.equal(top.toNext, 0);
  });

  test('orders ask only for what the character can get: met creatures without trophies, known herbs and potions, resources, lower parts', () => {
    const goods = orderGoods(character, content);
    const kinds = new Set(goods.map((good) => good.kind));
    for (const kind of ['herb', 'potion', 'material', 'resource', 'part']) assert.ok(kinds.has(kind), kind);
    const materials = goods.filter((good) => good.kind === 'material').map((good) => good.key);
    assert.deepEqual(materials.sort(), [`${content.materialsByMonster.crow.id}:${content.materialsByMonster.crow.rarity}`, `${content.materialsByMonster.wolf.id}:${content.materialsByMonster.wolf.rarity}`].sort());
    const parts = goods.filter((good) => good.kind === 'part').map((good) => content.partsById[good.key].rarity);
    assert.deepEqual(parts, ['common', 'rare']);
    const herbs = goods.filter((good) => good.kind === 'herb');
    assert.ok(herbs.every((good) => content.herbsById[good.key].level <= 1));
    // Before the professions open, no herbs and no potions.
    const young = orderGoods({ ...character, level: 1 }, content);
    assert.ok(!young.some((good) => good.kind === 'herb' || good.kind === 'potion'));
  });

  test('an order is the same for the same seed, pays above the market and below what it costs to buy', () => {
    const a = drawOrder({ character, seed: 'x:1' }, content);
    assert.deepEqual(drawOrder({ character, seed: 'x:1' }, content), a);
    // A resource and a part at their cheapest: the fire spirit's and the
    // Lada złomiarza's top level, the week's big order's rate included.
    const cheapest = ({ kind, key }) =>
      kind === 'resource' ? fireTrade(fireBuilding(content).maxLevel, content).unitGold : partPrice(key, shopBuilding(content).maxLevel, content);
    for (let i = 0; i < 200; i++) {
      for (const weekly of [false, true]) {
        const order = drawOrder({ character, seed: `pay:${i}`, weekly }, content);
        if (order.kind === 'resource' || order.kind === 'part') {
          const buy = cheapest(order) * order.count;
          assert.ok(order.gold <= buy, `${order.kind} ${order.gold} > ${buy}`);
        } else {
          const market = goodPrice(order, content) * order.count;
          assert.ok(order.gold > market, `${order.kind} ${order.gold} ≤ ${market}`);
        }
        assert.ok(content.settlement.orders.stories[order.kind].includes(order.story));
        assert.equal(order.brotherhood, content.settlement.brotherhoods.find((one) => one.goods.includes(order.kind)).id);
      }
    }
  });

  test('each brotherhood with goods to order gets about as many orders as another', () => {
    const counts = {};
    for (let i = 0; i < 3000; i++) {
      const { brotherhood } = drawOrder({ character, seed: `b:${i}` }, content);
      counts[brotherhood] = (counts[brotherhood] ?? 0) + 1;
    }
    assert.deepEqual(Object.keys(counts).sort(), ['herbalists', 'hunters', 'smiths']);
    for (const count of Object.values(counts)) assert.ok(Math.abs(count - 1000) < 120, `${count}`);
  });

  test('orders of quality ask for a finer material only from the quality standing on', () => {
    const { quality } = content.settlement.orders;
    const hunters = content.settlement.standings.find((standing) => standing.id === quality.from).points;
    const finer = (reputation) =>
      Array.from({ length: 300 }, (_, i) => drawOrder({ character, reputation, seed: `q:${i}` }, content)).filter(
        (order) => order.kind === 'material' && !order.key.endsWith(`:${content.materialsById[order.key.split(':')[0]].rarity}`),
      ).length;
    assert.equal(finer({}), 0);
    assert.ok(finer({ hunters }) > 0);
  });

  test('the board fills its slots, keeps them, and refills a delivered or rejected one after its time', () => {
    const board = settleBoard(emptyBoard(), { character, seed: 's' }, NOW, content);
    assert.equal(board.slots.length, content.settlement.orders.open);
    assert.ok(board.slots.every((slot) => slot.order));
    assert.deepEqual(settleBoard(board, { character, seed: 's' }, NOW + HOUR, content), board);
    const first = board.slots[0].order;
    const stocks = { herbs: {}, potions: {}, materials: {}, resources: {}, parts: {} };
    assert.equal(deliverBlock(board, first.id, stocks).code, 'not_enough');
    const store = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' }[first.kind];
    stocks[store][first.key] = first.count;
    assert.equal(deliverBlock(board, first.id, stocks), null);
    const done = deliverOrder(board, first.id, NOW, content);
    assert.deepEqual(done.take, { kind: first.kind, key: first.key, count: first.count });
    assert.equal(done.gold, first.gold);
    assert.deepEqual(done.reputation, { [first.brotherhood]: first.reputation });
    assert.equal(done.board.slots[0].order, undefined);
    const refill = content.settlement.orders.refillMinutes * 60000;
    assert.equal(settleBoard(done.board, { character, seed: 's' }, NOW + refill - 1, content).slots[0].order, undefined);
    assert.ok(settleBoard(done.board, { character, seed: 's' }, NOW + refill, content).slots[0].order);
    // Rejecting is free and waits as long; the week's order cannot be rejected.
    const second = board.slots[1].order;
    const rejected = rejectOrder(board, second.id, NOW, content);
    assert.equal(rejected.slots[1].readyAt, NOW + refill);
    assert.equal(rejectOrder(board, 'weekly', NOW, content), null);
  });

  test('every third order and the week\'s big one give Punkty Systemu', () => {
    const { systemPoints } = content.settlement.orders;
    let board = settleBoard(emptyBoard(), { character, seed: 'ps' }, NOW, content);
    const points = [];
    for (let i = 0; i < 6; i++) {
      const slot = board.slots.find((one) => one.order);
      const done = deliverOrder(board, slot.order.id, NOW, content);
      points.push(done.systemPoints);
      board = settleBoard(done.board, { character, seed: 'ps' }, NOW + 24 * HOUR, content);
    }
    assert.deepEqual(points, [0, 0, systemPoints.points, 0, 0, systemPoints.points]);
    const weekly = board.weekly.order;
    assert.ok(weekly.weekly && weekly.count >= content.settlement.orders.counts[weekly.kind].min * content.settlement.orders.weekly.count);
    const done = deliverOrder(board, 'weekly', NOW, content);
    assert.equal(done.systemPoints, systemPoints.weekly);
    assert.equal(done.board.weekly.done, true);
    assert.equal(deliverBlock(done.board, 'weekly', {}).code, 'no_order');
    // A new week brings a new big order.
    const next = questPeriod('weekly', NOW, content).endsAt;
    assert.equal(settleBoard(done.board, { character, seed: 'ps' }, next, content).weekly.done, false);
  });

  test('reforging draws one affix anew, of its kind, never one the item has, and keeps the rest', () => {
    const rng = createRng('item');
    const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'epic', area: content.areas[0] }, rng, content);
    assert.equal(item.affixes.length, 3);
    for (let i = 0; i < 50; i++) {
      const done = reforgeItem(item, 1, createRng(`r:${i}`), content);
      assert.equal(done.affixes[1].kind, item.affixes[1].kind);
      assert.equal(done.affixes[1].monster, item.affixes[1].monster);
      assert.notEqual(done.affixes[1].id, item.affixes[1].id);
      assert.ok(!done.affixes.some((affix, index) => index !== 1 && affix.id === done.affixes[1].id));
      assert.deepEqual(done.affixes[0], item.affixes[0]);
      assert.deepEqual(done.affixes[2], item.affixes[2]);
      assert.equal(done.reforged, 1);
      assert.equal(done.level, item.level);
    }
  });

  test('reforging costs gold by level and rarity, more each time, and materials of the item\'s rarity class', () => {
    const rng = createRng('cost');
    const rare = generateItem({ baseId: 'sword', level: 20, rarityId: 'rare' }, rng, content);
    const common = generateItem({ baseId: 'sword', level: 20, rarityId: 'common' }, rng, content);
    const first = reforgeCost(rare, 0, content);
    const second = reforgeCost(rare, 1, content);
    assert.ok(second.gold > first.gold);
    assert.equal(Math.round(first.gold * content.settlement.reforge.growth), second.gold);
    assert.equal(reforgeBlock(common, 0, { gold: 1e9, materials: {}, times: 0 }, content).code, 'no_affixes');
    const need = first.materials;
    const stack = `${content.materials.find((material) => material.rarity === need.rarity).id}:${need.rarity}`;
    assert.equal(reforgeBlock(rare, 0, { gold: first.gold - 1, materials: { [stack]: need.count }, stack, times: 0 }, content).code, 'not_enough_gold');
    assert.equal(reforgeBlock(rare, 0, { gold: first.gold, materials: { [stack]: need.count - 1 }, stack, times: 0 }, content).code, 'not_enough_materials');
    assert.equal(reforgeBlock(rare, 0, { gold: first.gold, materials: { [stack]: need.count }, stack, times: 0 }, content), null);
    assert.equal(reforgeBlock(rare, 5, { gold: first.gold, materials: { [stack]: need.count }, stack, times: 0 }, content).code, 'invalid_affix');
  });

  test('the Pustelnik\'s prices', () => {
    const { hermit } = content.settlement;
    assert.equal(pathResetCost(30, content), 30 * hermit.pathGoldPerLevel);
    assert.equal(evolutionChangeCost(0, content), hermit.evolutionGold);
    assert.equal(evolutionChangeCost(2, content), hermit.evolutionGold * hermit.evolutionGrowth ** 2);
    assert.equal(statResetCost(hermit.statsFromLevel - 1, content), null);
    assert.equal(statResetCost(hermit.statsFromLevel, content), hermit.statsFromLevel * hermit.statsGoldPerLevel);
  });
});

describe('the Osada through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('soltysowa'));
    await call('POST', '/api/character', { cookie, body: { name: 'Soltysowa', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 20, class_level = 20, met = '["wolf"]', gold = 100000`).run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const view = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const STORE = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' };

  test('the Osada opens at its level, with three orders and the week\'s', async () => {
    await set('level = 19');
    const locked = await call('GET', '/api/settlement', { cookie });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    await set('level = 20');
    const settlement = await view();
    assert.equal(settlement.name, content.settlement.name);
    assert.equal(settlement.board.slots.length, 3);
    // Each order says how much of it the character holds (a new one has some resources).
    assert.ok(settlement.board.slots.every((slot) => slot.order && Number.isInteger(slot.order.have)));
    assert.ok(settlement.board.weekly);
    // The board is kept: the same orders the next time.
    assert.deepEqual((await view()).board, settlement.board);
  });

  test('delivering an order takes what it asks for and gives gold, reputation and a new order later', async () => {
    const settlement = await view();
    const order = settlement.board.slots[0].order;
    const short = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(short.status, 409);
    assert.equal(short.data.error.code, 'not_enough');
    const column = STORE[order.kind];
    await set(`${column} = json_set(${column}, ?, ?)`, `$."${order.key}"`, order.count + 1);
    const done = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(done.status, 200);
    assert.equal(done.data.delivered.gold, order.gold);
    assert.equal(done.data.character.gold, 100000 + order.gold);
    assert.equal(done.data.settlement.board.slots[0].readyAt > 0, true);
    const brotherhood = done.data.settlement.brotherhoods.find((one) => one.id === order.brotherhood);
    assert.equal(brotherhood.standing.toNext, content.settlement.standings[1].points - order.reputation);
    const row = await (await db()).prepare(`SELECT ${column} AS stock FROM characters`).first();
    assert.equal(JSON.parse(row.stock)[order.key], 1);
    const again = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(again.status, 404);
  });

  test('the Osada tab lights up when an order on the board can be delivered', async () => {
    await set(`herbs = '{}', potions = '{}', materials = '{}', resources = '{}', parts = '{}'`);
    const order = (await view()).board.slots[0].order;
    const lit = async () => (await call('GET', '/api/character', { cookie })).data.character.settlementWaiting;
    assert.equal(await lit(), false);
    const column = STORE[order.kind];
    await set(`${column} = json_set(${column}, ?, ?)`, `$."${order.key}"`, order.count);
    assert.equal(await lit(), true);
  });

  test('herb and potion orders wait for the character at home, the others do not', async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    let orders = [];
    for (let i = 0; i < 12 && !(orders.some((order) => order.home) && orders.some((order) => !order.home)); i++) {
      await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } });
      orders = (await view()).board.slots.map((slot) => slot.order);
    }
    const home = orders.find((order) => order.home);
    const away = orders.find((order) => !order.home);
    assert.ok(['herb', 'potion'].includes(home.kind));
    assert.ok(!['herb', 'potion'].includes(away.kind));
    const lit = async () => (await call('GET', '/api/character', { cookie })).data.character.settlementWaiting;
    const give = (order) => set(`${STORE[order.kind]} = json_set(${STORE[order.kind]}, ?, ?)`, `$."${order.key}"`, order.count);
    await set(`herbs = '{}', potions = '{}', materials = '{}', resources = '{}', parts = '{}'`);
    await give(home);
    assert.equal(await lit(), false);
    const waiting = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: home.id } });
    assert.equal(waiting.status, 409);
    assert.equal(waiting.data.error.code, 'busy');
    await give(away);
    assert.equal(await lit(), true);
    assert.equal((await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: away.id } })).status, 200);
  });

  test('rejecting an order empties its slot for a while', async () => {
    const order = (await view()).board.slots[1].order;
    const rejected = await call('POST', '/api/settlement/reject', { cookie, body: { orderId: order.id } });
    assert.equal(rejected.status, 200);
    assert.ok(rejected.data.settlement.board.slots[1].readyAt);
    assert.equal((await call('POST', '/api/settlement/reject', { cookie, body: { orderId: 'weekly' } })).status, 404);
  });

  test('"Testuj Osadę" opens it below its level, puts everyone at one standing and brings new orders', async () => {
    await set('level = 12');
    assert.equal((await call('GET', '/api/settlement', { cookie })).status, 403);
    const { standings } = (await call('GET', '/api/test/settlement', { cookie })).data;
    assert.deepEqual(
      standings.map((one) => one.id),
      content.settlement.standings.map((one) => one.id),
    );
    const opened = await call('POST', '/api/test/settlement', { cookie, body: { action: 'open' } });
    assert.equal(opened.status, 200);
    assert.ok(opened.data.character.features.includes('settlement'));
    const before = await view();
    const top = content.settlement.standings.at(-1);
    assert.equal((await call('POST', '/api/test/settlement', { cookie, body: { action: 'standing', standing: top.id } })).status, 200);
    const after = await view();
    assert.ok(after.brotherhoods.every((one) => one.standing.id === top.id));
    assert.ok(after.residents.every((one) => one.standing.id === top.id));
    // The orders stay until "Nowe zlecenia", which draws new ones for every slot.
    assert.deepEqual(after.board.slots, before.board.slots);
    assert.equal((await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } })).status, 200);
    const renewed = await view();
    assert.equal(renewed.board.slots.length, 3);
    assert.ok(renewed.board.slots.every((slot, index) => slot.order && slot.order.id !== before.board.slots[index].order.id));
    assert.equal((await call('POST', '/api/test/settlement', { cookie, body: { action: 'nothing' } })).status, 400);
  });

  test('the Pustelnik resets the paths and, above the free reset\'s level, the stats for gold', async () => {
    const { hermit } = content.settlement;
    const skill = content.skills.find((one) => one.classId === 'warrior');
    await set('skills = ?, points = ?', JSON.stringify({ [skill.id]: 3 }), JSON.stringify({ strength: 5 }));
    const path = await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'path' } });
    assert.equal(path.status, 200);
    assert.equal(path.data.gold, 20 * hermit.pathGoldPerLevel);
    let row = await (await db()).prepare('SELECT skills, gold FROM characters').first();
    assert.deepEqual(JSON.parse(row.skills), {});
    assert.equal(row.gold, 100000 - path.data.gold);
    assert.equal((await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'path' } })).data.error.code, 'nothing_to_reset');
    // At level 20 the stats reset is the free one in Statystyki.
    assert.equal((await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'stats' } })).data.error.code, 'free_reset');
    await set('level = ?', hermit.statsFromLevel);
    const stats = await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'stats' } });
    assert.equal(stats.status, 200);
    row = await (await db()).prepare('SELECT points FROM characters').first();
    assert.deepEqual(JSON.parse(row.points), {});
  });

  test('the Zaklinaczka reforges one affix for gold and materials', async () => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const item = generateItem({ baseId: 'sword', level: 20, rarityId: 'rare', area: content.areas[0] }, createRng('api'), content);
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item)).run();
    const itemId = meta.last_row_id;
    const cost = reforgeCost(item, 0, content);
    const stack = `${content.materialsByMonster.wolf.id}:${cost.materials.rarity}`;
    const missing = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0, material: stack } });
    assert.equal(missing.data.error.code, 'not_enough_materials');
    await set('materials = json_set(materials, ?, ?)', `$."${stack}"`, cost.materials.count);
    const done = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0, material: stack } });
    assert.equal(done.status, 200);
    assert.notEqual(done.data.item.affixes[0].id, item.affixes[0].id);
    assert.equal(done.data.item.reforged, 1);
    assert.equal(done.data.character.gold, 100000 - cost.gold);
    const row = await database.prepare('SELECT materials FROM characters').first();
    assert.equal(JSON.parse(row.materials)[stack], undefined);
    // The next one costs more.
    assert.ok(reforgeCost({ ...item, reforged: 1 }, 1, content).gold > cost.gold);
  });
});

describe('the Osada in the narrator\'s quests', () => {
  test('"Wykonaj N zleceń w Osadzie" comes only with the Osada open, and delivered orders move it on', () => {
    const kinds = (hasSettlement) =>
      new Set(Array.from({ length: 200 }, (_, i) => drawQuests('weekly', { character, hasTable: true, hasProfessions: true, hasSettlement, seed: `w:${i}` }, content)).flat().map((quest) => quest.kind));
    assert.ok(!kinds(false).has('orders'));
    assert.ok(kinds(true).has('orders'));
    const quest = { kind: 'orders', count: 8, progress: 7, reward: { kind: 'gold', amount: 10 }, claimed: false };
    const moved = addQuestProgress({ weekly: { period: 'x', quests: [quest], chest: false } }, { orders: 3 });
    assert.equal(moved.weekly.quests[0].progress, 8);
  });
});
