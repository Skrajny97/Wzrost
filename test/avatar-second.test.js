// The second Awatar Systemu (1066; the author: „A czy jest szansa by można
// było mieć dwa Awatary Systemu przy czym drugi bardzo drogi - za 200000
// złota?”): bought once the first is, for avatar.second.price, it works
// beside the character and the first Awatar the same way, its work in
// avatar2_activities, named in the requests with `avatar: 2`.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { notificationsDue, workXp } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the second Awatar Systemu', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('dwaawatary'));
    await call('POST', '/api/character', { cookie, body: { name: 'Dwaawatary', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  // Moves a work of `table` `minutes` into the past.
  const age = async (table, minutes) =>
    (await db()).prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`).bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const buy = (body) => call('POST', '/api/avatar/buy', { cookie, ...(body && { body }) });
  const both = async () => {
    await set('gold = 210000');
    assert.equal((await buy()).status, 200);
    assert.equal((await buy({ avatar: 2 })).status, 200);
  };
  const gather = (body) => call('POST', '/api/professions/gather', { cookie, body });
  const mine = (body) => call('POST', '/api/professions/mine', { cookie, body });
  const brew = (body) => call('POST', '/api/professions/brew', { cookie, body });

  test('is on sale once the first is bought, for its own price in gold', async () => {
    const { second } = (await character()).professions.avatar;
    assert.deepEqual([second.name, second.price, second.owned, second.activity], ['Drugi Awatar Systemu', 200000, false, null]);
    await set('gold = 500000');
    assert.equal((await buy({ avatar: 2 })).data.error.code, 'no_avatar');
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60, avatar: 2 })).data.error.code, 'no_avatar');
    assert.equal((await buy()).status, 200);
    await set('gold = 199999');
    assert.equal((await buy({ avatar: 2 })).data.error.code, 'no_gold');
    await set('gold = 200500');
    const paid = await buy({ avatar: 2 });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.text, content.avatar.second.texts.bought[0]);
    assert.equal(paid.data.character.gold, 500);
    assert.deepEqual([paid.data.character.professions.avatar.owned, paid.data.character.professions.avatar.second.owned], [true, true]);
    assert.equal((await buy({ avatar: 2 })).data.error.code, 'owned');
  });

  test('works at once with the first Awatar and the character, each with its own report', async () => {
    await both();
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } })).status, 201);
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60, avatar: true })).status, 201);
    const started = await mine({ minutes: 60, avatar: 2 });
    assert.equal(started.status, 201);
    const { activity, professions } = started.data.character;
    assert.deepEqual([activity.kind, professions.avatar.activity.kind, professions.avatar.second.activity.kind], ['hunt', 'herbs', 'minerals']);
    const again = await gather({ herbs: ['comfrey'], minutes: 60, avatar: 2 });
    assert.deepEqual([again.data.error.code, again.data.error.message], ['busy', content.avatar.second.texts.busy[0]]);
    assert.equal((await call('POST', '/api/avatar/claim', { cookie, body: { avatar: 2 } })).data.error.code, 'not_finished');

    await age('avatar2_activities', 60);
    assert.equal((await mine({ minutes: 60, avatar: 2 })).data.error.code, 'claim_first');
    // Its mini-game, as the first one's.
    assert.equal((await call('POST', '/api/minigame', { cookie, body: { avatar: 2 } })).status, 200);
    // The first one's work still goes on.
    assert.equal((await call('POST', '/api/avatar/claim', { cookie })).data.error.code, 'not_finished');
    const claimed = await call('POST', '/api/avatar/claim', { cookie, body: { avatar: 2 } });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.deepEqual([report.kind, report.avatar], ['minerals', 2]);
    // The Dziennik's line and the report's key name the second Awatar.
    const stored = await (await db()).prepare('SELECT activity_key, summary FROM reports ORDER BY id DESC LIMIT 1').first();
    assert.match(stored.activity_key, /:avatar2:/);
    assert.equal(JSON.parse(stored.summary).avatar, 2);
    assert.equal(report.summary.xp, Math.round(workXp(25, 60, content) * content.avatar.share));
    assert.equal(after.xp, report.summary.xp);
    assert.equal(after.professions.avatar.second.activity, null);
    assert.equal(after.professions.avatar.activity.kind, 'herbs');
    assert.equal((await call('POST', '/api/avatar/claim', { cookie, body: { avatar: 2 } })).data.error.code, 'no_activity');
  });

  test('Time Points shorten its work, and called back early it keeps the potions done', async () => {
    await both();
    await set(`herbs = '{"comfrey":90}', time_points = 500`);
    assert.equal((await brew({ recipe: 'lesser-healing', count: 10, avatar: true })).status, 201);
    assert.equal((await brew({ recipe: 'lesser-healing', count: 10, avatar: 2 })).status, 201);
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'avatar2' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 100);
    assert.ok(skipped.data.character.professions.avatar.second.activity.finished);
    assert.equal(skipped.data.character.professions.avatar.activity.finished, false);
    assert.equal((await call('POST', '/api/avatar/claim', { cookie, body: { avatar: 2 } })).data.report.avatar, 2);

    assert.equal((await brew({ recipe: 'lesser-healing', count: 10, avatar: 2 })).status, 201);
    await age('avatar2_activities', 25);
    const stopped = await call('POST', '/api/avatar/cancel', { cookie, body: { avatar: 2 } });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.data.report.avatar, 2);
    assert.equal(stopped.data.report.potion.count, 2 + stopped.data.report.potion.bonus);
    assert.equal(stopped.data.character.professions.avatar.second.activity, null);
    // The first one's brewing goes on.
    assert.equal(stopped.data.character.professions.avatar.activity.kind, 'potions');
    assert.equal((await call('POST', '/api/avatar/cancel', { cookie, body: { avatar: 2 } })).data.error.code, 'no_activity');
  });

  test('its work shows on the Postać tab and goes with the character', async () => {
    await both();
    await mine({ minutes: 60, avatar: 2 });
    const { characters } = (await call('GET', '/api/characters', { cookie })).data;
    assert.equal(characters[0].avatar2Activity.kind, 'minerals');
    const { results } = await (await db()).prepare('SELECT COUNT(*) AS count FROM avatar2_activities').all();
    assert.equal(results[0].count, 1);
  });
});

test('the end of the second Awatar\'s work comes under its own title', () => {
  const work = { kind: 'herbs', areaId: content.gathering.place.id, endsAt: 1500 };
  const due = notificationsDue({ level: 10, activity: null, avatarActivity: null, avatar2Activity: work, buildings: {}, queue: [] }, 1000, 2000, content);
  assert.deepEqual(
    due.map((notice) => [notice.tag, notice.title]),
    [['avatar2-herbs', content.avatar.second.texts.pushTitle[0]]],
  );
});
