// The reward for days in a row (1029, mock-ups 1034 accepted, 1034.4 B):
// one series for the account, a day from midnight Polish time, each day
// once; a day missed starts it anew, and after the seventh a new one starts.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { explorationGold } from '../src/engine/mining.js';
import { questPeriod } from '../src/engine/quests.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;

describe('the reward for days in a row (1029)', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  let cookie;
  // Noon of a day, Polish time, `offset` days after the first.
  const start = questPeriod('daily', Date.now() + 10 * DAY, content).startsAt + 12 * 3600000;
  const noon = (offset) => start + offset * DAY;
  const row = async () => (await db()).prepare('SELECT c.gold, c.time_points, c.system_points, c.card_packs, c.level, u.streak_day, u.streak_done FROM characters c JOIN users u ON u.id = c.user_id WHERE c.name = ?').bind('Wytrwała').first();
  const look = async (offset) => (await call('GET', '/api/streak', { cookie, now: noon(offset) })).data.streak;
  const take = (offset) => call('POST', '/api/streak', { cookie, now: noon(offset) });

  beforeEach(async () => {
    ({ cookie } = await signUp('wytrwala'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wytrwała', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 64 WHERE name = 'Wytrwała'").run();
  });

  test("seven days, each once, its gold from the minutes of exploring at the character's level; the seventh a pack and Punkty Systemu; then a new series", async () => {
    const first = await look(0);
    assert.deepEqual([first.day, first.taken, first.fresh], [1, false, false]);
    const perHour = explorationGold(64, content);
    assert.deepEqual(
      first.days.map((day) => day.gold),
      [30, 45, 60, 75, 90, 120, 0].map((minutes) => (minutes ? Math.round((perHour * minutes) / 60 / 5) * 5 : 0)),
    );
    assert.deepEqual(
      first.days.map((day) => day.timePoints),
      [10, 10, 15, 15, 20, 25, 30],
    );
    assert.deepEqual([first.days[6].packs, first.days[6].systemPoints], [1, 5]);
    for (let day = 0; day < 7; day += 1) {
      // Punkty Czasu also come back with time: those of the character as the
      // page sees it at the same moment, before and after.
      const shown = (await call('GET', '/api/character', { cookie, now: noon(day) })).data.character;
      const before = await row();
      const answer = await take(day);
      assert.equal(answer.status, 200);
      assert.deepEqual([answer.data.streak.day, answer.data.streak.taken], [day + 1, true]);
      // Once a day.
      assert.equal((await take(day)).status, 409);
      const after = await row();
      const reward = first.days[day];
      assert.deepEqual(
        [after.gold - before.gold, answer.data.character.timePoints - shown.timePoints, after.system_points - before.system_points, after.card_packs - before.card_packs],
        [reward.gold, reward.timePoints, reward.systemPoints, reward.packs],
      );
    }
    assert.equal((await row()).streak_done, 1);
    // After the seventh day a new series, not a missed one.
    const next = await look(7);
    assert.deepEqual([next.day, next.taken, next.fresh], [1, false, false]);
  });

  test('a day missed starts the series anew, and says so', async () => {
    await take(0);
    await take(1);
    assert.equal((await look(2)).day, 3);
    const later = await look(3);
    assert.deepEqual([later.day, later.taken, later.fresh], [1, false, true]);
    assert.equal((await take(3)).data.streak.day, 1);
  });

  test('one series for the account: another character of it finds the day taken', async () => {
    await take(0);
    const database = await db();
    const { id: _, ...character } = await database.prepare("SELECT * FROM characters WHERE name = 'Wytrwała'").first();
    const other = { ...character, name: 'Druga', name_key: 'druga', role: 'player' };
    await database.prepare("UPDATE characters SET role = 'aside' WHERE name = 'Wytrwała'").run();
    const columns = Object.keys(other);
    await database.prepare(`INSERT INTO characters (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...columns.map((column) => other[column])).run();
    const seen = await look(0);
    assert.deepEqual([seen.day, seen.taken], [1, true]);
    assert.equal((await take(0)).status, 409);
    assert.equal((await look(1)).day, 2);
  });
});
