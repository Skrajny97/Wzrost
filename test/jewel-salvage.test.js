// Jewellery taken apart on the Stół rozbiórki (the author's of 4.11.2026:
// „Niech wisiory amulety pierscienie itd. dają też z rozbiórki bardziej
// rzeczy do Jubilerstwa niż do Rzemieślnictwa”): a third of the parts, at
// least one, as many pieces of its setting's ore as it would have given
// parts, and from the second rarity on a gem a rarity below its own; the
// minerals at once, the parts when the table is done.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { salvageYield } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const ringBase = content.bases.find((base) => base.slot === 'ring');
const amuletBase = content.bases.find((base) => base.slot === 'amulet');
const jewel = (base, rarity, level, upgrade = 0) => ({ base: base.id, slot: base.slot, rarity, level, upgrade, affixes: [] });

describe('jewellery taken apart, in the engine', () => {
  test('more for Jubilerstwo than for the Warsztat: ore by the parts it would give, a gem a rarity below, a third of the parts', () => {
    // A common ring of level 5 would give 2 parts: now 1, and 2 silver ore, no gem below the commonest.
    assert.deepEqual(salvageYield(jewel(ringBase, 'common', 5), content), { partId: 'scraps', count: 1, minerals: { 'silver-ore': 2 } });
    // A rare ring of level 30 (5 parts): 1 part, 5 silver ore and a quartz.
    assert.deepEqual(salvageYield(jewel(ringBase, 'rare', 30), content), { partId: 'straps', count: 1, minerals: { 'silver-ore': 5, quartz: 1 } });
    // An epic amulet of level 40 at +2 (8 parts): 2 shards, 8 gold ore and an amethyst.
    const epic = salvageYield(jewel(amuletBase, 'epic', 40, 2), content);
    assert.deepEqual(epic, { partId: 'shards', count: 2, minerals: { 'gold-ore': 8, amethyst: 1 } });
    for (const yielded of [epic, salvageYield(jewel(amuletBase, 'divine', 150, 10), content)]) {
      const minerals = Object.values(yielded.minerals).reduce((sum, count) => sum + count, 0);
      assert.ok(minerals > yielded.count, 'more minerals than parts');
    }
    // Other items as before.
    const sword = content.bases.find((base) => base.slot === 'weapon');
    assert.deepEqual(salvageYield({ base: sword.id, slot: 'weapon', rarity: 'epic', level: 40, upgrade: 2, affixes: [] }, content), { partId: 'shards', count: 8 });
  });
});

describe('jewellery taken apart, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('jubiler'));
    await call('POST', '/api/character', { cookie, body: { name: 'Jubiler', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    await database.prepare(`UPDATE characters SET level = 40, xp = 0, minerals = '{"silver-ore":1}'`).run();
    await database
      .prepare(
        "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 10, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level",
      )
      .run();
  });

  const addItem = async (item) =>
    (await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(item)).run()).meta.last_row_id;
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT minerals FROM characters').first()).minerals);

  test('one jewel: the card says what it gives, the gem and the ore come at once and the parts with the table', async () => {
    const ring = await addItem(jewel(ringBase, 'rare', 30));
    const card = (await character()).bag.find((item) => item.id === ring).salvage;
    assert.deepEqual([card.part, card.parts], ['Rzemienie', 1]);
    assert.deepEqual(
      card.minerals.map((one) => [one.id, one.count]),
      [
        ['silver-ore', 5],
        ['quartz', 1],
      ],
    );
    const { status, data } = await call('POST', `/api/items/${ring}/salvage`, { cookie });
    assert.equal(status, 200, JSON.stringify(data));
    assert.deepEqual(
      data.salvage.minerals.map((one) => [one.name, one.count]),
      [
        ['Srebrny kruszec', 5],
        ['Kwarc', 1],
      ],
    );
    assert.deepEqual(await stored(), { 'silver-ore': 6, quartz: 1 });
    assert.equal(data.salvage.parts, 1);
  });

  test('several at once: the minerals of every jewel add up, and a sword gives only its parts', async () => {
    const ring = await addItem(jewel(ringBase, 'common', 5));
    const amulet = await addItem(jewel(amuletBase, 'rare', 30));
    const sword = content.bases.find((base) => base.slot === 'weapon');
    const blade = await addItem({ base: sword.id, slot: 'weapon', rarity: 'common', level: 20, affixes: [], damage: { min: 6, max: 10 } });
    const { status, data } = await call('POST', '/api/items/salvage', { cookie, body: { ids: [ring, amulet, blade] } });
    assert.equal(status, 200, JSON.stringify(data));
    assert.deepEqual(Object.fromEntries(data.salvaged.minerals.map((one) => [one.id, one.count])), { 'silver-ore': 7, quartz: 1 });
    assert.deepEqual(await stored(), { 'silver-ore': 8, quartz: 1 });
    // Without jewellery nothing changes in the minerals.
    const another = await addItem({ base: sword.id, slot: 'weapon', rarity: 'common', level: 20, affixes: [], damage: { min: 6, max: 10 } });
    const plain = await call('POST', `/api/items/${another}/salvage`, { cookie });
    assert.equal(plain.status, 200, JSON.stringify(plain.data));
    assert.equal(plain.data.salvage.minerals, undefined);
    assert.deepEqual(await stored(), { 'silver-ore': 8, quartz: 1 });
  });
});
