// The Stajnia in the Osada (327 A): Mirosław sells mounts for good, one
// stage after another, each from its level and for its gold, and a mount
// shortens the wait of every exploration of the character's own by 5, 10 or
// 15%, while the length chosen stays what the exploration is: its rewards,
// XP and the report's minutes. Not a Szybkie Polowanie, which is over as it
// starts.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { huntWait, mountBlock, mountOf, mountStage, mountView, standingOf } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const { stable } = content.settlement;

describe('the Stajnia in the engine', () => {
  test("three stages as the author set them: 5, 10 and 15% for 2 500 (343 A), 30 000 and 150 000 gold, from levels 20, 50 and 100", () => {
    assert.deepEqual(
      stable.mounts.map(({ shorter, gold, level }) => [shorter, gold, level]),
      [
        [0.05, 2500, 20],
        [0.1, 30000, 50],
        [0.15, 150000, 100],
      ],
    );
    // Mirosław the koniuszy sells them, in a place of his own on the board.
    const groom = content.settlement.residents.find((resident) => resident.id === stable.resident);
    assert.deepEqual([groom.name, groom.title], ['Mirosław', 'koniuszy']);
    assert.equal(groom.greetings.length, content.settlement.standings.length);
    assert.equal(content.settlement.places.find((place) => place.resident === stable.resident).name, 'Stajnia');
  });

  test('an hour waits 57, 54 or 51 minutes with a mount, the full hour without one', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((stage) => huntWait(60, stage, content) / MINUTE),
      [60, 57, 54, 51],
    );
    // To the whole second: a minute with the first mount is 57 seconds.
    assert.equal(huntWait(1, 1, content), 57000);
    assert.equal(huntWait(5, 1, content), 285000);
    assert.equal(huntWait(30, 2, content), 27 * MINUTE);
    for (const minutes of [1, ...Array.from({ length: 48 }, (_, index) => (index + 1) * 5)]) {
      // Without a mount, exactly the length, as before the Stajnia.
      assert.equal(huntWait(minutes, 0, content), minutes * MINUTE);
      for (const stage of [1, 2, 3]) {
        const wait = huntWait(minutes, stage, content);
        assert.equal(wait % 1000, 0, `${minutes} min, stage ${stage}`);
        assert.ok(Math.abs(wait - minutes * MINUTE * (1 - mountOf(stage, content).shorter)) <= 500, `${minutes} min, stage ${stage}`);
      }
    }
  });

  test('the stage kept in the Osada: none before the first, never above the last', () => {
    assert.equal(mountStage({}, content), 0);
    assert.equal(mountStage(null, content), 0);
    assert.equal(mountStage({ mount: 2 }, content), 2);
    assert.equal(mountStage({ mount: 9 }, content), stable.mounts.length);
    assert.equal(mountStage({ mount: 'tak' }, content), 0);
    assert.equal(mountView({}, content), null);
    assert.deepEqual(mountView({ mount: 1 }, content), { stage: 1, name: stable.mounts[0].name, shorter: 0.05 });
  });

  test('mounts are bought in order, each from its level and for its gold', () => {
    const rich = { level: 100, gold: 1e9 };
    assert.equal(mountBlock(1, 0, rich, content), null);
    assert.equal(mountBlock(2, 0, rich, content).code, 'mount_order');
    assert.equal(mountBlock(3, 1, rich, content).code, 'mount_order');
    assert.equal(mountBlock(2, 1, rich, content), null);
    assert.equal(mountBlock(1, 1, rich, content).code, 'owned');
    assert.equal(mountBlock(1, 2, rich, content).code, 'owned');
    assert.equal(mountBlock(4, 3, rich, content).code, 'invalid_mount');
    assert.equal(mountBlock('1', 0, rich, content).code, 'invalid_mount');
    assert.equal(mountBlock(1, 0, { level: 19, gold: 2500 }, content).code, 'locked');
    assert.equal(mountBlock(1, 0, { level: 20, gold: 2499 }, content).code, 'not_enough_gold');
    assert.equal(mountBlock(1, 0, { level: 20, gold: 2500 }, content), null);
    assert.equal(mountBlock(3, 2, { level: 99, gold: 1e9 }, content).code, 'locked');
  });
});

describe('the Stajnia through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('koniuszy'));
    await call('POST', '/api/character', { cookie, body: { name: 'Jezdziec', classId: 'warrior', appearance: 'female' } });
    await set('level = 20, class_level = 20, gold = 2499, hp = 99999');
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement ?? '{}');
  const buy = (stage) => call('POST', '/api/settlement/stable', { cookie, body: { stage } });

  test('the stages are bought in order, from their levels, for their gold, the higher in place of the lower', async () => {
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    assert.equal(view.stable.stage, 0);
    assert.deepEqual(
      view.stable.mounts.map(({ stage, gold, level }) => [stage, gold, level]),
      [
        [1, 2500, 20],
        [2, 30000, 50],
        [3, 150000, 100],
      ],
    );
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.mount, null);

    assert.equal((await buy(1)).data.error.code, 'not_enough_gold');
    assert.equal((await buy(2)).data.error.code, 'mount_order');
    assert.equal((await buy(4)).status, 400);
    await set('gold = 2500');
    const first = await buy(1);
    assert.equal(first.status, 200);
    assert.equal(first.data.character.gold, 0);
    assert.equal(first.data.settlement.stable.stage, 1);
    assert.deepEqual(first.data.character.mount, { stage: 1, name: stable.mounts[0].name, shorter: 0.05 });
    // Mirosław's relation grows with each mount bought, and his greeting
    // with it; no brotherhood's reputation does.
    const groom = first.data.settlement.residents.find((resident) => resident.id === stable.resident);
    const standing = standingOf(stable.relationGain, content);
    assert.equal(groom.standing.id, standing.id);
    assert.equal(groom.greeting, groom.greetings[standing.index]);
    assert.equal((await stored()).relations[stable.resident], stable.relationGain);
    assert.equal((await stored()).mount, 1);
    assert.deepEqual((await stored()).reputation, {});
    assert.equal((await buy(1)).data.error.code, 'owned');

    // The second from level 50.
    await set('gold = 1000000');
    const low = await buy(2);
    assert.equal(low.status, 403);
    assert.equal(low.data.error.code, 'locked');
    await set('level = 50');
    const second = await buy(2);
    assert.equal(second.status, 200);
    assert.equal(second.data.character.gold, 1000000 - 30000);
    assert.equal((await stored()).mount, 2);
    assert.equal((await stored()).relations[stable.resident], stable.relationGain * 2);
    assert.equal((await buy(1)).data.error.code, 'owned');
    assert.equal((await buy(3)).data.error.code, 'locked');

    // The mount stays when the Osada is saved for something else.
    await call('POST', '/api/test/settlement', { cookie, body: { action: 'standing', standing: 'friend' } });
    assert.equal((await stored()).mount, 2);
  });

  test('an exploration ends sooner with a mount, and its report keeps the length chosen', async () => {
    await set('gold = 2500');
    assert.equal((await buy(1)).status, 200);
    const start = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(start.status, 201);
    const { activity } = start.data.character;
    assert.equal(activity.minutes, 30);
    // 30 minutes less 5%: 28 minutes 30 seconds.
    assert.equal(activity.endsAt - activity.startedAt, 28 * MINUTE + 30000);
    const row = await (await db()).prepare('SELECT minutes, started_at, ends_at FROM activities').first();
    assert.equal(row.minutes, 30);
    // The time passes (start and end move together), and the report is of 30 minutes.
    assert.equal((await call('POST', '/api/test/skip-time', { cookie })).status, 200);
    const claim = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claim.status, 200);
    assert.equal(claim.data.report.minutes, 30);
    assert.equal(claim.data.report.endsAt - claim.data.report.startedAt, 28 * MINUTE + 30000);
    const summary = JSON.parse((await (await db()).prepare('SELECT summary FROM reports ORDER BY id DESC').first()).summary);
    assert.equal(summary.minutes, 30);
    // The claim keeps the mount.
    assert.equal((await stored()).mount, 1);
  });

  test('the full length without a mount, and a Szybkie Polowanie stays as it was with one', async () => {
    const plain = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(plain.data.character.activity.endsAt - plain.data.character.activity.startedAt, 30 * MINUTE);
    await call('POST', '/api/hunts/cancel', { cookie });

    await set('gold = 2500');
    assert.equal((await buy(1)).status, 200);
    const quick = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge' } });
    assert.equal(quick.status, 200);
    const { report } = quick.data;
    assert.equal(report.quick, true);
    assert.equal(report.minutes, content.balance.quickHunt.minutes);
    assert.equal(report.endsAt - report.startedAt, content.balance.quickHunt.minutes * MINUTE);
    // So is a Błyskawiczne polowanie.
    await set('hp = 99999');
    const flash = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge', kind: 'flash' } });
    assert.equal(flash.status, 200);
    assert.equal(flash.data.report.endsAt - flash.data.report.startedAt, content.balance.flashHunt.minutes * MINUTE);
  });
});
