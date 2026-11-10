// The Awatar Systemu's share (data/professions.json, avatar.share;
// src/server/professions.js, workGains; 10.11.2026, the author: „Awatar
// niech od teraz daje 1/4 tego co zdobyłaby postać - XPa i wpływ na level
// Profesji w podobnej ilości - tak jakby gracz robił te czynności”): its
// claimed work brings the character a quarter of the character's XP and of
// the profession's XP the same work of the character would, with the levels,
// HP, Time Points and stats they bring. Its claim, as the character's own,
// saves them only while the character is as read, so neither undoes a
// change made meanwhile.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { professionStatBonus, workXp, xpToNext } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { share } = content.avatar;
const herbalism = content.professionsById.herbalism;

describe('the Awatar Systemu\'s share', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT level, xp, hp, hp_at, time_points, professions, version FROM characters').first();
  // Moves the works of `table` `minutes` into the past.
  const age = async (table, minutes) =>
    (await db()).prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`).bind(minutes * 60000, minutes * 60000).run();
  const gather = (body) => call('POST', '/api/professions/gather', { cookie, body: { herbs: ['comfrey'], minutes: 60, ...body } });

  beforeEach(async () => {
    ({ cookie } = await signUp('awatarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Awatarka', classId: 'warrior', appearance: 'female' } });
    await set('level = 10, xp = 0, gold = 10000, time_points_at = ?', Date.now());
    assert.equal((await call('POST', '/api/avatar/buy', { cookie })).status, 200);
  });

  test('a quarter, in the data', () => {
    assert.equal(share, 0.25);
  });

  test('its gathering brings a quarter of the XP and of the profession\'s progress the character\'s own brings', async () => {
    // The character's own hour.
    assert.equal((await gather()).status, 201);
    await age('activities', 60);
    const own = (await call('POST', '/api/hunts/claim', { cookie })).data.report;
    assert.equal(own.summary.xp, workXp(10, 60, content));
    assert.deepEqual([own.profession.levelBefore, own.profession.levelAfter, own.profession.xpAfter], [1, 2, 60 - 30]);
    // The Awatar's hour, from the same start.
    await set(`xp = 0, professions = '{}'`);
    assert.equal((await gather({ avatar: true })).status, 201);
    await age('avatar_activities', 60);
    const claimed = await call('POST', '/api/avatar/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const { report, character } = claimed.data;
    assert.equal(report.avatar, true);
    assert.equal(report.summary.xp, Math.round(own.summary.xp * share));
    assert.equal(character.xp, report.summary.xp);
    assert.deepEqual([report.profession.levelBefore, report.profession.levelAfter, report.profession.xpAfter], [1, 1, Math.round(60 * share)]);
    assert.deepEqual(JSON.parse((await row()).professions).herbalism, { level: 1, xp: Math.round(60 * share) });
  });

  test('a level from its work heals fully, gives its Time Points and says so', async () => {
    const before = xpToNext(10, content) - 10;
    await set('xp = ?, hp = 1, hp_at = ?, time_points = 0', before, Date.now());
    await gather({ avatar: true });
    await age('avatar_activities', 60);
    const { report, character } = (await call('POST', '/api/avatar/claim', { cookie })).data;
    assert.equal(report.summary.levelAfter, 11);
    assert.equal(character.level, 11);
    assert.equal(character.xp, before + report.summary.xp - xpToNext(10, content));
    assert.equal(character.hp, character.maxHp);
    assert.equal(report.summary.timePoints, content.balance.timePoints.perLevel);
    assert.equal(character.timePoints, content.balance.timePoints.perLevel);
    assert.ok(report.system.length > 0);
  });

  test('a level of the profession from its work raises the profession\'s stats', async () => {
    await set(`professions = ?`, JSON.stringify({ herbalism: { level: 1, xp: 20 } }));
    await gather({ avatar: true });
    await age('avatar_activities', 60);
    const { report, character } = (await call('POST', '/api/avatar/claim', { cookie })).data;
    assert.deepEqual([report.profession.levelBefore, report.profession.levelAfter], [1, 2]);
    assert.ok(report.system.some((line) => line.includes('2')), JSON.stringify(report.system));
    const listed = character.professions.list.find((one) => one.id === 'herbalism');
    assert.deepEqual([listed.level, listed.xp], [2, 20 + Math.round(60 * share) - 30]);
    assert.ok(professionStatBonus(herbalism, 2) > 0);
    assert.ok(listed.stats.every((stat) => stat.bonus === professionStatBonus(herbalism, 2)), JSON.stringify(listed.stats));
  });

  // A change of the character landing between a claim's read and its
  // write: another request's claim, simulated by a trigger on the Time
  // Points every request settles first (characters.js, requirePlayer).
  async function meanwhile(gain) {
    await set('time_points_at = 0');
    await (await db())
      .prepare(`CREATE TRIGGER meanwhile AFTER UPDATE OF time_points_at ON characters BEGIN UPDATE characters SET xp = xp + ${gain}, version = version + 1 WHERE id = NEW.id; END`)
      .run();
  }
  const quiet = async () => (await db()).prepare('DROP TRIGGER IF EXISTS meanwhile').run();

  test('its claim never undoes a change made meanwhile: it asks for a retry, and the retry keeps both', async () => {
    await gather({ avatar: true });
    await age('avatar_activities', 60);
    await meanwhile(100);
    let raced;
    try {
      raced = await call('POST', '/api/avatar/claim', { cookie });
    } finally {
      await quiet();
    }
    assert.equal(raced.status, 409);
    assert.equal(raced.data.error.code, 'character_changed');
    assert.equal((await row()).xp, 100);
    // The work waits, and the retry claims it with both gains kept.
    const claimed = await call('POST', '/api/avatar/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal((await row()).xp, 100 + Math.round(workXp(10, 60, content) * share));
    // Claimed once: a second claim finds nothing.
    assert.equal((await call('POST', '/api/avatar/claim', { cookie })).data.error.code, 'no_activity');
  });

  test('the character\'s own claim of a work is guarded the same way, beside the Awatar\'s', async () => {
    await set(`herbs = '{"comfrey":30}'`);
    await gather();
    assert.equal((await call('POST', '/api/professions/brew', { cookie, body: { recipe: 'lesser-healing', count: 10, avatar: true } })).status, 201);
    await age('activities', 60);
    await age('avatar_activities', 200);
    // The Awatar's claim lands first; the character's own, read before it,
    // would write its XP over it.
    await meanwhile(0);
    let raced;
    try {
      raced = await call('POST', '/api/hunts/claim', { cookie });
    } finally {
      await quiet();
    }
    assert.equal(raced.status, 409);
    assert.equal(raced.data.error.code, 'character_changed');
    const avatar = (await call('POST', '/api/avatar/claim', { cookie })).data.report;
    const own = (await call('POST', '/api/hunts/claim', { cookie })).data.report;
    assert.equal((await row()).xp, avatar.summary.xp + own.summary.xp);
    assert.equal(avatar.summary.xp, Math.round(workXp(10, avatar.minutes, content) * share));
    assert.equal(own.summary.xp, workXp(10, 60, content));
  });
});
