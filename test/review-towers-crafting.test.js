// The code review of the Wieże, the Portale, the Warownia and the crafting
// professions (towers.js, portals.js, fortress.js, brewing.js,
// jewelcraft.js, mining.js, crafting.js, inventory.js). Each test fails on
// the code as it was reviewed.
//
// A race is shown with a SQLite trigger where it can be: the trigger makes
// the other request's change at the moment the handler has read the
// character and not yet written it (while it settles the Punkty Czasu at
// its start, characters.js settleTimePoints), as the other request,
// committed in between, would.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem } from '../src/engine/index.js';
import { makeClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { call, db, signUp } = useServer();

// A change made by "another request" between the handler's read and its
// write: `body` runs as the next request settles the character's Punkty
// Czasu (every request settles them first, after it has read the row).
async function betweenReadAndWrite(database, characterId, body) {
  await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();
  // Points due, so the next request settles them; then the trigger.
  await database.prepare('UPDATE characters SET time_points_at = 0 WHERE id = ?').bind(characterId).run();
  await database.prepare(`CREATE TRIGGER meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${characterId} BEGIN ${body} END`).run();
}

describe('the code review: the Wieże', () => {
  let cookie;
  let id;
  let userId;

  beforeEach(async () => {
    ({ cookie } = await signUp('wspinacz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wspinacz', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    ({ id, user_id: userId } = await database.prepare('SELECT id, user_id FROM characters').first());
    // A level-200 warrior with gear in every slot: it wins the low floors.
    await makeClimber(database, id);
  });

  // towers.js enterTower: when the win's item does not fit, the scrapper
  // buys the weakest item of the bag, and its gem goes back to the minerals
  // (fallenGems, addTo('minerals')). The item's price is counted in SQL from
  // the items still there (soldGold), but the gem is added whatever happened
  // to the item meanwhile. Putting it into the Skrzynia Konta (chest.js
  // putInChest) does not move the character's version, so the batch's
  // sameVersion lets it through: the gem stays in the item in the chest and
  // comes to the minerals as well.
  test('the gem of an item put into the Skrzynia Konta while the scrapper of a tower win sells it is not given twice', async () => {
    const database = await db();
    // A dagger (no warrior wears one, so the scrapper takes it first) with a
    // ruby set in it, the only item in the bag.
    const dagger = { ...generateItem({ baseId: 'dagger', level: 60, rarityId: 'common' }, createRng('dagger'), content), gem: 'ruby' };
    const daggerId = (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(dagger)).run()).meta.last_row_id;
    // Herbs in every other place of the bag: the chest's item of floor 10 does not fit.
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    const stack = content.professionRules.stack;
    await database
      .prepare('UPDATE characters SET herbs = ?, minerals = ? WHERE id = ?')
      .bind(JSON.stringify({ [content.herbs[0].id]: stack * (view.bagCapacity - view.bagUsed) }), '{}', id)
      .run();

    let won = null;
    for (let attempt = 0; attempt < 5 && !won; attempt++) {
      // Floor 10 next, whose first win brings the chest's item.
      await database.prepare('UPDATE characters SET towers = ? WHERE id = ?').bind(JSON.stringify({ best: { solo: 9 } }), id).run();
      await database.prepare('DELETE FROM chest_items').run();
      await database.prepare('INSERT OR IGNORE INTO items (id, character_id, slot, data, created_at) VALUES (?, ?, NULL, ?, 0)').bind(daggerId, id, JSON.stringify(dagger)).run();
      // "Włóż do Skrzyni Konta" of the dagger, as putInChest does it.
      await betweenReadAndWrite(
        database,
        id,
        `INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at) SELECT ${userId}, character_id, id, data, created_at, 1 FROM items WHERE id = ${daggerId} AND slot IS NULL;
         DELETE FROM items WHERE id = ${daggerId} AND slot IS NULL;`,
      );
      const entered = await call('POST', '/api/towers/enter', { cookie, body: { tower: 'solo' } });
      assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
      if (entered.data.report.tower.won) won = entered.data.report;
    }
    assert.ok(won, 'floor 10 is won');
    const inChest = (await database.prepare('SELECT data FROM chest_items').all()).results.map((row) => JSON.parse(row.data));
    assert.equal(inChest.length, 1, 'the dagger is in the Skrzynia Konta');
    assert.equal(inChest[0].gem, 'ruby', 'with its ruby still in it');
    const minerals = JSON.parse((await database.prepare('SELECT minerals FROM characters WHERE id = ?').bind(id).first()).minerals);
    assert.equal(minerals.ruby ?? 0, 0, `one ruby became two: it is in the dagger in the chest and ${minerals.ruby} in the minerals (report: ${won.system.join(' ')})`);
  });

  // towers.js enterTower: the item of a win goes on at once into a slot
  // that was empty when the character was read (autoEquip), and is inserted
  // with that slot. "Załóż" (inventory.js equipItem) did not move the
  // character's version, so an item put on in that slot meanwhile passed the
  // batch's sameVersion, and the insert broke items_one_per_slot: the whole
  // entry ended in HTTP 500. "Załóż" moves the version now (here as the
  // trigger does it), and the entry asks for a retry, which goes through.
  test('an item put on at the moment a tower win puts its own item into that slot does not end the entry in a server error', async () => {
    const database = await db();
    const ready = async () => {
      // Nothing worn (the climber still wins floor 10): its gear is in the bag.
      await database.prepare('UPDATE items SET slot = NULL WHERE character_id = ?').bind(id).run();
      await database.prepare('DELETE FROM items WHERE character_id = ? AND id > 9').bind(id).run();
      await database.prepare('UPDATE characters SET towers = ? WHERE id = ?').bind(JSON.stringify({ best: { solo: 9 } }), id).run();
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      await ready();
      // "Załóż" of every item of the bag, each into its own slot, as equipItem does it.
      await betweenReadAndWrite(
        database,
        id,
        `UPDATE items SET slot = json_extract(data, '$.slot') WHERE character_id = ${id} AND slot IS NULL;
         UPDATE characters SET version = version + 1 WHERE id = ${id};`,
      );
      const entered = await call('POST', '/api/towers/enter', { cookie, body: { tower: 'solo' } });
      assert.notEqual(entered.status, 500, `the entry ended in a server error: ${JSON.stringify(entered.data)}`);
      assert.equal(entered.status, 409, JSON.stringify(entered.data).slice(0, 300));
      assert.equal(entered.data.error.code, 'character_changed');
    }
    // The retry, with nothing put on meanwhile, goes through.
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();
    await ready();
    const retried = await call('POST', '/api/towers/enter', { cookie, body: { tower: 'solo' } });
    assert.equal(retried.status, 200, JSON.stringify(retried.data).slice(0, 300));
  });
});

describe("the code review: the bag's moves", () => {
  // Every change of what the character holds moves its version, so a
  // request that read the bag and the worn items before (a tower's win, an
  // exploration's report, sameVersion in atomic.js) asks for a retry
  // instead of selling, wearing or giving back what is no longer there.
  // "Załóż", "Zdejmij", the Skrzynia Konta's "Włóż" and "Wyjmij" and
  // "Wyrzuć" of an item without a gem did not move it.
  test('putting on, taking off, the Skrzynia Konta and throwing away move the character\'s version', async () => {
    const { cookie } = await signUp('nosiciel');
    await call('POST', '/api/character', { cookie, body: { name: 'Nosiciel', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare('UPDATE characters SET level = 20, class_level = 20 WHERE id = ?').bind(id).run();
    const insert = async (seed) =>
      (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(generateItem({ baseId: 'sword', level: 5, rarityId: 'common' }, createRng(seed), content))).run()).meta.last_row_id;
    const sword = await insert('nosiciel-1');
    const other = await insert('nosiciel-2');
    const version = async () => (await database.prepare('SELECT version FROM characters WHERE id = ?').bind(id).first()).version;
    const moved = [];
    const step = async (name, action) => {
      const before = await version();
      const answer = await action();
      assert.equal(answer.status, 200, `${name}: ${JSON.stringify(answer.data).slice(0, 200)}`);
      if ((await version()) === before) moved.push(name);
    };
    await step('Załóż', () => call('POST', `/api/items/${sword}/equip`, { cookie }));
    await step('Zdejmij', () => call('POST', `/api/items/${sword}/unequip`, { cookie }));
    await step('Włóż do Skrzyni Konta', () => call('POST', '/api/chest/put', { cookie, body: { itemId: sword } }));
    const [boxed] = (await call('GET', '/api/chest', { cookie })).data.chest.items;
    await step('Wyjmij ze Skrzyni Konta', () => call('POST', '/api/chest/take', { cookie, body: { id: boxed.id } }));
    await step('Wyrzuć', () => call('POST', `/api/items/${other}/discard`, { cookie }));
    assert.deepEqual(moved, [], `these left the version as it was: ${moved.join(', ')}`);
  });
});

describe('the code review: the Stół rozbiórki', () => {
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('rzemieslnik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rzemieslnik', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const table = content.buildings.find((building) => building.effect.kind === 'craftSpeed');
    await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, 1, 0, 1)').bind(id, table.id).run();
    await database.prepare('UPDATE characters SET materials = ? WHERE id = ?').bind(JSON.stringify({ 'wolf-pelt:common': 3 }), id).run();
  });

  // crafting.js craftMaterials: `keys` are only checked to be strings, and
  // orderMaterials reads materials[key] from a plain object. A key such as
  // "constructor" or "__proto__" finds Object.prototype's member, its count
  // is NaN, and content.partsByRarity[...] (no prototype) is undefined, so
  // the request ends in a TypeError: HTTP 500.
  test('a material key named like a property of every object is refused, not a server error', async () => {
    for (const key of ['constructor', '__proto__', 'toString']) {
      const answer = await call('POST', '/api/craft/materials', { cookie, body: { keys: [key] } });
      assert.notEqual(answer.status, 500, `${key}: ${JSON.stringify(answer.data)}`);
    }
    // A real stack still goes to the table.
    assert.equal((await call('POST', '/api/craft/materials', { cookie, body: { keys: ['wolf-pelt:common'] } })).status, 200);
  });

  // A jewel taken apart teaches its pattern at once (crafting.js
  // salvageItem, taughtPattern), and "Usuń z kolejki" (cancelOrders) gives
  // the jewel back and hides the pattern again (patternsKept). A work of the
  // Szlifiernia started with the pattern in between (jewelcraft.js
  // startJewelcraft, knowsJewelPattern) is left going, and its claim makes
  // the jewels without asking for the pattern. So a pattern is used without
  // the item that teaches it being given up, as often as the player likes:
  // take it apart, start the order, take it off the queue.
  test('a pattern used in the Szlifiernia is not hidden again while the jewel that taught it comes back to the bag', async () => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    // Level 30: Jubilerstwo is open, at its 1st level, which shows the first
    // ring's pattern only. The Sygnet (pattern level 10) is in the bag.
    const signet = generateItem({ baseId: 'signet-ring', level: 20, rarityId: 'common' }, createRng('signet'), content);
    await database.prepare('UPDATE characters SET level = 30, minerals = ? WHERE id = ?').bind(JSON.stringify({ quartz: 1, 'silver-ore': 2 }), id).run();
    const ringId = (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(signet)).run()).meta.last_row_id;
    const order = { baseId: 'signet-ring', rarity: 'common', count: 1 };
    assert.equal((await call('POST', '/api/professions/jewel', { cookie, body: order })).data.error?.code, 'unknown_pattern', 'the Sygnet is not known yet');

    // Taken apart: the pattern is known.
    const salvaged = await call('POST', `/api/items/${ringId}/salvage`, { cookie });
    assert.equal(salvaged.status, 200, JSON.stringify(salvaged.data));
    assert.ok(salvaged.data.salvage.pattern, 'the Sygnet taught its pattern');
    // A Sygnet ordered in the Szlifiernia with it.
    const started = await call('POST', '/api/professions/jewel', { cookie, body: order });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    // "Usuń z kolejki" of the Sygnet taken apart.
    const queued = JSON.parse((await database.prepare('SELECT crafting FROM characters WHERE id = ?').bind(id).first()).crafting);
    const cancelled = await call('POST', '/api/craft/cancel', { cookie, body: { id: queued[0].id } });

    const row = await database.prepare('SELECT patterns FROM characters WHERE id = ?').bind(id).first();
    const known = JSON.parse(row.patterns ?? '[]').includes('signet-ring');
    const back = (await database.prepare('SELECT data FROM items WHERE character_id = ?').bind(id).all()).results.some((item) => JSON.parse(item.data).base === 'signet-ring');
    // The order's end: its claim.
    await database.prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ? WHERE character_id = ?').bind(Date.now() - 1, id).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const made = (await database.prepare('SELECT data FROM items WHERE character_id = ?').bind(id).all()).results.filter((item) => JSON.parse(item.data).base === 'signet-ring').length - Number(back);
    assert.ok(
      !(back && !known && made > 0),
      `the cancel answered ${cancelled.status}: the Sygnet that taught the pattern is back in the bag, the pattern hidden again, and the Szlifiernia made ${made} Sygnet(s) with it`,
    );
  });
});
