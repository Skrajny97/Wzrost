// The Społeczność tab beside the chat: the Ranking postaci by the character's
// level or its class's, the Znajomi by invitation, and the daily Upominek
// between friends: one a day to each, at most ten collected a day, each
// with a Time Point and gold or a resource.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { giftReward, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

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

  test('collecting the Upominki pays all they hold, at most ten a day', async () => {
    const database = await db();
    const ola = await database.prepare("SELECT id, gold, time_points, resources FROM characters WHERE name = 'Ola'").first();
    // Twelve sent yesterday by twelve senders, each worth 1 Time Point and 5
    // gold, or 3 wood.
    const day = questPeriod('daily', Date.now() - 86400000, content).key;
    for (let index = 0; index < 12; index += 1) {
      const { cookie } = await signUp(`dawca${index}`);
      await call('POST', '/api/character', { cookie, body: { name: `Dawca${index}`, classId: 'warrior', appearance: 'male' } });
      const reward = index % 2 === 0 ? { timePoints: 1, gold: 5, resources: {} } : { timePoints: 1, gold: 0, resources: { wood: 3 } };
      await database
        .prepare("INSERT INTO gifts (sender_id, receiver_id, day, created_at, reward) SELECT id, ?, ?, 0, ? FROM characters WHERE name = ?")
        .bind(ola.id, day, JSON.stringify(reward), `Dawca${index}`)
        .run();
    }
    const claimed = await call('POST', '/api/friends/claim', { cookie: players.ola });
    assert.equal(claimed.status, 200);
    assert.deepEqual(claimed.data.reward, { count: 10, timePoints: 10, gold: 25, resources: { wood: 15 } });
    const after = await database.prepare("SELECT gold, time_points, resources FROM characters WHERE name = 'Ola'").first();
    assert.equal(after.gold, ola.gold + 25);
    assert.ok(after.time_points >= ola.time_points + 10);
    assert.equal(JSON.parse(after.resources).wood, (JSON.parse(ola.resources).wood ?? 0) + 15);
    assert.deepEqual([claimed.data.gifts.claimedToday, claimed.data.gifts.waiting], [10, 2]);
    // The rest waits for tomorrow, and the light does not promise it today.
    assert.equal((await call('POST', '/api/friends/claim', { cookie: players.ola })).data.error.code, 'limit');
    assert.equal((await call('GET', '/api/chat/latest', { cookie: players.ola })).data.gifts, 0);
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
