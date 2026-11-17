// Szczodre Gody (1044; data/winter.json): the calendar of 1–24 December, a
// reward a day for coming into the game, each character its own, a day
// missed lost (1044.1a A), the 24th the winter set (1044.2 B), cosmetics of
// the event the Sklep Systemu does not sell; where WINTER is "test" every
// day plays as a day of the calendar.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { explorationGold } from '../src/engine/mining.js';
import { questPeriod } from '../src/engine/quests.js';
import { winterCampPeriod, winterDecorations, winterTakenState, winterToday } from '../src/engine/winter.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const calendar = content.winter.calendar;

describe('the days of Szczodre Gody (engine)', () => {
  test('the calendar runs from the 1st to the 24th of December, the camp to the 31st; on test every day', () => {
    assert.deepEqual(winterToday('2026-12-01', calendar), { period: '2026-12', day: 1 });
    assert.deepEqual(winterToday('2026-12-24', calendar), { period: '2026-12', day: 24 });
    assert.equal(winterToday('2026-12-25', calendar), null);
    assert.equal(winterToday('2026-11-30', calendar), null);
    assert.equal(winterToday('2027-01-01', calendar), null);
    assert.equal(winterCampPeriod('2026-12-31', content.winter.camp), '2026-12');
    assert.equal(winterCampPeriod('2027-01-01', content.winter.camp), null);
    // On test, a day of a calendar of its month, those after the 24th as the 24th.
    assert.deepEqual(winterToday('2026-11-17', calendar, true), { period: 'test-2026-11', day: 17 });
    assert.deepEqual(winterToday('2026-11-30', calendar, true), { period: 'test-2026-11', day: 24 });
  });

  test("the camp's decorations are those of the days taken, of this year's calendar", () => {
    const december = { period: '2026-12', day: 12 };
    const stored = winterTakenState(winterTakenState(null, { period: '2026-12', day: 3 }), december);
    assert.deepEqual(stored, { period: '2026-12', taken: [3, 12] });
    assert.deepEqual(winterDecorations(stored, '2026-12', content), ['podlaznniczka']);
    assert.deepEqual(winterDecorations({ ...stored, taken: [3, 12, 19] }, '2026-12', content), ['podlaznniczka', 'snopek']);
    // Last year's days count for nothing.
    assert.deepEqual(winterDecorations(stored, '2027-12', content), []);
  });
});

describe('the calendar of Szczodre Gody (1044)', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  let cookie;
  // Noon of a day of December 2026, Polish time.
  const december = questPeriod('daily', Date.UTC(2026, 11, 1, 11), content).startsAt + 12 * 3600000;
  const noon = (day) => december + (day - 1) * DAY;
  const row = async () =>
    (await db())
      .prepare('SELECT gold, time_points, system_points, card_packs, potions, foreign_stacks, scrolls, steady_scrolls, cosmetics, winter FROM characters WHERE name = ?')
      .bind('Kolędniczka')
      .first();
  const look = async (day) => (await call('GET', '/api/winter', { cookie, now: noon(day) })).data.winter;
  const take = (day) => call('POST', '/api/winter', { cookie, now: noon(day) });

  beforeEach(async () => {
    ({ cookie } = await signUp('koledniczka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kolędniczka', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 64 WHERE name = 'Kolędniczka'").run();
    // The session lasts past December's days (30 days from today's sign-up).
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(Date.UTC(2027, 1, 1)).run();
  });

  test('outside its days there is no calendar and nothing to take', async () => {
    const before = await call('GET', '/api/winter', { cookie, now: noon(0) });
    assert.equal(before.status, 200, JSON.stringify(before.data));
    assert.equal(before.data.winter, null);
    assert.equal(await look(25), null);
    const closed = await take(25);
    assert.equal(closed.status, 409);
    assert.equal(closed.data.error.code, 'winter_closed');
  });

  test("each day once, its gold from the minutes of exploring at the character's level; a day missed is lost", async () => {
    const first = await look(1);
    assert.deepEqual([first.today, first.taken, first.days.length], [1, false, 24]);
    const perHour = explorationGold(64, content);
    assert.equal(first.days[0].gold, Math.round((perHour * 30) / 60 / 5) * 5);
    assert.deepEqual(
      first.days.map((day) => day.state),
      ['today', ...Array(23).fill('later')],
    );
    const before = await row();
    const answer = await take(1);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual([answer.data.winter.today, answer.data.winter.taken], [1, true]);
    assert.equal(answer.data.reward.day, 1);
    const after = await row();
    assert.equal(after.gold - before.gold, first.days[0].gold);
    assert.equal(after.time_points - before.time_points >= 10, true);
    // Once a day.
    const again = await take(1);
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'winter_taken');
    // The 2nd missed: lost on the 3rd, which waits.
    const third = await look(3);
    assert.deepEqual(
      third.days.slice(0, 4).map((day) => day.state),
      ['taken', 'missed', 'today', 'later'],
    );
  });

  test('potions into the bag as got from others, scrolls to their columns, packs and Punkty Systemu', async () => {
    const before = await row();
    assert.equal((await take(2)).status, 200);
    const potions = await row();
    assert.equal(JSON.parse(potions.potions)['lesser-speed'], 2);
    assert.equal(JSON.parse(potions.foreign_stacks)['potion:lesser-speed'], 2);
    assert.equal((await take(4)).status, 200);
    assert.equal((await take(6)).status, 200);
    assert.equal((await take(7)).status, 200);
    assert.equal((await take(14)).status, 200);
    const after = await row();
    assert.deepEqual(
      [after.card_packs - before.card_packs, after.scrolls - before.scrolls, after.steady_scrolls - before.steady_scrolls, after.system_points - before.system_points],
      [1, 1, 1, 5],
    );
    assert.deepEqual(JSON.parse(after.winter), { period: '2026-12', taken: [2, 4, 6, 7, 14] });
  });

  test('a full bag keeps the potions waiting until it has room', async () => {
    const database = await db();
    const { stack } = content.professionRules;
    // A bag full of herbs: more stacks of one herb than it has places.
    const full = { [content.herbs[0].id]: stack * 500 };
    await database.prepare("UPDATE characters SET herbs = ? WHERE name = 'Kolędniczka'").bind(JSON.stringify(full)).run();
    const refused = await take(2);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'bag_full');
    assert.equal((await look(2)).taken, false);
    await database.prepare("UPDATE characters SET herbs = '{}' WHERE name = 'Kolędniczka'").run();
    assert.equal((await take(2)).status, 200);
  });

  test('the 24th gives the winter set, which the shop does not sell and the character can wear', async () => {
    const buy = await call('POST', '/api/cosmetics/buy', { cookie, body: { id: 'frame-szron' } });
    assert.equal(buy.status, 409);
    assert.equal(buy.data.error.code, 'event_only');
    const before = await row();
    const answer = await take(24);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual(
      answer.data.reward.cosmetics.map((one) => one.id),
      ['frame-szron', 'bg-szczodre', 'aura-sniezyca'],
    );
    assert.deepEqual(answer.data.character.cosmetics.owned, ['frame-szron', 'bg-szczodre', 'aura-sniezyca']);
    assert.equal((await row()).card_packs - before.card_packs, 2);
    const worn = await call('POST', '/api/cosmetics/wear', { cookie, body: { kind: 'frame', id: 'frame-szron' } });
    assert.equal(worn.status, 200);
    assert.equal(worn.data.character.cosmetics.frame, 'frame-szron');
    // Owned once, not again.
    assert.equal((await call('POST', '/api/cosmetics/buy', { cookie, body: { id: 'frame-szron' } })).data.error.code, 'owned');
  });
});

describe('the calendar where WINTER is "test"', () => {
  const { call, signUp } = useServer({ TEST_CLOCK: 'on', WINTER: 'test' });

  test('runs on a day of November as that day of a calendar of its own', async () => {
    const { cookie } = await signUp('probna');
    await call('POST', '/api/character', { cookie, body: { name: 'Próbna', classId: 'mage', appearance: 'female' } });
    const now = questPeriod('daily', Date.UTC(2026, 10, 17, 11), content).startsAt + 12 * 3600000;
    const winter = (await call('GET', '/api/winter', { cookie, now })).data.winter;
    assert.equal(winter.today, 17);
    assert.equal((await call('POST', '/api/winter', { cookie, now })).status, 200);
  });
});
