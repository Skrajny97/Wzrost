// The author's 924 A (13.11.2026): an exploration's fights count the
// character's and the class's levels as it set out, not a level gained on
// the way (the Labirynt, a party's event), as the professions' levels since
// 0.2.72; an exploration begun before keeps none and counts the levels of
// the claim, as it always did.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const { call, db, signUp } = useServer();

describe("an exploration's fights count the levels it set out with", () => {
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wędrowiec', classId: 'warrior', appearance: 'male' } });
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  // The exploration's time passed, with a fixed seed.
  const finish = async () =>
    (await db()).prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed'").bind(Date.now() - 1).run();
  // Sets out at level 30 and class level 30, then gains five of each on the
  // way, as a Labirynt's or a party event's XP would bring them.
  async function setOutThenGain() {
    await set('level = 30, class_level = 30, xp = 0, class_xp = 0, hp = 99999, hp_at = ?', Date.now());
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } })).status, 201);
    const setOut = await character();
    await set('level = 35, class_level = 35');
    const during = await character();
    assert.ok(during.maxHp > setOut.maxHp, `five levels more raise the max HP (${setOut.maxHp} → ${during.maxHp})`);
    await finish();
    return { setOut, during };
  }

  test('a level gained on the way changes nothing in the fights', async () => {
    const { setOut } = await setOutThenGain();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const hero = claimed.data.report.fights[0].allies[0];
    assert.equal(hero.maxHp, setOut.maxHp);
    // The report's XP still goes onto the character as it is now.
    assert.ok(claimed.data.character.level >= 35);
  });

  test('one set out before 0.3.24, with no levels kept, counts those of the claim', async () => {
    const { during } = await setOutThenGain();
    await (await db()).prepare("UPDATE activities SET options = json_remove(options, '$.levels')").run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.fights[0].allies[0].maxHp, during.maxHp);
  });
});
