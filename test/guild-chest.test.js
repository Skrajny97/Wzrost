// The Skrzynia Gildii (src/server/guild-chest.js; the author, 10.11.2026:
// „Wspólna skrzynia Gildii, w której można równocześnie zostawiać
// przedmioty bez przypisania do jakiegokolwiek gracza, zeby kazdy mogl
// wziąć lub z przypisaniem do konkretnego gracza w Gildii.”): a member puts
// an item of its bag in for all or for one member; any member takes one for
// all, only that member one for it, and the one who put it in takes it back
// as it was, while any other gets it as from a trade, with all its data.
// Taking needs a place in the bag; the chest holds up to its capacity, and
// no worn item, nor one a gem is being set in, goes in. Two taps at once
// move an item once. An item for a member who leaves is for all; the last
// member leaves only with the chest empty, and a guild gone takes its chest
// along. The log keeps the last moves, and an item waiting for a member
// lights that member's dot.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.chest;
const gem = content.minerals.find((mineral) => mineral.kind === 'gem').id;
const amulet = (level, extra = {}) => ({ base: 'amulet', slot: 'amulet', level, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 }, ...extra });

describe('Skrzynia Gildii', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const view = async (login) => (await as(login, 'GET', '/api/guild/chest')).data;
  const put = (login, itemId, forId) => as(login, 'POST', '/api/guild/chest/put', forId === undefined ? { itemId } : { itemId, forId });
  const take = (login, id) => as(login, 'POST', '/api/guild/chest/take', { id });
  const todo = async (login) => (await as(login, 'GET', '/api/guild/todo')).data.todo;
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const guildId = async () => (await first("SELECT id FROM guilds WHERE tag = 'LB'"))?.id ?? null;
  // An item put straight in the character's bag (or worn in `slot`), made
  // at `made`; its id.
  async function inBag(name, item, { slot = null, made = 1234 } = {}) {
    const result = await run('INSERT INTO items (character_id, slot, data, created_at) VALUES ((SELECT id FROM characters WHERE name = ?), ?, ?, ?)', name, slot, JSON.stringify(item), made);
    return result.meta.last_row_id;
  }
  // The items in the character's bag, each with its data and when it was made.
  const bag = async (name) =>
    (await all('SELECT i.data, i.created_at FROM items i JOIN characters c ON c.id = i.character_id WHERE c.name = ? AND i.slot IS NULL ORDER BY i.id', name)).map((row) => ({
      ...JSON.parse(row.data),
      made: row.created_at,
    }));

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?', name);
  }

  async function join(login, name) {
    const id = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name });
    assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId: id })).status, 200);
  }

  // The character's bag filled up to `free` places short of its capacity.
  async function fill(login, name, free = 0) {
    const { bagUsed, bagCapacity } = (await as(login, 'GET', '/api/character')).data.character;
    for (let index = bagUsed; index < bagCapacity - free; index += 1) await inBag(name, amulet(1, { rarity: 'common' }));
  }

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh');
    await player('trzeci', 'Trzeci');
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).status, 200);
    await join('druh', 'Druh');
    await join('trzeci', 'Trzeci');
  });

  test('an item for all leaves the bag with all its data, and any member takes it as from a trade', async () => {
    const item = amulet(30, { upgrade: 3, gem });
    const id = await inBag('Mistrz', item, { made: 4321 });
    const before = Date.now();
    const done = await put('mistrz', id);
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.equal(done.data.text, `${done.data.items[0].name} +3: w Skrzyni Gildii.`);
    assert.deepEqual([done.data.capacity, done.data.count, done.data.waiting], [rules.capacity, 1, 0]);
    const [stored] = done.data.items;
    assert.deepEqual(
      { from: stored.from, forName: stored.forName, forYou: stored.forYou, own: stored.own, canTake: stored.canTake, upgrade: stored.upgrade, rarity: stored.rarity, gem: stored.gem?.id },
      { from: 'Mistrz', forName: null, forYou: false, own: true, canTake: true, upgrade: 3, rarity: 'rare', gem },
    );
    assert.ok(stored.putAt >= before && stored.putAt <= Date.now());
    assert.deepEqual(done.data.log.map(({ kind, name, forName }) => [kind, name, forName]), [['put', 'Mistrz', null]]);
    // Out of the bag, in the answer's character too.
    assert.deepEqual(await bag('Mistrz'), []);
    assert.equal(done.data.character.bag.length, 0);
    // Another member sees who put it in, and takes it.
    const seen = (await view('druh')).items[0];
    assert.deepEqual([seen.from, seen.own, seen.canTake], ['Mistrz', false, true]);
    const taken = await take('druh', stored.id);
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.equal(taken.data.text, `${stored.name} +3: w plecaku.`);
    assert.deepEqual(await bag('Druh'), [{ ...item, traded: 1, made: 4321 }]);
    assert.deepEqual([taken.data.count, taken.data.items], [0, []]);
    assert.deepEqual(
      taken.data.log.map(({ kind, name }) => [kind, name]),
      [
        ['take', 'Druh'],
        ['put', 'Mistrz'],
      ],
    );
    assert.equal(taken.data.log[0].item.name, `${stored.name} +3`);
    assert.equal((await take('trzeci', stored.id)).data.error.code, 'not_in_chest');
  });

  test('an item for one member: only that member takes it, or the one who put it in, as it was; it lights that member\'s dot', async () => {
    const druh = await idOf('Druh');
    const item = amulet(20);
    const id = await inBag('Mistrz', item);
    assert.equal((await put('mistrz', id, druh)).status, 200);
    const forDruh = await view('druh');
    assert.deepEqual([forDruh.waiting, forDruh.items[0].forYou, forDruh.items[0].canTake], [1, true, true]);
    const forOthers = (await view('trzeci')).items[0];
    assert.deepEqual([forOthers.forName, forOthers.forYou, forOthers.canTake], ['Druh', false, false]);
    assert.deepEqual([(await todo('druh')).chest, (await todo('trzeci')).chest, (await todo('mistrz')).chest], [true, false, false]);
    const refused = await take('trzeci', forOthers.id);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [403, 'not_yours', 'Ten przedmiot czeka na postać Druh.']);
    // The one who put it in takes it back as it was.
    const back = await take('mistrz', forOthers.id);
    assert.equal(back.status, 200);
    assert.deepEqual(await bag('Mistrz'), [{ ...item, made: 1234 }]);
    assert.equal((await todo('druh')).chest, false);
    // Left for Druh again, Druh takes it, as from a trade.
    const [{ id: again }] = await all("SELECT i.id FROM items i JOIN characters c ON c.id = i.character_id WHERE c.name = 'Mistrz' AND i.slot IS NULL");
    assert.equal((await put('mistrz', again, druh)).status, 200);
    assert.equal((await take('druh', (await view('druh')).items[0].id)).status, 200);
    assert.deepEqual(await bag('Druh'), [{ ...item, traded: 1, made: 1234 }]);
    assert.equal((await todo('druh')).chest, false);
  });

  test('a worn item, one a gem is being set in, one not in the bag, for oneself or for one outside the guild, and a full chest stay out', async () => {
    const worn = await inBag('Mistrz', amulet(10), { slot: 'amulet' });
    assert.equal((await put('mistrz', worn)).data.error.code, 'equipped');
    assert.equal((await put('mistrz', 999999)).data.error.code, 'item_not_found');
    // A gem being set in it (jewelcraft.js), by the character's own work.
    const setting = await inBag('Mistrz', amulet(10));
    const mistrz = await idOf('Mistrz');
    await run(
      "INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'jewels', 'workshop', 60, ?, ?, 'x', 100, ?)",
      mistrz,
      Date.now(),
      Date.now() + 3600000,
      JSON.stringify({ set: true, item: setting, gem }),
    );
    assert.deepEqual((await view('mistrz')).setting, [setting]);
    assert.equal((await put('mistrz', setting)).data.error.code, 'setting_under_way');
    await run('DELETE FROM activities WHERE character_id = ?', mistrz);
    // Not for oneself, nor for one outside the guild.
    assert.equal((await put('mistrz', setting, mistrz)).data.error.code, 'self');
    await player('obcy', 'Obcy');
    assert.equal((await put('mistrz', setting, await idOf('Obcy'))).data.error.code, 'no_member');
    assert.equal((await put('mistrz', setting, 'Druh')).data.error.code, 'invalid_member');
    assert.equal((await bag('Mistrz')).length, 1);
    // A full chest.
    const guild = await guildId();
    const database = await db();
    await database.batch(
      Array.from({ length: rules.capacity }, () =>
        database.prepare("INSERT INTO guild_chest (guild_id, data, created_at, put_by, put_by_name, put_at) VALUES (?, ?, 1, NULL, 'Dawny', 1)").bind(guild, JSON.stringify(amulet(5))),
      ),
    );
    const full = await put('mistrz', setting);
    assert.deepEqual([full.status, full.data.error.code], [409, 'chest_full']);
    assert.match(full.data.error.message, new RegExp(`mieści ${rules.capacity} przedmiotów`));
    assert.equal((await view('mistrz')).count, rules.capacity);
  });

  test('taking needs a place in the bag', async () => {
    const id = await inBag('Mistrz', amulet(10));
    const stored = (await put('mistrz', id)).data.items[0];
    await fill('druh', 'Druh');
    const refused = await take('druh', stored.id);
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'bag_full']);
    assert.equal((await view('druh')).count, 1);
  });

  test('two taps at once move an item once: never doubled, never lost', async () => {
    // Exactly one of two requests at once goes through; the other is
    // refused (the item gone from the bag or the chest, or the character
    // changed meanwhile).
    const once = (answers) => assert.deepEqual(answers.map((answer) => answer.status === 200).sort(), [false, true], JSON.stringify(answers.map((answer) => answer.data.error ?? 'ok')));
    const id = await inBag('Mistrz', amulet(10, { upgrade: 1 }));
    once(await Promise.all([put('mistrz', id), put('mistrz', id)]));
    assert.equal((await view('mistrz')).count, 1);
    assert.deepEqual(await bag('Mistrz'), []);
    const stored = (await view('mistrz')).items[0];
    // Two members take it at the same moment.
    const takes = await Promise.all([take('druh', stored.id), take('trzeci', stored.id)]);
    once(takes);
    assert.equal(takes.find((answer) => answer.status !== 200).data.error.code, 'not_in_chest');
    const holders = [...(await bag('Druh')), ...(await bag('Trzeci'))].filter((item) => item.upgrade === 1);
    assert.equal(holders.length, 1);
    assert.equal((await view('mistrz')).count, 0);
    assert.equal((await all("SELECT id FROM guild_chest_log WHERE kind = 'take'")).length, 1);
    // One place left in the bag and two items taken at once: one comes.
    for (const level of [11, 12]) assert.equal((await put('mistrz', await inBag('Mistrz', amulet(level)))).status, 200);
    await fill('trzeci', 'Trzeci', 1);
    const ids = (await view('trzeci')).items.map((item) => item.id);
    once(await Promise.all(ids.map((one) => take('trzeci', one))));
    const { bagUsed, bagCapacity } = (await as('trzeci', 'GET', '/api/character')).data.character;
    assert.equal(bagUsed, bagCapacity);
    assert.equal((await view('trzeci')).count, 1);
  });

  test('leaving: an item for the one who left is for all, and the last member leaves only with the chest empty', async () => {
    const [druh, trzeci] = [await idOf('Druh'), await idOf('Trzeci')];
    assert.equal((await put('mistrz', await inBag('Mistrz', amulet(21)), druh)).status, 200);
    assert.equal((await put('druh', await inBag('Druh', amulet(22)), trzeci)).status, 200);
    assert.equal((await as('druh', 'POST', '/api/guild/leave')).status, 200);
    const after = (await view('mistrz')).items;
    const byLevel = Object.fromEntries(after.map((item) => [item.level, item]));
    // Left for Druh: for all now. Put in by Druh: still for Trzeci, from
    // Druh by the name it had.
    assert.deepEqual([byLevel[21].forName, byLevel[21].canTake], [null, true]);
    assert.deepEqual([byLevel[22].from, byLevel[22].forName, byLevel[22].canTake], ['Druh', 'Trzeci', false]);
    assert.equal((await view('druh')).guild, null);
    assert.equal((await put('druh', await inBag('Druh', amulet(23)))).data.error.code, 'no_guild');
    // Removed by the leader: what waited for Trzeci is for all.
    assert.equal((await as('mistrz', 'POST', '/api/guild/kick', { characterId: trzeci })).status, 200);
    assert.deepEqual(
      (await view('mistrz')).items.map((item) => [item.level, item.forName, item.canTake]).sort(),
      [
        [21, null, true],
        [22, null, true],
      ],
    );
    // The last member: not with items in the chest.
    const refused = await as('mistrz', 'POST', '/api/guild/leave');
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'chest_not_empty']);
    assert.ok(await guildId());
    for (const item of (await view('mistrz')).items) assert.equal((await take('mistrz', item.id)).status, 200);
    assert.equal((await as('mistrz', 'POST', '/api/guild/leave')).status, 200);
    assert.equal(await guildId(), null);
    assert.deepEqual([await all('SELECT id FROM guild_chest'), await all('SELECT id FROM guild_chest_log')], [[], []]);
  });

  test('a guild gone with its last character takes its chest along', async () => {
    const guild = await guildId();
    assert.equal((await put('druh', await inBag('Druh', amulet(15)))).status, 200);
    for (const login of ['druh', 'trzeci']) assert.equal((await as(login, 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('mistrz', 'DELETE', '/api/character')).status, 200);
    assert.equal(await first('SELECT id FROM guilds WHERE id = ?', guild), null);
    assert.deepEqual(await all('SELECT id FROM guild_chest WHERE guild_id = ?', guild), []);
  });

  test('the log keeps the last moves, the newest first', async () => {
    const guild = await guildId();
    const database = await db();
    await database.batch(
      Array.from({ length: rules.log + 10 }, (_, index) =>
        database
          .prepare("INSERT INTO guild_chest_log (guild_id, kind, name, for_name, data, created_at) VALUES (?, 'take', 'Dawny', NULL, ?, ?)")
          .bind(guild, JSON.stringify(amulet(5)), index),
      ),
    );
    const done = await put('mistrz', await inBag('Mistrz', amulet(9)), await idOf('Druh'));
    assert.equal(done.data.log.length, rules.log);
    assert.deepEqual([done.data.log[0].kind, done.data.log[0].name, done.data.log[0].forName], ['put', 'Mistrz', 'Druh']);
    assert.equal((await all('SELECT id FROM guild_chest_log WHERE guild_id = ?', guild)).length, rules.log);
  });

  test('outside a guild only the words, and nothing goes in', async () => {
    await player('obcy', 'Obcy');
    const outside = await view('obcy');
    assert.deepEqual([outside.guild, outside.texts.title], [null, rules.texts.title]);
    assert.match(outside.texts.how.join(' '), new RegExp(`${rules.capacity} przedmiotów`));
    const refused = await put('obcy', await inBag('Obcy', amulet(5)));
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'no_guild']);
  });
});
