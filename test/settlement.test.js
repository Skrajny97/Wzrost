// The Osada, part I, in the engine: standings, the board of orders (what
// they ask for, drawing, refilling, delivering, rejecting, the week's big
// order), the Zaklinaczka's reforging and the Pustelnik's prices.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  createRng,
  deliverBlock,
  drawRumor,
  explorationPace,
  mugCost,
  rumorFactor,
  rumorText,
  withRareOdds,
  deliverOrder,
  drawOrder,
  orderGold,
  drawQuests,
  emptyBoard,
  evolutionChangeCost,
  evolutionChangePrice,
  evolutionChanges,
  fireBuilding,
  fireTrade,
  generateItem,
  goodPrice,
  goodStock,
  materialsTaken,
  orderGoods,
  orderStories,
  craftBuyCost,
  craftSellPrice,
  partPrice,
  pathResetCost,
  questPeriod,
  reforgeBlock,
  reforgeChoices,
  reforgeCost,
  reforgeItem,
  reforgeOptions,
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
// The stack that holds what an order asks for: for any materials of a
// rarity, the wolf's pelt at that rarity.
const heldKey = (order) => (order.kind === 'material' && order.key.startsWith('any:') ? `${content.materialsByMonster.wolf.id}:${order.key.slice(4)}` : order.key);

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

  test('the Karczma\'s rumor names an elite or a champion of an open place, the same all day, and doubles them there', () => {
    const rumor = drawRumor({ character, seed: 'k' }, NOW, content);
    const area = content.areasById[rumor.areaId];
    assert.ok([area.elite, area.champion].includes(rumor.monsterId));
    assert.ok(area.minLevel - content.balance.hunt.areaUnlockLead <= character.classLevel);
    assert.deepEqual(drawRumor({ character, seed: 'k' }, NOW + HOUR, content), rumor);
    assert.match(rumorText(rumor, content), new RegExp(area.name));
    assert.equal(mugCost(20, content), 20 * content.settlement.tavern.mugGoldPerLevel);
    const { factor } = content.settlement.tavern.rumor;
    assert.equal(rumorFactor(rumor, rumor.areaId, NOW, content), factor);
    assert.equal(rumorFactor(rumor, 'windfalls-edge', NOW, content), 1);
    assert.equal(rumorFactor({ ...rumor, used: true }, rumor.areaId, NOW, content), 1);
    assert.equal(rumorFactor(rumor, rumor.areaId, NOW + 24 * HOUR, content), 1);
    const pace = explorationPace(60, content);
    const told = withRareOdds(pace, { rumor: factor }, content);
    assert.equal(told.eliteChance, Math.min(1, pace.eliteChance * factor));
    assert.equal(told.championChance, Math.min(1, pace.championChance * factor));
    assert.equal(withRareOdds(pace, { avoidRare: true, rumor: factor }, content).eliteChance, 0);
  });

  test('orders ask only for what the character can get: any materials of the met creatures\' rarities, known herbs and potions, resources, lower parts', () => {
    const goods = orderGoods(character, content);
    const kinds = new Set(goods.map((good) => good.kind));
    for (const kind of ['herb', 'potion', 'material', 'resource', 'part']) assert.ok(kinds.has(kind), kind);
    const materials = goods.filter((good) => good.kind === 'material').map((good) => good.key);
    assert.deepEqual(materials, [`any:${content.materialsByMonster.wolf.rarity}`, `any:${content.materialsByMonster.crow.rarity}`]);
    // An elite's trophy adds no rarity of its own.
    const elite = Object.values(content.monstersById).find((monster) => monster.elite && content.materialsByMonster[monster.id]);
    const withElite = orderGoods({ ...character, met: [...character.met, elite.id] }, content).filter((good) => good.kind === 'material');
    assert.deepEqual(withElite.map((good) => good.key), materials);
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
        } else if (order.kind === 'craft') {
          // A Warsztat's item: more than the scrapper's, less than making it from bought parts.
          assert.ok(order.gold < craftBuyCost(order.key, character.level, content) * order.count, `craft ${order.gold}`);
          assert.ok(order.gold > craftSellPrice(character.level, content) * order.count, `craft ${order.gold}`);
        } else {
          const market = goodPrice(order, content) * order.count;
          assert.ok(order.gold > market, `${order.kind} ${order.gold} ≤ ${market}`);
        }
        assert.ok(orderStories(order.kind, order.key, content).includes(order.story));
        assert.equal(order.brotherhood, content.settlement.brotherhoods.find((one) => one.goods.includes(order.kind)).id);
      }
    }
  });

  test('an order of herbs, potions or materials pays at least 20% over what the scrapper pays the character (236 A)', () => {
    const { overScrap } = content.settlement.orders;
    for (let i = 0; i < 200; i++) {
      const order = drawOrder({ character, seed: `skup:${i}` }, content);
      for (const bonus of [0, 0.5, 1]) {
        const gold = orderGold(order, bonus, content);
        assert.ok(gold >= order.gold);
        if (['herb', 'potion', 'material'].includes(order.kind)) assert.ok(gold >= goodPrice(order, content) * (1 + bonus) * order.count * overScrap - 1e-9, `${order.kind} ${gold}`);
        else assert.equal(gold, order.gold);
      }
    }
  });

  test("a Warsztat's weapon is not wanted for guards in rags, armour is", () => {
    const sword = orderStories('craft', 'sword', content);
    const chest = content.bases.find((base) => base.slot === 'chest');
    const armour = orderStories('craft', chest.id, content);
    assert.ok(sword.some((story) => story.includes('bez uzbrojenia')));
    assert.ok(!sword.some((story) => story.includes('łachmanach')));
    assert.ok(armour.some((story) => story.includes('łachmanach')));
    assert.ok(!armour.some((story) => story.includes('bez uzbrojenia')));
  });

  test('an order hung before its sentence was rewritten reads the new one', () => {
    const now = Date.UTC(2026, 9, 30, 12);
    const board = settleBoard(null, { character, reputation: {}, seed: 's' }, now, content);
    const old = {
      ...board,
      slots: board.slots.map((slot, index) =>
        index === 0 ? { ...slot, order: { ...slot.order, kind: 'craft', key: 'sword', story: 'Strażnicy palisady chodzą w łachmanach. Wstyd przed kupcami.' } } : slot,
      ),
      weekly: { ...board.weekly, order: { ...board.weekly.order, kind: 'resource', story: 'Most na brodzie znowu się sypie.' } },
    };
    const fresh = settleBoard(old, { character, reputation: {}, seed: 's' }, now, content);
    assert.equal(fresh.slots[0].order.story, 'Strażnicy palisady chodzą bez uzbrojenia. Wstyd przed kupcami.');
    assert.equal(fresh.weekly.order.story, 'Most nad rzeką znowu się sypie.');
    assert.deepEqual(fresh.slots.slice(1), board.slots.slice(1));
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

  test('orders of quality ask for finer materials only from the quality standing on', () => {
    const { quality } = content.settlement.orders;
    const hunters = content.settlement.standings.find((standing) => standing.id === quality.from).points;
    // The wolf's and the crow's rarities, and a quality order one above them.
    const met = new Set(['wolf', 'crow'].map((id) => `any:${content.materialsByMonster[id].rarity}`));
    const finer = (reputation) =>
      Array.from({ length: 300 }, (_, i) => drawOrder({ character, reputation, seed: `q:${i}` }, content)).filter((order) => order.kind === 'material' && !met.has(order.key)).length;
    assert.equal(finer({}), 0);
    assert.ok(finer({ hunters }) > 0);
  });

  test('a material order asks for any materials of a rarity, fewer of a rarer one, for about the same gold', () => {
    const { counts, materialStep, weekly, anyMaterial } = content.settlement.orders;
    const older = { ...character, level: 28, met: ['wolf', 'crow', ...Object.values(content.monstersById).filter((monster) => !monster.elite && !monster.champion).map((monster) => monster.id)] };
    const seen = {};
    for (let i = 0; i < 400; i++) {
      const order = drawOrder({ character: older, seed: `any:${i}`, weekly: true }, content);
      if (order.kind !== 'material') continue;
      const rarityId = order.key.slice(4);
      assert.ok(order.key.startsWith('any:') && anyMaterial[rarityId], order.key);
      const step = materialStep ** content.rarities.findIndex((rarity) => rarity.id === rarityId);
      const most = (counts.material.max + counts.material.perTenLevels * 2) * weekly.count;
      assert.ok(order.count >= 1 && order.count <= Math.max(1, Math.round(most * step)), `${order.key} ${order.count}`);
      seen[rarityId] = true;
    }
    // The author's example: up to 32 common ones a week at level 28.
    assert.equal((counts.material.max + counts.material.perTenLevels * 2) * weekly.count, 32);
    assert.deepEqual(Object.keys(seen).sort(), Object.keys(anyMaterial).sort());
  });

  test('any materials of a rarity count from every stack of it, the biggest go first and the elements\' last', () => {
    const wolf = content.materialsByMonster.wolf;
    const crow = content.materialsByMonster.crow;
    const spark = content.settlement.imbue.elements.find((one) => content.materialsById[one.material].rarity === 'rare').material;
    const materials = {
      [`${wolf.id}:rare`]: 4,
      [`${crow.id}:rare`]: 9,
      [`${spark}:rare`]: 20,
      [`${wolf.id}:common`]: 50,
    };
    const order = { kind: 'material', key: 'any:rare', count: 30 };
    assert.equal(goodStock(order, { materials }, content), 33);
    assert.deepEqual(materialsTaken(order, materials, content), { [`${crow.id}:rare`]: 9, [`${wolf.id}:rare`]: 4, [`${spark}:rare`]: 17 });
    assert.deepEqual(materialsTaken({ ...order, count: 10 }, materials, content), { [`${crow.id}:rare`]: 9, [`${wolf.id}:rare`]: 1 });
    // One material of an order hung before keeps its own stack.
    assert.deepEqual(materialsTaken({ key: `${wolf.id}:common`, count: 5 }, materials, content), { [`${wolf.id}:common`]: 5 });
    const board = { ...emptyBoard(), slots: [{ order: { ...order, id: 1, brotherhood: 'hunters', gold: 10, reputation: 10 } }] };
    assert.equal(deliverBlock(board, 1, { materials }, content), null);
    assert.equal(deliverBlock(board, 1, { materials: { ...materials, [`${spark}:rare`]: 16 } }, content).code, 'not_enough');
  });

  test('an order for one creature\'s material hung before asks for any of its rarity, for the same count and gold', () => {
    const board = settleBoard(emptyBoard(), { character, seed: 'old' }, NOW, content);
    const wolf = content.materialsByMonster.wolf;
    const old = { kind: 'material', key: `${wolf.id}:${wolf.rarity}`, brotherhood: 'hunters', count: 32, gold: 128, reputation: 50, story: content.settlement.orders.stories.material[0] };
    const stored = { ...board, slots: [{ order: { ...old, id: 99, expiresAt: NOW + HOUR } }, ...board.slots.slice(1)], weekly: { ...board.weekly, order: { ...old, weekly: true } } };
    const fresh = settleBoard(stored, { character, seed: 'old' }, NOW, content);
    assert.deepEqual(fresh.slots[0].order, { ...old, id: 99, expiresAt: NOW + HOUR, key: `any:${wolf.rarity}` });
    assert.deepEqual(fresh.weekly.order, { ...old, weekly: true, key: `any:${wolf.rarity}` });
    assert.deepEqual(settleBoard(fresh, { character, seed: 'old' }, NOW, content), fresh);
  });

  test('the board fills its slots, keeps them, and refills a delivered or rejected one after its time', () => {
    const board = settleBoard(emptyBoard(), { character, seed: 's' }, NOW, content);
    assert.equal(board.slots.length, content.settlement.orders.open);
    assert.ok(board.slots.every((slot) => slot.order));
    assert.deepEqual(settleBoard(board, { character, seed: 's' }, NOW + HOUR, content), board);
    const first = board.slots[0].order;
    const stocks = { herbs: {}, potions: {}, materials: {}, resources: {}, parts: {} };
    assert.equal(deliverBlock(board, first.id, stocks, content).code, 'not_enough');
    const store = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' }[first.kind];
    stocks[store][heldKey(first)] = first.count;
    assert.equal(deliverBlock(board, first.id, stocks, content), null);
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

  test('an order left on the board for a week goes, and a new one comes in its place', () => {
    const week = content.settlement.orders.expireDays * 24 * HOUR;
    const board = settleBoard(emptyBoard(), { character, seed: 'x' }, NOW, content);
    const first = board.slots[0].order;
    assert.equal(first.expiresAt, NOW + week);
    assert.equal(settleBoard(board, { character, seed: 'x' }, NOW + week - 1, content).slots[0].order.id, first.id);
    const later = settleBoard(board, { character, seed: 'x' }, NOW + week, content).slots[0].order;
    assert.notEqual(later.id, first.id);
    assert.equal(later.expiresAt, NOW + 2 * week);
    // Two weeks away: the second week's orders have gone too.
    assert.equal(settleBoard(board, { character, seed: 'x' }, NOW + 2 * week + HOUR, content).slots[0].order.expiresAt, NOW + 3 * week);
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
    assert.equal(deliverBlock(done.board, 'weekly', {}, content).code, 'no_order');
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

  test('the Zaklinaczka offers more affixes to choose from as the relation grows, all different and new', () => {
    const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
    assert.equal(reforgeChoices(0, content), 1);
    assert.equal(reforgeChoices(points('acquaintance'), content), 2);
    assert.equal(reforgeChoices(points('trusted'), content), 3);
    const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'epic', area: content.areas[0] }, createRng('options'), content);
    const options = reforgeOptions(item, 0, 3, createRng('o'), content);
    assert.equal(options.length, 3);
    assert.equal(new Set(options.map((option) => option.id)).size, 3);
    for (const option of options) {
      assert.equal(option.kind, item.affixes[0].kind);
      assert.ok(!item.affixes.some((affix) => affix.id === option.id));
    }
    // With nothing to choose, reforging draws the first of them.
    assert.deepEqual(reforgeItem(item, 0, createRng('o'), content).affixes[0], options[0]);
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

  test('from Zaufany a brotherhood\'s order may be special: more reputation and a Punkt Systemu for the same pay', () => {
    const trusted = content.settlement.standings.find((standing) => standing.id === content.settlement.orders.special.from).points;
    const reputation = Object.fromEntries(content.settlement.brotherhoods.map(({ id }) => [id, trusted]));
    const drawn = Array.from({ length: 200 }, (_, i) => drawOrder({ character, reputation, seed: `sp:${i}` }, content));
    const special = drawn.filter((order) => order.special);
    assert.ok(special.length > 20 && special.length < 90, `${special.length} special of 200`);
    // The same order without the special ones pays the same gold.
    const { orders } = content.settlement;
    const plainContent = { ...content, settlement: { ...content.settlement, orders: { ...orders, special: { ...orders.special, chance: 0 } } } };
    for (const order of special) {
      assert.equal(order.reputation, orders.reputation * orders.special.reputation);
      const plain = drawOrder({ character, reputation, seed: `sp:${drawn.indexOf(order)}` }, plainContent);
      assert.equal(plain.special, undefined);
      assert.equal(order.gold, plain.gold);
    }
    // Never below the standing, never the week's.
    assert.ok(Array.from({ length: 100 }, (_, i) => drawOrder({ character, seed: `sp:${i}` }, content)).every((order) => !order.special));
    assert.ok(Array.from({ length: 50 }, (_, i) => drawOrder({ character, reputation, seed: `sw:${i}`, weekly: true }, content)).every((order) => !order.special));
    // Delivered, a special order adds its Punkt Systemu to the every-third one.
    const board = { ...emptyBoard(), slots: [{ order: { ...special[0], id: 1 } }], delivered: 0 };
    assert.equal(deliverOrder(board, 1, NOW, content).systemPoints, content.settlement.orders.special.systemPoints);
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
  const hold = (order, count = order.count) => set(`${STORE[order.kind]} = json_set(${STORE[order.kind]}, ?, ?)`, `$."${heldKey(order)}"`, count);

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

  // The first order of a good kept in a column (not the Warsztat's items) and its slot.
  const columnOrder = (settlement) => {
    const index = settlement.board.slots.findIndex((slot) => slot.order.kind !== 'craft');
    return { order: settlement.board.slots[index].order, index };
  };

  test('delivering an order takes what it asks for and gives gold, reputation and a new order later', async () => {
    const settlement = await view();
    const { order, index } = columnOrder(settlement);
    const short = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(short.status, 409);
    assert.equal(short.data.error.code, 'not_enough');
    const column = STORE[order.kind];
    await hold(order, order.count + 1);
    const done = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(done.status, 200);
    assert.equal(done.data.delivered.gold, order.gold);
    assert.equal(done.data.character.gold, 100000 + order.gold);
    assert.equal(done.data.settlement.board.slots[index].readyAt > 0, true);
    const brotherhood = done.data.settlement.brotherhoods.find((one) => one.id === order.brotherhood);
    assert.equal(brotherhood.standing.toNext, content.settlement.standings[1].points - order.reputation);
    const row = await (await db()).prepare(`SELECT ${column} AS stock FROM characters`).first();
    assert.equal(JSON.parse(row.stock)[heldKey(order)], 1);
    const again = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(again.status, 404);
  });

  test('the Osada tab lights up when an order on the board can be delivered', async () => {
    await set(`herbs = '{}', potions = '{}', materials = '{}', resources = '{}', parts = '{}'`);
    const { order } = columnOrder(await view());
    const lit = async () => (await call('GET', '/api/character', { cookie })).data.character.settlementWaiting;
    assert.equal(await lit(), false);
    await hold(order);
    assert.equal(await lit(), true);
  });

  test('herb and potion orders are delivered during an exploration too, as the others are', async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    let orders = [];
    const herbal = (order) => ['herb', 'potion'].includes(order.kind);
    for (let i = 0; i < 20 && !orders.some(herbal); i++) {
      await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } });
      orders = (await view()).board.slots.map((slot) => slot.order);
    }
    const order = orders.find(herbal);
    // The bag stays at hand while the character is away (the author: "Niech
    // system pozwala na Wymianę i różne działania na przedmiotach w czasie
    // zbierania ziół itp.").
    const lit = async () => (await call('GET', '/api/character', { cookie })).data.character.settlementWaiting;
    await set(`herbs = '{}', potions = '{}', materials = '{}', resources = '{}', parts = '{}'`);
    assert.equal(await lit(), false);
    await hold(order);
    assert.equal(await lit(), true);
    assert.equal((await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } })).status, 200);
  });

  test('an order for any materials of a rarity takes them from several stacks, the biggest first', async () => {
    let order = null;
    for (let i = 0; i < 30 && !order; i++) {
      await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } });
      order = (await view()).board.slots.map((slot) => slot.order).find((one) => one.kind === 'material') ?? null;
    }
    assert.ok(order, 'a material order comes');
    const rarityId = order.key.slice(4);
    const [one, few, many] = content.settlement.orders.anyMaterial[rarityId];
    assert.deepEqual(order.forms, [one, few, many]);
    const wolf = content.materialsByMonster.wolf.id;
    const crow = content.materialsByMonster.crow.id;
    const other = rarityId === 'common' ? 'rare' : 'common';
    const materials = { [`${wolf}:${rarityId}`]: order.count, [`${crow}:${rarityId}`]: 1, [`${wolf}:${other}`]: 7 };
    await set('materials = ?', JSON.stringify(materials));
    const shown = (await view()).board.slots.find((slot) => slot.order?.id === order.id).order;
    assert.equal(shown.have, order.count + 1);
    assert.equal(shown.takes.length, 1);
    assert.equal(shown.takes[0].count, order.count);
    const done = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(done.status, 200);
    const row = await (await db()).prepare('SELECT materials FROM characters').first();
    assert.deepEqual(JSON.parse(row.materials), { [`${crow}:${rarityId}`]: 1, [`${wolf}:${other}`]: 7 });
  });

  test('a Warsztat order takes the weakest of the pattern\'s items from the bag, never a worn one', async () => {
    let order = null;
    for (let i = 0; i < 30 && !order; i++) {
      await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } });
      order = (await view()).board.slots.map((slot) => slot.order).find((one) => one.kind === 'craft') ?? null;
    }
    assert.ok(order, 'a Warsztat order comes');
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const made = (rarityId, seed) => ({
      ...generateItem({ baseId: order.key, level: 20, rarityId, area: content.areas[0] }, createRng(seed), content),
      crafted: { parts: 6, upgrade: 0 },
    });
    const insert = async (item, slot = null) =>
      (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, JSON.stringify(item)).run()).meta.last_row_id;
    // A loot item of the same base does not count, nor does a worn one.
    const loot = generateItem({ baseId: order.key, level: 20, rarityId: 'common', area: content.areas[0] }, createRng('loot'), content);
    await insert(loot);
    const worn = await insert(made('common', 'worn'), content.basesById[order.key].slot);
    assert.equal((await view()).board.slots.find((slot) => slot.order?.id === order.id).order.have, 0);
    const rare = await insert(made('rare', 'rare'));
    const commons = [];
    for (let n = 0; n < order.count; n++) commons.push(await insert(made('common', `c${n}`)));
    assert.equal((await view()).board.slots.find((slot) => slot.order?.id === order.id).order.have, order.count + 1);
    const before = (await database.prepare('SELECT gold FROM characters').first()).gold;
    const done = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(done.status, 200);
    assert.equal(done.data.character.gold, before + order.gold);
    const left = (await database.prepare('SELECT id FROM items WHERE character_id = ?').bind(id).all()).results.map((row) => row.id);
    assert.ok(left.includes(worn) && left.includes(rare));
    assert.ok(commons.every((one) => !left.includes(one)));
  });

  test('a mug at the Karczma tells today\'s rumor once, and the next exploration there takes it along', async () => {
    const gold = mugCost(20, content);
    const bought = await call('POST', '/api/settlement/tavern', { cookie });
    assert.equal(bought.status, 200);
    const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
    const told = (await stored()).rumor;
    // The page has the innkeeper's words only, with the place's name; what
    // the rumor means is not told (the author).
    assert.deepEqual(Object.keys(bought.data.settlement.tavern.rumor), ['text']);
    assert.ok(bought.data.settlement.tavern.rumor.text.includes(content.areasById[told.areaId].name));
    assert.equal(told.used, false);
    assert.equal(bought.data.character.gold, 100000 - gold);
    assert.equal(bought.data.character.rumor, undefined);
    const innkeeper = bought.data.settlement.residents.find((resident) => resident.id === content.settlement.tavern.resident);
    assert.equal(innkeeper.service, 'tavern');
    assert.equal((await stored()).relations[content.settlement.tavern.resident], content.settlement.tavern.relationGain);
    assert.equal((await call('POST', '/api/settlement/tavern', { cookie })).data.error.code, 'told');
    // An exploration there uses it up, and the words stay on the page all day.
    await call('POST', '/api/hunts', { cookie, body: { areaId: told.areaId, minutes: 5 } });
    const activity = await (await db()).prepare('SELECT options FROM activities').first();
    assert.equal(JSON.parse(activity.options).rumor, content.settlement.tavern.rumor.factor);
    assert.equal((await stored()).rumor.used, true);
    assert.ok((await view()).tavern.rumor.text);
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
    // What the affix became, for the sheet to show.
    assert.equal(done.data.result.itemId, itemId);
    assert.match(done.data.result.old, /: \+\d+$/);
    assert.match(done.data.result.new, /: \+\d+$/);
    const row = await database.prepare('SELECT materials FROM characters').first();
    assert.equal(JSON.parse(row.materials)[stack], undefined);
    // The next one costs more.
    assert.ok(reforgeCost({ ...item, reforged: 1 }, 1, content).gold > cost.gold);
  });

  test('the Pustelnik changes the evolution, the first time free, then for more and more gold', async () => {
    assert.equal(evolutionChangePrice(0, content), 0);
    assert.equal(evolutionChangePrice(1, content), content.settlement.hermit.evolutionGold);
    assert.equal(evolutionChangePrice(2, content), content.settlement.hermit.evolutionGold * content.settlement.hermit.evolutionGrowth);
    assert.equal((await view()).hermit.evolution, null);
    const notYet = await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'evolution', evolutionId: 'gladiator' } });
    assert.equal(notYet.data.error.code, 'not_evolved');
    await set(`evolution = 'guardian', class_level = 50, skills = ?`, JSON.stringify({ challenge: 5, indomitable: 3 }));
    const offer = (await view()).hermit.evolution;
    assert.equal(offer.price, 0);
    assert.deepEqual(offer.choices.map((choice) => choice.id).sort(), evolutionChanges({ classId: 'warrior', evolution: 'guardian' }, content).map((one) => one.id).sort());
    assert.ok(!offer.choices.some((choice) => choice.id === 'guardian'));
    const free = await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'evolution', evolutionId: 'gladiator' } });
    assert.equal(free.status, 200);
    assert.equal(free.data.gold, 0);
    let row = await (await db()).prepare('SELECT evolution, skills, gold FROM characters').first();
    assert.equal(row.evolution, 'gladiator');
    assert.deepEqual(JSON.parse(row.skills), Object.fromEntries(content.evolutionsById.gladiator.skills.map((id) => [id, 0])));
    assert.equal(row.gold, 100000);
    const paid = await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'evolution', evolutionId: 'guardian' } });
    assert.equal(paid.data.gold, content.settlement.hermit.evolutionGold);
    row = await (await db()).prepare('SELECT evolution, gold FROM characters').first();
    assert.equal(row.evolution, 'guardian');
    assert.equal(row.gold, 100000 - content.settlement.hermit.evolutionGold);
    assert.equal((await call('POST', '/api/settlement/hermit', { cookie, body: { service: 'evolution', evolutionId: 'gladiator' } })).data.error.code, 'not_enough_gold');
  });

  test('closer to the Zaklinaczka, the player keeps one of the affixes she draws', async () => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const item = generateItem({ baseId: 'sword', level: 20, rarityId: 'rare', area: content.areas[0] }, createRng('choice'), content);
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item)).run();
    const itemId = meta.last_row_id;
    const trusted = content.settlement.standings.find((standing) => standing.id === 'trusted').points;
    await set('settlement = ?', JSON.stringify({ relations: { [content.settlement.reforge.resident]: trusted } }));
    const cost = reforgeCost(item, 0, content);
    const stack = `${content.materialsByMonster.wolf.id}:${cost.materials.rarity}`;
    await set('materials = json_set(materials, ?, ?)', `$."${stack}"`, cost.materials.count * 2);
    const done = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0, material: stack } });
    assert.equal(done.status, 200);
    // Paid, but the item keeps its affix until the choice.
    assert.equal(done.data.item.affixes[0].id, item.affixes[0].id);
    assert.equal(done.data.pending.options.length, 3);
    assert.equal(done.data.result, null);
    assert.equal(done.data.character.gold, 100000 - cost.gold);
    const again = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0, material: stack } });
    assert.equal(again.data.error.code, 'choose_first');
    const view = await call('GET', '/api/settlement', { cookie });
    assert.deepEqual(view.data.settlement.reforge.pending.options, done.data.pending.options);
    const chosen = await call('POST', '/api/settlement/reforge/choose', { cookie, body: { option: 1 } });
    assert.equal(chosen.status, 200);
    const stored = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement);
    assert.equal(stored.pending, undefined);
    assert.notEqual(chosen.data.item.affixes[0].id, item.affixes[0].id);
    assert.deepEqual(chosen.data.item.affixes.slice(1), item.affixes.slice(1));
    assert.equal(chosen.data.result.old, done.data.pending.old);
    assert.equal(chosen.data.result.new, done.data.pending.options[1]);
    assert.equal((await call('POST', '/api/settlement/reforge/choose', { cookie, body: { option: 0 } })).data.error.code, 'no_choice');
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
