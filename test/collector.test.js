// The Zbieracz Systemu (DECISIONS.md, „Zbieracz Systemu”): a spirit by the
// Skrzynia Konta, bought once for good for gold; from then on the game
// collects the camp's stores as it goes (753 A): all they made, whenever it
// loads the player's character, at most about once a minute for a store,
// so production never stands.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const { price } = content.camp.collector;
// Level 1 stores fill in two hours: the Tartak's with 12 wood, the Staw
// Midasa's with 16 gold.
const SAWMILL = { perHour: 6, capacity: 12 };
const LAKE = { perHour: 8, capacity: 16 };

describe('Zbieracz Systemu', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const newPlayer = async (login, name) => {
    const { cookie: own } = await signUp(login);
    await call('POST', '/api/character', { cookie: own, body: { name, classId: 'warrior', appearance: 'female' } });
    return own;
  };

  beforeEach(async () => {
    cookie = await newPlayer('zbieraczka', 'Zbieraczka');
  });

  const run = async (sql, ...values) => (await db()).prepare(sql).bind(...values).run();
  const character = async (own = cookie) => (await call('GET', '/api/character', { cookie: own })).data.character;
  const buy = (own = cookie) => call('POST', '/api/camp/collector', { cookie: own });
  const store = (view, id = 'sawmill') => view.camp.buildings.find((building) => building.id === id).production;
  // A building of `name`'s at `level`, standing, its store filling for
  // `hours` hours by now.
  const stand = (id, level, hours, name = 'Zbieraczka') =>
    run(
      "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at) SELECT id, ?, ?, 0, 1, ? FROM characters WHERE name = ?",
      id,
      level,
      Date.now() - hours * HOUR,
      name,
    );
  const row = (name = 'Zbieraczka') => db().then((database) => database.prepare('SELECT gold, resources, collector_at FROM characters WHERE name = ?').bind(name).first());
  // The Zbieracz bought `hours` ago, before the stores' times moved back:
  // a store that stood full before he came would give only one fill.
  const boughtAgo = async (hours) => {
    await run('UPDATE characters SET gold = ? WHERE name = ?', price, 'Zbieraczka');
    assert.equal((await buy()).status, 200);
    await run('UPDATE characters SET collector_at = ? WHERE name = ?', Date.now() - hours * HOUR, 'Zbieraczka');
  };

  test('is bought once for its price in gold, by the Skrzynia Konta', async () => {
    const before = await character();
    assert.deepEqual(before.camp.collector, {
      art: 'collector-spirit',
      name: 'Zbieracz Systemu',
      price: 10000,
      everySeconds: content.camp.collector.everySeconds,
      owned: false,
      texts: { offer: content.camp.collector.texts.offer, bought: content.camp.collector.texts.bought, hint: content.camp.collector.texts.hint },
    });
    await run('UPDATE characters SET gold = ?', price - 1);
    const short = await buy();
    assert.deepEqual([short.status, short.data.error.code, short.data.error.message], [409, 'no_gold', 'Brakuje złota na Zbieracza Systemu.']);
    assert.equal((await row()).collector_at, null);

    await run('UPDATE characters SET gold = ?', price + 250);
    const paid = await buy();
    assert.equal(paid.status, 200);
    assert.equal(paid.data.character.gold, 250);
    assert.equal(paid.data.character.camp.collector.owned, true);
    const saved = await row();
    assert.equal(saved.gold, 250);
    assert.ok(saved.collector_at > Date.now() - 60000 && saved.collector_at <= Date.now());

    // Once only: a second purchase is refused and costs nothing.
    await run('UPDATE characters SET gold = ?', 2 * price);
    const again = await buy();
    assert.deepEqual([again.status, again.data.error.code, again.data.error.message], [409, 'owned', 'Masz już Zbieracza Systemu.']);
    assert.equal((await row()).gold, 2 * price);
  });

  test('two taps at once buy him once', async () => {
    await run('UPDATE characters SET gold = ?', 3 * price);
    const taps = await Promise.all([buy(), buy()]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await row()).gold, 2 * price);
  });

  test('collects all the stores made, whole fills and the rest, and each piece once', async () => {
    await boughtAgo(6);
    const start = await character();
    assert.equal(start.camp.collector.everySeconds, content.camp.collector.everySeconds);
    // Five hours of the Tartak and four and a half of the Staw Midasa: two
    // whole fills each and the part of the third made so far.
    await stand('sawmill', 1, 5);
    await stand('midas-lake', 1, 4.5);
    const view = await character();
    assert.equal(view.resources.wood, start.resources.wood + 2 * SAWMILL.capacity + SAWMILL.perHour);
    assert.equal(view.gold, start.gold + 2 * LAKE.capacity + LAKE.perHour / 2);
    // The stores are empty and fill on from `since`, which the page counts on.
    assert.deepEqual([store(view).amount, store(view, 'midas-lake').amount], [0, 0]);
    const database = await db();
    const sawmill = await database.prepare("SELECT collected_at FROM buildings WHERE building_id = 'sawmill'").first();
    assert.equal(store(view).since, sawmill.collected_at);
    // Asked again, nothing more: each piece comes once.
    const again = await character();
    assert.deepEqual([again.resources.wood, again.gold], [view.resources.wood, view.gold]);
  });

  test('a store started filling less than a minute ago waits, though a unit is made', async () => {
    await boughtAgo(6);
    const start = await character();
    // Level 20 of the Staw Midasa makes a unit of gold in seconds.
    await run(
      "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at) SELECT id, 'midas-lake', 20, 0, 1, ? FROM characters WHERE name = 'Zbieraczka'",
      Date.now() - 30000,
    );
    const view = await character();
    assert.equal(view.gold, start.gold);
    assert.ok(store(view, 'midas-lake').amount >= 1);
    await run("UPDATE buildings SET collected_at = ? WHERE building_id = 'midas-lake'", Date.now() - 2 * 60000);
    const later = await character();
    assert.ok(later.gold > start.gold);
    assert.equal(store(later, 'midas-lake').amount, 0);
  });

  test('without him a full store stands, and nothing is collected', async () => {
    const start = await character();
    await stand('sawmill', 1, 5);
    const view = await character();
    assert.equal(view.camp.collector.owned, false);
    assert.equal(view.resources.wood, start.resources.wood);
    assert.equal(store(view).amount, SAWMILL.capacity);
    const collected = await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } });
    assert.deepEqual(collected.data.collected, { resource: 'wood', amount: SAWMILL.capacity });
  });

  test('a store full before he came gives one fill as he comes: the time it stood brings nothing', async () => {
    await stand('sawmill', 1, 10);
    const start = await character();
    assert.equal(store(start).amount, SAWMILL.capacity);
    await run('UPDATE characters SET gold = ?', price);
    const paid = await buy();
    assert.equal(paid.data.character.resources.wood, start.resources.wood + SAWMILL.capacity);
    assert.equal(store(paid.data.character).amount, 0);
    assert.equal((await character()).resources.wood, start.resources.wood + SAWMILL.capacity);
  });

  test('collects while the request goes on: an action counted on the version after it still saves', async () => {
    await boughtAgo(6);
    await run('UPDATE characters SET gold = 1000');
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'campfire', 1, 0, 1 FROM characters");
    const start = await character();
    await stand('sawmill', 1, 4.2);
    // The fire spirit's trade saves only with the character as read: the
    // collection before it moved the version on. 4.2 hours: 25 wood.
    const traded = await call('POST', '/api/camp/trade', { cookie, body: { resource: 'wood', amount: 2 } });
    assert.equal(traded.status, 200);
    assert.equal(traded.data.character.resources.wood, start.resources.wood + 2 * SAWMILL.capacity + 1 + 2);
  });

  test('requests at once collect each piece once', async () => {
    await boughtAgo(8);
    const start = await character();
    await stand('sawmill', 1, 7);
    const made = 7 * SAWMILL.perHour;
    const views = await Promise.all([character(), character(), character()]);
    assert.deepEqual(views.map((view) => view.resources.wood), Array(3).fill(start.resources.wood + made));
    assert.equal((await character()).resources.wood, start.resources.wood + made);
  });

  test('a build from the queue that starts while the player is away takes the fills made by then along', async () => {
    await boughtAgo(24);
    const start = await character();
    // The Tartak filling for 5 hours, and its level 2 queued to start an
    // hour ago: by then 4 hours, two whole fills, and nothing of a third.
    await stand('sawmill', 1, 5);
    const now = Date.now();
    const cost = { gold: 1 };
    await run('UPDATE characters SET build_queue = ?', JSON.stringify([{ buildingId: 'sawmill', level: 2, startsAt: now - HOUR, endsAt: now + HOUR, cost }]));
    const view = await character();
    assert.equal(view.resources.wood, start.resources.wood + 2 * SAWMILL.capacity);
    assert.equal(store(view).paused, true);
    assert.equal(view.camp.construction.buildingId, 'sawmill');
  });

  test("only the player's own requests collect: another player's look at the character does not", async () => {
    await boughtAgo(6);
    const start = await row();
    await stand('sawmill', 1, 5);
    const other = await newPlayer('ciekawski', 'Ciekawski');
    assert.equal((await call('GET', '/api/profile/Zbieraczka', { cookie: other })).status, 200);
    assert.equal((await row()).resources, start.resources);
    const wood = (resources) => JSON.parse(resources).wood ?? 0;
    assert.equal((await character()).resources.wood, wood(start.resources) + 5 * SAWMILL.perHour);
  });
});
