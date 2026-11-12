// Awatar Systemu: bought once for gold on the Profesje tab, it does one
// profession's work at a time beside the character, with the character's
// levels of the professions, and brings a quarter of the XP and of the
// profession's progress the character's own work would (10.11.2026; before,
// none: avatar-share.test.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { notificationsDue, workProfession, workXp } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Awatar Systemu', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('awatarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Awatarka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 10, xp = 0').run();
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  // Moves the Awatar's work `minutes` into the past.
  const age = async (minutes) =>
    (await db()).prepare('UPDATE avatar_activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const buy = () => call('POST', '/api/avatar/buy', { cookie });
  const bought = async () => {
    await set('gold = 10000');
    await buy();
  };
  const gather = (body) => call('POST', '/api/professions/gather', { cookie, body });
  const brew = (body) => call('POST', '/api/professions/brew', { cookie, body });

  test('is bought once on the Profesje tab, for its price in gold', async () => {
    const { avatar } = (await character()).professions;
    assert.deepEqual([avatar.name, avatar.price, avatar.owned, avatar.activity], ['Awatar Systemu', 10000, false, null]);
    await set('gold = 9999');
    assert.equal((await buy()).data.error.code, 'no_gold');
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60, avatar: true })).data.error.code, 'no_avatar');
    await set('gold = 10500');
    const paid = await buy();
    assert.equal(paid.status, 200);
    assert.equal(paid.data.text, content.avatar.texts.bought[0]);
    assert.equal(paid.data.character.gold, 500);
    assert.equal(paid.data.character.professions.avatar.owned, true);
    assert.equal((await buy()).data.error.code, 'owned');
  });

  test('gathers herbs while the character explores, and brings them with a quarter of the XP and of the profession\'s progress', async () => {
    await bought();
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } })).status, 201);
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60 })).data.error.code, 'busy');
    const started = await gather({ herbs: ['comfrey'], minutes: 60, avatar: true });
    assert.equal(started.status, 201);
    const { activity, professions } = started.data.character;
    assert.equal(activity.kind, 'hunt');
    assert.deepEqual([professions.avatar.activity.kind, professions.avatar.activity.minutes, professions.avatar.activity.placeName], ['herbs', 60, 'Systemowy Zagajnik']);
    const again = await gather({ herbs: ['comfrey'], minutes: 60, avatar: true });
    assert.deepEqual([again.data.error.code, again.data.error.message], ['busy', content.avatar.texts.busy[0]]);
    assert.equal((await call('POST', '/api/avatar/claim', { cookie })).data.error.code, 'not_finished');

    await age(60);
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60, avatar: true })).data.error.code, 'claim_first');
    const claimed = await call('POST', '/api/avatar/claim', { cookie });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'herbs');
    assert.equal(report.avatar, true);
    assert.equal(report.summary.xp, Math.round(workXp(10, 60, content) * content.avatar.share));
    assert.equal(report.profession.levelAfter, 1);
    const found = report.herbs.find((herb) => herb.id === 'comfrey').count;
    assert.ok(found > 0);
    assert.equal(after.herbs.find((herb) => herb.id === 'comfrey').count, found);
    assert.equal(after.xp, report.summary.xp);
    assert.deepEqual([after.professions.list[0].level, after.professions.list[0].xp], [1, Math.round(60 * content.avatar.share)]);
    assert.equal(after.professions.avatar.activity, null);
    assert.equal(after.activity.kind, 'hunt');
    assert.equal((await call('POST', '/api/avatar/claim', { cookie })).status, 409);
  });

  test('brews beside the character\'s own work, and Time Points shorten its brewing', async () => {
    await bought();
    await set(`herbs = '{"comfrey":61}', time_points = 500`);
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60 })).status, 201);
    const started = await brew({ recipe: 'lesser-healing', count: 10, avatar: true });
    assert.equal(started.status, 201);
    assert.equal(started.data.character.activity.kind, 'herbs');
    assert.equal(started.data.character.professions.avatar.activity.minutes, 100);
    assert.deepEqual(started.data.character.herbs.map((herb) => [herb.id, herb.count]), [['comfrey', 31]]);

    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'avatar' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 100);
    assert.equal(skipped.data.character.timePoints, 400);
    assert.ok(skipped.data.character.professions.avatar.activity.finished);
    assert.equal(skipped.data.character.activity.finished, false);

    const { report, character: after } = (await call('POST', '/api/avatar/claim', { cookie })).data;
    assert.equal(report.kind, 'potions');
    assert.equal(report.avatar, true);
    assert.equal(report.potion.count, 10 + report.potion.bonus);
    assert.equal(report.summary.xp, Math.round(workXp(10, 100, content) * content.avatar.share));
    assert.equal(after.potions[0].count, report.potion.count);
    assert.equal(after.professions.list[1].level, 1);
    assert.equal(after.activity.kind, 'herbs');
  });

  test('called back early, keeps the potions done and gives back the herbs for the rest', async () => {
    await bought();
    await set(`herbs = '{"comfrey":30}'`);
    await brew({ recipe: 'lesser-healing', count: 10, avatar: true });
    await age(25);
    const stopped = await call('POST', '/api/avatar/cancel', { cookie });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.data.report.avatar, true);
    assert.equal(stopped.data.report.potion.count, 2 + stopped.data.report.potion.bonus);
    const after = stopped.data.character;
    assert.equal(after.professions.avatar.activity, null);
    assert.deepEqual(after.herbs.map((herb) => [herb.id, herb.count]), [['comfrey', 24]]);
    // The share of the 25 minutes worked.
    assert.equal(after.xp, Math.round(workXp(10, 25, content) * content.avatar.share));
    // A gathering called back brings nothing.
    await gather({ herbs: ['comfrey'], minutes: 60, avatar: true });
    const back = await call('POST', '/api/avatar/cancel', { cookie });
    assert.equal(back.data.report, null);
    assert.equal(back.data.character.professions.avatar.activity, null);
    assert.equal((await call('POST', '/api/avatar/cancel', { cookie })).data.error.code, 'no_activity');
  });

  test('makes items in the Warsztat with the parts and resources it takes at the start', async () => {
    await bought();
    await set(`level = 15, parts = '{"scraps":30}', resources = '{"wood":50,"stone":200,"iron-ore":40}'`);
    const started = await call('POST', '/api/professions/craft', { cookie, body: { baseId: 'sword', rarity: 'common', count: 2, avatar: true } });
    assert.equal(started.status, 201);
    assert.equal(started.data.character.activity, null);
    assert.equal(started.data.character.professions.avatar.activity.kind, 'items');
    assert.deepEqual(started.data.character.resources, { wood: 50, stone: 164, 'iron-ore': 28 });
    await age(120);
    const { report, character: after } = (await call('POST', '/api/avatar/claim', { cookie })).data;
    assert.equal(report.kind, 'items');
    assert.equal(report.avatar, true);
    assert.equal(report.summary.xp, Math.round(workXp(15, report.minutes, content) * content.avatar.share));
    // The items wait in the Przechowalnia, out of the bag (842).
    assert.equal(after.bag.length, 0);
    assert.equal(after.professions.storage.items.length, report.items.length);
    assert.equal(after.professions.list[2].level, workProfession(content.professionsById.crafting, { level: 1, xp: 0 }, Math.round(report.minutes * content.avatar.share)).level);
  });

  test('the phone hears of the end of its work under its own title', () => {
    const endsAt = 1000;
    const due = notificationsDue({ level: 10, activity: null, avatarActivity: { kind: 'potions', areaId: 'system-workshop', endsAt }, buildings: {}, queue: [] }, 0, 2000, content);
    assert.deepEqual(due.map(({ tag, url, title }) => [tag, url, title]), [['avatar-potions', '#/profesje/alchemia', content.avatar.texts.pushTitle[0]]]);
    assert.match(due[0].body, /Systemowa Pracownia/);
  });
});
