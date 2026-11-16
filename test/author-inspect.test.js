// The author's look at a player's numbers in its profile (1019, the author:
// „1019 tak”): only the author's account, bound to Google, gets them.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe("the author's look in a profile (1019)", () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let player;
  let author;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Gracz', classId: 'mage', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await call('POST', '/api/character', { cookie: author, body: { name: 'Szef', classId: 'warrior', appearance: 'male' } });
  });

  test("the author sees the player's own numbers; another player and the author without Google see none", async () => {
    // Without Google the author's login opens nothing (author.js).
    assert.equal((await call('GET', '/api/profile/Gracz', { cookie: author })).data.profile.inspect, undefined);
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    const seen = (await call('GET', '/api/profile/Gracz', { cookie: author })).data.profile;
    const own = (await call('GET', '/api/character', { cookie: player })).data.character;
    assert.deepEqual(
      [seen.inspect.hp, seen.inspect.maxHp, seen.inspect.mana, seen.inspect.gold, seen.inspect.timePoints, seen.inspect.damage],
      [own.hp, own.maxHp, own.mana, own.gold, own.timePoints, own.combat.damage],
    );
    assert.deepEqual(seen.inspect.stats.map((stat) => stat.total), own.stats.map((stat) => stat.total));
    assert.equal(seen.inspect.activity, null);
    // A player looking at the author, or at anyone, gets no such numbers.
    assert.equal((await call('GET', '/api/profile/Szef', { cookie: player })).data.profile.inspect, undefined);
  });
});
