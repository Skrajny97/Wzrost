// The dice of the Osada's boards (24.11.2026; a player's idea, „możliwość
// rollowania tablicy zleceń / poszukiwani”, and the author: „potrzeba
// jeszcze przelosowania tablicy poszukiwanych oraz zleceń (zamiast
// odrzucania i czekania 12 godzin)”): an order of the Tablica zleceń and an
// open poster of the Poszukiwani drawn anew at once, by the rules that hang
// them, never the same again; free, orders.reroll.perDay and
// wanted.reroll.perDay times a day each, anew at midnight, Polish time
// (src/engine/settlement.js: rerollOrder; src/engine/wanted.js:
// rerollPoster; src/server/settlement.js and src/server/wanted.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaUnlocked, drawOrder, orderRerolls, questPeriod, rerollOrder, rerollPoster, settleBoard, swappedPosters, wantedPlaces, wantedPosters, wantedRerolls } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { orders } = content.settlement;
const rules = content.settlement.wanted;
const good = (order) => `${order.kind}:${order.key}`;
// The target of a poster, as no poster of a day may repeat it.
const target = (poster) => (poster.kind === 'outlaw' ? poster.monsterId : `${poster.areaId}:${poster.monsterId}`);
// Noon in Poland, and the day's midnight there.
const NOON = Date.UTC(2026, 10, 24, 11);
const MIDNIGHT = questPeriod('daily', NOON, content).endsAt;

describe('the dice in the engine', () => {
  const character = { ...newCharacter('warrior', { level: 40, classLevel: 30 }), met: ['wolf', 'boar', 'lynx'], patterns: [], settlement: {} };
  const owner = { character, reputation: {}, seed: 'kostka:settlement' };

  test('an order drawn anew never asks for the good it replaces while the character can be asked for another, a finer one of quality neither', () => {
    // Without the order to avoid, the draw is the board's as ever.
    assert.deepEqual(drawOrder({ ...owner, seed: 's:1', avoid: null }, content), drawOrder({ ...owner, seed: 's:1' }, content));
    const trusted = Object.fromEntries(content.settlement.brotherhoods.map((one) => [one.id, content.settlement.standings.at(-1).points]));
    for (let seed = 0; seed < 300; seed += 1) {
      const old = drawOrder({ ...owner, reputation: trusted, seed: `stare:${seed}` }, content);
      const fresh = drawOrder({ ...owner, reputation: trusted, seed: `nowe:${seed}`, avoid: old }, content);
      assert.notEqual(good(fresh), good(old), `seed ${seed}`);
    }
  });

  test('a slot\'s order drawn anew at once: a new id, a new term, the rest of the board as it was; not the week\'s nor one gone', () => {
    const board = settleBoard(null, owner, NOON, content);
    const [first, second] = board.slots;
    const next = rerollOrder(board, first.order.id, owner, NOON, content);
    assert.equal(next.turn, board.turn + 1);
    assert.equal(next.slots[0].order.id, board.turn + 1);
    assert.notEqual(good(next.slots[0].order), good(first.order));
    assert.equal(next.slots[0].order.expiresAt, NOON + orders.expireDays * 86400000);
    assert.deepEqual(next.slots.slice(1), board.slots.slice(1));
    assert.deepEqual(next.weekly, board.weekly);
    // Drawn as the slot's next order is, at the board's next turn.
    const { id: _id, expiresAt: _term, ...drawn } = next.slots[0].order;
    assert.deepEqual(drawn, drawOrder({ ...owner, seed: `${owner.seed}:order:${board.turn + 1}`, avoid: first.order }, content));
    assert.deepEqual(next.rerolls, { day: questPeriod('daily', NOON, content).key, count: 1 });
    assert.equal(rerollOrder(board, 'weekly', owner, NOON, content), null);
    assert.equal(rerollOrder(next, first.order.id, owner, NOON, content), null);
    assert.equal(rerollOrder(board, 9999, owner, NOON, content), null);
    // A slot waiting for its order has nothing to draw anew.
    const empty = { ...board, slots: [{ readyAt: NOON + 3600000 }, second, board.slots[2]] };
    assert.equal(rerollOrder(empty, first.order.id, owner, NOON, content), null);
  });

  test('the orders\' dice: perDay a day, anew at midnight in Poland, none on a record of a later day', () => {
    let board = settleBoard(null, owner, NOON, content);
    assert.deepEqual(orderRerolls(board, NOON, content), { daily: orders.reroll.perDay, left: orders.reroll.perDay, day: questPeriod('daily', NOON, content).key, used: 0 });
    for (let count = 0; count < orders.reroll.perDay; count += 1) board = rerollOrder(board, board.slots[count % board.slots.length].order.id, owner, NOON, content);
    assert.equal(orderRerolls(board, MIDNIGHT - 1, content).left, 0);
    assert.equal(rerollOrder(board, board.slots[0].order.id, owner, MIDNIGHT - 1, content), null);
    // After midnight, Polish time, all of them again.
    assert.equal(orderRerolls(board, MIDNIGHT, content).left, orders.reroll.perDay);
    const tomorrow = rerollOrder(board, board.slots[0].order.id, owner, MIDNIGHT + 60000, content);
    assert.deepEqual(tomorrow.rerolls, { day: questPeriod('daily', MIDNIGHT, content).key, count: 1 });
    // A request begun before midnight and done after one of the new day
    // finds none: the limit never opens again by going back a day.
    assert.equal(orderRerolls(tomorrow, MIDNIGHT - 1, content).left, 0);
  });

  test('a poster drawn anew: of the day\'s places, for a target the day has not had; a creature\'s for an outlaw once each place has its own, an outlaw\'s for another', () => {
    const day = '2026-11-24';
    const basis = { classLevel: 47, day, seed: 'postać' };
    const posters = wantedPosters(47, day, 'postać', content);
    const places = wantedPlaces(content.areas.filter((area) => areaUnlocked(area, 47, content)), content).places.map((area) => area.id);
    const creature = posters.find((poster) => poster.kind === 'creature');
    const outlaw = posters.find((poster) => poster.kind === 'outlaw');
    // Every place of the day has its creature's poster (places is creatures).
    assert.equal(rules.places, rules.creatures);
    const forCreature = rerollPoster(basis, creature, posters, 1, content);
    assert.equal(forCreature.kind, 'outlaw');
    const forOutlaw = rerollPoster(basis, outlaw, posters, 1, content);
    assert.equal(forOutlaw.kind, 'outlaw');
    assert.deepEqual(rerollPoster(basis, outlaw, posters, 1, content), forOutlaw);
    for (const fresh of [forCreature, forOutlaw]) {
      assert.ok(places.includes(fresh.areaId));
      assert.ok(!posters.some((poster) => target(poster) === target(fresh)));
      assert.ok(fresh.id.startsWith(`${day}:`));
      assert.equal(fresh.level, content.areasById[fresh.areaId].maxLevel + content.balance.hunt.eliteLevelBonus);
      // The bounty of its place, as the day's posters there pay.
      assert.equal(fresh.gold, posters.find((poster) => poster.areaId === fresh.areaId).gold);
    }
    // One place more than creatures: a creature's poster brings the other
    // place's creature.
    const wider = { ...content, settlement: { ...content.settlement, wanted: { ...rules, places: rules.creatures + 1 } } };
    const many = wantedPosters(47, day, 'postać', wider);
    const another = rerollPoster(basis, many.find((poster) => poster.kind === 'creature'), many, 1, wider);
    assert.equal(another.kind, 'creature');
    assert.ok(!many.some((poster) => target(poster) === target(another)));
    // Every outlaw and creature of the day's places seen: nothing left.
    const all = [...posters, ...rules.outlaws.map((id) => ({ kind: 'outlaw', areaId: places[0], monsterId: id }))];
    assert.equal(rerollPoster(basis, outlaw, all, 1, content), null);
  });

  test('the day\'s posters with those drawn anew in their places, drawn anew again too; perDay a day', () => {
    const posters = wantedPosters(47, '2026-11-24', 'postać', content);
    const basis = { classLevel: 47, day: '2026-11-24', seed: 'postać' };
    const first = rerollPoster(basis, posters[1], posters, 1, content);
    const second = rerollPoster(basis, first, [...posters, first], 2, content);
    const rerolled = { [posters[1].id]: first, [first.id]: second };
    assert.deepEqual(swappedPosters(posters, rerolled), [posters[0], second, posters[2], posters[3]]);
    assert.deepEqual(swappedPosters(posters, undefined), posters);
    assert.deepEqual(wantedRerolls(rerolled, content), { daily: rules.reroll.perDay, left: rules.reroll.perDay - 2 });
    assert.deepEqual(wantedRerolls(undefined, content), { daily: rules.reroll.perDay, left: rules.reroll.perDay });
  });
});

describe('the dice through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', TEST_CLOCK: 'on' });
  let cookie;
  let clock = NOON;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const as = (method, path, body) => call(method, path, { cookie, body, now: clock });
  const view = async () => (await as('GET', '/api/settlement')).data.settlement;
  const rerollOrderCall = (orderId) => as('POST', '/api/settlement/reroll', { orderId });
  const rerollPosterCall = (posterId) => as('POST', '/api/settlement/wanted/reroll', { posterId });

  beforeEach(async () => {
    clock = NOON;
    ({ cookie } = await signUp('kosciarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kościarz', classId: 'warrior', appearance: 'male' }, now: clock });
    await set(`level = 80, class_level = 30, tutorial = NULL, met = '["wolf"]'`);
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(NOON + 60 * 86400000).run();
  });

  test('an order drawn anew at once, for free, up to the day\'s limit, again after midnight; never the week\'s, and two taps draw once', async () => {
    const before = await view();
    assert.deepEqual(before.board.reroll, { daily: orders.reroll.perDay, left: orders.reroll.perDay });
    const old = before.board.slots[1].order;
    const gold = (await (await db()).prepare('SELECT gold FROM characters').first()).gold;
    const rerolled = await rerollOrderCall(old.id);
    assert.equal(rerolled.status, 200, JSON.stringify(rerolled.data).slice(0, 300));
    const fresh = rerolled.data.settlement.board.slots[1].order;
    assert.notEqual(fresh.id, old.id);
    assert.notEqual(`${fresh.kind}:${fresh.key}`, `${old.kind}:${old.key}`);
    assert.deepEqual(rerolled.data.settlement.board.slots[0], before.board.slots[0]);
    assert.deepEqual(rerolled.data.settlement.board.reroll, { daily: orders.reroll.perDay, left: orders.reroll.perDay - 1 });
    assert.equal(rerolled.data.character.gold, gold);
    // Kept: the same board at the next look.
    assert.deepEqual((await view()).board.slots, rerolled.data.settlement.board.slots);
    // The order drawn away is gone, the week's cannot be drawn anew.
    assert.equal((await rerollOrderCall(old.id)).data.error.code, 'no_order');
    assert.equal((await rerollOrderCall('weekly')).data.error.code, 'no_order');
    // Two taps at once: one draw.
    const order = (await view()).board.slots[0].order;
    const both = await Promise.all([rerollOrderCall(order.id), rerollOrderCall(order.id)]);
    assert.deepEqual(both.map((answer) => answer.status === 200).sort(), [false, true]);
    assert.equal((await view()).board.reroll.left, orders.reroll.perDay - 2);
    for (let left = orders.reroll.perDay - 2; left > 0; left -= 1) assert.equal((await rerollOrderCall((await view()).board.slots[2].order.id)).status, 200);
    const spent = await view();
    assert.equal(spent.board.reroll.left, 0);
    const refused = await rerollOrderCall(spent.board.slots[2].order.id);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'reroll_limit');
    // A minute before midnight in Poland, none yet; a minute after, all again.
    clock = MIDNIGHT - 60000;
    assert.equal((await view()).board.reroll.left, 0);
    clock = MIDNIGHT + 60000;
    const tomorrow = await view();
    assert.equal(tomorrow.board.reroll.left, orders.reroll.perDay);
    assert.equal((await rerollOrderCall(tomorrow.board.slots[2].order.id)).status, 200);
    // The posters' dice are their own.
    assert.equal(tomorrow.wanted.reroll.left, rules.reroll.perDay);
  });

  test('an open poster drawn anew at once for a target the day has not had; not one in hand nor one done; the day\'s limit, again after midnight', async () => {
    const before = (await view()).wanted;
    assert.deepEqual(before.reroll, { daily: rules.reroll.perDay, left: rules.reroll.perDay });
    const [first, second, third] = before.posters;
    const rerolled = await rerollPosterCall(first.id);
    assert.equal(rerolled.status, 200, JSON.stringify(rerolled.data).slice(0, 300));
    const after = rerolled.data.settlement.wanted;
    const fresh = after.posters[0];
    assert.equal(fresh.state, 'open');
    assert.ok(!before.posters.some((poster) => poster.id === fresh.id || target(poster) === target(fresh)));
    assert.deepEqual(after.posters.slice(1), before.posters.slice(1));
    assert.deepEqual(after.reroll, { daily: rules.reroll.perDay, left: rules.reroll.perDay - 1 });
    // The orders' dice are their own.
    assert.equal(rerolled.data.settlement.board.reroll.left, orders.reroll.perDay);
    // The poster drawn away is gone; the new one is taken as any other.
    assert.equal((await rerollPosterCall(first.id)).data.error.code, 'no_poster');
    assert.equal((await as('POST', '/api/settlement/wanted', { posterId: first.id })).data.error.code, 'no_poster');
    assert.equal((await as('POST', '/api/settlement/wanted', { posterId: fresh.id })).status, 200);
    // In hand: not drawn anew; another open one is.
    const held = await rerollPosterCall(fresh.id);
    assert.equal(held.status, 409);
    assert.equal(held.data.error.code, 'held');
    assert.equal(held.data.error.message, rules.texts.rerollHeld);
    // Done: not drawn anew either.
    const stored = JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
    await set('settlement = ?', JSON.stringify({ ...stored, wanted: { ...stored.wanted, done: [second.id] } }));
    assert.equal((await rerollPosterCall(second.id)).data.error.code, 'done');
    // Two taps at once: one draw.
    const both = await Promise.all([rerollPosterCall(third.id), rerollPosterCall(third.id)]);
    assert.deepEqual(both.map((answer) => answer.status === 200).sort(), [false, true]);
    const now = (await view()).wanted;
    assert.equal(now.reroll.left, rules.reroll.perDay - 2);
    // Every poster the day has had stays apart from the new ones.
    const kept = JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement).wanted;
    assert.deepEqual(Object.keys(kept.rerolled), [first.id, third.id]);
    assert.equal(new Set([...before.posters, ...now.posters].map(target)).size, before.posters.length + 2);
    // The last of the day's, then none.
    const open = now.posters.find((poster) => poster.state === 'open');
    assert.equal((await rerollPosterCall(open.id)).status, 200);
    const spent = (await view()).wanted;
    assert.equal(spent.reroll.left, 0);
    const refused = await rerollPosterCall(spent.posters.find((poster) => poster.state === 'open').id);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'reroll_limit');
    // After midnight in Poland: the new day's posters, and all the rerolls again.
    clock = MIDNIGHT - 60000;
    assert.equal((await view()).wanted.reroll.left, 0);
    clock = MIDNIGHT + 60000;
    const tomorrow = (await view()).wanted;
    assert.equal(tomorrow.reroll.left, rules.reroll.perDay);
    const next = tomorrow.posters.find((poster) => poster.state === 'open');
    assert.equal((await rerollPosterCall(next.id)).status, 200);
  });
});
