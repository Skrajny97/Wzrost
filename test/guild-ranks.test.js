// The ranks of a guild's members (1062; src/server/guilds.js): R4 the
// leader, R3 a deputy, R2 a member, and R1 a Nowicjusz, a character new to
// the guild, for its first days or until the leader or a deputy makes it a
// member; a Nowicjusz takes from the Skrzynia Gildii only the items left
// for it and its own (src/server/guild-chest.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { ranks } = content.guilds;
const DAY = 24 * 3600000;
const amulet = () => ({ base: 'amulet', slot: 'amulet', level: 30, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 } });

describe('the ranks of a guild', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const members = async (login) => Object.fromEntries((await as(login, 'GET', '/api/guild')).data.guild.members.map((one) => [one.name, one]));
  const inBag = async (name) => (await run('INSERT INTO items (character_id, slot, data, created_at) VALUES ((SELECT id FROM characters WHERE name = ?), NULL, ?, 1234)', name, JSON.stringify(amulet()))).meta.last_row_id;

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

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh');
    await player('nowa', 'Nowa');
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).status, 200);
    await join('druh', 'Druh');
    await join('nowa', 'Nowa');
  });

  test('a character that joins is a Nowicjusz (R1) for its first days; the leader R4, a deputy R3, a member R2', async () => {
    const before = Date.now();
    let seen = await members('mistrz');
    assert.deepEqual([seen.Mistrz.rank, seen.Mistrz.rankShort, seen.Mistrz.rankName], ['leader', 'R4', 'Lider']);
    assert.deepEqual([seen.Nowa.rank, seen.Nowa.rankShort, seen.Nowa.rankName, seen.Nowa.role], ['novice', 'R1', 'Nowicjusz', 'member']);
    assert.ok(seen.Nowa.noviceUntil >= before + ranks.probationDays * DAY - 60000 && seen.Nowa.noviceUntil <= Date.now() + ranks.probationDays * DAY);
    assert.match(seen.Nowa.noviceUntilText, /^do \d\d\.\d\d, \d\d:\d\d$/);
    const guild = (await as('nowa', 'GET', '/api/guild')).data.guild;
    assert.equal(guild.rank, 'novice');
    assert.equal(guild.ranksRule, ranks.rule.replace('{days}', String(ranks.probationDays)));
    // A Nowicjusz named a deputy is a deputy (R3), and made a member again a member (R2).
    assert.equal((await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf('Druh'), role: 'deputy' })).status, 200);
    seen = await members('mistrz');
    assert.deepEqual([seen.Druh.rank, seen.Druh.rankShort, seen.Druh.noviceUntil], ['deputy', 'R3', undefined]);
    assert.equal((await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf('Druh'), role: 'member' })).status, 200);
    assert.deepEqual([(await members('mistrz')).Druh.rank, (await members('mistrz')).Druh.rankShort], ['member', 'R2']);
    // Its days over, a Nowicjusz is a member.
    await run("UPDATE guild_members SET probation_until = ? WHERE character_id = (SELECT id FROM characters WHERE name = 'Nowa')", Date.now() - 1);
    assert.equal((await members('mistrz')).Nowa.rank, 'member');
  });

  test('the leader or a deputy makes a Nowicjusz a member before its days are over; a member or a Nowicjusz cannot', async () => {
    const nowa = await idOf('Nowa');
    assert.equal((await as('druh', 'POST', '/api/guild/promote', { characterId: nowa })).data.error.code, 'not_allowed');
    assert.equal((await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf('Druh'), role: 'deputy' })).status, 200);
    const done = await as('druh', 'POST', '/api/guild/promote', { characterId: nowa });
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.equal(done.data.text, 'Nowa jest teraz członkiem.');
    assert.equal(done.data.guild.members.find((one) => one.name === 'Nowa').rank, 'member');
    assert.equal((await as('mistrz', 'POST', '/api/guild/promote', { characterId: nowa })).data.error.code, 'not_novice');
    assert.equal((await as('mistrz', 'POST', '/api/guild/promote', { characterId: await idOf('Mistrz') })).data.error.code, 'not_novice');
  });

  test('a Nowicjusz takes from the Skrzynia Gildii only the items left for it and its own', async () => {
    const forAll = await inBag('Mistrz');
    const forNowa = await inBag('Mistrz');
    assert.equal((await as('mistrz', 'POST', '/api/guild/chest/put', { itemId: forAll })).status, 200);
    assert.equal((await as('mistrz', 'POST', '/api/guild/chest/put', { itemId: forNowa, forId: await idOf('Nowa') })).status, 200);
    const view = (await as('nowa', 'GET', '/api/guild/chest')).data;
    assert.match(view.novice.note, /^Jako nowicjusz \(R1\) bierzesz tylko przedmioty zostawione dla Ciebie\. Przedmioty dla wszystkich weźmiesz od \d\d\.\d\d, \d\d:\d\d\.$/);
    assert.match(view.novice.take, /^Weźmiesz od /);
    const stored = Object.fromEntries(view.items.map((item) => [item.forName === null ? 'all' : 'nowa', item]));
    assert.deepEqual([stored.all.canTake, stored.nowa.canTake], [false, true]);
    const refused = await as('nowa', 'POST', '/api/guild/chest/take', { id: stored.all.id });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error.code, 'novice');
    assert.equal((await as('nowa', 'POST', '/api/guild/chest/take', { id: stored.nowa.id })).status, 200);
    // Its own item a Nowicjusz takes back.
    const own = await inBag('Nowa');
    assert.equal((await as('nowa', 'POST', '/api/guild/chest/put', { itemId: own })).status, 200);
    const back = (await as('nowa', 'GET', '/api/guild/chest')).data.items.find((item) => item.own);
    assert.equal(back.canTake, true);
    assert.equal((await as('nowa', 'POST', '/api/guild/chest/take', { id: back.id })).status, 200);
    // The leader has no Nowicjusz's note; the Nowicjusz made a member takes the items for all.
    assert.equal((await as('mistrz', 'GET', '/api/guild/chest')).data.novice, null);
    assert.equal((await as('mistrz', 'POST', '/api/guild/promote', { characterId: await idOf('Nowa') })).status, 200);
    assert.equal((await as('nowa', 'GET', '/api/guild/chest')).data.novice, null);
    assert.equal((await as('nowa', 'POST', '/api/guild/chest/take', { id: stored.all.id })).status, 200);
  });
});
