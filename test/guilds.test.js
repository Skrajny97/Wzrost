// The players' Gildie (src/server/guilds.js): founding one from level 30
// for 1000 gold, with a unique name and tag; invitations by the leader and
// the deputies, also of their friends at a tap; the roles; a leader who
// leaves passes the lead on, and a
// guild nobody is in goes; its chat channel only its members read and
// write in; a deleted character leaves its guild.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the Gildia through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const { found, size } = content.guilds;

  async function player(login, name, { level = 30, gold = 5000 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, gold = ? WHERE name = ?').bind(level, gold, name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  const count = async (table) => (await (await db()).prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count;

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh', { level: 10 });
  });

  test('a guild is founded from level 30 for its gold, with a name and a tag nobody else has', async () => {
    await (await db()).prepare("UPDATE characters SET level = 29 WHERE name = 'Mistrz'").run();
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).data.error.code, 'level');
    await (await db()).prepare("UPDATE characters SET level = 30, gold = ? WHERE name = 'Mistrz'").bind(found.gold - 1).run();
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).data.error.code, 'no_gold');
    await (await db()).prepare("UPDATE characters SET gold = ? WHERE name = 'Mistrz'").bind(found.gold + 5).run();
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'X', tag: 'LB' })).data.error.code, 'invalid_name');
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'L!' })).data.error.code, 'invalid_tag');
    const made = await as('mistrz', 'POST', '/api/guild/found', { name: '  Leśni   Bracia ', tag: 'lb' });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    assert.equal(made.data.guild.name, 'Leśni Bracia');
    assert.equal(made.data.guild.tag, 'LB');
    assert.deepEqual(made.data.guild.members.map((member) => [member.name, member.role]), [['Mistrz', 'leader']]);
    assert.equal(made.data.character.gold, 5);
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Druga', tag: 'DR' })).data.error.code, 'in_guild');
    // Another founder: the name whatever the letter case, and the tag, are taken.
    await player('trzeci', 'Trzeci');
    assert.equal((await as('trzeci', 'POST', '/api/guild/found', { name: 'leśni bracia', tag: 'XY' })).data.error.code, 'name_taken');
    assert.equal((await as('trzeci', 'POST', '/api/guild/found', { name: 'Inni', tag: 'Lb' })).data.error.code, 'tag_taken');
  });

  test('the leader and the deputies invite; a member joins, a deputy removes only members, a leader who leaves passes the lead', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const invited = await as('mistrz', 'POST', '/api/guild/invite', { name: 'druh' });
    assert.deepEqual(invited.data.guild.invited.map((one) => one.name), ['Druh']);
    // The light on the Społeczność tab of the invited one.
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.guildInvites, 1);
    const seen = (await as('druh', 'GET', '/api/guild')).data;
    assert.equal(seen.invites[0].tag, 'LB');
    const joined = await as('druh', 'POST', '/api/guild/accept', { guildId: seen.invites[0].guildId });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.equal(joined.data.guild.role, 'member');
    // A member does not invite; the leader names a deputy, who does.
    await player('trzeci', 'Trzeci', { level: 12 });
    assert.equal((await as('druh', 'POST', '/api/guild/invite', { name: 'Trzeci' })).data.error.code, 'not_allowed');
    await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf('Druh'), role: 'deputy' });
    assert.equal((await as('druh', 'POST', '/api/guild/invite', { name: 'Trzeci' })).status, 200);
    const trzeci = (await as('trzeci', 'GET', '/api/guild')).data.invites[0].guildId;
    await as('trzeci', 'POST', '/api/guild/accept', { guildId: trzeci });
    // The deputy removes a member, not the leader.
    assert.equal((await as('druh', 'POST', '/api/guild/kick', { characterId: await idOf('Mistrz') })).data.error.code, 'not_allowed');
    assert.equal((await as('druh', 'POST', '/api/guild/kick', { characterId: await idOf('Trzeci') })).status, 200);
    // The leader leaves: the deputy leads.
    await as('mistrz', 'POST', '/api/guild/leave');
    const after = (await as('druh', 'GET', '/api/guild')).data.guild;
    assert.deepEqual(after.members.map((member) => [member.name, member.role]), [['Druh', 'leader']]);
    // The last one leaves: the guild goes.
    await as('druh', 'POST', '/api/guild/leave');
    assert.equal(await count('guilds'), 0);
    assert.equal(await count('guild_members'), 0);
  });

  test('the leader and the deputies see the friends they may invite at a tap, members do not', async () => {
    await player('trzeci', 'Trzeci');
    // Mistrz's friends: Druh and Trzeci.
    for (const [login, name] of [['druh', 'Mistrz'], ['trzeci', 'Mistrz']]) {
      await as(login, 'POST', '/api/friends/invite', { name });
      const invitation = (await as('mistrz', 'GET', '/api/friends')).data.incoming[0];
      assert.equal((await as('mistrz', 'POST', '/api/friends/accept', { id: invitation.id })).status, 200);
    }
    const made = await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    assert.deepEqual(made.data.guild.friends.map((friend) => friend.name), ['Druh', 'Trzeci']);
    // One invited is not offered again, and one in a guild neither.
    const invited = await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    assert.deepEqual(invited.data.guild.friends.map((friend) => friend.name), ['Trzeci']);
    await as('trzeci', 'POST', '/api/guild/found', { name: 'Inni', tag: 'IN' });
    assert.deepEqual((await as('mistrz', 'GET', '/api/guild')).data.guild.friends, []);
    // A member is offered nobody.
    await as('druh', 'POST', '/api/guild/accept', { guildId: made.data.guild.id });
    assert.deepEqual((await as('druh', 'GET', '/api/guild')).data.guild.friends, []);
  });

  test('a full guild takes no more, and the lead is handed over by the leader', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
    const handed = await as('mistrz', 'POST', '/api/guild/lead', { characterId: await idOf('Druh') });
    assert.deepEqual(handed.data.guild.members.map((member) => [member.name, member.role]), [['Druh', 'leader'], ['Mistrz', 'deputy']]);
    // The places filled by others: no more invitations.
    const database = await db();
    await database.batch(
      Array.from({ length: size - 2 }, (_, index) => database.prepare("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)").bind(100000 + index, guildId)),
    );
    await player('trzeci', 'Trzeci');
    assert.equal((await as('druh', 'POST', '/api/guild/invite', { name: 'Trzeci' })).data.error.code, 'full');
  });

  test('the guild\'s channel: its members read and write there, nobody else', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
    await player('obcy', 'Obcy');
    for (const login of ['mistrz', 'druh', 'obcy']) await as(login, 'POST', '/api/chat/rules');
    const sent = await as('mistrz', 'POST', '/api/chat', { channel: 'guild', text: 'Zbiórka o świcie!' });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    const read = await as('druh', 'GET', '/api/chat?channel=guild');
    assert.equal(read.data.channel, 'guild');
    assert.deepEqual(read.data.messages.map((message) => message.text), ['Zbiórka o świcie!']);
    // Not in the Globalny, and not for those outside.
    assert.deepEqual((await as('druh', 'GET', '/api/chat?channel=global')).data.messages, []);
    assert.equal((await as('obcy', 'GET', '/api/chat?channel=guild')).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'POST', '/api/chat', { channel: 'guild', text: 'Hej' })).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'POST', '/api/chat/report', { messageId: sent.data.message.id })).data.error.code, 'no_message');
    // The light of the channel, and its mark read.
    const latest = (await as('druh', 'GET', '/api/chat/latest')).data;
    assert.deepEqual(latest.guild, { name: 'Leśni Bracia', tag: 'LB', latest: sent.data.message.id });
    await as('druh', 'POST', '/api/chat/seen', { guild: sent.data.message.id });
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.seen.guild, sent.data.message.id);
    // A guild that goes takes its channel along.
    await as('druh', 'POST', '/api/guild/leave');
    await as('mistrz', 'POST', '/api/guild/leave');
    assert.equal((await (await db()).prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE channel LIKE 'guild:%'").first()).count, 0);
  });

  test('a deleted character leaves its guild, and its lead passes on', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
    assert.equal((await as('mistrz', 'DELETE', '/api/character')).status, 200);
    const left = (await as('druh', 'GET', '/api/guild')).data.guild;
    assert.deepEqual(left.members.map((member) => [member.name, member.role]), [['Druh', 'leader']]);
  });
});
