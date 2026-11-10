// A gem set in an item falls out and goes back to the character's minerals
// when the item is lost (the author's 757 B, 10.11.2026: „kamień wypada i
// wraca do Twoich minerałów”): sold to the scrapper by hand, thrown away,
// taken apart on the Stół rozbiórki (alone or with "Rozbierz kilka", where
// jewellery keeps its own gem and ore on top, and an order taken off the
// queue gives the item back with its gem), broken on the Kowadło (the
// character's and a companion's), and sold when the bag overflows after an
// exploration. In the batch that takes the item, and the answer says so.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, rollUpgrade, salvageMinerals, salvageYield } from '../src/engine/index.js';
import { toHex } from '../src/server/encoding.js';
import { readFeatures } from '../src/server/features.js';
import { upgradeItem } from '../src/server/inventory.js';
import { upgradeCompanionItem } from '../src/server/settlement.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const sword = (extra = {}) => ({ base: 'sword', slot: 'weapon', level: 20, rarity: 'common', affixes: [], damage: { min: 10, max: 14 }, ...extra });
const ring = (extra = {}) => ({ base: 'ring', slot: 'ring', level: 20, rarity: 'rare', affixes: [], implicit: { stat: 'dexterity', value: 6 }, ...extra });

// The roll's 16 random bytes, made the ones given for a while (as in
// fortress.test.js), and bytes whose roll breaks an item of +7.
async function withRoll(bytes, run) {
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    value: (array) => {
      array.set(bytes.subarray(0, array.length));
      return array;
    },
    configurable: true,
    writable: true,
  });
  try {
    return await run();
  } finally {
    delete globalThis.crypto.getRandomValues;
  }
}
function breakingBytes() {
  for (let seed = 0; ; seed++) {
    const bytes = new Uint8Array(16).map((_, index) => (seed * 31 + index * 17 + (seed >> 3)) % 256);
    if (rollUpgrade({ upgrade: 7 }, createRng(toHex(bytes)), content).result === 'broken') return bytes;
  }
}

describe('the minerals of an item taken apart, in the engine', () => {
  test('the gem set in it comes on top of what jewellery gives', () => {
    assert.equal(salvageMinerals(sword(), content), null);
    assert.deepEqual(salvageMinerals(sword({ gem: 'emerald' }), content), { emerald: 1 });
    const own = salvageYield(ring(), content).minerals;
    assert.ok(Object.keys(own).length > 0);
    const withGem = salvageMinerals(ring({ gem: 'emerald' }), content);
    assert.deepEqual(withGem, { ...own, emerald: (own.emerald ?? 0) + 1 });
    // A gem the data no longer knows is not given.
    assert.equal(salvageMinerals(sword({ gem: 'nothing' }), content), null);
  });
});

describe('a gem falls out of an item lost, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  let id;

  const row = async () => (await db()).prepare('SELECT * FROM characters WHERE id = ?').bind(id).first();
  const minerals = async () => JSON.parse((await row()).minerals);
  async function inBag(item, slot = null) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const build = (buildingId, level) =>
    db().then((database) => database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run());
  const request = (path, body) => new Request(`http://localhost${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  beforeEach(async () => {
    ({ cookie } = await signUp('jubilerka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Jubilerka', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database
      .prepare("UPDATE characters SET level = 30, class_level = 30, gold = 1000000, minerals = '{\"emerald\":2}', resources = json_set(resources, ?, 10000), materials = ? WHERE id = ?")
      .bind('$."iron-ore"', JSON.stringify({ 'wolf-pelt:common': 1000 }), id)
      .run();
    // The handlers called here directly run with the Osada on.
    readFeatures({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  });

  test('sold to the scrapper by hand, its gem goes back; by the handful such an item stays, as before', async () => {
    const item = await inBag(sword({ gem: 'emerald' }));
    const handful = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'divine' } });
    assert.equal(handful.data.sold.count, 0);
    const sold = await call('POST', `/api/items/${item}/sell`, { cookie });
    assert.equal(sold.status, 200, JSON.stringify(sold.data));
    assert.deepEqual(sold.data.sold.gem, { id: 'emerald', name: content.mineralsById.emerald.name });
    assert.deepEqual(await minerals(), { emerald: 3 });
    // Sold twice at once: the second finds no item and gives no gem.
    const again = await call('POST', `/api/items/${item}/sell`, { cookie });
    assert.equal(again.status, 404);
    assert.deepEqual(await minerals(), { emerald: 3 });
  });

  test('thrown away, its gem goes back too', async () => {
    const item = await inBag(sword({ gem: 'emerald' }));
    const thrown = await call('POST', `/api/items/${item}/discard`, { cookie });
    assert.equal(thrown.status, 200, JSON.stringify(thrown.data));
    assert.deepEqual(thrown.data.discarded.gem, { id: 'emerald', name: content.mineralsById.emerald.name });
    assert.deepEqual(await minerals(), { emerald: 3 });
    assert.equal((await call('POST', `/api/items/${await inBag(sword())}/discard`, { cookie })).data.discarded, undefined);
  });

  test('taken apart, its gem goes back at once; an order taken off the queue gives the item back with it', async () => {
    await build('craft-table', 10);
    const item = await inBag(sword({ gem: 'emerald' }));
    const taken = await call('POST', `/api/items/${item}/salvage`, { cookie });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(taken.data.salvage.gems, [{ id: 'emerald', name: content.mineralsById.emerald.name }]);
    assert.equal(taken.data.salvage.minerals, undefined);
    assert.deepEqual(await minerals(), { emerald: 3 });
    const [order] = taken.data.character.crafting.queue;
    const cancelled = await call('POST', '/api/craft/cancel', { cookie, body: { id: order.id } });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.deepEqual(await minerals(), { emerald: 2 });
    const [back] = cancelled.data.character.bag;
    assert.equal(back.gem.id, 'emerald');
  });

  test('"Rozbierz kilka": each item gives its gem back, jewellery its own gem and ore on top', async () => {
    await build('craft-table', 10);
    const own = salvageYield(ring(), content).minerals;
    const ids = [await inBag(sword({ gem: 'emerald' })), await inBag(ring({ gem: 'emerald' })), await inBag(sword())];
    const taken = await call('POST', '/api/items/salvage', { cookie, body: { ids } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.deepEqual(
      taken.data.salvaged.gems.map((gem) => gem.id),
      ['emerald', 'emerald'],
    );
    const expected = { ...own, emerald: (own.emerald ?? 0) + 2 + 2 };
    assert.deepEqual(await minerals(), expected);
    // The jewellery's own minerals are named for the page as before.
    assert.deepEqual(Object.fromEntries(taken.data.salvaged.minerals.map((one) => [one.id, one.count])), own);
  });

  test("broken on the Kowadło, the gem goes back with the try's payment", async () => {
    await build('anvil', 10);
    const item = await inBag(sword({ upgrade: 7, gem: 'emerald' }));
    const bytes = breakingBytes();
    const database = await db();
    const broken = await withRoll(bytes, () => upgradeItem({ request: request(`/api/items/${item}/upgrade`, {}), env: { DB: database }, now: Date.now(), params: { id: String(item) } }));
    const answer = await broken.json();
    assert.equal(answer.upgrade.result, 'broken');
    assert.deepEqual(answer.upgrade.gem, { id: 'emerald', name: content.mineralsById.emerald.name });
    assert.deepEqual(await minerals(), { emerald: 3 });
    assert.equal(await (await db()).prepare('SELECT id FROM items WHERE id = ?').bind(item).first(), null);
  });

  test("a companion's item broken on the Kowadło gives its gem back to the character", async () => {
    await build('anvil', 10);
    await build('quarters', 2);
    const [candidate] = (await call('GET', '/api/settlement', { cookie })).data.settlement.companions.candidates;
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } })).status, 200);
    const database = await db();
    const osada = JSON.parse((await row()).settlement);
    const [companion] = osada.companions;
    osada.companions = [{ ...companion, gear: companion.gear.map((item) => (item.slot === 'weapon' ? { ...item, upgrade: 7, gem: 'emerald' } : item)) }];
    await database.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(osada), id).run();
    const bytes = breakingBytes();
    const broken = await withRoll(bytes, () =>
      upgradeCompanionItem({ request: request('/api/settlement/companion-upgrade', { companionId: companion.id, slot: 'weapon' }), env: { DB: database }, now: Date.now(), params: {} }),
    );
    const answer = await broken.json();
    assert.equal(answer.upgrade.result, 'broken', JSON.stringify(answer));
    assert.deepEqual(answer.upgrade.gem, { id: 'emerald', name: content.mineralsById.emerald.name });
    assert.deepEqual(await minerals(), { emerald: 3 });
  });

  test('sold when the bag overflows after an exploration, a gem goes back and the report says so', async () => {
    const database = await db();
    const rng = createRng('gems');
    // A staff a warrior cannot use, with a gem: the first the scrapper
    // takes from a bag of 31 items for its 30 places.
    const staff = await inBag({ ...generateItem({ baseId: 'staff', level: 3, rarityId: 'common' }, rng, content), gem: 'emerald' });
    for (let i = 0; i < 30; i++) await inBag(generateItem({ baseId: 'helmet', level: 3, rarityId: 'common' }, rng, content));
    await database.prepare('UPDATE characters SET level = 1, class_level = 1 WHERE id = ?').bind(id).run();
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 15 } })).status, 201);
    await database.prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed'").bind(Date.now() - 1).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(await database.prepare('SELECT id FROM items WHERE id = ?').bind(staff).first(), null);
    assert.deepEqual(await minerals(), { emerald: 3 });
    assert.ok(claimed.data.report.system.includes(`Kamień ${content.mineralsById.emerald.name} wypadł i wrócił do zapasu.`), JSON.stringify(claimed.data.report.system));
  });
});
