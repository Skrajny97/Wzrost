// The time in the game (993 A; DECISIONS.md, "Czas w grze"): a minute with
// the game on the screen is a Punkt Czasu, up to 60 a narrator's day, counted
// by the server once a minute at most, so two pages count once.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { playMinute, playView, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.balance.timePoints.play;
const MINUTE = 60000;

describe('Czas w grze (993 A) in the engine', () => {
  test('the data: a point a minute, up to 60 a day, minutes 50 s apart at least, 10 minutes untouched stop the page', () => {
    assert.deepEqual(rules, { minutes: 1, daily: 60, gapSeconds: 50, idleMinutes: 10 });
  });

  test('a minute counts and pays a point; another within 50 s does not; the next minute does', () => {
    const now = Date.UTC(2026, 10, 15, 12, 0, 0);
    const first = playMinute(null, now, content);
    assert.deepEqual([first.counted, first.gained, first.play.minutes], [true, 1, 1]);
    const soon = playMinute(first.play, now + 30000, content);
    assert.deepEqual([soon.counted, soon.gained, soon.play], [false, 0, first.play]);
    const next = playMinute(first.play, now + MINUTE, content);
    assert.deepEqual([next.counted, next.gained, next.play.minutes], [true, 1, 2]);
    assert.deepEqual(playView(next.play, now + MINUTE, content), { points: 2, daily: 60, minutes: 2, idleMinutes: 10 });
  });

  test('up to 60 points a day; the next day starts from 0', () => {
    const now = Date.UTC(2026, 10, 15, 12, 0, 0);
    const day = questPeriod('daily', now, content).key;
    const full = { day, minutes: 60, at: now - MINUTE };
    const more = playMinute(full, now, content);
    assert.deepEqual([more.counted, more.gained, more.play.minutes], [true, 0, 61]);
    assert.equal(playView(more.play, now, content).points, 60);
    const tomorrow = questPeriod('daily', now, content).endsAt + MINUTE;
    const fresh = playMinute(more.play, tomorrow, content);
    assert.deepEqual([fresh.gained, fresh.play.minutes], [1, 1]);
    assert.notEqual(fresh.play.day, day);
    // A view of yesterday's count is today's 0.
    assert.deepEqual(playView(more.play, tomorrow, content), { points: 0, daily: 60, minutes: 0, idleMinutes: 10 });
  });
});

describe('Czas w grze (993 A) through the API', () => {
  const { call, db, signUp } = useServer();

  test('POST /api/play pays a point a minute, once for two pages; the character shows the day\'s count', async () => {
    const { cookie } = await signUp('czaswgrze');
    await call('POST', '/api/character', { cookie, body: { name: 'Czasowa', classId: 'mage', appearance: 'female' } });
    const database = await db();
    const points = async () => (await database.prepare("SELECT time_points, play_time FROM characters WHERE name = 'Czasowa'").first());
    const before = await points();
    assert.equal(before.play_time, null);
    let view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(view.play, { points: 0, daily: 60, minutes: 0, idleMinutes: 10 });
    const first = await call('POST', '/api/play', { cookie });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.deepEqual([first.data.gained, first.data.play.points, first.data.play.minutes], [1, 1, 1]);
    // A second page in the same minute: nothing more.
    const twice = await call('POST', '/api/play', { cookie });
    assert.deepEqual([twice.data.gained, twice.data.play.points], [0, 1]);
    let after = await points();
    assert.equal(after.time_points, before.time_points + 1);
    // A minute later another point.
    const stored = JSON.parse(after.play_time);
    await database.prepare("UPDATE characters SET play_time = ? WHERE name = 'Czasowa'").bind(JSON.stringify({ ...stored, at: stored.at - MINUTE })).run();
    const next = await call('POST', '/api/play', { cookie });
    assert.deepEqual([next.data.gained, next.data.play.points], [1, 2]);
    after = await points();
    assert.equal(after.time_points, before.time_points + 2);
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.play.points, view.play.minutes], [2, 2]);
    // At the day's limit the minutes count on, without points.
    await database.prepare("UPDATE characters SET play_time = ? WHERE name = 'Czasowa'").bind(JSON.stringify({ day: JSON.parse(after.play_time).day, minutes: 60, at: Date.now() - MINUTE })).run();
    const full = await call('POST', '/api/play', { cookie });
    assert.deepEqual([full.data.gained, full.data.play.points, full.data.play.minutes], [0, 60, 61]);
    assert.equal((await points()).time_points, before.time_points + 2);
    // Without a session: refused.
    assert.equal((await call('POST', '/api/play')).status, 401);
  });
});
