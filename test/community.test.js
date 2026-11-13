// The Społeczność tab beside the chat: the Ranking postaci by the character's
// level or its class's, the Znajomi by invitation, and the daily Upominek
// between friends: one a day to each, at most ten collected a day, each
// with a Time Point and gold or a resource.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { giftReward, questPeriod } from '../src/engine/index.js';
import { acceptFriend, firstKept, inviteFriend } from '../src/server/community.js';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

// The code review: going back keepDays times 24 hours came a day too late
// at 23:00–24:00 in the week after the autumn change of the clocks, and an
// Upominek of the first day kept was gone an hour early.
test('the Upominki kept are counted in calendar days, also around a change of the clocks', () => {
  const back = (year, month, day) => new Date(Date.UTC(year, month - 1, day - (content.community.gift.keepDays - 1))).toISOString().slice(0, 10);
  // 30.10.2026 at 23:30 and at 22:30 in Warsaw (CET), the week after the
  // autumn change.
  assert.equal(firstKept(Date.UTC(2026, 9, 30, 22, 30)), back(2026, 10, 30));
  assert.equal(firstKept(Date.UTC(2026, 9, 30, 21, 30)), back(2026, 10, 30));
  // 2.4.2026 at 00:30 in Warsaw (CEST), the week after the spring change.
  assert.equal(firstKept(Date.UTC(2026, 3, 1, 22, 30)), back(2026, 4, 2));
  // 15.11.2026 at noon.
  assert.equal(firstKept(Date.UTC(2026, 10, 15, 11)), back(2026, 11, 15));
});

describe('Społeczność: Ranking, Znajomi i Upominek', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  const players = {};

  // An account with a character at the given levels.
  async function player(login, { level = 5, classLevel = 1 } = {}) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ? WHERE name = ?').bind(level, classLevel, login).run();
    return cookie;
  }
  const friends = async (cookie) => (await call('GET', '/api/friends', { cookie })).data;
  // Ala and Ola become friends.
  async function befriend(from, to, name) {
    await call('POST', '/api/friends/invite', { cookie: from, body: { name } });
    const invitation = (await friends(to)).incoming[0];
    return call('POST', '/api/friends/accept', { cookie: to, body: { id: invitation.id } });
  }

  beforeEach(async () => {
    players.ala = await player('Ala', { level: 12, classLevel: 3 });
    players.ola = await player('Ola', { level: 7, classLevel: 9 });
  });

  test('the Ranking orders by the character\'s level or its class\'s, with the player\'s own place', async () => {
    await player('Ewa', { level: 4, classLevel: 20 });
    const byLevel = (await call('GET', '/api/ranking', { cookie: players.ola })).data;
    assert.equal(byLevel.by, 'level');
    assert.deepEqual(byLevel.rows.map(({ place, name, level, classLevel, own }) => [place, name, level, classLevel, own]), [
      [1, 'Ala', 12, 3, false],
      [2, 'Ola', 7, 9, true],
      [3, 'Ewa', 4, 20, false],
    ]);
    assert.equal(byLevel.place, 2);
    assert.equal(byLevel.rows[0].className, content.classesById.mage.name);
    const byClass = (await call('GET', '/api/ranking?by=class', { cookie: players.ola })).data;
    assert.deepEqual(byClass.rows.map(({ name }) => name), ['Ewa', 'Ola', 'Ala']);
    assert.equal(byClass.place, 2);
    // Below the Społeczność's level there is no Ranking either.
    const young = await player('Iza', { level: 4 });
    assert.equal((await call('GET', '/api/ranking', { cookie: young })).status, 403);
  });

  test('the Ranking by profession takes each character\'s highest one, and only characters that have worked in one', async () => {
    const ewa = await player('Ewa', { level: 30 });
    const database = await db();
    const set = (name, professions) => database.prepare('UPDATE characters SET professions = ? WHERE name = ?').bind(JSON.stringify(professions), name).run();
    await set('Ala', { herbalism: { level: 3, xp: 10 } });
    await set('Ola', { herbalism: { level: 2, xp: 0 }, alchemy: { level: 7, xp: 5 } });
    const byProfession = (await call('GET', '/api/ranking?by=profession', { cookie: players.ala })).data;
    assert.equal(byProfession.by, 'profession');
    assert.deepEqual(byProfession.rows.map(({ name, profession }) => [name, profession]), [
      ['Ola', { id: 'alchemy', level: 7 }],
      ['Ala', { id: 'herbalism', level: 3 }],
    ]);
    assert.equal(byProfession.place, 2);
    // Without a profession, no place in this order; an unknown order is by level.
    assert.equal((await call('GET', '/api/ranking?by=profession', { cookie: ewa })).data.place, null);
    assert.equal((await call('GET', '/api/ranking?by=gold', { cookie: ewa })).data.by, 'level');
  });

  test('a friendship starts with an invitation and holds once accepted', async () => {
    const sent = await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'ola' } });
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.data.outgoing.map(({ name }) => name), ['Ola']);
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ola' } })).data.error.code, 'invited');
    // The light on the tab tells Ola of it.
    assert.equal((await call('GET', '/api/chat/latest', { cookie: players.ola })).data.invites, 1);
    const waiting = await friends(players.ola);
    assert.deepEqual(waiting.incoming.map(({ name }) => name), ['Ala']);
    const accepted = await call('POST', '/api/friends/accept', { cookie: players.ola, body: { id: waiting.incoming[0].id } });
    assert.deepEqual(accepted.data.friends.map(({ name }) => name), ['Ala']);
    assert.deepEqual((await friends(players.ala)).friends.map(({ name, level }) => [name, level]), [['Ola', 7]]);
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ola, body: { name: 'Ala' } })).data.error.code, 'friends');
    // The profile knows it, and ending the friendship ends it both ways.
    const profile = (await call('GET', '/api/profile/Ola', { cookie: players.ala })).data.profile;
    assert.deepEqual([profile.relation.state, profile.relation.sentToday], ['friends', false]);
    assert.equal((await call('GET', '/api/profile/Ala', { cookie: players.ala })).data.profile.relation.state, 'self');
    await call('POST', '/api/friends/remove', { cookie: players.ola, body: { id: accepted.data.friends[0].id } });
    assert.deepEqual((await friends(players.ala)).friends, []);
    assert.equal((await call('GET', '/api/profile/Ola', { cookie: players.ala })).data.profile.relation, null);
  });

  test('an invitation both ways is a friendship, and nobody below the Społeczność can be invited', async () => {
    await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ola' } });
    const back = await call('POST', '/api/friends/invite', { cookie: players.ola, body: { name: 'Ala' } });
    assert.deepEqual(back.data.friends.map(({ name }) => name), ['Ala']);
    await player('Iza', { level: 4 });
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Iza' } })).data.error.code, 'locked');
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ala' } })).data.error.code, 'self');
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Nikt' } })).status, 404);
  });

  test('a friend\'s dot says online, busy (no trade now) or offline', async () => {
    await befriend(players.ala, players.ola, 'Ola');
    const status = async () => (await friends(players.ala)).friends[0].status;
    await (await db()).prepare("UPDATE users SET seen_at = 0 WHERE id = (SELECT user_id FROM characters WHERE name = 'Ola')").run();
    assert.equal(await status(), 'offline');
    await call('GET', '/api/chat/latest', { cookie: players.ola });
    assert.equal(await status(), 'online');
    // Away on an exploration, or with trades turned off: no trade now.
    assert.equal((await call('POST', '/api/hunts', { cookie: players.ola, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal(await status(), 'busy');
    await call('POST', '/api/hunts/cancel', { cookie: players.ola });
    assert.equal(await status(), 'online');
    await call('POST', '/api/trade/settings', { cookie: players.ola, body: { off: true } });
    assert.equal(await status(), 'busy');
    await call('POST', '/api/trade/settings', { cookie: players.ola, body: { off: false } });
    // Set aside for another character of the account: offline.
    assert.equal((await call('POST', '/api/character', { cookie: players.ola, body: { name: 'Ola Druga', classId: 'mage', appearance: 'female' } })).status, 201);
    assert.equal(await status(), 'offline');
  });

  test('a character has at most 30 friends and invitations', async () => {
    const { max } = content.community.friends;
    const database = await db();
    const ala = await database.prepare("SELECT id FROM characters WHERE name = 'Ala'").first();
    // Friends made straight in the database, all but one.
    for (let index = 0; index < max - 1; index += 1) {
      const { cookie } = await signUp(`gracz${index}`);
      await call('POST', '/api/character', { cookie, body: { name: `Gracz${index}`, classId: 'warrior', appearance: 'male' } });
      await database
        .prepare("INSERT INTO friends (character_id, friend_id, created_at, accepted_at) SELECT ?, id, 0, 0 FROM characters WHERE name = ?")
        .bind(ala.id, `Gracz${index}`)
        .run();
    }
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ola' } })).status, 200);
    await player('Ewa');
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ewa' } })).data.error.code, 'full');
  });

  // Characters of Ola's account set aside, made straight in the database:
  // `count` of them, to fill a list at once. Their ids.
  async function others(count) {
    const database = await db();
    const { id: _, ...ola } = await database.prepare("SELECT * FROM characters WHERE name = 'Ola'").first();
    const ids = [];
    for (let index = 0; index < count; index += 1) {
      const data = { ...ola, name: `Inna${index}`, name_key: `inna${index}`, role: 'aside' };
      const columns = Object.keys(data);
      const made = await database
        .prepare(`INSERT INTO characters (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
        .bind(...columns.map((column) => data[column]))
        .run();
      ids.push(made.meta.last_row_id);
    }
    return ids;
  }
  const friendRow = async (from, to, acceptedAt = null) =>
    (await db()).prepare('INSERT INTO friends (character_id, friend_id, created_at, accepted_at) VALUES (?, ?, 0, ?)').bind(from, to, acceptedAt).run();
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  const listOf = async (id) => (await (await db()).prepare('SELECT COUNT(*) AS count FROM friends WHERE character_id = ? OR friend_id = ?').bind(id, id).first()).count;

  // The code review: the cap was counted before the invitation was written,
  // so two sent at the same moment both went in. Here another invitation of
  // Ala's lands just before hers is written.
  test('invitations sent at the same moment never take a list past the cap; the same one twice goes once', async () => {
    const { max } = content.community.friends;
    const database = await db();
    const ala = await idOf('Ala');
    const filler = await others(max);
    // One place left: max - 2 friends and an invitation waiting.
    for (const id of filler.slice(0, max - 2)) await friendRow(ala, id, 0);
    await friendRow(ala, filler[max - 2]);
    const invite = (racing) => inviteFriend({ request: posted('/api/friends/invite', players.ala, { name: 'Ola' }), env: { DB: racing }, now: Date.now() });
    let racing = meanwhile(database, /INTO friends\b/, () => friendRow(ala, filler[max - 1]));
    await assert.rejects(invite(racing), (error) => error.code === 'full' && error.message === `Masz już ${max} znajomych i zaproszeń. Usuń kogoś, żeby zaprosić nową postać.`);
    assert.ok(racing.done);
    assert.equal(await listOf(ala), max);
    // The same invitation sent twice at once: once, and the second tap
    // hears it waits (it ended in an error of the server).
    await database.prepare('DELETE FROM friends WHERE character_id = ? AND friend_id = ?').bind(ala, filler[max - 1]).run();
    racing = meanwhile(database, /INTO friends\b/, async () => friendRow(ala, await idOf('Ola')));
    await assert.rejects(invite(racing), (error) => error.code === 'invited' && error.message === 'Zaproszenie dla postaci Ola już czeka.');
    assert.equal(await listOf(ala), max);
  });

  test('invitations accepted at the same moment never take a list past the cap; one accepted twice is accepted', async () => {
    const { max } = content.community.friends;
    const database = await db();
    const ala = await idOf('Ala');
    const filler = await others(max);
    // One place left: max - 1 friends, and two invitations waiting for her.
    for (const id of filler.slice(0, max - 1)) await friendRow(ala, id, 0);
    await friendRow(filler[max - 1], ala);
    assert.equal((await call('POST', '/api/friends/invite', { cookie: players.ola, body: { name: 'Ala' } })).status, 200);
    const { id } = await database.prepare('SELECT id FROM friends WHERE character_id = ? AND friend_id = ?').bind(await idOf('Ola'), ala).first();
    const accept = (racing) => acceptFriend({ request: posted('/api/friends/accept', players.ala, { id }), env: { DB: racing }, now: Date.now() });
    // The other one accepted just before Ola's is written.
    let racing = meanwhile(database, /UPDATE friends SET accepted_at/, () => database.prepare('UPDATE friends SET accepted_at = 0 WHERE character_id = ? AND friend_id = ?').bind(filler[max - 1], ala).run());
    await assert.rejects(accept(racing), (error) => error.code === 'full' && error.message === `Masz już ${max} znajomych. Usuń kogoś, żeby przyjąć zaproszenie.`);
    assert.ok(racing.done);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM friends WHERE (character_id = ? OR friend_id = ?) AND accepted_at IS NOT NULL').bind(ala, ala).first()).count, max);
    assert.equal((await database.prepare('SELECT accepted_at FROM friends WHERE id = ?').bind(id).first()).accepted_at, null);
    // With a place again, Ola's accepted twice at once: both taps hear it is.
    await database.prepare('DELETE FROM friends WHERE character_id = ? AND friend_id = ?').bind(filler[max - 1], ala).run();
    racing = meanwhile(database, /UPDATE friends SET accepted_at/, () => database.prepare('UPDATE friends SET accepted_at = 0 WHERE id = ?').bind(id).run());
    const answer = await accept(racing);
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).text, 'Ola jest teraz wśród Twoich znajomych.');
  });

  test('one Upominek a day to each friend, with its reward for the friend\'s level', async () => {
    const accepted = await befriend(players.ala, players.ola, 'Ola');
    const id = accepted.data.friends[0].id;
    // Both have an Upominek to send, and the light on the tab says so.
    const unsent = async (cookie) => (await call('GET', '/api/chat/latest', { cookie })).data.unsent;
    assert.deepEqual([await unsent(players.ala), await unsent(players.ola)], [1, 1]);
    const sent = await call('POST', '/api/friends/gift', { cookie: players.ala, body: { id } });
    assert.deepEqual([await unsent(players.ala), await unsent(players.ola)], [0, 1]);
    assert.equal(sent.status, 200);
    assert.equal(sent.data.friends[0].sentToday, true);
    assert.equal((await call('POST', '/api/friends/gift', { cookie: players.ala, body: { id } })).data.error.code, 'sent');
    const row = await (await db()).prepare('SELECT reward FROM gifts').first();
    const reward = JSON.parse(row.reward);
    assert.equal(reward.timePoints, 1);
    // Gold or one resource, as much as the engine gives at Ola's level 7.
    const gold = giftReward(7, [0, 0], content).gold;
    const resource = Object.values(giftReward(7, [0.99, 0], content).resources)[0];
    assert.ok(reward.gold === gold || Object.values(reward.resources)[0] === resource, JSON.stringify(reward));
    // Ola sees it waiting, and so does the light on the tab.
    const seen = await friends(players.ola);
    assert.deepEqual([seen.gifts.waiting, seen.friends[0].waiting], [1, 1]);
    assert.equal((await call('GET', '/api/chat/latest', { cookie: players.ola })).data.gifts, 1);
    // A friend's tomorrow is another day.
    await (await db()).prepare('UPDATE gifts SET day = ?').bind('2000-01-01').run();
    assert.equal((await call('POST', '/api/friends/gift', { cookie: players.ala, body: { id } })).status, 200);
  });

  // The author's 834 A (12.11.2026): a new character of another account
  // sent the main character every day an Upominek of the main character's
  // level. Below the Wymiana's level it is rolled for the sender's level.
  test('an Upominek from a character below the Wymiana\'s level gives no more than its own level would', async () => {
    const { minLevel } = content.community.trade;
    const database = await db();
    const rolled = async (cookie, name) => {
      await database.prepare('DELETE FROM gifts').run();
      const id = (await friends(cookie)).friends.find((friend) => friend.name === name).id;
      assert.equal((await call('POST', '/api/friends/gift', { cookie, body: { id } })).status, 200);
      return JSON.parse((await database.prepare('SELECT reward FROM gifts').first()).reward);
    };
    // Gold at the level it is rolled for, or that level's one resource.
    const worth = (reward, level) => reward.gold === giftReward(level, [0, 0], content).gold || Object.values(reward.resources)[0] === Object.values(giftReward(level, [0.99, 0], content).resources)[0];
    players.big = await player('Wielki', { level: 100 });
    await befriend(players.ola, players.big, 'Wielki');
    // Ola at level 7 gives Wielki an Upominek of level 7, not 100.
    const small = await rolled(players.ola, 'Wielki');
    assert.equal(small.timePoints, 1);
    assert.ok(worth(small, 7) && !worth(small, 100), JSON.stringify(small));
    // Every one of "Wyślij wszystkie" too.
    await database.prepare('DELETE FROM gifts').run();
    assert.equal((await call('POST', '/api/friends/gift-all', { cookie: players.ola })).status, 200);
    assert.ok(worth(JSON.parse((await database.prepare('SELECT reward FROM gifts').first()).reward), 7));
    // To a receiver below the sender, still the receiver's level.
    await database.prepare('UPDATE characters SET level = 15 WHERE name = ?').bind('Ola').run();
    await befriend(players.ala, players.ola, 'Ola');
    await database.prepare('UPDATE characters SET level = 9 WHERE name = ?').bind('Ala').run();
    assert.ok(worth(await rolled(players.ola, 'Ala'), 9));
    // From the Wymiana's level on, the receiver's level as before.
    await database.prepare('UPDATE characters SET level = ? WHERE name = ?').bind(minLevel, 'Ola').run();
    const big = await rolled(players.ola, 'Wielki');
    assert.ok(worth(big, 100) && !worth(big, minLevel), JSON.stringify(big));
  });

  test('"Wyślij wszystkie": today\'s Upominek to every friend not given one yet', async () => {
    const accepted = await befriend(players.ala, players.ola, 'Ola');
    players.ewa = await player('Ewa');
    await befriend(players.ala, players.ewa, 'Ewa');
    // One sent by hand already.
    assert.equal((await call('POST', '/api/friends/gift', { cookie: players.ala, body: { id: accepted.data.friends[0].id } })).status, 200);
    const all = await call('POST', '/api/friends/gift-all', { cookie: players.ala });
    assert.equal(all.status, 200);
    assert.equal(all.data.sent, 1);
    assert.equal(all.data.friends.length, 2);
    assert.ok(all.data.friends.every((friend) => friend.sentToday));
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM gifts').first()).count, 2);
    assert.equal((await call('POST', '/api/friends/gift-all', { cookie: players.ala })).data.error.code, 'sent');
  });

  test('collecting the Upominki pays all they hold, at most claimsPerDay a day', async () => {
    const database = await db();
    const limit = content.community.gift.claimsPerDay;
    const ola = await database.prepare("SELECT id, gold, time_points, resources FROM characters WHERE name = 'Ola'").first();
    // Two more than a day's limit, from twelve senders over the days before
    // today, each worth 1 Time Point and 5 gold, or 3 wood. They are
    // collected oldest first, in the order they were sent.
    const senders = 12;
    const sent = [];
    for (let index = 0; index < senders; index += 1) {
      const { cookie } = await signUp(`dawca${index}`);
      await call('POST', '/api/character', { cookie, body: { name: `Dawca${index}`, classId: 'warrior', appearance: 'male' } });
    }
    for (let back = 1; sent.length < limit + 2; back += 1) {
      const day = questPeriod('daily', Date.now() - back * 86400000, content).key;
      for (let index = 0; index < senders && sent.length < limit + 2; index += 1) {
        const reward = index % 2 === 0 ? { timePoints: 1, gold: 5, resources: {} } : { timePoints: 1, gold: 0, resources: { wood: 3 } };
        await database
          .prepare("INSERT INTO gifts (sender_id, receiver_id, day, created_at, reward) SELECT id, ?, ?, 0, ? FROM characters WHERE name = ?")
          .bind(ola.id, day, JSON.stringify(reward), `Dawca${index}`)
          .run();
        sent.push(reward);
      }
    }
    const taken = sent.slice(0, limit);
    const gold = taken.reduce((sum, reward) => sum + reward.gold, 0);
    const wood = taken.reduce((sum, reward) => sum + (reward.resources.wood ?? 0), 0);
    const claimed = await call('POST', '/api/friends/claim', { cookie: players.ola });
    assert.equal(claimed.status, 200);
    assert.deepEqual(claimed.data.reward, { count: limit, timePoints: limit, gold, resources: { wood } });
    const after = await database.prepare("SELECT gold, time_points, resources FROM characters WHERE name = 'Ola'").first();
    assert.equal(after.gold, ola.gold + gold);
    assert.ok(after.time_points >= ola.time_points + limit);
    assert.equal(JSON.parse(after.resources).wood, (JSON.parse(ola.resources).wood ?? 0) + wood);
    assert.deepEqual([claimed.data.gifts.claimedToday, claimed.data.gifts.waiting], [limit, 2]);
    // The rest waits for tomorrow, and the light does not promise it today.
    assert.equal((await call('POST', '/api/friends/claim', { cookie: players.ola })).data.error.code, 'limit');
    assert.equal((await call('GET', '/api/chat/latest', { cookie: players.ola })).data.gifts, 0);
  });

  // The author, 7.11.2026: "Zwiększmy możliwość odbierania upominków do 30 dziennie."
  test('a character collects up to 30 Upominki a day', () => {
    assert.equal(content.community.gift.claimsPerDay, 30);
  });

  test('a character gone takes its friendships and Upominki along', async () => {
    const accepted = await befriend(players.ala, players.ola, 'Ola');
    await call('POST', '/api/friends/gift', { cookie: players.ala, body: { id: accepted.data.friends[0].id } });
    await call('DELETE', '/api/character', { cookie: players.ala });
    const database = await db();
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM friends').first()).count, 0);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM gifts').first()).count, 0);
  });
});
