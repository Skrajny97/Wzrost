// A Drużyna member's meal with Autouzupełnianie (gracz (poz. 95),
// 24.11.2026: „może dodadzą jeszcze posiłki ze spiżarni z zaznaczeniem
// autouzupełniania do wyczerpania zapasów”): beside its own potions (0.4.84)
// a member, not the leader, chooses a dish of its Spiżarnia and
// „Autouzupełnianie”; as the leader sends the party out, a member whose meal
// has run out eats one portion of it from its own Spiżarnia, till there is
// none, as eating by hand would: a meal at work goes on, another dish's is
// never replaced (src/engine/cooking.js: mealRefill; src/server/parties.js:
// memberMeal, PUT /api/party/meal). The choice stays for the next trips.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { mealRefill } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the dish of a member\'s Autouzupełnianie (engine)', () => {
  const pantry = { zurek: 2, 'pea-soup': 0 };
  const auto = { dish: 'zurek', auto: true };

  test('one portion of the dish chosen once the meal has run out, while the Spiżarnia has one', () => {
    assert.equal(mealRefill(auto, null, pantry, content), 'zurek');
    assert.equal(mealRefill({ dish: 'pea-soup', auto: true }, null, pantry, content), null);
    assert.equal(mealRefill({ dish: 'pea-soup', auto: true }, null, {}, content), null);
  });

  test('a meal at work goes on: of the same dish, or of another, which is never replaced', () => {
    assert.equal(mealRefill(auto, { dish: 'zurek', left: 10, portions: 1 }, pantry, content), null);
    assert.equal(mealRefill(auto, { dish: 'pea-soup', left: 200, portions: 2 }, pantry, content), null);
  });

  test('nothing without the box ticked, without a choice, or for a dish the game has not', () => {
    assert.equal(mealRefill({ dish: 'zurek', auto: false }, null, pantry, content), null);
    assert.equal(mealRefill(null, null, pantry, content), null);
    assert.equal(mealRefill({ dish: 'no-such-dish', auto: true }, null, { 'no-such-dish': 3 }, content), null);
  });
});

describe('a member\'s meal for the party\'s trips (API)', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await sql(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0 WHERE name = ?`, name)).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const pantry = async (name) => JSON.parse((await row(name)).pantry ?? '{}');
  const meal = async (name) => JSON.parse((await row(name)).meal ?? 'null');
  const trip = async (name) => JSON.parse((await (await sql("SELECT a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ? AND a.kind = 'hunt'", name)).first()).options);
  // The party's trip of 30 minutes, set out, then over and claimed.
  const setOut = async () => {
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh']);
  };
  const back = async () => {
    await (await sql('UPDATE activities SET started_at = started_at - 1800000, ends_at = ends_at - 1800000')).run();
    assert.equal((await as('lider', 'POST', '/api/hunts/claim')).status, 200);
  };

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await (await sql(`UPDATE characters SET pantry = '{"zurek":2,"pea-soup":1}'`)).run();
  });

  test('a member whose meal ran out eats one portion of its dish as the party sets out, till its Spiżarnia has none; the choice stays', async () => {
    const chosen = await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
    assert.deepEqual(chosen.data.meal, { dish: 'zurek', auto: true, name: 'Żurek' });
    assert.equal((await as('lider', 'GET', '/api/party')).data.meal, null);

    await setOut();
    // One portion from its own Spiżarnia, its meal fresh, on the trip.
    assert.deepEqual(await pantry('Druh'), { zurek: 1, 'pea-soup': 1 });
    assert.deepEqual(await meal('Druh'), { dish: 'zurek', left: content.cooking.meal.minutes - 30, portions: 1 });
    const kept = await trip('Druh');
    assert.equal(kept.meal.dish, 'zurek');
    assert.deepEqual(kept.mealBack, { before: null, eaten: 'zurek', count: 1 });
    // The leader eats nothing of it.
    assert.deepEqual(await pantry('Lider'), { zurek: 2, 'pea-soup': 1 });
    assert.equal(await meal('Lider'), null);
    // Its report tells the meal.
    await back();
    const report = (await as('druh', 'POST', '/api/hunts/claim')).data.report;
    assert.ok(report.system.some((line) => line.startsWith('Posiłek (Żurek)')), JSON.stringify(report.system));

    // The meal still works: the next trip eats nothing more.
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 1, 'pea-soup': 1 });
    await back();
    // Run out: the next eats the last portion, and with none left, nothing.
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 0, 'pea-soup': 1 });
    assert.equal((await meal('Druh')).dish, 'zurek');
    await back();
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    await setOut();
    assert.equal(await meal('Druh'), null);
    assert.equal((await trip('Druh')).meal, undefined);
    // The choice stays, its dish shown with none left.
    const view = (await as('druh', 'GET', '/api/party')).data;
    assert.deepEqual(view.meal, { dish: 'zurek', auto: true, name: 'Żurek' });
  });

  test("another dish's meal at work is never replaced, and without the box nothing is eaten", async () => {
    assert.equal((await as('druh', 'POST', '/api/pantry/eat', { id: 'pea-soup', count: 1 })).status, 200);
    const before = await meal('Druh');
    assert.equal(before.dish, 'pea-soup');
    assert.equal((await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true })).status, 200);
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 0 });
    assert.equal((await meal('Druh')).dish, 'pea-soup');
    await back();
    // Without the box: the dish is kept, nothing eaten.
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    const off = await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: false });
    assert.deepEqual(off.data.meal, { dish: 'zurek', auto: false, name: 'Żurek' });
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 0 });
    assert.equal(await meal('Druh'), null);
  });

  test('a leader eats by its own "Opcje wyprawy" only: a choice kept from its days as a member waits', async () => {
    await (await sql(`UPDATE characters SET party_meal = '{"dish":"zurek","auto":true}' WHERE name = 'Lider'`)).run();
    await setOut();
    assert.deepEqual(await pantry('Lider'), { zurek: 2, 'pea-soup': 1 });
    assert.equal(await meal('Lider'), null);
  });

  test('the choice checked: a dish of the game, the box a yes or no, and the box only with a dish', async () => {
    const wrong = async (body, code) => {
      const answer = await as('druh', 'PUT', '/api/party/meal', body);
      assert.equal(answer.status, 400, JSON.stringify(answer.data));
      assert.equal(answer.data.error.code, code);
    };
    await wrong({ dish: 'no-such-dish', auto: true }, 'unknown_dish');
    await wrong({ dish: 7, auto: true }, 'unknown_dish');
    await wrong({ dish: 'zurek', auto: 'yes' }, 'invalid_auto');
    await wrong({ dish: null, auto: true }, 'no_dish_chosen');
    assert.equal((await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true })).status, 200);
    // Nothing chosen: none kept.
    const none = await as('druh', 'PUT', '/api/party/meal', { dish: null, auto: false });
    assert.equal(none.data.meal, null);
    assert.equal((await row('Druh')).party_meal, null);
  });
});
