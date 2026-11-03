// The Duch budowniczego at the Kamień węgielny Warowni (the author: "Niech
// przy Kamieniu czuwa duch budowniczego, który za zasoby płaci złotem"): he
// buys the camp's resources for gold, rounded down, an extra and not a main
// source of gold, and the stone's window shows what the camp's builds still
// need, so the surplus is plain.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  builderSpirit,
  campNeeds,
  fireBuilding,
  fireTrade,
  goodPrice,
  playerCombatant,
  simulateHunt,
  spiritGold,
  spiritLeast,
  spiritSaleBlock,
  upgradeCost,
} from '../src/engine/index.js';
import { companionsOf, newestArea, playerOf, withArea } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const spirit = builderSpirit(content);
const RESOURCES = content.resources.map((resource) => resource.id);
const pricePerPiece = (id) => spirit.gold[id] / spirit.lot;

describe('the Duch budowniczego in the engine', () => {
  test('he buys every camp resource, ore dearer than stone and stone than wood, for less than anyone sells a piece', () => {
    assert.deepEqual(Object.keys(spirit.gold).sort(), [...RESOURCES].sort());
    assert.ok(pricePerPiece('iron-ore') > pricePerPiece('stone'));
    assert.ok(pricePerPiece('stone') > pricePerPiece('wood'));
    // The fire spirit sells a piece for gold at the Ognisko's top level at
    // the cheapest, and the Osada's orders pay for one: both well above.
    const cheapest = fireTrade(fireBuilding(content).maxLevel, content).unitGold;
    const order = goodPrice({ kind: 'resource', key: 'wood' }, content) * content.settlement.orders.pay.resource;
    for (const id of RESOURCES) {
      assert.ok(pricePerPiece(id) < cheapest, id);
      assert.ok(pricePerPiece(id) < order, id);
    }
  });

  test('the gold is rounded down: a few pieces at a time never pay more than all at once', () => {
    for (const id of RESOURCES) {
      const least = spiritLeast(id, content);
      assert.equal(spiritGold(id, least, content), 1);
      assert.equal(spiritGold(id, least - 1, content), 0);
      for (const count of [1, least, least + 1, 250, 999, 12345]) {
        for (const parts of [2, 3, 7]) {
          const piece = Math.floor(count / parts);
          const pieces = [...Array(parts - 1).fill(piece), count - piece * (parts - 1)];
          const apart = pieces.reduce((sum, part) => sum + spiritGold(id, part, content), 0);
          assert.ok(apart <= spiritGold(id, count, content), `${id}: ${pieces.join(' + ')}`);
        }
      }
      assert.equal(spiritGold(id, spirit.lot * 7, content), spirit.gold[id] * 7);
    }
    // 6, 9 and 12 gold a hundred: 250 wood bring 15 gold, 33 of them 1.98,
    // so 1; a coin takes 17 wood, 12 stone or 9 ore.
    assert.deepEqual([spirit.lot, spirit.gold], [100, { wood: 6, stone: 9, 'iron-ore': 12 }]);
    assert.deepEqual([spiritGold('wood', 250, content), spiritGold('wood', 33, content), spiritGold('iron-ore', 1000, content)], [15, 1, 120]);
    assert.deepEqual(RESOURCES.map((id) => spiritLeast(id, content)), [17, 12, 9]);
  });

  test('a sale takes a known resource, whole pieces it has, and at least those worth a coin', () => {
    const resources = { wood: 500, stone: 5, 'iron-ore': 0 };
    const code = (resource, amount) => spiritSaleBlock({ resources, resource, amount }, content)?.code ?? null;
    assert.equal(code('wood', 500), null);
    assert.equal(code('wood', spiritLeast('wood', content)), null);
    for (const resource of ['gold', 'system-points', '__proto__', 'constructor', 'toString', '', undefined, null, 7, ['wood']]) {
      assert.equal(code(resource, 50), 'invalid_resource', String(resource));
    }
    for (const amount of [0, -5, 1.5, '50', null, undefined, Number.NaN, Infinity]) assert.equal(code('wood', amount), 'invalid_amount', String(amount));
    assert.equal(code('wood', 501), 'not_enough');
    assert.equal(code('iron-ore', 1), 'not_enough');
    const few = spiritSaleBlock({ resources, resource: 'stone', amount: 5 }, content);
    assert.equal(few.code, 'too_few');
    assert.match(few.message, new RegExp(`${spiritLeast('stone', content)} szt\\.`));
  });

  test("the camp's needs: every level not paid yet, of the camp's buildings and of the camp itself", () => {
    const own = content.buildings.filter((building) => !building.settlement);
    const sawmill = content.buildingsById.sawmill;
    const top = (buildings) => Object.fromEntries([...buildings, content.camp].map((building) => [building.id, { level: building.maxLevel, startedAt: 0, endsAt: 1 }]));
    // A new camp needs every level of every building.
    const fresh = campNeeds(own, {}, [], content);
    const all = Object.fromEntries(RESOURCES.map((id) => [id, 0]));
    for (const building of own) {
      for (let level = 1; level <= building.maxLevel; level++) {
        for (const [id, amount] of Object.entries(upgradeCost(building, level))) if (id !== 'gold') all[id] += amount;
      }
    }
    assert.deepEqual(fresh, all);
    assert.ok(RESOURCES.every((id) => fresh[id] > 0));
    // All at their highest but the Tartak at 9: its tenth level, gold left out
    // (DECISIONS.md: 1936 wood, 510 stone and 141 iron ore).
    const almost = { ...top(own), sawmill: { level: 9, startedAt: 0, endsAt: 1 } };
    assert.deepEqual(campNeeds(own, almost, [], content), { wood: 1936, stone: 510, 'iron-ore': 141 });
    const { gold, ...rest } = upgradeCost(sawmill, 10);
    assert.ok(gold > 0);
    assert.deepEqual(campNeeds(own, almost, [], content), rest);
    // A level under way or waiting in the queue is paid already.
    const building = { ...top(own), sawmill: { level: 10, startedAt: 0, endsAt: Date.UTC(2100, 0, 1) } };
    assert.deepEqual(campNeeds(own, building, [], content), { wood: 0, stone: 0, 'iron-ore': 0 });
    const queued = [{ buildingId: 'sawmill', level: 10, startsAt: 1, endsAt: 2, cost: upgradeCost(sawmill, 10) }];
    assert.deepEqual(campNeeds(own, almost, queued, content), { wood: 0, stone: 0, 'iron-ore': 0 });
    // The camp's own levels cost gold alone; the Kwatery count with the Osada.
    assert.deepEqual(campNeeds(own, { ...top(own), camp: { level: 3, startedAt: 0, endsAt: 1 } }, [], content), { wood: 0, stone: 0, 'iron-ore': 0 });
    const quarters = content.buildingsById.quarters;
    assert.ok(campNeeds([...own, quarters], top(own), [], content).wood > 0);
    assert.deepEqual(campNeeds([...own, quarters], top([...own, quarters]), [], content), { wood: 0, stone: 0, 'iron-ore': 0 });
  });

  // The author's wish, as the session understood it: an extra, not a main
  // source of gold. At level 100 with the Tartak, the Kamieniołom and the
  // Kopalnia at level 10, everything the camp gathers (its production all
  // day, and the finds and gathering of 8 hours of 4-hour explorations of
  // the realistic player of tools/difficulty-sim.mjs) sold at his prices adds
  // 5–10% to the gold of the explorations, and not above 10% even when the
  // Stół rozbiórki at its top level first turns it all into ore, one for one.
  test('selling all a level-100 camp gathers in a day adds 5–10% to the gold of its explorations', () => {
    const level = 100;
    const minutes = 240;
    const area = newestArea(level, content);
    const local = withArea(area, content);
    const gathered = Object.fromEntries(RESOURCES.map((id) => [id, 0]));
    let gold = 0;
    let hours = 0;
    for (const cls of content.classes) {
      const player = playerOf('realistic', cls.id, level, local);
      const hp = playerCombatant({ character: player.character, equipped: player.equipped, name: 'Spirit', area }, local).maxHp;
      for (let i = 0; i < 6; i++) {
        const companions = companionsOf(player.plan, level, i, local);
        const hunt = simulateHunt({ character: player.character, equipped: player.equipped, hp, name: 'Spirit', areaId: area.id, minutes, seed: `spirit:${cls.id}:${i}`, companions }, local);
        gold += hunt.gold;
        for (const [id, amount] of Object.entries(hunt.resources)) gathered[id] += amount;
        hours += minutes / 60;
      }
    }
    const day = { explored: 8, produced: 24 };
    const produced = Object.fromEntries(RESOURCES.map((id) => [id, 0]));
    for (const building of content.buildings) {
      if (building.effect.kind === 'production' && building.effect.resource in produced) produced[building.effect.resource] += building.effect.perLevel * building.maxLevel;
    }
    const pieces = Object.fromEntries(RESOURCES.map((id) => [id, (gathered[id] / hours) * day.explored + produced[id] * day.produced]));
    const dayGold = (gold / hours) * day.explored;
    const sold = RESOURCES.reduce((sum, id) => sum + pieces[id] * pricePerPiece(id), 0);
    const asOre = RESOURCES.reduce((sum, id) => sum + pieces[id], 0) * pricePerPiece('iron-ore');
    assert.ok(sold / dayGold >= 0.05 && sold / dayGold <= 0.1, `${((sold / dayGold) * 100).toFixed(1)}%`);
    assert.ok(asOre / dayGold <= 0.1, `${((asOre / dayGold) * 100).toFixed(1)}% as ore`);
    // Exploring all day, with no hours of production left over, it is still worth a look.
    const allDay = RESOURCES.reduce((sum, id) => sum + (gathered[id] / hours + produced[id]) * pricePerPiece(id), 0) / (gold / hours);
    assert.ok(allDay >= 0.04, `${(allDay * 100).toFixed(1)}% exploring all day`);
  });
});

describe('the Duch budowniczego in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  beforeEach(async () => {
    ({ cookie } = await signUp('budowniczy'));
    await call('POST', '/api/character', { cookie, body: { name: 'Budowniczy', classId: 'warrior', appearance: 'male' } });
    await set('level = 20, class_level = 20, gold = 100, resources = ?', JSON.stringify({ wood: 1000, stone: 40, 'iron-ore': 9 }));
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const sell = (resource, amount) => call('POST', '/api/camp/sell', { cookie, body: { resource, amount } });
  const good = (view, id) => view.camp.cornerstone.spirit.goods.find((one) => one.id === id);

  test('the stone\'s window shows him, his price and what the camp still needs of each resource', async () => {
    const view = await character();
    const shown = view.camp.cornerstone.spirit;
    assert.deepEqual([shown.name, shown.art, shown.line, shown.lot], [spirit.name, spirit.art, spirit.line, spirit.lot]);
    assert.deepEqual(Object.keys(shown.texts).sort(), ['least', 'need', 'price', 'sold']);
    assert.deepEqual(shown.goods.map((one) => one.id), RESOURCES);
    assert.deepEqual(shown.goods.map((one) => one.name), ['Drewno', 'Kamień', 'Ruda żelaza']);
    assert.deepEqual(
      shown.goods.map((one) => [one.have, one.gold, one.least]),
      RESOURCES.map((id) => [{ wood: 1000, stone: 40, 'iron-ore': 9 }[id], spirit.gold[id], spiritLeast(id, content)]),
    );
    // A camp of the Osada with nothing built needs every level of every building, the Kwatery too.
    const open = content.buildings;
    const needs = campNeeds(open, {}, [], content);
    assert.deepEqual(Object.fromEntries(shown.goods.map((one) => [one.id, one.need])), needs);
    // With everything at its highest level the camp needs nothing more.
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (const building of [...open, content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, building.id, building.maxLevel).run();
    }
    const full = await character();
    assert.ok(full.camp.cornerstone.ready);
    assert.deepEqual(full.camp.cornerstone.spirit.goods.map((one) => one.need), [0, 0, 0]);
  });

  test('he pays for the pieces chosen, rounded down, and nothing else changes', async () => {
    const before = await (await db()).prepare('SELECT settlement FROM characters').first();
    const answer = await sell('wood', 250);
    assert.equal(answer.status, 200);
    const paid = spiritGold('wood', 250, content);
    assert.deepEqual(answer.data.sold, { resource: 'wood', amount: 250, gold: paid });
    assert.equal(answer.data.character.gold, 100 + paid);
    assert.deepEqual(answer.data.character.resources, { wood: 750, stone: 40, 'iron-ore': 9 });
    assert.equal(good(answer.data.character, 'wood').have, 750);
    // 33 pieces of wood are worth less than 2 gold: 1.
    const small = await sell('wood', 33);
    assert.deepEqual(small.data.sold, { resource: 'wood', amount: 33, gold: spiritGold('wood', 33, content) });
    assert.equal(small.data.character.gold, 100 + paid + spiritGold('wood', 33, content));
    // No relation or reputation in the Osada: he lives in none of its places.
    const after = await (await db()).prepare('SELECT settlement FROM characters').first();
    assert.equal(after.settlement, before.settlement);
  });

  test('he takes only whole pieces the character has, of a camp resource, enough for a coin', async () => {
    const refused = async (resource, amount) => {
      const answer = await sell(resource, amount);
      return [answer.status, answer.data.error?.code];
    };
    assert.deepEqual(await refused('wood', 1001), [409, 'not_enough']);
    assert.deepEqual(await refused('iron-ore', 10), [409, 'not_enough']);
    assert.deepEqual(await refused('wood', 0), [400, 'invalid_amount']);
    assert.deepEqual(await refused('wood', -50), [400, 'invalid_amount']);
    assert.deepEqual(await refused('wood', 2.5), [400, 'invalid_amount']);
    assert.deepEqual(await refused('wood', '50'), [400, 'invalid_amount']);
    assert.deepEqual(await refused('gold', 50), [400, 'invalid_resource']);
    assert.deepEqual(await refused('herbs', 50), [400, 'invalid_resource']);
    assert.deepEqual(await refused('__proto__', 50), [400, 'invalid_resource']);
    assert.deepEqual(await refused(undefined, 50), [400, 'invalid_resource']);
    const least = spiritLeast('wood', content);
    const few = await sell('wood', least - 1);
    assert.deepEqual([few.status, few.data.error.code], [409, 'too_few']);
    assert.match(few.data.error.message, new RegExp(`${least} szt\\.`));
    // Nothing went anywhere.
    const view = await character();
    assert.deepEqual([view.gold, view.resources], [100, { wood: 1000, stone: 40, 'iron-ore': 9 }]);
    assert.equal((await sell('wood', least)).data.sold.gold, 1);
  });

  test('two taps at once sell the pieces once', async () => {
    const taps = await Promise.all([sell('wood', 1000), sell('wood', 1000)]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    const view = await character();
    assert.deepEqual([view.gold, view.resources.wood], [100 + spiritGold('wood', 1000, content), 0]);
  });

  test('he buys while the character explores, as the rest of the camp does', async () => {
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(started.status, 201);
    const answer = await sell('stone', 40);
    assert.equal(answer.status, 200);
    assert.equal(answer.data.character.resources.stone, 0);
    assert.ok(answer.data.character.activity);
  });

  test('without the Osada there is no stone and no spirit to sell to', async () => {
    await set('level = 19');
    const answer = await sell('wood', 500);
    assert.deepEqual([answer.status, answer.data.error.code, answer.data.error.message], [403, 'locked', spirit.texts.locked]);
    assert.equal((await character()).resources.wood, 1000);
    // "Testuj Osadę" opens it below its level, the stone and the spirit with it.
    await set(`settlement = json_set(COALESCE(settlement, '{}'), '$.test', json('true'))`);
    assert.equal((await sell('wood', 500)).status, 200);
  });
});
