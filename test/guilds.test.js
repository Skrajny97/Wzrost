// The players' Gildie (src/server/guilds.js): founding one from level 30
// for 1000 gold, with a unique name and tag; invitations by the leader and
// the deputies, also of their friends at a tap and from a character's card;
// the roles; a leader who leaves passes the lead on, and a guild nobody is
// in goes; its chat channel only its members read and write in; a deleted
// character leaves its guild.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { inviteToGuild } from '../src/server/guilds.js';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
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

  // The code review: the members and the invitations were counted before
  // the invitation was written, so two sent at the same moment both went
  // in. Here another write of the guild's lands just before it.
  test('invitations sent at the same moment never take a guild past its invitations or its members', async () => {
    const database = await db();
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).status, 200);
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    const mistrz = await idOf('Mistrz');
    const invite = (racing) => inviteToGuild({ request: posted('/api/guild/invite', cookies.mistrz, { name: 'Druh' }), env: { DB: racing }, now: Date.now() });
    // Others' invitations and members, made straight in the database, by
    // ids of no character: those from `from` up to `to`.
    const ids = (from, to) => Array.from({ length: to - from }, (_, index) => 100000 + from + index);
    const waiting = (from, to) =>
      database.batch(ids(from, to).map((id) => database.prepare('INSERT INTO guild_invites (guild_id, character_id, invited_by, created_at) VALUES (?, ?, ?, 0)').bind(guildId, id, mistrz)));
    const members = (from, to) =>
      database.batch(ids(from, to).map((id) => database.prepare("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)").bind(id, guildId)));
    // One invitation fits, and another one lands just before Druh's.
    const { invites } = content.guilds;
    await waiting(0, invites - 1);
    let racing = meanwhile(database, /INTO guild_invites/, () => waiting(invites - 1, invites));
    await assert.rejects(invite(racing), (error) => error.code === 'too_many_invites' && error.message === `Na odpowiedź czeka już ${invites} zaproszeń.`);
    assert.ok(racing.done);
    assert.equal(await count('guild_invites'), invites);
    // One member fits, and another one joins just before Druh's invitation.
    await database.prepare('DELETE FROM guild_invites').run();
    await members(0, size - 2);
    racing = meanwhile(database, /INTO guild_invites/, () => members(size - 2, size - 1));
    await assert.rejects(invite(racing), (error) => error.code === 'full' && error.message === `Gildia jest pełna: ${size} postaci.`);
    assert.equal(await count('guild_invites'), 0);
    // An invitation that waits already: sent again, the leader hears it went.
    await database.prepare("DELETE FROM guild_members WHERE role = 'member'").run();
    racing = meanwhile(database, /INTO guild_invites/, async () => database.prepare('INSERT INTO guild_invites (guild_id, character_id, invited_by, created_at) VALUES (?, ?, ?, 0)').bind(guildId, await idOf('Druh'), mistrz).run());
    assert.equal((await invite(racing)).status, 200);
    assert.equal(await count('guild_invites'), 1);
  });

  test('a character in a guild cannot be invited, and sees no invitations left from before (0.2.22)', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    await player('trzeci', 'Trzeci');
    await as('trzeci', 'POST', '/api/guild/found', { name: 'Inni', tag: 'IN' });
    const refused = await as('mistrz', 'POST', '/api/guild/invite', { name: 'Trzeci' });
    assert.equal(refused.data.error.code, 'in_guild');
    assert.equal(refused.data.error.message, 'Trzeci jest już w gildii.');
    // An invitation from before, as one left by an older version.
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await (await db()).prepare('INSERT INTO guild_invites (guild_id, character_id, invited_by, created_at) VALUES (?, ?, ?, ?)').bind(guildId, await idOf('Trzeci'), await idOf('Mistrz'), Date.now()).run();
    assert.equal((await as('trzeci', 'GET', '/api/chat/latest')).data.guildInvites, 0);
    assert.deepEqual((await as('trzeci', 'GET', '/api/guild')).data.invites, []);
    assert.equal(await count('guild_invites'), 0);
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

  test('the guild\'s tag stands beside its members\' names: the chat, the Ranking, the Drużyna and their own view', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    // The chat: the writer's guild now.
    await as('mistrz', 'POST', '/api/chat/rules');
    const sent = await as('mistrz', 'POST', '/api/chat', { channel: 'global', text: 'Witajcie' });
    assert.equal(sent.status, 201);
    // The message just sent shows the tag at once, not only once read again.
    assert.equal(sent.data.message.guildTag, 'LB');
    const chat = (await as('druh', 'GET', '/api/chat?channel=global')).data;
    assert.equal(chat.messages.find((message) => message.name === 'Mistrz').guildTag, 'LB');
    const ranking = (await as('druh', 'GET', '/api/ranking')).data;
    assert.deepEqual(
      ranking.rows.filter((row) => ['Mistrz', 'Druh'].includes(row.name)).map((row) => [row.name, row.guildTag]),
      [
        ['Mistrz', 'LB'],
        ['Druh', null],
      ],
    );
    assert.equal((await as('mistrz', 'GET', '/api/character')).data.character.guildTag, 'LB');
    assert.equal((await as('druh', 'GET', '/api/character')).data.character.guildTag, null);
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

  test('the character card offers "Zaproś do gildii" to the leader and the deputies, for a character in no guild', async () => {
    await player('trzeci', 'Trzeci', { level: 12 });
    const offer = async (login, name) => (await as(login, 'GET', `/api/profile/${name}`)).data.profile.guildInvite;
    // Without a guild there is nothing to offer, nor on one's own card.
    assert.equal(await offer('mistrz', 'Druh'), null);
    const made = await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    assert.equal(await offer('mistrz', 'Druh'), 'can');
    assert.equal(await offer('mistrz', 'Mistrz'), null);
    // Once invited, the card says so.
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    assert.equal(await offer('mistrz', 'Druh'), 'sent');
    // A member does not invite, and one in a guild is not offered.
    await as('druh', 'POST', '/api/guild/accept', { guildId: made.data.guild.id });
    assert.equal(await offer('druh', 'Trzeci'), null);
    assert.equal(await offer('mistrz', 'Druh'), null);
    // A deputy does invite.
    await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf('Druh'), role: 'deputy' });
    assert.equal(await offer('druh', 'Trzeci'), 'can');
    // A character without the Społeczność is not offered.
    await (await db()).prepare("UPDATE characters SET level = 1 WHERE name = 'Trzeci'").run();
    assert.equal(await offer('druh', 'Trzeci'), null);
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

  // The author, 14.11.2026: "Spraw by 4-dniowa nieobecność Lidera Gildii
  // przekazywała dowodzenie jednemu z zastępców, a samemu Liderowi nadawała
  // rolę Zastępcy".
  test('a leader away for days hands the guild to the deputy seen last and becomes a deputy', async () => {
    await player('trzeci', 'Trzeci');
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    for (const [login, name] of [
      ['druh', 'Druh'],
      ['trzeci', 'Trzeci'],
    ]) {
      await as('mistrz', 'POST', '/api/guild/invite', { name });
      await as(login, 'POST', '/api/guild/accept', { guildId });
    }
    const database = await db();
    const day = 24 * 60 * 60 * 1000;
    const { days } = content.guilds.leaderAway;
    const seen = (name, ago) => database.prepare('UPDATE characters SET seen_at = ? WHERE name = ?').bind(Date.now() - ago, name).run();
    const roles = async (login) => (await as(login, 'GET', '/api/guild')).data.guild.members.map((member) => [member.name, member.role]);
    // The System's words of the handover (the Kronika's lines aside, 1195 A).
    const said = async () => (await database.prepare('SELECT text FROM chat_messages WHERE channel = ? AND system = 1 AND chronicle IS NULL ORDER BY id').bind(`guild:${guildId}`).all()).results.map((row) => row.text);
    // Without a deputy nothing changes, however long the leader is away.
    await seen('Mistrz', (days + 6) * day);
    assert.deepEqual(await roles('druh'), [
      ['Mistrz', 'leader'],
      ['Druh', 'member'],
      ['Trzeci', 'member'],
    ]);
    await seen('Mistrz', 0);
    for (const name of ['Druh', 'Trzeci']) await as('mistrz', 'POST', '/api/guild/role', { characterId: await idOf(name), role: 'deputy' });
    // Away for less than the days: still the leader.
    await seen('Mistrz', (days - 1) * day);
    assert.equal((await roles('druh'))[0][0], 'Mistrz');
    // Away for the days: the deputy seen last within them leads, not the
    // one away as long as the leader.
    await database.prepare("UPDATE users SET language = 'en' WHERE login = 'druh'").run();
    await seen('Mistrz', days * day + 1000);
    await seen('Druh', (days + 1) * day);
    await seen('Trzeci', day);
    const viewed = await as('druh', 'GET', '/api/guild');
    assert.equal(viewed.data.guild.leaderAwayDays, days);
    assert.deepEqual(
      viewed.data.guild.members.map((member) => [member.name, member.role]),
      [
        ['Trzeci', 'leader'],
        ['Mistrz', 'deputy'],
        ['Druh', 'deputy'],
      ],
    );
    // The System says so in the guild's channel, in each language of its
    // members, once.
    assert.deepEqual(await said(), [
      `Mistrz nie zagląda do gry od ${days} dni, więc gildię prowadzi teraz Trzeci. Mistrz zostaje zastępcą.`,
      `Mistrz hasn't played for ${days} days, so Trzeci now leads the guild. Mistrz stays on as a deputy.`,
    ]);
    await as('mistrz', 'GET', '/api/guild');
    assert.equal((await said()).length, 2);
    // A leader away with every deputy away too: nothing changes.
    await seen('Trzeci', (days + 2) * day);
    await seen('Mistrz', (days + 3) * day);
    assert.equal((await roles('druh'))[0][0], 'Trzeci');
    // Playing the character marks it seen (the chat's poll).
    await as('druh', 'POST', '/api/chat/rules');
    await database.prepare("UPDATE users SET seen_at = 0 WHERE login = 'druh'").run();
    await as('druh', 'GET', '/api/chat?channel=guild');
    const { seen_at: at } = await database.prepare("SELECT seen_at FROM characters WHERE name = 'Druh'").first();
    assert.ok(Date.now() - at < 60000, `${at}`);
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
    // The Kronika's line of Druh's joining (1195 A), then the message.
    assert.deepEqual(read.data.messages.map((message) => message.text), ['Nowy członek gildii: Druh.', 'Zbiórka o świcie!']);
    assert.deepEqual(read.data.messages.map((message) => Boolean(message.system)), [true, false]);
    // Not in the Globalny, and not for those outside.
    assert.deepEqual((await as('druh', 'GET', '/api/chat?channel=global')).data.messages, []);
    assert.equal((await as('obcy', 'GET', '/api/chat?channel=guild')).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'POST', '/api/chat', { channel: 'guild', text: 'Hej' })).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'POST', '/api/chat/report', { messageId: sent.data.message.id })).data.error.code, 'no_message');
    // The light of the channel, and its mark read.
    const latest = (await as('druh', 'GET', '/api/chat/latest')).data;
    assert.deepEqual(latest.guild, { name: 'Leśni Bracia', tag: 'LB', latest: sent.data.message.id, notice: 0 });
    await as('druh', 'POST', '/api/chat/seen', { guild: sent.data.message.id });
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.seen.guild, sent.data.message.id);
    // A guild that goes takes its channel along.
    await as('druh', 'POST', '/api/guild/leave');
    await as('mistrz', 'POST', '/api/guild/leave');
    assert.equal((await (await db()).prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE channel LIKE 'guild:%'").first()).count, 0);
  });

  // 998.1 and 998.2 (16.11.2026; a player asked for „tablica ogłoszeń albo
  // czat lidera i zastępców”, the author accepted both).
  test('the guild\'s board: its members read it, its leader and deputies write it; their own channel only they read and write', async () => {
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await player('zastepca', 'Zastępca');
    await player('obcy', 'Obcy');
    for (const login of ['druh', 'zastepca']) {
      await as('mistrz', 'POST', '/api/guild/invite', { name: login === 'druh' ? 'Druh' : 'Zastępca' });
      await as(login, 'POST', '/api/guild/accept', { guildId });
    }
    const deputy = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Zastępca'").first()).id;
    await as('mistrz', 'POST', '/api/guild/role', { characterId: deputy, role: 'deputy' });
    for (const login of ['mistrz', 'druh', 'zastepca', 'obcy']) await as(login, 'POST', '/api/chat/rules');
    // The chat's pause between one's messages, past.
    const later = async () => (await db()).prepare('UPDATE chat_messages SET created_at = created_at - 10000').run();
    // The board: a member reads, only the leader and the deputies write.
    assert.equal((await as('druh', 'POST', '/api/chat', { channel: 'notice', text: 'Ja też' })).data.error.code, 'no_lead');
    const notice = await as('mistrz', 'POST', '/api/chat', { channel: 'notice', text: 'W czwartek mecz ligi o 20:00, @Druh!' });
    assert.equal(notice.status, 201, JSON.stringify(notice.data));
    const board = await as('druh', 'GET', '/api/chat?channel=notice');
    assert.equal(board.data.channel, 'notice');
    assert.deepEqual(board.data.messages.map((message) => message.text), ['W czwartek mecz ligi o 20:00, @Druh!']);
    assert.equal((await as('zastepca', 'POST', '/api/chat', { channel: 'notice', text: 'Bestia czeka.' })).status, 201);
    // No tags on the board: no notification tells it outside.
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM chat_mentions').first()).count, 0);
    // Its light for a member, and its mark read; reported by a member, not by one outside.
    const latest = (await as('druh', 'GET', '/api/chat/latest')).data.guild;
    assert.equal(latest.notice > notice.data.message.id, true);
    assert.equal(latest.lead, undefined);
    await as('druh', 'POST', '/api/chat/seen', { notice: latest.notice });
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.seen.notice, latest.notice);
    assert.equal((await as('obcy', 'GET', '/api/chat?channel=notice')).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'POST', '/api/chat/report', { messageId: notice.data.message.id })).data.error.code, 'no_message');
    assert.equal((await as('druh', 'POST', '/api/chat/report', { messageId: notice.data.message.id })).status, 200);
    // The leaders' channel: the leader and the deputy, nobody else.
    await later();
    const lead = await as('zastepca', 'POST', '/api/chat', { channel: 'lead', text: 'Kogo bierzemy na zastępcę?' });
    assert.equal(lead.status, 201, JSON.stringify(lead.data));
    assert.deepEqual((await as('mistrz', 'GET', '/api/chat?channel=lead')).data.messages.map((message) => message.text), ['Kogo bierzemy na zastępcę?']);
    assert.equal((await as('mistrz', 'GET', '/api/chat/latest')).data.guild.lead, lead.data.message.id);
    assert.equal((await as('druh', 'GET', '/api/chat?channel=lead')).data.error.code, 'no_lead');
    assert.equal((await as('druh', 'POST', '/api/chat', { channel: 'lead', text: 'Hej' })).data.error.code, 'no_lead');
    assert.equal((await as('druh', 'POST', '/api/chat/report', { messageId: lead.data.message.id })).data.error.code, 'no_message');
    assert.equal((await as('obcy', 'GET', '/api/chat?channel=lead')).data.error.code, 'no_guild');
    // A deputy made a member again reads it no more.
    await as('mistrz', 'POST', '/api/guild/role', { characterId: deputy, role: 'member' });
    assert.equal((await as('zastepca', 'GET', '/api/chat?channel=lead')).data.error.code, 'no_lead');
    assert.equal((await as('zastepca', 'GET', '/api/chat/latest')).data.guild.lead, undefined);
    // A guild that goes takes its board and the leaders' channel along.
    for (const login of ['druh', 'zastepca', 'mistrz']) await as(login, 'POST', '/api/guild/leave');
    assert.equal((await (await db()).prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE channel LIKE 'notice:%' OR channel LIKE 'lead:%'").first()).count, 0);
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
