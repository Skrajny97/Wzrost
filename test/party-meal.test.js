// A Drużyna member's meal with Autouzupełnianie (gracz (poz. 95),
// 24.11.2026: „może dodadzą jeszcze posiłki ze spiżarni z zaznaczeniem
// autouzupełniania do wyczerpania zapasów”): beside its own potions (0.4.84)
// a member, not the leader, chooses a dish of its Spiżarnia, how many
// portions of it at once (×1 to ×3, ×3 as it comes; the author, 24.11.2026:
// „Automatyczne jedzenie w drużynie i w ogóle trzeba ustawić tak mogło jeść
// 3 te same posiłki na raz nie tylko jeden”) and „Autouzupełnianie”; as the
// leader sends the party out, a member whose meal has run out eats those
// portions of it from its own Spiżarnia, or as many as are left, till there
// is none, as eating by hand would: a meal at work goes on, another dish's
// is never replaced and the same dish's gets no portions on top
// (src/engine/cooking.js: mealRefill; src/server/parties.js: memberMeal,
// PUT /api/party/meal). The choice stays for the next trips.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { mealRefill, portionsWanted } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the dish of a member\'s Autouzupełnianie (engine)', () => {
  const pantry = { zurek: 2, 'pea-soup': 0, 'baked-turnip': 7 };
  const auto = { dish: 'zurek', auto: true };

  test('the portions chosen of the dish once the meal has run out, 3 for a choice without them, as many as the Spiżarnia has', () => {
    assert.equal(content.cooking.meal.portions, 3);
    assert.deepEqual(mealRefill({ dish: 'baked-turnip', auto: true }, null, pantry, content), { dish: 'baked-turnip', portions: 3 });
    assert.deepEqual(mealRefill({ dish: 'baked-turnip', auto: true, portions: 2 }, null, pantry, content), { dish: 'baked-turnip', portions: 2 });
    assert.deepEqual(mealRefill({ ...auto, portions: 1 }, null, pantry, content), { dish: 'zurek', portions: 1 });
    // Fewer in the Spiżarnia: as many as there are.
    assert.deepEqual(mealRefill(auto, null, pantry, content), { dish: 'zurek', portions: 2 });
    assert.deepEqual(mealRefill({ ...auto, portions: 3 }, null, { zurek: 1 }, content), { dish: 'zurek', portions: 1 });
    assert.equal(mealRefill({ dish: 'pea-soup', auto: true }, null, pantry, content), null);
    assert.equal(mealRefill({ dish: 'pea-soup', auto: true }, null, {}, content), null);
  });

  test('the portions a choice eats: one to the most, the most where it says none', () => {
    assert.deepEqual([1, 2, 3].map((portions) => portionsWanted(portions, content)), [1, 2, 3]);
    assert.deepEqual([undefined, null, '2', 1.5].map((portions) => portionsWanted(portions, content)), [3, 3, 3, 3]);
    assert.deepEqual([0, -2, 4, 99].map((portions) => portionsWanted(portions, content)), [1, 1, 3, 3]);
  });

  test('a meal at work goes on: of the same dish, with no portions on top, or of another, which is never replaced', () => {
    assert.equal(mealRefill(auto, { dish: 'zurek', left: 10, portions: 1 }, pantry, content), null);
    assert.equal(mealRefill({ dish: 'baked-turnip', auto: true }, { dish: 'baked-turnip', left: 10, portions: 1 }, pantry, content), null);
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

  test('a member whose meal ran out eats 3 portions of its dish at once as the party sets out, then what is left, till its Spiżarnia has none; the choice stays', async () => {
    await (await sql(`UPDATE characters SET pantry = '{"zurek":5,"pea-soup":1}' WHERE name = 'Druh'`)).run();
    const chosen = await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
    // No portions said: the most at once.
    assert.deepEqual(chosen.data.meal, { dish: 'zurek', auto: true, portions: 3, name: 'Żurek' });
    assert.equal(chosen.data.mealMost, content.cooking.meal.portions);
    assert.equal((await as('lider', 'GET', '/api/party')).data.meal, null);

    await setOut();
    // Three portions at once from its own Spiżarnia, its meal fresh, on the trip.
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 1 });
    assert.deepEqual(await meal('Druh'), { dish: 'zurek', left: content.cooking.meal.minutes - 30, portions: 3 });
    const kept = await trip('Druh');
    assert.deepEqual([kept.meal.dish, kept.meal.portions], ['zurek', 3]);
    assert.deepEqual(kept.mealBack, { before: null, eaten: 'zurek', count: 3 });
    // The leader eats nothing of it.
    assert.deepEqual(await pantry('Lider'), { zurek: 2, 'pea-soup': 1 });
    assert.equal(await meal('Lider'), null);
    // Its report tells the meal.
    await back();
    const report = (await as('druh', 'POST', '/api/hunts/claim')).data.report;
    assert.ok(report.system.some((line) => line.startsWith('Posiłek (Żurek ×3)')), JSON.stringify(report.system));

    // The meal still works: the next trip eats nothing more.
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 1 });
    await back();
    // Run out: the next eats the two left at once, and with none left, nothing.
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 0, 'pea-soup': 1 });
    assert.deepEqual(await meal('Druh'), { dish: 'zurek', left: content.cooking.meal.minutes - 30, portions: 2 });
    assert.deepEqual((await trip('Druh')).mealBack, { before: null, eaten: 'zurek', count: 2 });
    await back();
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    await setOut();
    assert.equal(await meal('Druh'), null);
    assert.equal((await trip('Druh')).meal, undefined);
    // The choice stays, its dish shown with none left.
    const view = (await as('druh', 'GET', '/api/party')).data;
    assert.deepEqual(view.meal, { dish: 'zurek', auto: true, portions: 3, name: 'Żurek' });
  });

  test('the portions chosen: ×1 eats one at a time, ×2 two, and a choice kept before without portions eats 3', async () => {
    await (await sql(`UPDATE characters SET pantry = '{"zurek":6}' WHERE name = 'Druh'`)).run();
    const one = await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true, portions: 1 });
    assert.deepEqual(one.data.meal, { dish: 'zurek', auto: true, portions: 1, name: 'Żurek' });
    assert.equal((await row('Druh')).party_meal, '{"dish":"zurek","auto":true,"portions":1}');
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 5 });
    assert.deepEqual(await meal('Druh'), { dish: 'zurek', left: content.cooking.meal.minutes - 30, portions: 1 });
    await back();
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    assert.equal((await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true, portions: 2 })).data.meal.portions, 2);
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 3 });
    assert.equal((await meal('Druh')).portions, 2);
    await back();
    // A choice kept before 24.11.2026, with no portions: the most at once.
    await (await sql(`UPDATE characters SET meal = NULL, party_meal = '{"dish":"zurek","auto":true}' WHERE name = 'Druh'`)).run();
    assert.deepEqual((await as('druh', 'GET', '/api/party')).data.meal, { dish: 'zurek', auto: true, portions: 3, name: 'Żurek' });
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 0 });
    assert.equal((await meal('Druh')).portions, 3);
  });

  test("a meal at work is never replaced nor topped up, and without the box nothing is eaten", async () => {
    assert.equal((await as('druh', 'POST', '/api/pantry/eat', { id: 'pea-soup', count: 1 })).status, 200);
    const before = await meal('Druh');
    assert.equal(before.dish, 'pea-soup');
    assert.equal((await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true })).status, 200);
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 0 });
    assert.equal((await meal('Druh')).dish, 'pea-soup');
    await back();
    // The same dish's meal of one portion gets none on top while it works.
    await (await sql(`UPDATE characters SET meal = '{"dish":"zurek","left":200,"portions":1}' WHERE name = 'Druh'`)).run();
    await setOut();
    assert.deepEqual(await pantry('Druh'), { zurek: 2, 'pea-soup': 0 });
    assert.deepEqual(await meal('Druh'), { dish: 'zurek', left: 170, portions: 1 });
    await back();
    // Without the box: the dish is kept, nothing eaten.
    await (await sql("UPDATE characters SET meal = NULL WHERE name = 'Druh'")).run();
    const off = await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: false });
    assert.deepEqual(off.data.meal, { dish: 'zurek', auto: false, portions: 3, name: 'Żurek' });
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

  test('the choice checked: a dish of the game, the box a yes or no, the box only with a dish, and 1 to 3 portions', async () => {
    const wrong = async (body, code) => {
      const answer = await as('druh', 'PUT', '/api/party/meal', body);
      assert.equal(answer.status, 400, JSON.stringify(answer.data));
      assert.equal(answer.data.error.code, code);
      return answer.data.error.message;
    };
    await wrong({ dish: 'no-such-dish', auto: true }, 'unknown_dish');
    await wrong({ dish: 7, auto: true }, 'unknown_dish');
    await wrong({ dish: 'zurek', auto: 'yes' }, 'invalid_auto');
    await wrong({ dish: null, auto: true }, 'no_dish_chosen');
    for (const portions of [0, 4, 1.5, '2']) assert.equal(await wrong({ dish: 'zurek', auto: true, portions }, 'invalid_portions'), 'Wybierz od 1 do 3 porcji.');
    assert.equal((await row('Druh')).party_meal, null);
    assert.equal((await as('druh', 'PUT', '/api/party/meal', { dish: 'zurek', auto: true })).status, 200);
    // Nothing chosen: none kept.
    const none = await as('druh', 'PUT', '/api/party/meal', { dish: null, auto: false });
    assert.equal(none.data.meal, null);
    assert.equal((await row('Druh')).party_meal, null);
  });
});
