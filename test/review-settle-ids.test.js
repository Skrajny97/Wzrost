// The code review of what every request settles, the characters' lifecycle
// and the items' ids (12.11.2026). Each test fails on the code as reviewed.
//
// The items table has `id INTEGER PRIMARY KEY` without AUTOINCREMENT: once
// the newest item row is gone, the next item inserted gets its id again. A
// handler that read an item and then writes by its id alone, without
// checking that the character is as read (sameVersion in atomic.js), acts
// on whatever item has that id by then.
//
// A race is shown with a SQLite trigger, as in review-towers-crafting.test.js:
// the trigger makes the other requests' changes at the moment the handler
// has read the character and not yet written it (while it settles the
// Punkty Czasu at its start, characters.js settleTimePoints), as requests
// committed in between would. Here those are "Włóż do Skrzyni Konta" of the
// item (chest.js putInChest: the item's row goes) and "Wyjmij" of another
// item (takeFromChest: a new row, which gets the id of the newest row gone).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, equipBlock, generateItem, sellPrice, upgradeView } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// The professions on, for the Szlifiernia's settings.
const { server, call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });

// Requests that start together, as a script sends them (review-accounts.test.js):
// each sent straight to the worker with its body held back, and all the
// bodies let go at once, so the handlers, which start once the whole body
// has come (bodyCome in index.js), run side by side. `requests`: { path,
// body, delay }, the body let go `delay` ms after the others' (a tap a
// moment later).
async function together(cookie, requests) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const answers = requests.map(({ path, body = {}, delay = 0 }) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const stream = new ReadableStream(
      {
        async pull(controller) {
          await gate;
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return server
      .getWorker()
      .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: stream, duplex: 'half' })
      .then(async (response) => ({ status: response.status, data: await response.json() }));
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  return Promise.all(answers);
}

// A change made by "other requests" between the handler's read and its
// write: `body` runs as the next request settles the character's Punkty
// Czasu (every request settles them first, after it has read the row).
async function betweenReadAndWrite(database, characterId, body) {
  await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();
  await database.prepare('UPDATE characters SET time_points_at = 0 WHERE id = ?').bind(characterId).run();
  await database.prepare(`CREATE TRIGGER meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${characterId} BEGIN ${body} END`).run();
}

const quoted = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;

// "Włóż do Skrzyni Konta" of item `itemId` and "Wyjmij" of another item
// (`other`, its data) as chest.js does them, each moving the version: the
// item taken out is a new row, the newest, so it gets the id of the item
// put in when that one was the newest.
const putAndTake = ({ userId, characterId, itemId, other }) =>
  `INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at) SELECT ${userId}, character_id, id, data, created_at, 1 FROM items WHERE id = ${itemId} AND slot IS NULL;
   DELETE FROM items WHERE id = ${itemId} AND slot IS NULL;
   UPDATE characters SET version = version + 1 WHERE id = ${characterId};
   INSERT INTO items (character_id, slot, data, created_at) VALUES (${characterId}, NULL, ${quoted(other)}, 0);
   UPDATE characters SET version = version + 1 WHERE id = ${characterId};`;

const item = (baseId, level, rarityId, seed, extra = {}) => ({ ...generateItem({ baseId, level, rarityId }, createRng(seed), content), ...extra });

describe('the code review: an item id given again', () => {
  let cookie;
  let id;
  let userId;
  let database;

  beforeEach(async () => {
    ({ cookie } = await signUp('handlarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Handlarz', classId: 'warrior', appearance: 'male' } });
    database = await db();
    ({ id, user_id: userId } = await database.prepare('SELECT id, user_id FROM characters').first());
  });

  const insertItem = async (data) => (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(data)).run()).meta.last_row_id;
  const character = () => database.prepare('SELECT gold, minerals, version FROM characters WHERE id = ?').bind(id).first();
  const chest = async () => (await database.prepare('SELECT data FROM chest_items').all()).results.map((row) => JSON.parse(row.data));

  // inventory.js sellItem: the price and the gem are counted in SQL "from
  // the item still in the bag", by its id (soldGold, gemBack), and the item
  // is deleted by its id, with no check that the character is as read. An
  // item put into the Skrzynia Konta meanwhile, while another one taken out
  // got its id, is paid in full and its gem given back, though it stays in
  // the chest whole: the item taken out is what goes.
  test('"Sprzedaj" pays nothing for an item put into the Skrzynia Konta meanwhile, whose id a new item took', async () => {
    const precious = item('sword', 100, 'legendary', 'precious', { upgrade: 10, gem: 'diamond' });
    const junk = item('sword', 1, 'common', 'junk');
    const preciousId = await insertItem(precious);
    const before = await character();
    await betweenReadAndWrite(database, id, putAndTake({ userId, characterId: id, itemId: preciousId, other: junk }));
    const sold = await call('POST', `/api/items/${preciousId}/sell`, { cookie });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    const after = await character();
    const inChest = await chest();
    assert.equal(inChest.length, 1, 'the sword went into the Skrzynia Konta');
    assert.equal(inChest[0].gem, 'diamond', 'with its diamond');
    const gained = after.gold - before.gold;
    const diamonds = JSON.parse(after.minerals).diamond ?? 0;
    const bag = (await database.prepare('SELECT data FROM items WHERE character_id = ?').bind(id).all()).results.map((row) => JSON.parse(row.data));
    assert.ok(
      gained === 0 && diamonds === 0,
      `the sword is whole in the Skrzynia Konta, yet "Sprzedaj" answered ${sold.status} ${JSON.stringify(sold.data.sold)}: ` +
        `${gained} gold (its price ${sellPrice(precious, content, 0)}) and ${diamonds} diamond(s) came, and the item taken out of the chest ` +
        `${bag.some((one) => one.base === junk.base && one.level === junk.level) ? 'is still in the bag' : 'is gone'}`,
    );
  });

  // The same without any intent: "Sprzedaj" tapped twice while an
  // exploration's report brings an item. The first tap sells the sword, the
  // report's item gets its id, and the second tap, which read the sword
  // before, sells the new item at the sword's price: paid twice, the find
  // gone.
  test('"Sprzedaj" tapped twice pays once, and leaves the item a report brought meanwhile', async () => {
    const sword = item('sword', 100, 'legendary', 'precious', { upgrade: 10 });
    const find = item('axe', 50, 'epic', 'find');
    const price = sellPrice(sword, content, 0);
    const swordId = await insertItem(sword);
    const before = await character();
    // The first tap's sale and the report's item, as sellItem and the claim do them.
    await betweenReadAndWrite(
      database,
      id,
      `UPDATE characters SET gold = gold + ${price}, version = version + 1 WHERE id = ${id};
       DELETE FROM items WHERE id = ${swordId} AND slot IS NULL;
       INSERT INTO items (character_id, slot, data, created_at) VALUES (${id}, NULL, ${quoted(find)}, 0);
       UPDATE characters SET version = version + 1 WHERE id = ${id};`,
    );
    const second = await call('POST', `/api/items/${swordId}/sell`, { cookie });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    const gained = (await character()).gold - before.gold;
    const bag = (await database.prepare('SELECT data FROM items WHERE character_id = ?').bind(id).all()).results.map((row) => JSON.parse(row.data));
    assert.deepEqual(
      { gained, find: bag.some((one) => one.base === 'axe') },
      { gained: price, find: true },
      `the second tap answered ${second.status} ${JSON.stringify(second.data.sold ?? second.data.error)}`,
    );
  });

  // The same with real requests side by side, no trigger: "Sprzedaj" of the
  // sword tapped twice, a moment apart, while an item comes out of the
  // Skrzynia Konta. The first tap sells the sword; the item taken out gets
  // the sword's id; the second tap, which names that id, sells the new item,
  // which the player never chose to sell (it is the newest row, as any
  // item just found or bought is).
  test('a second "Sprzedaj" of a sold item does not sell the item that came meanwhile (real requests)', async () => {
    const sword = item('sword', 100, 'legendary', 'precious', { upgrade: 10 });
    const find = item('axe', 50, 'epic', 'find');
    const outcomes = [];
    for (const delays of [[0, 1, 0], [0, 2, 1], [0, 3, 1], [0, 1, 0], [0, 2, 1], [0, 3, 1]]) {
      await database.prepare('DELETE FROM items').run();
      await database.prepare('DELETE FROM chest_items').run();
      const chestId = (await database.prepare('INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at) VALUES (?, ?, 0, ?, 0, 0)').bind(userId, id, JSON.stringify(find)).run()).meta.last_row_id;
      const swordId = await insertItem(sword);
      const answers = await together(cookie, [
        { path: `/api/items/${swordId}/sell`, delay: delays[0] },
        { path: `/api/items/${swordId}/sell`, delay: delays[1] },
        { path: '/api/chest/take', body: { id: chestId }, delay: delays[2] },
      ]);
      const bag = (await database.prepare('SELECT data FROM items WHERE character_id = ?').bind(id).all()).results.map((row) => JSON.parse(row.data));
      outcomes.push({ taken: answers[2].status, axe: bag.some((one) => one.base === 'axe'), sold: answers.slice(0, 2).map((one) => one.data.sold ?? one.data.error?.code) });
      if (answers[2].status === 200 && !bag.some((one) => one.base === 'axe')) break;
    }
    const lost = outcomes.find((one) => one.taken === 200 && !one.axe);
    assert.equal(lost, undefined, `the axe taken out of the chest was sold by the second tap on the sword: ${JSON.stringify(lost)}`);
  });

  // inventory.js discardItem: the same with "Wyrzuć", whose gem falls out
  // (gemBack): the diamond comes to the minerals and stays in the chest.
  test('"Wyrzuć" gives back no gem of an item put into the Skrzynia Konta meanwhile, whose id a new item took', async () => {
    const precious = item('sword', 100, 'legendary', 'precious', { gem: 'diamond' });
    const junk = item('sword', 1, 'common', 'junk');
    const preciousId = await insertItem(precious);
    await betweenReadAndWrite(database, id, putAndTake({ userId, characterId: id, itemId: preciousId, other: junk }));
    const thrown = await call('POST', `/api/items/${preciousId}/discard`, { cookie });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    const inChest = await chest();
    assert.equal(inChest[0]?.gem, 'diamond', 'the sword is in the Skrzynia Konta with its diamond');
    const diamonds = JSON.parse((await character()).minerals).diamond ?? 0;
    assert.equal(diamonds, 0, `"Wyrzuć" answered ${thrown.status} ${JSON.stringify(thrown.data.discarded ?? null)}: one diamond became two, in the chest and in the minerals`);
  });

  // inventory.js sellItems ("Sprzedaj wszystkie do rzadkości"): the same
  // by the handful, priced by the ids read.
  test('selling by the handful pays nothing for an item put into the Skrzynia Konta meanwhile, whose id a new item took', async () => {
    const precious = item('sword', 100, 'legendary', 'precious');
    const junk = item('sword', 1, 'common', 'junk');
    const preciousId = await insertItem(precious);
    const before = await character();
    await betweenReadAndWrite(database, id, putAndTake({ userId, characterId: id, itemId: preciousId, other: junk }));
    const sold = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'legendary' } });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    assert.equal((await chest()).length, 1, 'the sword went into the Skrzynia Konta');
    const gained = (await character()).gold - before.gold;
    assert.equal(gained, 0, `the sword is whole in the Skrzynia Konta, yet selling answered ${sold.status} ${JSON.stringify(sold.data.sold)} and ${gained} gold came`);
  });

  // inventory.js equipItem: the slot and the rules (equipBlock: the class,
  // the class level, the slot) are those of the item read, and the batch
  // puts whatever item has its id into that slot. A sword of class level
  // 125 taken out of the chest goes on as the level-1 warrior's helmet.
  test('"Załóż" does not put on, in the slot of the item read, a new item that took its id', async () => {
    const helmet = item('helmet', 1, 'common', 'helmet');
    const sword = item('coronation-sword', 125, 'legendary', 'crown');
    assert.equal(equipBlock(sword, 'warrior', 1, content), 'class_level', 'a level-1 warrior may not wear this sword');
    const helmetId = await insertItem(helmet);
    await betweenReadAndWrite(database, id, putAndTake({ userId, characterId: id, itemId: helmetId, other: sword }));
    const equipped = await call('POST', `/api/items/${helmetId}/equip`, { cookie });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    const worn = (await database.prepare('SELECT id, slot, data FROM items WHERE character_id = ? AND slot IS NOT NULL').bind(id).all()).results.map((row) => ({ id: row.id, wornIn: row.slot, ...JSON.parse(row.data) }));
    const wrong = worn.filter((one) => one.wornIn !== one.slot || equipBlock(one, 'warrior', 1, content));
    assert.deepEqual(
      wrong.map(({ id: itemId, base, slot, wornIn }) => ({ id: itemId, base, slot, wornIn })),
      [],
      `"Załóż" answered ${equipped.status}: the helmet is in the Skrzynia Konta, and the level-125 sword that took its id is worn`,
    );
  });

  // inventory.js upgradeItem: the try is priced and rolled for the item
  // read, and the batch changes the item of that id while its upgrade and
  // last roll are as read. An item never upgraded has none, so any new item
  // matches: a legendary sword taken out of the chest gets the try at the
  // price of the common one put in.
  test('"Ulepsz" does not upgrade, at the price of the item read, a new item that took its id', async () => {
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'anvil', 1, 0, 0)").bind(id).run();
    await database.prepare('UPDATE characters SET gold = 1000, resources = ? WHERE id = ?').bind(JSON.stringify({ wood: 0, stone: 0, 'iron-ore': 100 }), id).run();
    const cheap = item('sword', 1, 'common', 'cheap');
    const precious = item('sword', 100, 'legendary', 'precious');
    const cheapCost = upgradeView(cheap, 1, content).next.cost;
    const preciousCost = upgradeView(precious, 1, content).next.cost;
    const cheapId = await insertItem(cheap);
    await betweenReadAndWrite(database, id, putAndTake({ userId, characterId: id, itemId: cheapId, other: precious }));
    const tried = await call('POST', `/api/items/${cheapId}/upgrade`, { cookie });
    await database.prepare('DROP TRIGGER IF EXISTS meanwhile').run();

    const row = await database.prepare('SELECT gold, resources FROM characters WHERE id = ?').bind(id).first();
    const paid = { gold: 1000 - row.gold, 'iron-ore': 100 - JSON.parse(row.resources)['iron-ore'] };
    const taken = JSON.parse((await database.prepare('SELECT data FROM items WHERE id = ?').bind(cheapId).first())?.data ?? '{}');
    assert.equal(taken.rarity === 'legendary' && taken.lastRoll !== undefined, false,
      `"Ulepsz" answered ${tried.status} ${JSON.stringify(tried.data.upgrade ?? tried.data.error)}: the legendary sword taken out of the chest got the try (now +${taken.upgrade ?? 0}) ` +
        `for ${JSON.stringify(paid)}, the common sword's price, not its own ${JSON.stringify(preciousCost)} (common: ${JSON.stringify(cheapCost)})`);
  });
});

describe('the code review: a setting in the Szlifiernia', () => {
  // jewelcraft.js finishJewels: a setting keeps its item's id in the
  // work's options and, once done, sets the gem in the item of that id "as
  // it is now". An item gone meanwhile should get no gem, the gem coming
  // back ("Tego przedmiotu już nie ma. Kamień wrócił do plecaka"). But the
  // next item the character gets may have that id: the gem goes into it,
  // and the gem it had is gone for good.
  test("a setting whose item was sold sets its gem in no other item that took the item's id", async () => {
    const { cookie } = await signUp('jubiler');
    await call('POST', '/api/character', { cookie, body: { name: 'Jubiler', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id, user_id: userId } = await database.prepare('SELECT id, user_id FROM characters').first();
    await database.prepare("UPDATE characters SET level = 25, xp = 0, minerals = '{\"quartz\":1}' WHERE id = ?").bind(id).run();
    // A sword with a diamond waits in the Skrzynia Konta; a plain one is the
    // newest item, in the bag.
    const jewelled = item('sword', 25, 'rare', 'jewelled', { gem: 'diamond' });
    const chestId = (await database.prepare('INSERT INTO chest_items (user_id, character_id, item_id, data, created_at, put_at) VALUES (?, ?, 0, ?, 0, 0)').bind(userId, id, JSON.stringify(jewelled)).run()).meta.last_row_id;
    const plainId = (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item('sword', 25, 'common', 'plain'))).run()).meta.last_row_id;

    const started = await call('POST', '/api/professions/jewel', { cookie, body: { set: true, itemId: plainId, gem: 'quartz' } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    // The plain sword sold to the scrapper, the jewelled one taken out.
    assert.equal((await call('POST', `/api/items/${plainId}/sell`, { cookie })).status, 200);
    assert.equal((await call('POST', '/api/chest/take', { cookie, body: { id: chestId } })).status, 200);
    // The setting done, and claimed.
    await database.prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ?').bind(15 * 60000, 15 * 60000, id).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));

    const bag = (await database.prepare('SELECT id, data FROM items WHERE character_id = ?').bind(id).all()).results.map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
    const taken = bag.find((one) => one.level === 25 && one.rarity === 'rare');
    const minerals = JSON.parse((await database.prepare('SELECT minerals FROM characters WHERE id = ?').bind(id).first()).minerals);
    assert.deepEqual(
      { gem: taken?.gem, quartzBack: minerals.quartz ?? 0 },
      { gem: 'diamond', quartzBack: 1 },
      `the jewelled sword took the sold sword's id ${taken?.id} (${plainId}), and the report says: ${claimed.data.report?.set?.text}`,
    );
  });
});

describe('the code review: a new character', () => {
  // characters.js createCharacter: the batch sets the played character
  // aside first, then makes the new one only while the account has room.
  // Of two creations at once with one place left, the second sets aside
  // the character the first just made and makes none: the account is left
  // with no character to play, and its answer says it has too many.
  test('two creations at once with one place left leave the account a character to play', async () => {
    const { cookie } = await signUp('tworca');
    const max = content.balance.account.characters;
    for (let index = 1; index < max; index++) {
      const made = await call('POST', '/api/character', { cookie, body: { name: `Tworca${'abcdefgh'[index]}`, classId: 'warrior', appearance: 'male' } });
      assert.equal(made.status, 201, JSON.stringify(made.data).slice(0, 200));
    }
    const database = await db();
    // A few tries, as the two requests must both count the characters
    // before either saves; between them the account is as before.
    for (let attempt = 0; attempt < 4; attempt++) {
      const answers = await together(cookie, [
        { path: '/api/character', body: { name: `Pierwsza${'abcd'[attempt]}`, classId: 'mage', appearance: 'female' } },
        { path: '/api/character', body: { name: `Druga${'abcd'[attempt]}`, classId: 'mage', appearance: 'female' } },
      ]);
      const roles = (await database.prepare('SELECT id, name, role FROM characters ORDER BY id').all()).results;
      assert.ok(
        roles.some((row) => row.role === 'player'),
        `answers ${answers.map((one) => `${one.status} ${one.data.error?.code ?? one.data.character?.name}`).join(', ')}; ` +
          `characters: ${roles.map((row) => `${row.name} ${row.role}`).join(', ')}: none is played`,
      );
      await database.prepare('DELETE FROM characters WHERE id = ?').bind(roles.at(-1).id).run();
      await database.prepare("UPDATE characters SET role = 'aside'").run();
      await database.prepare("UPDATE characters SET role = 'player' WHERE id = (SELECT MIN(id) FROM characters)").run();
    }
  });

  // characters.js refuseLookAlike (0.2.73, point 9: a name that looks like
  // another character's is taken): it looks only at the new name's
  // look-alike letters, and returns at once for a name of plain Latin
  // letters. So a Cyrillic "Ѕаѕһа" blocks a later Cyrillic copy of "Sasha",
  // but a Latin "Sasha" made after it goes through: two names that look
  // the same.
  test('a Latin name that looks like a Cyrillic name already taken is taken too', async () => {
    const first = await signUp('pierwszy');
    const second = await signUp('drugi');
    const cyrillic = 'Ѕаѕһа';
    const made = await call('POST', '/api/character', { cookie: first.cookie, body: { name: cyrillic, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data).slice(0, 200));
    const copy = await call('POST', '/api/character', { cookie: second.cookie, body: { name: 'Sasha', classId: 'warrior', appearance: 'female' } });
    const names = (await (await db()).prepare('SELECT name FROM characters ORDER BY id').all()).results.map((row) => row.name);
    assert.equal(copy.status, 409, `"Sasha" answered ${copy.status} beside "${cyrillic}": the game now has ${JSON.stringify(names)}, which look the same`);
  });

  // The same with two alphabets other than the Latin: a Cyrillic "КАТО"
  // looked only for a Latin "kato", and went through beside a Greek "ΚΑΤΟ".
  test('a Cyrillic name that looks like a Greek name already taken is taken too', async () => {
    const first = await signUp('grecki');
    const second = await signUp('cyrylica');
    const made = await call('POST', '/api/character', { cookie: first.cookie, body: { name: 'ΚΑΤΟ', classId: 'warrior', appearance: 'male' } });
    assert.equal(made.status, 201, JSON.stringify(made.data).slice(0, 200));
    const copy = await call('POST', '/api/character', { cookie: second.cookie, body: { name: 'КАТО', classId: 'warrior', appearance: 'male' } });
    assert.equal(copy.status, 409, `the Cyrillic "КАТО" answered ${copy.status} beside the Greek "ΚΑΤΟ"`);
    // A name of plain letters, or of other letters that look otherwise, is free.
    const other = await call('POST', '/api/character', { cookie: second.cookie, body: { name: 'Łucja', classId: 'warrior', appearance: 'female' } });
    assert.equal(other.status, 201, JSON.stringify(other.data).slice(0, 200));
  });
});
