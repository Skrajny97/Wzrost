// The Prośby Gildii (src/server/guild-requests.js; the author's 346 A): one
// open request a member, 1 to 10 pieces of a material, a herb or a potion,
// never items or gold; the next one 8 hours after the last; a gift moves the
// pieces at once, never more than held or still missing, as goods the
// Encyklopedia leaves out, and moves the giver's trial of the Próby Gildii
// on; thanks once; the week's ranking; a request's time running out; herbs
// and potions only with room in the bag; a member who left has no request
// hanging, and old requests go with their gifts; characters of one account
// give each other nothing.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { bagCapacity, campLevels } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.requests;
const HOUR = 3600000;

describe('the Prośby Gildii through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  async function player(login, name, { level = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = ?, class_level = ?, gold = 5000, herbs = '{}', potions = '{}' WHERE name = ?").bind(level, Math.min(level, 25), name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const ask = (login, body) => as(login, 'POST', '/api/guild/requests', body);
  const give = (login, requestId, count) => as(login, 'POST', '/api/guild/requests/give', { requestId, count });
  const stacks = async (name, column) => JSON.parse((await first(`SELECT ${column} AS value FROM characters WHERE name = ?`, name)).value);
  const setStacks = (name, column, value) => run(`UPDATE characters SET ${column} = ? WHERE name = ?`, JSON.stringify(value), name);

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh', { level: 12 });
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
  });

  test('one open request a member, 1 to 10 pieces of a material, a herb or a potion, never items or gold; the next one 8 hours after the last', async () => {
    assert.equal((await ask('mistrz', { kind: 'item', key: 'sword', count: 1 })).data.error.code, 'invalid_kind');
    assert.equal((await ask('mistrz', { kind: 'gold', key: 'gold', count: 5 })).data.error.code, 'invalid_kind');
    assert.equal((await ask('mistrz', { kind: 'material', key: 'nothing:common', count: 1 })).data.error.code, 'invalid_goods');
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: rules.most + 1 })).data.error.code, 'invalid_count');
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 0 })).data.error.code, 'invalid_count');
    const made = await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 5 });
    assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 300));
    assert.deepEqual([made.data.mine.goods.name, made.data.mine.count, made.data.mine.given, made.data.mine.state], ['Skóra wilka', 5, 0, 'open']);
    assert.equal(made.data.waiting, true);
    const seen = (await as('druh', 'GET', '/api/guild/requests')).data;
    assert.deepEqual(
      seen.requests.map((request) => [request.name, request.goods.key, request.left, request.have, request.give]),
      [['Mistrz', 'wolf-pelt:common', 5, 0, 0]],
    );
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 1 })).data.error.code, 'open_request');
    // Taken back: the next one waits for the hours after the last one made.
    const cancelled = await as('mistrz', 'POST', '/api/guild/requests/cancel');
    assert.equal(cancelled.data.mine.state, 'cancelled');
    assert.ok(cancelled.data.nextAt > Date.now());
    assert.deepEqual((await as('druh', 'GET', '/api/guild/requests')).data.requests, []);
    assert.equal((await as('mistrz', 'POST', '/api/guild/requests/cancel')).data.error.code, 'no_request');
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 1 })).data.error.code, 'wait');
    await run('UPDATE guild_requests SET created_at = created_at - ?', rules.waitHours * HOUR + 60000);
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 1 })).status, 200);
    // Not for those outside a guild.
    await player('obcy', 'Obcy');
    assert.equal((await ask('obcy', { kind: 'herb', key: 'comfrey', count: 1 })).data.error.code, 'no_guild');
  });

  test('a gift moves the pieces at once, never more than held or still missing; the asker thanks once; the week\'s ranking', async () => {
    await setStacks('Druh', 'materials', { 'wolf-pelt:common': 3 });
    await setStacks('Mistrz', 'materials', { 'wolf-pelt:common': 1 });
    const { mine } = (await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 5 })).data;
    const offered = (await as('druh', 'GET', '/api/guild/requests')).data.requests[0];
    assert.deepEqual([offered.have, offered.give], [3, 3]);
    assert.equal((await give('druh', mine.id, 4)).data.error.code, 'not_enough');
    assert.equal((await give('druh', mine.id, 0)).data.error.code, 'invalid_count');
    assert.equal((await give('druh', 999, 1)).data.error.code, 'no_request');
    const given = await give('druh', mine.id, 3);
    assert.equal(given.status, 200, JSON.stringify(given.data).slice(0, 300));
    assert.deepEqual(await stacks('Druh', 'materials'), {});
    assert.equal((await stacks('Mistrz', 'materials'))['wolf-pelt:common'], 4);
    // Bought goods for the Encyklopedia, as a trade's.
    assert.equal((await stacks('Mistrz', 'foreign_stacks'))['material:wolf-pelt:common'], 3);
    assert.equal((await first('SELECT given FROM guild_requests')).given, 3);
    // No more than still missing.
    await setStacks('Druh', 'materials', { 'wolf-pelt:common': 10 });
    assert.equal((await give('druh', mine.id, 3)).data.error.code, 'too_many');
    assert.equal((await give('druh', mine.id, 2)).status, 200);
    assert.equal((await stacks('Druh', 'materials'))['wolf-pelt:common'], 8);
    const filled = (await as('mistrz', 'GET', '/api/guild/requests')).data.mine;
    assert.equal(filled.state, 'filled');
    assert.deepEqual(
      filled.gifts.map((gift) => [gift.name, gift.count, gift.thanked]),
      [
        ['Druh', 3, false],
        ['Druh', 2, false],
      ],
    );
    assert.equal((await give('druh', mine.id, 1)).data.error.code, 'closed');
    assert.equal((await give('mistrz', mine.id, 1)).data.error.code, 'own');
    // Thanks: once a gift, and only from the one who asked.
    const thanked = await as('mistrz', 'POST', '/api/guild/requests/thank', { giftId: filled.gifts[0].id });
    assert.equal(thanked.status, 200);
    assert.equal(thanked.data.mine.gifts[0].thanked, true);
    assert.equal((await as('mistrz', 'POST', '/api/guild/requests/thank', { giftId: filled.gifts[0].id })).data.error.code, 'thanked');
    assert.equal((await as('druh', 'POST', '/api/guild/requests/thank', { giftId: filled.gifts[1].id })).data.error.code, 'no_gift');
    const { ranking } = (await as('druh', 'GET', '/api/guild/requests')).data;
    assert.deepEqual(
      ranking.map((one) => [one.name, one.pieces, one.thanks, one.own]),
      [['Druh', 5, 1, true]],
    );
  });

  test('a gift moves the giver\'s trial of the Próby Gildii on, in the same batch', async () => {
    await as('druh', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trial_boards SET trials = ?', JSON.stringify([{ kind: 'gifts', size: 0, roll: 0 }]));
    assert.equal((await as('druh', 'POST', '/api/guild/trials/take', { index: 0 })).status, 200);
    await setStacks('Druh', 'materials', { 'wolf-pelt:common': 10 });
    const { mine } = (await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 5 })).data;
    await give('druh', mine.id, 2);
    const { taken } = (await as('druh', 'GET', '/api/guild/trials')).data;
    assert.equal(taken.progress, 2);
  });

  test('a request\'s time runs out: it hangs no more and takes nothing', async () => {
    await setStacks('Druh', 'materials', { 'wolf-pelt:common': 10 });
    const { mine } = (await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 5 })).data;
    await run('UPDATE guild_requests SET ends_at = ?', Date.now() - 1000);
    assert.deepEqual((await as('druh', 'GET', '/api/guild/requests')).data.requests, []);
    const view = (await as('mistrz', 'GET', '/api/guild/requests')).data;
    assert.equal(view.mine.state, 'expired');
    assert.equal(view.waiting, false);
    assert.equal((await give('druh', mine.id, 1)).data.error.code, 'closed');
    assert.equal((await as('mistrz', 'POST', '/api/guild/requests/cancel')).data.error.code, 'no_request');
    // A new one, the hours after the last one made: the old one closes as run out.
    await run('UPDATE guild_requests SET created_at = ?', Date.now() - rules.openHours * HOUR);
    assert.equal((await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 2 })).status, 200);
    assert.deepEqual(
      (await (await db()).prepare('SELECT state FROM guild_requests ORDER BY id').all()).results.map((row) => row.state),
      ['expired', 'open'],
    );
  });

  test('herbs and potions go into the bag: a request and a gift need room there', async () => {
    const { stack } = content.professionRules;
    const places = bagCapacity(campLevels({}, Date.now(), content), content) - (await first("SELECT COUNT(*) AS count FROM items i JOIN characters c ON c.id = i.character_id WHERE c.name = 'Mistrz' AND i.slot IS NULL")).count;
    const full = places * stack;
    await setStacks('Mistrz', 'herbs', { comfrey: full });
    assert.equal((await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 5 })).data.error.code, 'bag_full');
    await setStacks('Mistrz', 'herbs', { comfrey: full - 5 });
    const { mine } = (await ask('mistrz', { kind: 'herb', key: 'comfrey', count: 5 })).data;
    await setStacks('Druh', 'herbs', { comfrey: 10 });
    assert.equal((await give('druh', mine.id, 3)).status, 200);
    assert.equal((await stacks('Mistrz', 'herbs')).comfrey, full - 2);
    assert.equal((await stacks('Mistrz', 'foreign_stacks'))['herb:comfrey'], 3);
    assert.equal((await stacks('Druh', 'herbs')).comfrey, 7);
    await setStacks('Mistrz', 'herbs', { comfrey: full - 1 });
    const crowded = await give('druh', mine.id, 2);
    assert.equal(crowded.data.error.code, 'bag_full');
    assert.match(crowded.data.error.message, /zmieści się jeszcze 1 szt\./);
    assert.equal((await give('druh', mine.id, 1)).status, 200);
  });

  test('a request of a member who left hangs no more; the requests closed before last week go with their gifts', async () => {
    await setStacks('Druh', 'materials', { 'wolf-pelt:common': 5 });
    const { mine } = (await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 3 })).data;
    // The goods to ask for: those the character holds or has in its Encyklopedia.
    const seen = (await as('druh', 'GET', '/api/guild/requests')).data;
    assert.ok(seen.known.some((goods) => goods.kind === 'material' && goods.key === 'wolf-pelt:common'));
    assert.equal(seen.requests.length, 1);
    assert.equal((await as('mistrz', 'POST', '/api/guild/leave')).status, 200);
    assert.deepEqual((await as('druh', 'GET', '/api/guild/requests')).data.requests, []);
    assert.equal((await give('druh', mine.id, 1)).data.error.code, 'closed');
    // A request filled a fortnight ago, with its gift.
    const druh = (await first("SELECT id FROM characters WHERE name = 'Druh'")).id;
    const mistrz = (await first("SELECT id FROM characters WHERE name = 'Mistrz'")).id;
    const guild = (await first('SELECT guild_id FROM guild_members WHERE character_id = ?', druh)).guild_id;
    const old = Date.now() - 14 * 24 * HOUR;
    const { meta } = await run(
      "INSERT INTO guild_requests (guild_id, character_id, kind, good, count, given, state, created_at, ends_at, closed_at) VALUES (?, ?, 'herb', 'comfrey', 1, 1, 'filled', ?, ?, ?)",
      guild,
      druh,
      old,
      old + rules.openHours * HOUR,
      old + HOUR,
    );
    await run('INSERT INTO guild_gifts (request_id, guild_id, giver_id, count, created_at) VALUES (?, ?, ?, 1, ?)', meta.last_row_id, guild, mistrz, old + HOUR);
    assert.equal((await ask('druh', { kind: 'material', key: 'wolf-pelt:rare', count: 2 })).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_requests WHERE id = ?', meta.last_row_id)).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_gifts')).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_requests')).count, 2);
  });

  test('characters of one account give each other nothing', async () => {
    await setStacks('Mistrz', 'materials', { 'wolf-pelt:common': 5 });
    const { mine } = (await ask('mistrz', { kind: 'material', key: 'wolf-pelt:common', count: 3 })).data;
    // A second character of Mistrz's account, played now, in the guild too.
    await call('POST', '/api/character', { cookie: cookies.mistrz, body: { name: 'Bliźniak', classId: 'mage', appearance: 'male' } });
    const twin = await first("SELECT id FROM characters WHERE name = 'Bliźniak'");
    const guild = await first("SELECT guild_id FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE c.name = 'Mistrz'");
    await run('UPDATE characters SET level = 30 WHERE id = ?', twin.id);
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)", twin.id, guild.guild_id);
    await setStacks('Bliźniak', 'materials', { 'wolf-pelt:common': 5 });
    const seen = (await as('mistrz', 'GET', '/api/guild/requests')).data.requests[0];
    assert.deepEqual([seen.sameAccount, seen.give], [true, 0]);
    assert.equal((await give('mistrz', mine.id, 1)).data.error.code, 'same_account');
  });
});
