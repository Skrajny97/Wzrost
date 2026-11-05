// The Stół rozbiórki's work counts for the narrator's quests and the Próby
// Gildii once an order ends, not when it is made (the author: „zrób też tak
// zeby zadania rozbiórki przedmiotów liczyły się po zakończonej rozbiórce bo
// inaczej bedzie mozna anulować rozbiórkę a zadanie zaliczone”): as the queue
// is settled (settleTable in src/server/characters.js), into the periods of
// then and the guild and the week of then, once, also when two requests
// settle it at the same moment. An order taken off before it ends counted
// nothing and takes nothing back; an order made before this, counted when it
// was made, does not count again when it ends.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, questPeriod } from '../src/engine/index.js';
import { loadPlayer, settleTable } from '../src/server/characters.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;

describe('the Stół rozbiórki counts its work as an order ends', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const stored = async (column) => JSON.parse((await first(`SELECT ${column} FROM characters`))[column] ?? 'null');
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const craft = (body) => call('POST', '/api/craft/materials', { cookie, body });
  const cancel = (body) => call('POST', '/api/craft/cancel', { cookie, body });
  const salvage = (id) => call('POST', `/api/items/${id}/salvage`, { cookie });
  // The day's quests of the table's work, as [progress, count].
  const daily = async () => (await stored('quests')).daily.quests.map((quest) => [quest.progress, quest.count]);
  // The progress of the character's trials of the table's work, by kind.
  const trials = async () =>
    Object.fromEntries(((await (await db()).prepare('SELECT kind, progress FROM guild_trials ORDER BY trial').all()).results).map((row) => [row.kind, row.progress]));
  const parts = async () => (await stored('parts')).scraps ?? 0;
  // The queue's orders done by now, ended an hour ago; when each was
  // ordered stays as it was.
  async function endAll() {
    const queue = (await stored('crafting')).map((order) => ({ ...order, startsAt: order.startsAt - 2 * HOUR, endsAt: Date.now() - HOUR }));
    await run('UPDATE characters SET crafting = ?', JSON.stringify(queue));
  }
  async function bagItem(seed) {
    const item = generateItem({ baseId: 'helmet', level: 3, rarityId: 'common' }, createRng(seed), content);
    return (await run('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters', JSON.stringify(item))).meta.last_row_id;
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('mistrz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Mistrz', classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 25, gold = 5000');
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters");
    // A guild whose board holds a trial of each kind of the table's work.
    assert.equal((await call('POST', '/api/guild/found', { cookie, body: { name: 'Leśni Bracia', tag: 'LB' } })).status, 200);
    await call('GET', '/api/guild/trials', { cookie });
    await run('UPDATE guild_trial_boards SET trials = ?, opened = 0', JSON.stringify(['process', 'salvage'].map((kind) => ({ kind, size: 0, roll: 0 }))));
    await run("DELETE FROM guild_trials WHERE state = 'active'");
    await call('GET', '/api/guild/trials', { cookie });
    await run('UPDATE guild_trials SET count = 100');
    // Today's quests: 10 materials processed and 2 items taken apart; none
    // of the table's work in the week and the month.
    const quests = await stored('quests');
    const quest = (kind, count) => ({ kind, count, progress: 0, reward: { kind: 'gold', amount: 5 }, claimed: false });
    quests.daily.quests = [quest('process', 10), quest('salvage', 2)];
    for (const period of ['weekly', 'monthly']) if (quests[period]) quests[period].quests = [];
    await run('UPDATE characters SET quests = ?, materials = ?', JSON.stringify(quests), JSON.stringify({ 'wolf-pelt:common': 10 }));
  });

  test('an order counts for the quests and the Próby Gildii once it ends, and only once', async () => {
    assert.equal((await craft({ key: 'wolf-pelt:common', count: 3 })).status, 200);
    const taken = await salvage(await bagItem('pierwszy'));
    assert.equal(taken.status, 200);
    const made = taken.data.character.crafting.queue.reduce((sum, order) => sum + order.parts, 0);
    assert.deepEqual(await daily(), [[0, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 0, salvage: 0 });
    await endAll();
    const view = await character();
    assert.deepEqual(view.quests.daily.quests.map((quest) => quest.progress), [3, 1]);
    assert.deepEqual(await trials(), { process: 3, salvage: 1 });
    assert.equal(await parts(), made);
    // Settled already: the next look counts nothing more.
    await character();
    assert.deepEqual(await daily(), [[3, 10], [1, 2]]);
    assert.deepEqual(await trials(), { process: 3, salvage: 1 });
  });

  test('taken off before it ends, an order leaves the quests and the trials as they were', async () => {
    const [order] = (await craft({ key: 'wolf-pelt:common', count: 3 })).data.character.crafting.queue;
    const taken = (await salvage(await bagItem('drugi'))).data.character.crafting.queue.at(-1);
    assert.equal((await cancel({ id: order.id })).status, 200);
    assert.equal((await cancel({ id: taken.id })).status, 200);
    assert.deepEqual(await daily(), [[0, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 0, salvage: 0 });
    // Made again and done, the work counts once.
    await craft({ key: 'wolf-pelt:common', count: 3 });
    await endAll();
    await character();
    assert.deepEqual(await daily(), [[3, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 3, salvage: 0 });
  });

  test('an order made yesterday that ends after midnight counts for the day it ends', async () => {
    await craft({ key: 'wolf-pelt:common', count: 3 });
    // Made a day ago, with the trial taken before it.
    const yesterday = Date.now() - DAY;
    const queue = (await stored('crafting')).map((order) => ({ ...order, orderedAt: yesterday }));
    await run('UPDATE characters SET crafting = ?', JSON.stringify(queue));
    await run('UPDATE guild_trials SET taken_at = ?', yesterday - HOUR);
    assert.equal(questPeriod('daily', yesterday, content).key === (await stored('quests')).daily.period, false);
    await endAll();
    await character();
    assert.deepEqual(await daily(), [[3, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 3, salvage: 0 });
  });

  test('two requests settling the queue at the same moment count an order once', async () => {
    await craft({ key: 'wolf-pelt:common', count: 3 });
    await endAll();
    // Both read the character before either settles.
    const database = await db();
    const { user_id: userId } = await first('SELECT user_id FROM characters');
    const [one, two] = [await loadPlayer(database, userId), await loadPlayer(database, userId)];
    const now = Date.now();
    await settleTable(database, one, now);
    await settleTable(database, two, now);
    assert.deepEqual(await daily(), [[3, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 3, salvage: 0 });
    assert.equal(await parts(), 3);
    // The second found the queue settled already, and so it is read now.
    assert.deepEqual([JSON.parse(two.row.crafting), two.row.version], [[], one.row.version]);
  });

  test('an order made before, counted when made, does not count again when it ends; one made now beside it does', async () => {
    const now = Date.now();
    const old = { id: 'stara', kind: 'material', key: 'fox-pelt:common', count: 4, partId: 'scraps', parts: 4, bonus: 0, orderedAt: now - 2 * HOUR, startsAt: now - 2 * HOUR, endsAt: now - HOUR };
    // As it counted when made.
    const quests = await stored('quests');
    quests.daily.quests[0].progress = 4;
    await run('UPDATE characters SET quests = ?', JSON.stringify(quests));
    await run("UPDATE guild_trials SET progress = 4 WHERE kind = 'process'");
    await craft({ key: 'wolf-pelt:common', count: 3 });
    await run('UPDATE characters SET crafting = ?', JSON.stringify([old, ...(await stored('crafting'))]));
    await endAll();
    await character();
    assert.deepEqual(await daily(), [[7, 10], [0, 2]]);
    assert.deepEqual(await trials(), { process: 7, salvage: 0 });
    assert.equal(await parts(), 7);
  });

  test('"Pomiń czas" at the table in test mode ends the orders, and their work counts', async () => {
    await craft({ key: 'wolf-pelt:common', count: 3 });
    const skipped = await call('POST', '/api/test/skip-craft', { cookie });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data).slice(0, 300));
    assert.deepEqual(skipped.data.character.crafting.queue, []);
    assert.deepEqual(skipped.data.character.quests.daily.quests.map((quest) => quest.progress), [3, 0]);
    assert.deepEqual(await trials(), { process: 3, salvage: 0 });
  });
});
